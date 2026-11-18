// Regras de negócio compartilhadas entre o navegador e o servidor (rotina diária).
// Cada função recebe ctx = { estado, hoje, avisar }, onde avisar(corpo) envia algo ao Discord da equipe.

import { registrar } from "./dados.js";
import { redistribuir, pontuar, explicar } from "./motor.js";
import { formatarCurto, somarDias, diferencaDias } from "./datas.js";
import { eventoParaDiscord } from "./discord.js";
import { tarefasDoEvento } from "./planejador.js";

export const PREFIXO_PILOTO = "Piloto automático: ";
const UM_DIA = 24 * 60 * 60 * 1000;

const semAviso = () => {};
const membroDe = (estado, id) => estado.membros.find((m) => m.id === id);
const nome = (estado, id) => (membroDe(estado, id) ? membroDe(estado, id).nome.split(" ")[0] : "—");

export function atribuirTask(ctx, task, membroId, motivo) {
  const { estado, hoje } = ctx;
  const antes = task.responsavelId;
  task.responsavelId = membroId;
  task.status = membroId ? "atribuida" : "sem_responsavel";
  task.atribuidaEm = hoje;
  task.atribuidaTs = Date.now();
  delete task.atrasoTratado;
  delete task.aceiteCobrado;
  task.historico = task.historico || [];
  task.historico.push({ em: new Date().toISOString(), texto: motivo });
  if (membroId) {
    const m = membroDe(estado, membroId);
    const r = pontuar(estado, m, { ...task, esforcoH: 0 }, hoje);
    task.explicacao = explicar(m.nome.split(" ")[0], r);
  }
  return antes;
}

// Quando alguém não pode: escolhe outra pessoa sem passar pela gerência.
export function repassar(ctx, task, quemSaiu, motivo) {
  const { estado, hoje } = ctx;
  const avisar = ctx.avisar || semAviso;
  task.recusadoPor = task.recusadoPor || [];
  if (quemSaiu && !task.recusadoPor.includes(quemSaiu)) task.recusadoPor.push(quemSaiu);
  const proximo = redistribuir(estado, task, hoje);
  const nomeSaiu = quemSaiu ? nome(estado, quemSaiu) : "—";
  if (proximo) {
    atribuirTask(ctx, task, proximo.membroId, `Repassada de ${nomeSaiu} para ${nome(estado, proximo.membroId)}${motivo ? ` (${motivo})` : ""}.`);
    registrar(estado, `"${task.titulo}": ${nomeSaiu} não pôde${motivo ? ` (${motivo})` : ""}; repassada automaticamente para ${nome(estado, proximo.membroId)}.`);
    avisar({ tipo: "repasse", texto: `"${task.titulo}" foi repassada de ${nomeSaiu} para ${nome(estado, proximo.membroId)}${motivo ? ` (${motivo})` : ""}. Prazo: ${formatarCurto(task.prazo)}.` });
    return proximo.membroId;
  }
  task.responsavelId = null;
  task.status = "sem_responsavel";
  registrar(estado, `"${task.titulo}": ${nomeSaiu} não pôde e ninguém elegível sobrou. A gerência precisa decidir.`);
  return null;
}

function idadeAtribuicao(t, hoje) {
  if (t.atribuidaTs) return Date.now() - t.atribuidaTs;
  return Math.max(0, diferencaDias(t.atribuidaEm || hoje, hoje)) * UM_DIA;
}

