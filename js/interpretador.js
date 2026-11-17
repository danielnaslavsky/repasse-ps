// Interpretação de pedidos em linguagem natural.
// 1º tenta a IA (função /api/ia na Vercel). Se não houver IA, usa regras locais.

import { somarDias, deISO, paraISO } from "./datas.js";

const NOMES_DIAS = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terça: 2,
  terca: 2,
  "terça-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sábado: 6,
  sabado: 6,
};

const PALAVRAS_AREA = [
  ["Gente e Gestão", ["gente e gestão", "gente e gestao", "g&g", "gg", "rh"]],
  ["Desenvolvimento", ["desenvolvimento", "dev", "código", "codigo", "programação"]],
  ["Marketing", ["marketing", "mkt"]],
  ["Comercial", ["comercial", "vendas"]],
  ["Dados", ["dados", "data", "bi"]],
  ["Projetos", ["projetos", "projeto"]],
];

const PALAVRAS_TIPO = [
  ["corrigir", ["corrigir", "correção", "correcao", "avaliar", "entregas", "desafio"]],
  ["entrevista", ["entrevista", "entrevistar"]],
  ["responder", ["responder", "resposta", "dúvidas", "duvidas", "e-mail", "email", "mensagens"]],
  ["dinamica", ["dinâmica", "dinamica"]],
  ["consolidar", ["consolidar", "notas", "planilha de notas", "deliberação", "deliberacao"]],
  ["divulgacao", ["divulgar", "divulgação", "divulgacao", "post", "edital"]],
];

