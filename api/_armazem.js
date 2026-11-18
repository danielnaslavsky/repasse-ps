// Acesso ao Upstash Redis pela API REST (sem bibliotecas).
// Aceita os nomes de variável da integração da Vercel (KV_REST_API_*) e do Upstash (UPSTASH_REDIS_REST_*).

const CHAVE_ESTADO = "repasse:estado";
const CHAVE_VERSAO = "repasse:versao";

function config() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function comando(args) {
  const c = config();
  if (!c) throw Object.assign(new Error("Banco (Upstash) não configurado na Vercel"), { status: 503, naoConfigurado: true });
  const resp = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || dados.error) throw new Error(`Upstash: ${dados.error || resp.status}`);
  return dados.result;
}

async function lerVersao() {
  const v = await comando(["GET", CHAVE_VERSAO]);
  return v ? Number(v) : 0;
}

async function lerEstado() {
  const [bruto, versao] = await Promise.all([comando(["GET", CHAVE_ESTADO]), lerVersao()]);
  return { estado: bruto ? JSON.parse(bruto) : null, versao };
}

// Grava só se ninguém gravou desde versaoBase (atômico, via script Lua).
const LUA = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v ~= tonumber(ARGV[2]) then return {0, v} end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], v + 1)
return {1, v + 1}`;

async function gravarEstado(estado, versaoBase) {
  const r = await comando(["EVAL", LUA, "2", CHAVE_ESTADO, CHAVE_VERSAO, JSON.stringify(estado), String(versaoBase)]);
  return { ok: Number(r[0]) === 1, versao: Number(r[1]) };
}

// Quem é o dono deste código de acesso?
function identificar(codigo, estado) {
  const gerente = process.env.PS_CODIGO_GERENTE;
  if (!codigo) return null;
  if (gerente && codigo === gerente) {
    const g = estado && estado.membros.find((m) => m.papel === "gerente");
    return { papel: "gerente", membroId: g ? g.id : null };
  }
  const m = estado && estado.membros.find((x) => x.codigo && x.codigo === codigo && x.ativo !== false);
  return m ? { papel: m.papel, membroId: m.id } : null;
}

module.exports = { config, comando, lerEstado, lerVersao, gravarEstado, identificar };