// Regras automáticas. Devolve a lista de ações (textos) e já as registra no histórico.
export function rodarPiloto(ctx) {
  const { estado, hoje } = ctx;
  const avisar = ctx.avisar || semAviso;
  const pl = estado.piloto || {};
  const acoes = [];
  if (pl.aceite24h) {
    for (const t of estado.tasks) {
      if (t.status !== "atribuida" || !t.responsavelId) continue;
      if (idadeAtribuicao(t, hoje) < UM_DIA || t.aceiteCobrado) continue;
      const antes = nome(estado, t.responsavelId);
      // Só repassa se houver para quem: senão mantém com a pessoa e avisa (nunca deixa a task sem dono).
      const candidato = redistribuir(estado, { ...t, recusadoPor: [...(t.recusadoPor || []), t.responsavelId] }, hoje);
      if (!candidato) {
        t.aceiteCobrado = true;
        acoes.push(`"${t.titulo}" não foi aceita por ${antes} em 24h, mas não há outra pessoa elegível; continua com ${antes} e a equipe foi avisada.`);
        avisar({ tipo: "repasse", texto: `${antes}, a task "${t.titulo}" está esperando o seu aceite há mais de 24h.` });
        continue;
      }
      if (t.prazo < hoje) t.prazo = somarDias(hoje, 1);
      const novo = repassar(ctx, t, t.responsavelId, "não aceitou em 24h");
      acoes.push(`"${t.titulo}" não foi aceita por ${antes} em 24h; repassada para ${nome(estado, novo)}${t.prazo === somarDias(hoje, 1) ? " com prazo para amanhã" : ""}.`);
    }
  }
  if (pl.atrasadas && pl.atrasadas !== "desligado") {
    for (const t of estado.tasks) {
      if (t.status === "concluida" || !t.responsavelId || t.prazo >= hoje || t.atrasoTratado) continue;
      const antes = nome(estado, t.responsavelId);
      if (pl.atrasadas === "repassar") {
        t.prazo = somarDias(hoje, 1);
        const novo = repassar(ctx, t, t.responsavelId, "atrasada");
        t.atrasoTratado = true;
        acoes.push(`"${t.titulo}" estava atrasada com ${antes}; ${novo ? `repassada para ${nome(estado, novo)} com prazo para amanhã` : "ninguém elegível, ficou para a gerência"}.`);
      } else {
        t.atrasoTratado = true;
        acoes.push(`"${t.titulo}" está atrasada com ${antes}; a equipe foi avisada.`);
        avisar({ tipo: "repasse", texto: `Atenção: "${t.titulo}" está atrasada (prazo ${formatarCurto(t.prazo)}, com ${antes}).` });
      }
    }
  }
  for (const a of acoes) registrar(estado, PREFIXO_PILOTO + a);
  return acoes;
}

// Quando um item do cronograma muda de data, as tasks ligadas a ele acompanham.
export function ajustarTasksDoEvento(ctx, ev) {
  const { estado, hoje } = ctx;
  if (!estado.piloto || !estado.piloto.seguirCronograma) return 0;
  const esperadas = tarefasDoEvento(ev, hoje, 12);
  let n = 0;
  for (const t of estado.tasks) {
    if (t.eventoId !== ev.id || t.status === "concluida") continue;
    const alvo = esperadas.find((x) => x.tipoId === t.tipoId);
    if (!alvo || alvo.prazo === t.prazo) continue;
    const antes = t.prazo;
    t.prazo = alvo.prazo;
    delete t.atrasoTratado;
    n++;
    const resp = t.responsavelId && membroDe(estado, t.responsavelId);
    if (resp && resp.indisponivelAte && resp.indisponivelAte >= t.prazo) {
      const novo = repassar(ctx, t, resp.id, "indisponível na nova data");
      registrar(estado, `${PREFIXO_PILOTO}"${t.titulo}" mudou de ${formatarCurto(antes)} para ${formatarCurto(t.prazo)}; ${resp.nome.split(" ")[0]} está indisponível, ${novo ? `repassada para ${nome(estado, novo)}` : "ficou para a gerência"}.`);
    } else {
      registrar(estado, `${PREFIXO_PILOTO}"${t.titulo}" acompanhou o cronograma: prazo de ${formatarCurto(antes)} para ${formatarCurto(t.prazo)}.`);
    }
  }
  return n;
}

export function cancelarTasksDoEvento(ctx, ev) {
  const { estado } = ctx;
  if (!estado.piloto || !estado.piloto.seguirCronograma) return 0;
  const canceladas = estado.tasks.filter((t) => t.eventoId === ev.id && t.status !== "concluida");
  if (!canceladas.length) return 0;
  estado.tasks = estado.tasks.filter((t) => !canceladas.includes(t));
  registrar(estado, `${PREFIXO_PILOTO}${canceladas.length} task(s) de "${ev.titulo}" canceladas junto com o item.`);
  return canceladas.length;
}

export function eventosOrdenados(estado) {
  return (estado.eventos || []).slice().sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
}

// Eventos que "acontecem" num dia: treinamentos e avisos na data; desafios no lançamento e na entrega.
export function eventosDoDia(estado, iso) {
  const lista = [];
  for (const ev of eventosOrdenados(estado)) {
    if (ev.tipo === "desafio") {
      if (ev.data === iso) lista.push({ ...eventoParaDiscord(ev), titulo: `Lançamento: ${ev.titulo}`, quando: formatarCurto(iso) });
      if (ev.entrega === iso) lista.push({ titulo: `Entrega: ${ev.titulo}`, quando: formatarCurto(iso), local: ev.local || "" });
    } else if (ev.data === iso) {
      lista.push(eventoParaDiscord(ev));
    }
  }
  return lista;
}
