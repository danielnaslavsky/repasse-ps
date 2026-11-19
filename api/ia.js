// Função serverless da Vercel que conversa com o Gemini.
// A chave fica na variável de ambiente GEMINI_API_KEY (configurada na Vercel),
// nunca no código nem no navegador.

const MODELO_PADRAO = "gemini-flash-lite-latest"; // rápido; troque com a variável GEMINI_MODEL

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Calendário dos próximos 14 dias, para o modelo não errar a conta de "quinta", "sexta"...
function calendario(hoje, dias = 14) {
  const [a, m, d] = String(hoje).split("-").map(Number);
  const linhas = [];
  for (let i = 0; i < dias; i++) {
    const dt = new Date(Date.UTC(a, m - 1, d + i));
    linhas.push(`${dt.toISOString().slice(0, 10)} = ${DIAS[dt.getUTCDay()]}${i === 0 ? " (hoje)" : ""}`);
  }
  return linhas.join("\n");
}

function promptInterpretar({ texto, hoje, areas, tipos }) {
  return `Você organiza as tarefas da equipe que conduz o processo seletivo (PS) de uma empresa júnior.
Transforme o pedido do gerente em uma tarefa estruturada.

Hoje é ${hoje} (formato AAAA-MM-DD). Converta prazos relativos ("sexta", "amanhã", "semana que vem") em uma data AAAA-MM-DD usando este calendário (um dia da semana sem "que vem" é a próxima ocorrência):
${calendario(hoje)}
Se não houver prazo, devolva prazo null.

Áreas possíveis: ${JSON.stringify([...areas, "Geral"])}. Use "Geral" quando a tarefa não for de uma área específica.
Tipos de tarefa possíveis (use o id): ${JSON.stringify(tipos)}

Regras:
- "quantidade" é o número de unidades a dividir (entregas, entrevistas, mensagens). Se não houver número, use 1.
- "esforcoPorUnidadeH" é o esforço em horas por unidade. Use o esforcoPadraoH do tipo, a menos que o pedido indique outro.
- "maxPessoas" é o limite de pessoas se o pedido disser (ex.: "no máximo 3 pessoas"); senão null.
- "titulo" é curto e no infinitivo, sem o prazo (ex.: "Corrigir desafio de Marketing").
- "observacao" é uma frase curta só se algo do pedido for ambíguo; senão, string vazia.

Responda apenas com JSON neste formato:
{"titulo": string, "tipoId": string, "area": string, "prazo": string|null, "quantidade": number, "esforcoPorUnidadeH": number, "maxPessoas": number|null, "observacao": string}

Pedido do gerente: """${String(texto).slice(0, 1000)}"""`;
}

