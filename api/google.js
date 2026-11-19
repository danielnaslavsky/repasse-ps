// Função serverless da Vercel que envia o cronograma para o Apps Script da planilha do PS.
// Variáveis de ambiente:
//   GOOGLE_SCRIPT_URL    URL do app da Web do Apps Script (ver google/apps-script.gs)
//   GOOGLE_SCRIPT_TOKEN  o mesmo código definido em TOKEN no Apps Script
//   GOOGLE_SHEET_URL     opcional: link da planilha, para o site mostrar o botão "Abrir planilha"

const A = require("./_armazem.js");

// ---------- Demonstração ----------
// No link puro do site (sem código), "Atualizar planilha" grava na aba "Demonstração", nunca nas abas reais.
// Ninguém escreve texto livre na planilha: os títulos são montados aqui, a partir do tipo e da subárea.
const AREAS = ["Comercial", "Marketing", "Dados", "Desenvolvimento", "Produto", "Gente e Gestão", "Inovação", "Geral"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ROTULO = { desafio: "Desafio", treinamento: "Treinamento síncrono", etapa: "Etapa", aviso: "Aviso" };

function eventosDemonstracao(eventos, hoje = new Date().toISOString().slice(0, 10)) {
  const somar = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const min = somar(hoje, -90);
  const max = somar(hoje, 400);
  const dentro = (iso) => ISO.test(iso || "") && iso >= min && iso <= max;
  return (Array.isArray(eventos) ? eventos : [])
    .filter((e) => e && !e.interno && dentro(e.data) && ROTULO[e.tipo])
    .slice(0, 40)
    .map((e) => {
      const area = AREAS.includes(e.area) ? e.area : "Geral";
      const titulo = {
        desafio: `Desafio de ${area}`,
        treinamento: `Treinamento síncrono de ${area}`,
        etapa: "Etapa com a equipe (dinâmica, entrevistas)",
        aviso: area === "Geral" ? "Aviso aos aspirantes" : `Aviso de ${area}`,
      }[e.tipo];
      return {
        tipo: e.tipo,
        tipoRotulo: ROTULO[e.tipo],
        titulo,
        area,
        data: e.data,
        hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(e.hora || "") ? e.hora : null,
        entrega: e.tipo === "desafio" && dentro(e.entrega) && e.entrega >= e.data ? e.entrega : null,
        local: "",
        descricao: "",
      };
    });
}

let versaoScript = { valor: 0, em: 0 };
let ultimaDemo = 0;

async function versaoDoScript(url) {
  if (versaoScript.valor >= 2 && Date.now() - versaoScript.em < 10 * 60e3) return versaoScript.valor;
  try {
    const r = await fetch(url, { redirect: "follow" });
    const j = JSON.parse(await r.text());
    versaoScript = { valor: Number(j.versao) || 1, em: Date.now() };
  } catch (e) {
    versaoScript = { valor: 0, em: Date.now() };
  }
  return versaoScript.valor;
}

async function enviarDemonstracao(eventos) {
  const url = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!url || !token) return { ok: false, status: 503, naoConfigurado: true, erro: "Planilha do Google não configurada na Vercel" };
  // Script antigo não conhece a aba de demonstração e gravaria nas abas reais: não envia.
  if ((await versaoDoScript(url)) < 2) {
    return { ok: false, status: 409, scriptAntigo: true, erro: "o Apps Script da planilha precisa ser atualizado para aceitar a aba Demonstração" };
  }
  if (Date.now() - ultimaDemo < 3000) return { ok: false, status: 429, erro: "aguarde alguns segundos e tente de novo" };
  ultimaDemo = Date.now();
  const lista = eventosDemonstracao(eventos);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token, destino: "demonstracao", eventos: lista }),
      redirect: "follow",
    });
    const dados = JSON.parse(await resp.text());
    if (!dados.ok) return { ok: false, status: 502, erro: dados.erro || "erro no Apps Script" };
    if (dados.destino !== "demonstracao") return { ok: false, status: 502, erro: "o Apps Script não confirmou a aba Demonstração" };
    return { ok: true, status: 200, demonstracao: true, itens: dados.itens, gid: dados.gid };
  } catch (e) {
    return { ok: false, status: 502, erro: e.message };
  }
}

