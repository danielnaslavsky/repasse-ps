// Função serverless da Vercel que envia o cronograma para o Apps Script da planilha do PS.
// Variáveis de ambiente:
//   GOOGLE_SCRIPT_URL    URL do app da Web do Apps Script (ver google/apps-script.gs)
//   GOOGLE_SCRIPT_TOKEN  o mesmo código definido em TOKEN no Apps Script
//   GOOGLE_SHEET_URL     opcional: link da planilha, para o site mostrar o botão "Abrir planilha"

const A = require("./_armazem.js");

// Envia a lista de eventos ao Apps Script. Devolve { ok, status, erro, itens, naoConfigurado }.
async function enviarPlanilha(eventos) {
  const url = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!url || !token) return { ok: false, status: 503, naoConfigurado: true, erro: "Planilha do Google não configurada na Vercel" };
  const limpo = (s, n) => String(s == null ? "" : s).slice(0, n);
  const lista = (Array.isArray(eventos) ? eventos.slice(0, 200) : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.data || ""))
    .map((e) => ({
      tipo: ["desafio", "treinamento", "aviso"].includes(e.tipo) ? e.tipo : "aviso",
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
  if (!(await A.autorizarPublicacao(req))) {
    res.status(403).json({ erro: "Atualizar a planilha só é possível no modo equipe", demonstracao: true });
    return;
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; }
  }
  const r = await enviarPlanilha(corpo && corpo.eventos);
  if (r.ok) res.status(200).json(r);
  else res.status(r.status).json({ erro: r.erro, naoConfigurado: !!r.naoConfigurado });
};

module.exports.enviarPlanilha = enviarPlanilha;