function promptPlanejar({ texto, hoje, areas }) {
  return `Você organiza o processo seletivo (PS) de uma empresa júnior. O PS tem desafios por subárea (com data de lançamento e de entrega), treinamentos síncronos (com data e horário), etapas em que membros da equipe trabalham com os aspirantes (dinâmica em grupo, entrevistas) e avisos (abertura, divulgações, resultado etc.).
Leia o planejamento abaixo e extraia TODOS os itens do cronograma.

Hoje é ${hoje}. Calendário de referência (datas sem ano são deste ano, ou do próximo se já passaram há muito tempo):
${calendario(hoje, 45)}

Subáreas possíveis: ${JSON.stringify([...areas, "Geral"])}. Use "Geral" quando o item não for de uma subárea.

Regras:
- "tipo" é "desafio", "treinamento", "etapa" ou "aviso".
- "etapa" é dinâmica em grupo, entrevistas, case em grupo ou outra atividade em que membros da equipe avaliam ou conduzem aspirantes. Divulgações, envio de planilhas e resultados são "aviso".
- "pessoas" (só para etapa): quantos membros da equipe participam no total, se o texto disser ou der para calcular; senão null.
- "duracaoH" (só para etapa): horas de trabalho de CADA membro, se der para estimar pelo texto (ex.: 40 entrevistas de 30 min com 2 membros cada, divididas entre 8 membros = 5); senão null.
- "interno" é true para compromissos só da equipe, que os aspirantes não devem ver (reunião geral, deliberação, alinhamento); senão false. Restrições como "não marcar nada no dia X" também são internas.
- "data" é AAAA-MM-DD: lançamento (desafio), dia do treinamento ou do aviso.
- "entrega" é AAAA-MM-DD só para desafios; null se não houver.
- "hora" é HH:MM (24h) ou null.
- "titulo" curto, ex.: "Desafio de Dados", "Treinamento síncrono de Marketing", "Resultado final".
- "local" é o canal, sala ou link, se houver; senão "".
- Se um item citar várias subáreas ("desafios de Dados e Marketing"), crie um item para cada uma.
- Uma etapa que dura vários dias ("de 14/12 a 16/12") vira um único item, com a data do primeiro dia e o período na descrição.
- Não invente itens nem datas. Se algo estiver ambíguo, coloque uma frase curta em "observacoes".
- Se o texto disser quem faz uma tarefa ("Rafael prepara o case de Dados"), escreva isso em "observacoes" para a gerência ajustar o responsável na prévia.

Responda apenas com JSON:
{"eventos": [{"tipo": string, "titulo": string, "area": string, "data": string, "entrega": string|null, "hora": string|null, "local": string, "descricao": string, "pessoas": number|null, "duracaoH": number|null, "interno": boolean}], "observacoes": [string]}

Planejamento:
"""${String(texto).slice(0, 8000)}"""`;
}

function promptResumo({ contexto }) {
  return `Você é o assistente da gerente do processo seletivo (PS) de uma empresa júnior.
Com base nos dados abaixo, escreva um resumo curto em português (no máximo 5 frases, sem títulos, sem listas, sem emojis) dizendo:
o que está atrasado ou em risco, quem está sobrecarregado ou com folga, e uma ação concreta para hoje.
Use os nomes das pessoas. Não invente nada que não esteja nos dados.

Dados (JSON):
${JSON.stringify(contexto).slice(0, 12000)}

Responda apenas com JSON: {"texto": string}`;
}

