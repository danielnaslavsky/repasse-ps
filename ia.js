// Função serverless da Vercel que conversa com o Gemini.
// A chave fica na variável de ambiente GEMINI_API_KEY (configurada na Vercel),
// nunca no código nem no navegador.

const MODELO_PADRAO = "gemini-flash-latest";

function promptInterpretar({ texto, hoje, areas, tipos }) {
  return `Você organiza as tarefas da equipe que conduz o processo seletivo (PS) de uma empresa júnior.
Transforme o pedido do gerente em uma tarefa estruturada.

Hoje é ${hoje} (formato AAAA-MM-DD). Converta prazos relativos ("sexta", "amanhã", "semana que vem") em uma data AAAA-MM-DD a partir de hoje. Se não houver prazo, devolva prazo null.

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

function promptResumo({ contexto }) {
  return `Você é o assistente da gerente do processo seletivo (PS) de uma empresa júnior.
Com base nos dados abaixo, escreva um resumo curto em português (no máximo 5 frases, sem títulos, sem listas, sem emojis) dizendo:
o que está atrasado ou em risco, quem está sobrecarregado ou com folga, e uma ação concreta para hoje.
Use os nomes das pessoas. Não invente nada que não esteja nos dados.

Dados (JSON):
${JSON.stringify(contexto).slice(0, 12000)}

Responda apenas com JSON: {"texto": string}`;
}

async function chamarGemini(prompt) {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    const erro = new Error("GEMINI_API_KEY não configurada na Vercel");
    erro.status = 503;
    throw erro;
  }
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    const erro = new Error(`Gemini respondeu ${resp.status}: ${corpo.slice(0, 300)}`);
    erro.status = 502;
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
}

module.exports = async function handler(req, res) {
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
    if (corpo.acao === "resumo") {
      res.status(200).json(await chamarGemini(promptResumo(corpo)));
      return;
    }
    res.status(400).json({ erro: "Ação desconhecida" });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message });
  }
};
