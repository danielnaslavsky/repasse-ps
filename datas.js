// Utilitários de data. Tudo trabalha com strings "AAAA-MM-DD" no fuso local.

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function paraISO(d) {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${a}-${m}-${dia}`;
}

export function deISO(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function hojeISO(agora = new Date()) {
  return paraISO(agora);
}

export function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return paraISO(d);
}

// Diferença em dias inteiros: b - a
export function diferencaDias(a, b) {
  const ms = deISO(b) - deISO(a);
  return Math.round(ms / 86400000);
}

export function formatarCurto(iso) {
  if (!iso) return "—";
  const d = deISO(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${DIAS_SEMANA[d.getDay()]}, ${dia}/${mes}`;
}

// Texto relativo: "hoje", "amanhã", "em 3 dias", "atrasada há 2 dias"
export function prazoRelativo(prazo, hoje) {
  const n = diferencaDias(hoje, prazo);
  if (n === 0) return "vence hoje";
  if (n === 1) return "vence amanhã";
  if (n > 1) return `em ${n} dias`;
  if (n === -1) return "atrasada há 1 dia";
  return `atrasada há ${-n} dias`;
}

export { DIAS_SEMANA };
