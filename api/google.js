// Função serverless da Vercel que envia o cronograma para o Apps Script da planilha do PS.
// Variáveis de ambiente:
//   GOOGLE_SCRIPT_URL    URL do app da Web do Apps Script (ver google/apps-script.gs)
//   GOOGLE_SCRIPT_TOKEN  o mesmo código definido em TOKEN no Apps Script
//   GOOGLE_SHEET_URL     opcional: link da planilha, para o site mostrar o botão "Abrir planilha"

module.exports = async function handler(req, res) {
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
  const url = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!url || !token) {
    res.status(503).json({ erro: "Planilha do Google não configurada na Vercel", naoConfigurado: true });
    return;
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; }
  }
  const eventos = Array.isArray(corpo && corpo.eventos) ? corpo.eventos.slice(0, 200) : [];
  const limpo = (s, n) => String(s == null ? "" : s).slice(0, n);
  const lista = eventos
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
      res.status(502).json({ erro: `Apps Script não devolveu JSON (HTTP ${resp.status}). Confira se a implantação está como "Qualquer pessoa".` });
      return;
    }
    if (!dados.ok) {
      res.status(502).json({ erro: dados.erro || "erro no Apps Script" });
      return;
    }
    res.status(200).json(dados);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
