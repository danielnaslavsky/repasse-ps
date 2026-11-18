// Modo equipe: o estado fica no servidor (Upstash) e cada pessoa entra pelo seu link (?c=código).

const CHAVE = "ps-tasks:codigo";

// Lê o código do link (e tira da barra de endereço) ou o que ficou salvo neste navegador.
export function lerCodigo() {
  const params = new URLSearchParams(location.search);
  try {
    if (params.has("sair")) {
      localStorage.removeItem(CHAVE);
      history.replaceState(null, "", location.pathname);
      return null;
    }
    const doLink = params.get("c");
    if (doLink) {
      localStorage.setItem(CHAVE, doLink);
      params.delete("c");
      const resto = params.toString();
      history.replaceState(null, "", location.pathname + (resto ? `?${resto}` : ""));
      return doLink;
    }
    return localStorage.getItem(CHAVE);
  } catch (e) {
    return params.get("c");
  }
}

export function esquecerCodigo() {
  try { localStorage.removeItem(CHAVE); } catch (e) { /* nada */ }
}

async function chamar(metodo, codigo, { query = "", corpo } = {}) {
  const resp = await fetch(`/api/estado${query}`, {
    method: metodo,
    headers: { "x-codigo": codigo, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  let dados = {};
  try { dados = await resp.json(); } catch (e) { /* sem JSON */ }
  return { status: resp.status, dados };
}

export async function carregarRemoto(codigo) {
  const r = await chamar("GET", codigo);
  if (r.status !== 200) throw Object.assign(new Error(r.dados.erro || `HTTP ${r.status}`), { status: r.status });
  return r.dados;
}

export async function versaoRemota(codigo) {
  const r = await chamar("GET", codigo, { query: "?versao=1" });
  return r.status === 200 ? r.dados.versao : null;
}

export async function salvarRemoto(codigo, estado, versaoBase) {
  try {
    const r = await chamar("PUT", codigo, { corpo: { estado, versaoBase } });
    if (r.status === 200) return { ok: true, versao: r.dados.versao };
    if (r.status === 409) return { conflito: true, estado: r.dados.estado, versao: r.dados.versao };
    return { erro: r.dados.erro || `HTTP ${r.status}` };
  } catch (e) {
    return { erro: e.message };
  }
}

export function novoCodigo() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) s += letras[b % letras.length];
  return s;
}

// Todo membro precisa de um código para ter o seu link.
export function garantirCodigos(estado) {
  let mudou = false;
  for (const m of estado.membros) {
    if (m.papel === "membro" && !m.codigo) {
      m.codigo = novoCodigo();
      mudou = true;
    }
  }
  return mudou;
}
