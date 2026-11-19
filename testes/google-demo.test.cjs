// Demonstração: grava só na aba "Demonstração", sem texto livre, e nunca com o script antigo.
const assert = require("node:assert/strict");
const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const novo = () => { delete require.cache[require.resolve("../api/google.js")]; return require("../api/google.js"); };
process.env.GOOGLE_SCRIPT_URL = "https://script.test/exec";
process.env.GOOGLE_SCRIPT_TOKEN = "abc";
const hoje = new Date().toISOString().slice(0, 10);
const eventos = [
  { tipo: "desafio", area: "Dados", titulo: "<script>alert(1)</script> visite http://spam.example", data: hoje, entrega: hoje, local: "http://phishing.example" },
  { tipo: "treinamento", area: "Marketing", titulo: "qualquer", data: hoje, hora: "19:00" },
  { tipo: "aviso", area: "Inventada", titulo: "texto ofensivo", data: hoje, hora: "99:99" },
  { tipo: "aviso", area: "Geral", titulo: "Reunião geral", data: hoje, interno: true },
  { tipo: "outro", data: hoje },
  { tipo: "desafio", area: "Dados", data: "1999-01-01" },
];

(async () => {
  // 1. Script antigo (sem versão): não envia nada e avisa.
  let h = novo();
  let posts = 0;
  global.fetch = async (url, opt) => {
    if (opt && opt.method === "POST") { posts++; return { status: 200, text: async () => JSON.stringify({ ok: true, itens: 0 }) }; }
    return { status: 200, text: async () => JSON.stringify({ ok: true, servico: "repasse" }) };
  };
  let r = res(); await h({ method: "POST", headers: {}, body: { demo: true, eventos } }, r);
  assert.equal(r.code, 409); assert.equal(r.body.scriptAntigo, true); assert.equal(posts, 0);

  // 2. Script novo: envia para a aba de demonstração, com títulos montados pelo servidor.
  h = novo();
  let enviado = null;
  global.fetch = async (url, opt) => {
    if (opt && opt.method === "POST") { enviado = JSON.parse(opt.body); return { status: 200, text: async () => JSON.stringify({ ok: true, itens: enviado.eventos.length, destino: "demonstracao", gid: 123 }) }; }
    return { status: 200, text: async () => JSON.stringify({ ok: true, versao: 2 }) };
  };
  r = res(); await h({ method: "POST", headers: {}, body: { demo: true, eventos } }, r);
  assert.equal(r.code, 200); assert.equal(r.body.gid, 123); assert.equal(r.body.demonstracao, true);
  assert.equal(enviado.destino, "demonstracao");
  assert.equal(enviado.eventos.length, 3); // interno, tipo inválido e data fora do intervalo ficam de fora
  const texto = JSON.stringify(enviado.eventos);
  assert.ok(!/script|spam|phishing|ofensivo|qualquer|Reunião/.test(texto), texto);
  assert.deepEqual(enviado.eventos.map((e) => e.titulo), ["Desafio de Dados", "Treinamento síncrono de Marketing", "Aviso aos aspirantes"]);
  assert.equal(enviado.eventos[2].area, "Geral"); assert.equal(enviado.eventos[2].hora, null);

  // 3. Várias chamadas seguidas: a segunda espera.
  r = res(); await h({ method: "POST", headers: {}, body: { demo: true, eventos } }, r);
  assert.equal(r.code, 429);

  // 4. Script que não confirma a aba de demonstração: erro, não sucesso.
  h = novo();
  global.fetch = async (url, opt) => {
    if (opt && opt.method === "POST") return { status: 200, text: async () => JSON.stringify({ ok: true, itens: 1 }) };
    return { status: 200, text: async () => JSON.stringify({ ok: true, versao: 2 }) };
  };
  r = res(); await h({ method: "POST", headers: {}, body: { demo: true, eventos } }, r);
  assert.equal(r.code, 502);

  console.log("GOOGLE DEMO OK");
})().catch((e) => { console.error(e); process.exit(1); });
