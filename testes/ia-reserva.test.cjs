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
  // 1. principal sobrecarregado duas vezes, reserva responde
  let chamados = [];
  global.fetch = async (url) => { chamados.push(url.match(/models\/([^:]+)/)[1]); return chamados.length <= 2 ? falha(503) : ok({ resumo: "tudo certo" }); };
  let r = res(); await h(pedido, r);
  assert.equal(r.code, 200); assert.equal(r.body.resumo, "tudo certo");
  assert.deepEqual(chamados, ["gemini-flash-lite-latest", "gemini-flash-lite-latest", "gemini-flash-latest"]);

  // 2. modelo de reserva inexistente (404) é pulado
  chamados = [];
  global.fetch = async (url) => { const m = url.match(/models\/([^:]+)/)[1]; chamados.push(m); if (m === "gemini-flash-lite-latest") return falha(503); if (m === "gemini-flash-latest") return falha(404); return ok({ resumo: "reserva 2" }); };
  r = res(); await h(pedido, r);
  assert.equal(r.body.resumo, "reserva 2");

  // 3. chave inválida (400/403): não insiste
  chamados = [];
  global.fetch = async (url) => { chamados.push(url); return falha(403); };
  r = res(); await h(pedido, r);
  assert.notEqual(r.code, 200); assert.equal(chamados.length, 1);

  // 4. todos sobrecarregados: erro, e o navegador cai nas regras locais
  chamados = [];
  global.fetch = async (url) => { chamados.push(url); return falha(503); };
  r = res(); await h(pedido, r);
  assert.notEqual(r.code, 200); assert.equal(chamados.length, 5);
  console.log("IA RESERVA OK");
})().catch((e) => { console.error(e); process.exit(1); });
