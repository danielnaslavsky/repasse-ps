const assert = require("node:assert/strict");
const handler = require("../api/discord.js");
const res = () => { const r = { code: 0, body: null, status(c){ r.code=c; return r; }, json(b){ r.body=b; return r; } }; return r; };
(async () => {
  delete process.env.DISCORD_WEBHOOK_ASPIRANTES;
  let r = res(); await handler({ method: "POST", body: { tipo: "lembrete", hoje: [], amanha: [] } }, r);
  assert.equal(r.code, 503);
  process.env.DISCORD_WEBHOOK_ASPIRANTES = "https://discord.test/hook";
  let enviado;
  global.fetch = async (url, opt) => { enviado = { url, body: JSON.parse(opt.body) }; return { ok: true, text: async () => "" }; };
  r = res(); await handler({ method: "POST", body: { tipo: "mudanca", evento: { titulo: "Treino @everyone" }, antes: "qua 19h", depois: "qui 20h" } }, r);
  assert.equal(r.code, 200); assert.ok(enviado.url.includes("wait=true"));
  assert.deepEqual(enviado.body.allowed_mentions, { parse: [] });
  assert.ok(!enviado.body.embeds[0].title.includes("@everyone"));
  process.env.DISCORD_PIN = "1234";
  r = res(); await handler({ method: "POST", body: { tipo: "lembrete", pin: "x" } }, r); assert.equal(r.code, 401);
  r = res(); await handler({ method: "POST", body: { tipo: "task", titulo: "x", partes: ["a"], pin: "1234" } }, r); assert.equal(r.code, 503);
  console.log("DISCORD OK");
})();
