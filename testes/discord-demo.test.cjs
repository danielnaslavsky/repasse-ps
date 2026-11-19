// Demonstração: mensagem montada pelo servidor, sem texto livre, sem marcar ninguém, sem webhook real.
(async () => {
  const assert = require("node:assert/strict");
  delete require.cache[require.resolve("../api/discord.js")];
  const h = require("../api/discord.js");
  const hoje = new Date().toISOString().slice(0, 10);
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  const chamadas = [];
  const fetchAntes = global.fetch;
  global.fetch = async (url) => { chamadas.push(url); return { ok: true, status: 200, text: async () => "{}" }; };
  delete process.env.DISCORD_WEBHOOK_DEMO;
  process.env.DISCORD_WEBHOOK_ASPIRANTES = "https://discord.test/aspirantes";
  await h({ method: "POST", headers: {}, body: { demo: true, tipo: "cronograma", eventos: [{ tipo: "desafio", area: "Dados", titulo: "@everyone http://x.y", data: hoje, entrega: hoje }] } }, r);
  assert.equal(r.code, 200); assert.equal(r.body.publicado, false);
  assert.equal(chamadas.length, 0, "a demonstração não pode usar o webhook real");
  const texto = JSON.stringify(r.body.previa);
  assert.ok(texto.includes("Desafio de Dados") && !/everyone|http/.test(texto), texto);
  process.env.DISCORD_WEBHOOK_DEMO = "https://discord.test/demo";
  await h({ method: "POST", headers: {}, body: { demo: true, tipo: "lembrete", hoje, eventos: [] } }, r);
  assert.equal(r.body.publicado, true); assert.ok(chamadas[0].startsWith("https://discord.test/demo"));
  delete process.env.DISCORD_WEBHOOK_DEMO;
  global.fetch = fetchAntes;
  console.log("DISCORD DEMO OK");
})().catch((e) => { console.error(e); process.exit(1); });
