// Envio de mensagens para o Discord (pela função /api/discord da Vercel).

import { formatarCurto } from "./datas.js";

const CHAVE_PIN = "ps-tasks:pin-discord";

function lerPin() {
  try { return localStorage.getItem(CHAVE_PIN) || ""; } catch (e) { return ""; }
}
function gravarPin(pin) {
  try { localStorage.setItem(CHAVE_PIN, pin); } catch (e) { /* sem localStorage */ }
}

export function horaBR(hora) {
  if (!hora) return "";
  const [h, m] = hora.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function quandoEvento(ev) {
  return `${formatarCurto(ev.data)}${ev.hora ? ` · ${horaBR(ev.hora)}` : ""}`;
}

export function eventoParaDiscord(ev) {
  return {
    titulo: ev.titulo,
    quando: ev.tipo === "desafio" ? `${formatarCurto(ev.data)} (lançamento)` : quandoEvento(ev),
    entrega: ev.tipo === "desafio" && ev.entrega ? formatarCurto(ev.entrega) : "",
    local: ev.local || "",
    descricao: ev.descricao || "",
  };
}

// Descrição de data/hora usada para avisar mudanças ("antes" e "agora").
export function resumoDatas(ev) {
  const partes = [quandoEvento(ev)];
  if (ev.tipo === "desafio" && ev.entrega) partes.push(`entrega ${formatarCurto(ev.entrega)}`);
  if (ev.local) partes.push(ev.local);
  return partes.join(" · ");
}

// Devolve { ok, erro, naoConfigurado }. Pede o código da gerência se a Vercel exigir.
export async function enviarDiscord(corpo, { perguntarPin = true, codigo = null } = {}) {
  if (!codigo) return { ok: false, demonstracao: true, erro: "demonstração" };
  const tentar = async (pin) => {
    const resp = await fetch("/api/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-codigo": codigo },
      body: JSON.stringify({ ...corpo, pin }),
    });
    let dados = {};
    try { dados = await resp.json(); } catch (e) { /* sem JSON */ }
    return { status: resp.status, dados };
  };
  try {
    let r = await tentar(lerPin());
    if (r.status === 401 && perguntarPin) {
      const pin = window.prompt("Código da gerência para publicar no Discord:");
      if (!pin) return { ok: false, erro: "Publicação cancelada." };
      r = await tentar(pin.trim());
      if (r.status !== 401) gravarPin(pin.trim());
    }
    if (r.status === 200 && r.dados.ok) return { ok: true };
    return {
      ok: false,
      naoConfigurado: !!r.dados.naoConfigurado || r.status === 404,
      erro: r.dados.erro || `HTTP ${r.status}`,
    };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
