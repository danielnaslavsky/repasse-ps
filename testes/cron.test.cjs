// Rotina diária com Redis, Discord e Apps Script simulados.
const assert = require("node:assert/strict");
const mem = {}; const enviados = [];
global.fetch = async (url, opt) => {
  if (url.startsWith("https://redis.test")) {
    const a = JSON.parse(opt.body); let result = null;
    if (a[0] === "GET") result = mem[a[1]] ?? null;
    else if (a[0] === "EVAL") { const v = Number(mem[a[4]] || 0); if (v !== Number(a[6])) result = [0, v]; else { mem[a[3]] = a[5]; mem[a[4]] = String(v + 1); result = [1, v + 1]; } }
    return { ok: true, json: async () => ({ result }) };
  }
  enviados.push({ url, body: JSON.parse(opt.body) });
  if (url.startsWith("https://script.test")) return { status: 200, text: async () => JSON.stringify({ ok: true, itens: 3 }) };
  return { ok: true, text: async () => "" };
};
Object.assign(process.env, { UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "t", PS_CODIGO_GERENTE: "chefe", CRON_SECRET: "s",
  DISCORD_WEBHOOK_ASPIRANTES: "https://discord.test/asp", DISCORD_WEBHOOK_EQUIPE: "https://discord.test/eq", GOOGLE_SCRIPT_URL: "https://script.test/exec", GOOGLE_SCRIPT_TOKEN: "x" });
const handler = require("../api/cron.js");
const res = () => { const r = { code: 0, body: null, setHeader() {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
(async () => {
  const D = await import("../js/dados.js");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  mem["repasse:estado"] = JSON.stringify(D.dadosDemonstracao(hoje)); mem["repasse:versao"] = "5";
  let r = res(); await handler({ headers: {}, query: {} }, r); assert.equal(r.code, 401);
  r = res(); await handler({ headers: { authorization: "Bearer s" }, query: {} }, r);
  console.log(r.code, JSON.stringify(r.body, null, 1).slice(0, 900));
  assert.equal(r.code, 200); assert.equal(mem["repasse:versao"], "6");
  assert.ok(enviados.some((e) => e.url.includes("/asp"))); assert.ok(enviados.some((e) => e.url.includes("/eq")));
  const n = enviados.length;
  r = res(); await handler({ headers: {}, query: { codigo: "chefe" } }, r);
  assert.equal(r.body.aspirantes, "nada para lembrar hoje"); // não repete o lembrete no mesmo dia
  console.log("CRON OK", enviados.length - n, "mensagens na 2ª execução");
})();
