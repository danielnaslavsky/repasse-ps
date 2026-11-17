// Calendário: monta a grade do mês e o que acontece em cada dia.

import { paraISO, somarDias } from "./datas.js";
import { horaBR } from "./discord.js";

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Semanas do mês, começando na segunda-feira. Cada dia: { iso, doMes }.
export function gradeMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  const recuo = (primeiro.getDay() + 6) % 7; // segunda = 0
  let atual = somarDias(paraISO(primeiro), -recuo);
  const semanas = [];
  for (let s = 0; s < 6; s++) {
    const semana = [];
    for (let d = 0; d < 7; d++) {
      const [, m] = atual.split("-").map(Number);
      semana.push({ iso: atual, doMes: m - 1 === mes });
      atual = somarDias(atual, 1);
    }
    semanas.push(semana);
    if (s >= 3 && !semanas[s].some((x) => x.doMes) ) break;
  }
  // tira uma última semana inteira fora do mês
  while (semanas.length && !semanas[semanas.length - 1].some((x) => x.doMes)) semanas.pop();
  return semanas;
}

// Itens de um dia. Se perfilId vier e não for gerente, mostra só as tasks dessa pessoa.
export function itensDoDia(estado, iso, { perfilId = null, gerente = true } = {}) {
  const itens = [];
  for (const ev of estado.eventos || []) {
    if (ev.tipo === "desafio") {
      if (ev.data === iso) itens.push({ cls: "desafio", hora: "", texto: `Lança: ${ev.titulo}`, curto: `Lança · ${ev.area}`, evento: ev });
      if (ev.entrega === iso) itens.push({ cls: "entrega", hora: "", texto: `Entrega: ${ev.titulo}`, curto: `Entrega · ${ev.area}`, evento: ev });
    } else if (ev.data === iso) {
      itens.push({ cls: ev.tipo, hora: ev.hora || "", texto: ev.titulo, curto: ev.tipo === "treinamento" ? `Treino · ${ev.area}` : ev.titulo, evento: ev });
    }
  }
  itens.sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
  for (const t of estado.tasks) {
    if (t.status === "concluida" || t.prazo !== iso) continue;
    if (!gerente && t.responsavelId !== perfilId) continue;
    itens.push({ cls: "task", hora: "", texto: t.titulo, curto: t.titulo, task: t });
  }
  return itens.map((i) => ({ ...i, rotuloHora: horaBR(i.hora) }));
}