// Envia a lista de eventos ao Apps Script. Devolve { ok, status, erro, itens, naoConfigurado }.
async function enviarPlanilha(eventos) {
  const url = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!url || !token) return { ok: false, status: 503, naoConfigurado: true, erro: "Planilha do Google não configurada na Vercel" };
  const limpo = (s, n) => String(s == null ? "" : s).slice(0, n);
  const lista = (Array.isArray(eventos) ? eventos.slice(0, 200) : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.data || ""))
    .map((e) => ({
      tipo: ["desafio", "treinamento", "etapa", "aviso"].includes(e.tipo) ? e.tipo : "aviso",
      tipoRotulo: limpo(e.tipoRotulo, 40),
      titulo: limpo(e.titulo, 120),
      area: limpo(e.area, 40),
      data: e.data,
      hora: /^\d{2}:\d{2}$/.test(e.hora || "") ? e.hora : null,
      entrega: /^\d{4}-\d{2}-\d{2}$/.test(e.entrega || "") ? e.entrega : null,
      local: limpo(e.local, 160),
      descricao: limpo(e.descricao, 400),
    }));
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token, eventos: lista }),
      redirect: "follow",
    });
    const texto = await resp.text();
    let dados;
    try { dados = JSON.parse(texto); } catch (e) {
      return { ok: false, status: 502, erro: `Apps Script não devolveu JSON (HTTP ${resp.status}). Confira se a implantação está como "Qualquer pessoa".` };
    }
    if (!dados.ok) return { ok: false, status: 502, erro: dados.erro || "erro no Apps Script" };
    return { ok: true, status: 200, ...dados };
  } catch (e) {
    return { ok: false, status: 500, erro: e.message };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET" && req.query && req.query.diagnostico) {
    const url = process.env.GOOGLE_SCRIPT_URL;
    const info = {
      GOOGLE_SCRIPT_URL: url ? "definida" : "FALTANDO",
      GOOGLE_SCRIPT_TOKEN: process.env.GOOGLE_SCRIPT_TOKEN ? "definida" : "FALTANDO",
      GOOGLE_SHEET_URL: process.env.GOOGLE_SHEET_URL ? "definida" : "opcional, não definida",
    };
    if (url) {
      try {
        const r = await fetch(url, { redirect: "follow" });
        const t = await r.text();
        let j = null;
        try { j = JSON.parse(t); } catch (e) { /* não é JSON */ }
        info.script = j && j.ok ? "respondendo" : `não respondeu como esperado (HTTP ${r.status}). Confira se a URL termina em /exec e se o acesso é "Qualquer pessoa".`;
        if (!(j && j.ok)) {
          const titulo = (t.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
          const corpo = t.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          info.respostaDoGoogle = { titulo: titulo.slice(0, 120), trecho: corpo.slice(0, 300) };
          info.urlTermina = url.slice(-12);
        }
        if (url.includes("/dev")) info.dica = "A URL termina em /dev: use a URL de implantação, que termina em /exec.";
      } catch (e) {
        info.script = `erro ao acessar: ${e.message}`;
      }
    }
    res.status(200).json(info);
    return;
  }
  if (req.method === "GET") {
    res.status(200).json({
      configurado: !!(process.env.GOOGLE_SCRIPT_URL && process.env.GOOGLE_SCRIPT_TOKEN),
      planilha: process.env.GOOGLE_SHEET_URL || null,
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Use POST" });
    return;
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; }
  }
  if (corpo && corpo.demo === true) {
    const r = await enviarDemonstracao(corpo.eventos);
    if (r.ok) res.status(200).json(r);
    else res.status(r.status).json({ erro: r.erro, scriptAntigo: !!r.scriptAntigo, naoConfigurado: !!r.naoConfigurado });
    return;
  }
  if (!(await A.autorizarPublicacao(req))) {
    res.status(403).json({ erro: "Atualizar a planilha só é possível no modo equipe", demonstracao: true });
    return;
  }
  const r = await enviarPlanilha(corpo && corpo.eventos);
  if (r.ok) res.status(200).json(r);
  else res.status(r.status).json({ erro: r.erro, naoConfigurado: !!r.naoConfigurado });
};

module.exports.enviarPlanilha = enviarPlanilha;
module.exports.enviarDemonstracao = enviarDemonstracao;
module.exports.eventosDemonstracao = eventosDemonstracao;