// Modelos tentados em ordem. Quando o Google está sobrecarregado (503) ou limita (429), o servidor
// tenta de novo e passa para o próximo modelo, sempre dentro do tempo que a página espera.
const MODELOS_RESERVA = ["gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
let modelosDaConta = { lista: null, em: 0 };

// Pergunta ao Google quais modelos esta chave pode usar (guardado por 1 hora).
async function listarModelos(chave) {
  if (modelosDaConta.lista && Date.now() - modelosDaConta.em < 3600e3) return modelosDaConta.lista;
  try {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 3000);
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": chave }, signal: controle.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const dados = await resp.json();
    const nomes = (dados.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => /flash/.test(n) && !/image|tts|audio|live|embed|vision|thinking|exp|preview/.test(n));
    // flash-lite primeiro (mais rápido), depois flash; "-latest" antes das versões fixas
    const nota = (n) => (/lite/.test(n) ? 0 : 10) + (/latest/.test(n) ? 0 : 1);
    nomes.sort((a, b) => nota(a) - nota(b) || b.localeCompare(a));
    modelosDaConta = { lista: nomes, em: Date.now() };
    return nomes;
  } catch (e) {
    return null;
  }
}
const PASSAGEIRO = new Set([429, 500, 502, 503, 504]);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function umaChamada(modelo, prompt, chave, limiteMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: controle.signal,
    });
    if (!resp.ok) {
      const corpo = await resp.text();
      const erro = new Error(`Gemini respondeu ${resp.status}: ${corpo.slice(0, 300)}`);
      erro.status = 502;
      erro.codigoGoogle = resp.status;
      throw erro;
    }
    const dados = await resp.json();
    const texto =
      dados &&
      dados.candidates &&
      dados.candidates[0] &&
      dados.candidates[0].content &&
      dados.candidates[0].content.parts &&
      dados.candidates[0].content.parts.map((p) => p.text || "").join("");
    if (!texto) throw new Error("Resposta vazia do Gemini");
    const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    return JSON.parse(limpo);
  } catch (e) {
    if (e.name === "AbortError") {
      const erro = new Error(`o modelo ${modelo} demorou demais`);
      erro.codigoGoogle = 504;
      throw erro;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function chamarGemini(prompt, { orcamentoMs = 18000 } = {}) {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    const erro = new Error("GEMINI_API_KEY não configurada na Vercel");
    erro.status = 503;
    throw erro;
  }
  const principal = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const inicio = Date.now();
  let ultimo = null;
  let primeiroPassageiro = null;
  // o principal tem duas chances; os de reserva (da lista da conta, quando der), uma cada
  let tentativas = [principal, principal];
  let reservaCarregada = false;
  for (let i = 0; i < tentativas.length; i++) {
    const restante = orcamentoMs - (Date.now() - inicio);
    if (restante < 1500) break;
    try {
      const resposta = await umaChamada(tentativas[i], prompt, chave, Math.min(restante, 12000));
      return resposta;
    } catch (e) {
      ultimo = e;
      const codigo = e.codigoGoogle;
      if (codigo && PASSAGEIRO.has(codigo) && !primeiroPassageiro) primeiroPassageiro = e;
      // erro que não passa sozinho (chave inválida, pedido malformado): não adianta insistir
      if (codigo && !PASSAGEIRO.has(codigo) && codigo !== 404) break;
      if (!codigo && !(e instanceof SyntaxError) && e.message !== "Resposta vazia do Gemini") break;
      if (i === 0) await espera(700);
      if (i === tentativas.length - 1 && !reservaCarregada) {
        reservaCarregada = true;
        const daConta = await listarModelos(chave);
        const reserva = (daConta && daConta.length ? daConta : MODELOS_RESERVA).filter((m) => m !== principal).slice(0, 3);
        tentativas = tentativas.concat(reserva);
      }
    }
  }
  // mostra o motivo real (sobrecarga), não o 404 de um modelo de reserva
  throw primeiroPassageiro || ultimo || new Error("IA indisponível");
}

module.exports = async function handler(req, res) {
  // Diagnóstico: abra /api/ia?diagnostico=1 no navegador para ver se a IA responde.
  if (req.method === "GET" && req.query && req.query.diagnostico) {
    const inicio = Date.now();
    const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
    try {
      await chamarGemini('Responda apenas com JSON: {"ok": true}');
      const disponiveis = req.query.modelos ? await listarModelos(process.env.GEMINI_API_KEY) : undefined;
      res.status(200).json({ ok: true, chaveConfigurada: true, modelo, ms: Date.now() - inicio, reserva: disponiveis });
    } catch (e) {
      const disponiveis = req.query.modelos ? await listarModelos(process.env.GEMINI_API_KEY) : undefined;
      res.status(200).json({ ok: false, chaveConfigurada: !!process.env.GEMINI_API_KEY, modelo, ms: Date.now() - inicio, erro: e.message, reserva: disponiveis });
    }
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Use POST" });
    return;
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try {
      corpo = JSON.parse(corpo);
    } catch (e) {
      res.status(400).json({ erro: "JSON inválido" });
      return;
    }
  }
  corpo = corpo || {};

  try {
    if (corpo.acao === "interpretar") {
      if (!corpo.texto || !corpo.hoje || !Array.isArray(corpo.areas) || !Array.isArray(corpo.tipos)) {
        res.status(400).json({ erro: "Campos faltando" });
        return;
      }
      res.status(200).json(await chamarGemini(promptInterpretar(corpo)));
      return;
    }
    if (corpo.acao === "planejar") {
      if (!corpo.texto || !corpo.hoje || !Array.isArray(corpo.areas)) {
        res.status(400).json({ erro: "Campos faltando" });
        return;
      }
      res.status(200).json(await chamarGemini(promptPlanejar(corpo), { orcamentoMs: 25000 }));
      return;
    }
    if (corpo.acao === "resumo") {
      res.status(200).json(await chamarGemini(promptResumo(corpo), { orcamentoMs: 20000 }));
      return;
    }
    res.status(400).json({ erro: "Ação desconhecida" });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message });
  }
};