function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function contem(texto, termo) {
  const t = semAcento(texto.toLowerCase());
  const p = semAcento(termo.toLowerCase());
  return new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}s?([^a-z0-9]|$)`).test(t);
}

export function lerPrazo(texto, hoje) {
  const t = semAcento(texto.toLowerCase());
  if (/depois de amanha/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bhoje\b/.test(t)) return hoje;

  const data = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (data) {
    const dia = Number(data[1]);
    const mes = Number(data[2]);
    let ano = data[3] ? Number(data[3]) : deISO(hoje).getFullYear();
    if (ano < 100) ano += 2000;
    let iso = paraISO(new Date(ano, mes - 1, dia));
    if (!data[3] && iso < hoje) iso = paraISO(new Date(ano + 1, mes - 1, dia));
    return iso;
  }

  const emDias = t.match(/em (\d+) dias?/);
  if (emDias) return somarDias(hoje, Number(emDias[1]));

  if (/semana que vem|proxima semana/.test(t)) return somarDias(hoje, 7);

  // Dia da semana só conta como prazo depois de "até", "na", "pra"... ("segunda fase" não é prazo)
  for (const [nome, alvo] of Object.entries(NOMES_DIAS)) {
    const n = semAcento(nome);
    if (new RegExp(`(?:ate|na|no|para|pra|dia|prazo:?|ate a|ate o)\\s+${n}(?:-feira)?\\b`).test(t)) {
      const atual = deISO(hoje).getDay();
      let delta = (alvo - atual + 7) % 7;
      if (delta === 0) delta = 7;
      return somarDias(hoje, delta);
    }
  }
  return null;
}

export function lerQuantidade(texto) {
  const m = texto.match(
    /\b(\d{1,3})\s+(?:entregas?|entrevistas?|candidat[oa]s?|aspirantes?|desafios?|mensagens?|e-?mails?|d[úu]vidas?|pessoas?)/i
  );
  return m ? Number(m[1]) : 1;
}

export function lerMaxPessoas(texto) {
  const t = semAcento(texto.toLowerCase());
  const m = t.match(/(?:no maximo|ate|max\.?|entre)\s+(\d{1,2})\s+pessoas/);
  return m ? Number(m[1]) : null;
}

export function lerArea(texto, areas) {
  for (const [area, termos] of PALAVRAS_AREA) {
    if (!areas.includes(area)) continue;
    if (termos.some((p) => contem(texto, p))) return area;
  }
  return "Geral";
}

export function lerTipo(texto, tipos) {
  for (const [chave, termos] of PALAVRAS_TIPO) {
    if (termos.some((p) => contem(texto, p))) {
      const tipo = tipos.find((t) => t.chave === chave);
      if (tipo) return tipo;
    }
  }
  return tipos.find((t) => t.chave === "outra") || tipos[0];
}

function tituloDe(texto) {
  let t = texto.trim().replace(/\s+/g, " ");
  t = t.replace(/[,.;]?\s*(at[ée]|para|pra|prazo:?)\s+.*$/i, "");
  if (t.length > 80) t = t.slice(0, 77) + "…";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function interpretarLocal(texto, estado, hoje) {
  const tipo = lerTipo(texto, estado.tipos);
  const area = lerArea(texto, estado.areas);
  const titulo =
    tipo.chave === "outra"
      ? tituloDe(texto)
      : area !== "Geral"
        ? `${tipo.nome} — ${area}`
        : tipo.nome;
  return {
    titulo,
    tipoId: tipo.id,
    area: area === "Geral" && tipo.areaPadrao ? tipo.areaPadrao : area,
    prazo: lerPrazo(texto, hoje) || somarDias(hoje, 3),
    prazoInferido: !lerPrazo(texto, hoje),
    quantidade: lerQuantidade(texto),
    esforcoPorUnidadeH: tipo.esforcoPadraoH,
    maxPessoas: lerMaxPessoas(texto),
    fonte: "regras",
  };
}

// Valida o que a IA devolveu; o que vier errado é substituído pela leitura local.
export function validarRespostaIA(r, local, estado) {
  const ok = {};
  ok.titulo = typeof r.titulo === "string" && r.titulo.trim() ? r.titulo.trim().slice(0, 90) : local.titulo;
  ok.tipoId = estado.tipos.some((t) => t.id === r.tipoId) ? r.tipoId : local.tipoId;
  ok.area = [...estado.areas, "Geral"].includes(r.area) ? r.area : local.area;
  // Datas: se as regras locais acharam um prazo explícito, elas mandam (conta de calendário é determinística).
  if (!local.prazoInferido) {
    ok.prazo = local.prazo;
    ok.prazoInferido = false;
  } else {
    ok.prazo = /^\d{4}-\d{2}-\d{2}$/.test(r.prazo || "") ? r.prazo : local.prazo;
    ok.prazoInferido = !r.prazo;
  }
  const q = Number(r.quantidade);
  ok.quantidade = Number.isFinite(q) && q >= 1 && q <= 500 ? Math.floor(q) : local.quantidade;
  const e = Number(r.esforcoPorUnidadeH);
  ok.esforcoPorUnidadeH = Number.isFinite(e) && e > 0 && e <= 40 ? e : local.esforcoPorUnidadeH;
  const mp = Number(r.maxPessoas);
  ok.maxPessoas = Number.isFinite(mp) && mp >= 1 && mp <= 50 ? Math.floor(mp) : local.maxPessoas;
  ok.observacao = typeof r.observacao === "string" ? r.observacao.slice(0, 240) : "";
  ok.fonte = "ia";
  return ok;
}

// fetch com limite de tempo: se a IA demorar, o sistema segue com as regras locais.
async function chamarIA(corpo, ms) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ms);
  try {
    const resp = await fetch("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    let dados = null;
    try { dados = await resp.json(); } catch (e) { /* resposta sem JSON */ }
    if (!resp.ok || !dados || dados.erro) {
      throw new Error((dados && dados.erro) || `HTTP ${resp.status}`);
    }
    return dados;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`a IA demorou mais de ${ms / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function interpretar(texto, estado, hoje) {
  const local = interpretarLocal(texto, estado, hoje);
  try {
    const dados = await chamarIA(
      {
        acao: "interpretar",
        texto,
        hoje,
        areas: estado.areas,
        tipos: estado.tipos.map((t) => ({
          id: t.id,
          nome: t.nome,
          esforcoPadraoH: t.esforcoPadraoH,
          divisivel: t.divisivel,
        })),
      },
      25000
    );
    return validarRespostaIA(dados, local, estado);
  } catch (e) {
    console.warn("IA indisponível:", e.message);
    return { ...local, avisoIA: `IA indisponível (${e.message}): interpretado pelas regras locais.` };
  }
}

export async function resumirComIA(contexto) {
  const dados = await chamarIA({ acao: "resumo", contexto }, 25000);
  return dados.texto;
}
