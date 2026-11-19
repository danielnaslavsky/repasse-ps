// Gemini sobrecarregado (503): o servidor tenta de novo e passa para outro modelo.
const assert = require("node:assert/strict");
process.env.GEMINI_API_KEY = "teste";
delete process.env.GEMINI_MODEL;
const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const ok = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), text: async () => "" });
const falha = (status) => ({ ok: false, status, json: async () => ({}), text: async () => JSON.stringify({ error: { code: status, status: "UNAVAILABLE" } }) });
const pedido = { method: "POST", headers: {}, body: { acao: "resumo", contexto: "x" } };

(async () => {
  const h = require("../api/ia.js");
  // 1. principal sobrecarregado duas vezes; reserva vem da lista de modelos da conta
  let chamados = [];
  const lista = { ok: true, status: 200, json: async () => ({ models: [
    { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-flash-lite-latest", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.0-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.0-flash-preview-image-generation", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
  ] }) };
  global.fetch = async (url) => {
    if (/models\?pageSize/.test(url)) return lista;
    chamados.push(url.match(/models\/([^:]+)/)[1]);
    return chamados.length <= 2 ? falha(503) : ok({ resumo: "tudo certo" });
  };
  let r = res(); await h(pedido, r);
  assert.equal(r.code, 200); assert.equal(r.body.resumo, "tudo certo");
  assert.deepEqual(chamados, ["gemini-flash-lite-latest", "gemini-flash-lite-latest", "gemini-2.0-flash-lite"]);

  // 2. modelo de reserva inexistente (404) é pulado
  chamados = [];
  global.fetch = async (url) => { if (/pageSize/.test(url)) return lista; const m = url.match(/models\/([^:]+)/)[1]; chamados.push(m); if (m === "gemini-flash-lite-latest") return falha(503); if (m === "gemini-2.0-flash-lite") return falha(404); return ok({ resumo: "reserva 2" }); };
  r = res(); await h(pedido, r);
  assert.equal(r.body.resumo, "reserva 2");

  // 3. chave inválida (400/403): não insiste
  chamados = [];
  global.fetch = async (url) => { chamados.push(url); return falha(403); };
  r = res(); await h(pedido, r);
  assert.notEqual(r.code, 200); assert.equal(chamados.length, 1);

  // 4. sobrecarga no principal e 404 nas reservas: o erro mostrado é a sobrecarga, não o 404
  chamados = [];
  global.fetch = async (url) => { if (/pageSize/.test(url)) return lista; const m = url.match(/models\/([^:]+)/)[1]; chamados.push(m); return m === "gemini-flash-lite-latest" ? falha(503) : falha(404); };
  r = res(); await h(pedido, r);
  assert.notEqual(r.code, 200); assert.equal(chamados.length, 4);
  assert.match(r.body.erro, /503/);
  console.log("IA RESERVA OK");
})().catch((e) => { console.error(e); process.exit(1); });
