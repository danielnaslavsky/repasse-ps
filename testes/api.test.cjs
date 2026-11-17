const assert = require("node:assert/strict");
const handler = require("../api/ia.js");
function res() { const r = { code: 0, body: null, status(c){ r.code=c; return r; }, json(b){ r.body=b; return r; } }; return r; }
(async () => {
  // sem chave
  delete process.env.GEMINI_API_KEY;
  let r = res(); await handler({ method: "POST", body: { acao: "resumo", contexto: {} } }, r);
  assert.equal(r.code, 503);
  // com chave e fetch simulado
  process.env.GEMINI_API_KEY = "teste";
  let urlChamada, headers;
  global.fetch = async (url, opt) => { urlChamada = url; headers = opt.headers; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"titulo":"Corrigir desafio de Marketing","tipoId":"tp_corrigir","area":"Marketing","prazo":"2026-11-20","quantidade":14,"esforcoPorUnidadeH":0.5,"maxPessoas":null,"observacao":""}' }] } }] }) }; };
  r = res(); await handler({ method: "POST", body: JSON.stringify({ acao: "interpretar", texto: "x", hoje: "2026-11-17", areas: ["Marketing"], tipos: [] }) }, r);
  assert.equal(r.code, 200); assert.equal(r.body.quantidade, 14);
  assert.ok(urlChamada.includes("gemini-flash-lite-latest:generateContent")); assert.equal(headers["x-goog-api-key"], "teste");
  r = res(); await handler({ method: "GET" }, r); assert.equal(r.code, 405);
  console.log("API OK");
})();
(async () => {
  const r = { code: 0, body: null, status(c){ r.code=c; return r; }, json(b){ r.body=b; return r; } };
  await handler({ method: "GET", query: { diagnostico: "1" } }, r);
  assert.equal(r.code, 200); assert.ok("ok" in r.body); console.log("DIAG", r.body);
})();
