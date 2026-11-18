const assert = require("node:assert/strict");
const handler = require("../api/google.js");
const res = () => { const r = { code: 0, body: null, status(c){ r.code=c; return r; }, json(b){ r.body=b; return r; } }; return r; };
(async () => {
  delete process.env.GOOGLE_SCRIPT_URL;
  let r = res(); await handler({ method: "POST", body: { eventos: [] } }, r); assert.equal(r.code, 503);
  process.env.GOOGLE_SCRIPT_URL = "https://script.test/exec"; process.env.GOOGLE_SCRIPT_TOKEN = "abc";
  let enviado;
  global.fetch = async (url, opt) => { enviado = JSON.parse(opt.body); return { status: 200, text: async () => JSON.stringify({ ok: true, itens: enviado.eventos.length }) }; };
  r = res(); await handler({ method: "POST", body: { eventos: [{ tipo: "desafio", data: "2026-11-23", entrega: "2026-11-27", titulo: "Desafio de Dados" }, { data: "x" }] } }, r);
  assert.equal(r.code, 200); assert.equal(enviado.token, "abc"); assert.equal(enviado.eventos.length, 1);
  global.fetch = async () => ({ status: 200, text: async () => "<html>login</html>" });
  r = res(); await handler({ method: "POST", body: { eventos: [] } }, r); assert.equal(r.code, 502);
  console.log("GOOGLE OK");
})();
