// Testa a API do estado compartilhado com um Redis simulado em memória.
const assert = require("node:assert/strict");
const mem = {};
global.fetch = async (url, opt) => {
  const args = JSON.parse(opt.body);
  let result = null;
  if (args[0] === "GET") result = mem[args[1]] ?? null;
  else if (args[0] === "SET") { mem[args[1]] = args[2]; result = "OK"; }
  else if (args[0] === "EVAL") {
    const [, , , kE, kV, valor, base] = args;
    const v = Number(mem[kV] || 0);
    if (v !== Number(base)) result = [0, v];
    else { mem[kE] = valor; mem[kV] = String(v + 1); result = [1, v + 1]; }
  }
  return { ok: true, json: async () => ({ result }) };
};
process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "t";
process.env.PS_CODIGO_GERENTE = "chefe";
const handler = require("../api/estado.js");
const res = () => { const r = { code: 0, body: null, setHeader() {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (method, codigo, extra = {}) => ({ method, headers: { "x-codigo": codigo }, query: extra.query || {}, body: extra.body });
(async () => {
  let r = res(); await handler(req("GET", "errado"), r); assert.equal(r.code, 401);
  r = res(); await handler(req("GET", "chefe"), r); assert.equal(r.code, 200); assert.equal(r.body.estado, null);
  const estado = { membros: [{ id: "g", papel: "gerente", nome: "G" }, { id: "a", papel: "membro", nome: "A", codigo: "ana123", ativo: true }], tasks: [] };
  r = res(); await handler(req("PUT", "chefe", { body: { estado, versaoBase: 0 } }), r); assert.equal(r.code, 200); assert.equal(r.body.versao, 1);
  r = res(); await handler(req("GET", "ana123"), r); assert.equal(r.code, 200); assert.equal(r.body.perfil.membroId, "a");
  r = res(); await handler(req("PUT", "ana123", { body: { estado: { ...estado, tasks: [{ id: 1 }] }, versaoBase: 0 } }), r); assert.equal(r.code, 409); assert.equal(r.body.versao, 1);
  r = res(); await handler(req("PUT", "ana123", { body: { estado: { ...estado, tasks: [{ id: 1 }] }, versaoBase: 1 } }), r); assert.equal(r.code, 200);
  r = res(); await handler(req("GET", "ana123", { query: { versao: "1" } }), r); assert.equal(r.body.versao, 2);
  r = res(); await handler(req("GET", "", { query: { diagnostico: "1" } }), r); assert.equal(r.body.conexao, "ok");
  console.log("ESTADO OK");
})();
