// Relatório do PS: números do processo a partir das tasks, do cronograma e do registro.
// Tudo é calculado aqui, sem IA, para a gerência confiar nos números e a próxima gestão poder planejar.

import { diferencaDias, somarDias } from "./datas.js";
import { inicioSemana } from "./motor.js";
import { PREFIXO_PILOTO } from "./regras.js";

const arred = (n, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas;
const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
export const num = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
export const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
export const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const primeiro = (nome) => nome.split(" ")[0];
const listaNomes = (l) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

// Semanas (segunda-feira) entre o primeiro e o último prazo das tasks.
function semanasDoPS(tasks) {
  const prazos = tasks.map((t) => t.prazo).filter(Boolean).sort();
  if (!prazos.length) return [];
  const semanas = [];
  for (let s = inicioSemana(prazos[0]); s <= prazos[prazos.length - 1]; s = somarDias(s, 7)) semanas.push(s);
  return semanas;
}

export function gerarRelatorio(estado, hoje) {
  const tasks = (estado.tasks || []).filter((t) => t.status !== "cancelada");
  const membros = (estado.membros || []).filter((m) => m.papel !== "gerente" || tasks.some((t) => t.responsavelId === m.id));
  const tipoNome = (id) => (estado.tipos.find((t) => t.id === id) || {}).nome || "Outra";
  const atrasada = (t) => t.status !== "concluida" && t.prazo < hoje;
  const concluidas = tasks.filter((t) => t.status === "concluida");
  const noPrazo = concluidas.filter((t) => t.concluidaEm && t.concluidaEm <= t.prazo);
  const comDataConclusao = concluidas.filter((t) => t.concluidaEm);
  const horas = tasks.reduce((s, t) => s + (t.esforcoH || 0), 0);
  const repassadas = tasks.filter((t) => (t.recusadoPor || []).length);
  const trocas = tasks.reduce((s, t) => s + (t.recusadoPor || []).length, 0);
  const aceites = tasks.filter((t) => t.aceitaEm && t.atribuidaEm).map((t) => Math.max(0, diferencaDias(t.atribuidaEm, t.aceitaEm)));
  const registro = estado.registro || [];
  const acoesPiloto = registro.filter((r) => r.texto.startsWith(PREFIXO_PILOTO));
  const repassesPiloto = acoesPiloto.filter((r) => /repassada para/.test(r.texto)).length;
  const semanas = semanasDoPS(tasks);

  // Por pessoa
  const pessoas = membros
    .map((m) => {
      const minhas = tasks.filter((t) => t.responsavelId === m.id);
      const h = minhas.reduce((s, t) => s + (t.esforcoH || 0), 0);
      const porSemana = semanas.map((s) => minhas.filter((t) => inicioSemana(t.prazo) === s).reduce((a, t) => a + (t.esforcoH || 0), 0));
      const picos = porSemana.filter((x) => x > (m.capacidadeSemanal || 0)).length;
      return {
        id: m.id,
        nome: m.nome,
        area: m.area,
        capacidade: m.capacidadeSemanal || 0,
        tasks: minhas.length,
        horas: arred(h),
        concluidas: minhas.filter((t) => t.status === "concluida").length,
        atrasadas: minhas.filter(atrasada).length,
        recusou: tasks.filter((t) => (t.recusadoPor || []).includes(m.id)).length,
        picoSemana: arred(Math.max(0, ...porSemana)),
        semanasAcima: picos,
      };
    })
    .sort((a, b) => b.horas - a.horas);

  // Por subárea e por tipo
  const agrupar = (chave) => {
    const mapa = new Map();
    for (const t of tasks) {
      const k = chave(t);
      const v = mapa.get(k) || { nome: k, tasks: 0, horas: 0, atrasadas: 0 };
      v.tasks++;
      v.horas += t.esforcoH || 0;
      if (atrasada(t)) v.atrasadas++;
      mapa.set(k, v);
    }
    return [...mapa.values()].map((v) => ({ ...v, horas: arred(v.horas) })).sort((a, b) => b.horas - a.horas);
  };
  const porArea = agrupar((t) => t.area || "Geral").map((a) => ({
    ...a,
    pessoas: (estado.membros || []).filter((m) => m.ativo !== false && m.papel !== "gerente" && m.area === a.nome).length,
  }));
  const porTipo = agrupar((t) => tipoNome(t.tipoId));

  // Lições: frases montadas por regra, a partir dos números acima.
  const licoes = [];
  const ativos = pessoas.filter((p) => p.horas > 0);
  if (ativos.length >= 3 && horas > 0) {
    const top = ativos[0];
    const parte = pct(top.horas, horas);
    // Só chama atenção quando a pessoa ficou com bem mais que a média.
    if (parte >= 20 && parte >= (200 / ativos.length)) licoes.push(`${primeiro(top.nome)} concentrou ${parte}% das horas do PS (${num(top.horas)}h).`);
    const menos = ativos[ativos.length - 1];
    if (top.horas - menos.horas >= 8) licoes.push(`A diferença de carga entre quem mais e quem menos trabalhou foi de ${num(top.horas - menos.horas)}h; vale revisar a capacidade cadastrada de cada um.`);
  }
  const semTask = pessoas.filter((p) => p.tasks === 0).map((p) => primeiro(p.nome));
  if (tasks.length >= 5 && semTask.length) licoes.push(`${listaNomes(semTask)} ${semTask.length === 1 ? "não recebeu" : "não receberam"} nenhuma task: dá para chamar mais cedo, ou conferir se estão marcados como ausentes.`);
  for (const a of porArea) {
    if (a.nome !== "Geral" && a.pessoas === 1 && a.horas >= 15) licoes.push(`${a.nome} tem uma pessoa só e recebeu ${num(a.horas)}h: no próximo PS, recrute mais gente para essa subárea ou divida as correções.`);
    if (a.nome !== "Geral" && a.pessoas === 0 && a.tasks) licoes.push(`${a.nome} não tem ninguém na equipe e teve ${plural(a.tasks, "task atribuída", "tasks atribuídas")} a outras subáreas.`);
  }
  const sobrecarregados = pessoas.filter((p) => p.semanasAcima > 0);
  if (sobrecarregados.length) licoes.push(`${listaNomes(sobrecarregados.map((p) => primeiro(p.nome)))} ${sobrecarregados.length === 1 ? "passou" : "passaram"} da capacidade semanal em pelo menos uma semana.`);
  if (repassesPiloto) licoes.push(`O piloto automático repassou ${plural(repassesPiloto, "task", "tasks")} sozinho, sem a gerência precisar cobrar ninguém.`);
  const tipoAtrasado = porTipo.filter((t) => t.atrasadas).sort((a, b) => b.atrasadas - a.atrasadas)[0];
  if (tipoAtrasado) licoes.push(`O tipo de task que mais atrasou foi "${tipoAtrasado.nome}" (${plural(tipoAtrasado.atrasadas, "atrasada", "atrasadas")}).`);

  return {
    hoje,
    periodo: semanas.length ? { inicio: semanas[0], fim: somarDias(semanas[semanas.length - 1], 6), semanas: semanas.length } : null,
    itensCronograma: (estado.eventos || []).length,
    totais: {
      tasks: tasks.length,
      concluidas: concluidas.length,
      abertas: tasks.length - concluidas.length,
      atrasadas: tasks.filter(atrasada).length,
      horas: arred(horas),
      pessoas: ativos.length,
      noPrazoPct: pct(noPrazo.length, comDataConclusao.length),
      tasksRepassadas: repassadas.length,
      trocasDeDono: trocas,
      repassesPiloto,
      acoesPiloto: acoesPiloto.length,
      aceiteMedioDias: aceites.length ? arred(media(aceites)) : null,
    },
    pessoas,
    porArea,
    porTipo,
    licoes,
  };
}

// Texto simples para copiar e colar (no Discord da equipe, num documento de passagem de gestão etc.).
export function relatorioEmTexto(r) {
  const T = r.totais;
  const linhas = [
    "Relatório do PS (repasse)",
    r.periodo ? `Período: ${dataBR(r.periodo.inicio)} a ${dataBR(r.periodo.fim)} (${plural(r.periodo.semanas, "semana", "semanas")})${T.abertas ? `, números até ${dataBR(r.hoje)}` : ""}` : "",
    "",
    `Tasks: ${num(T.tasks)} (${plural(T.concluidas, "concluída", "concluídas")}, ${plural(T.abertas, "aberta", "abertas")}, ${plural(T.atrasadas, "atrasada", "atrasadas")})`,
    `Horas de trabalho: ${num(T.horas)}h, divididas entre ${plural(T.pessoas, "pessoa", "pessoas")}`,
    T.noPrazoPct != null ? `Concluídas no prazo: ${T.noPrazoPct}%` : "",
    `Tasks que mudaram de dono: ${num(T.tasksRepassadas)} (${num(T.repassesPiloto)} pelo piloto automático)`,
    T.aceiteMedioDias != null ? `Tempo médio até aceitar: ${plural(T.aceiteMedioDias, "dia", "dias")}` : "",
    "",
    "Por pessoa:",
    ...r.pessoas.map((p) => `- ${p.nome} (${p.area}): ${p.tasks ? `${num(p.horas)}h em ${plural(p.tasks, "task", "tasks")}, ${plural(p.concluidas, "concluída", "concluídas")}, ${plural(p.atrasadas, "atrasada", "atrasadas")}` : "nenhuma task"}`),
    "",
    "Por subárea:",
    ...r.porArea.map((a) => `- ${a.nome}: ${num(a.horas)}h em ${plural(a.tasks, "task", "tasks")}${a.nome !== "Geral" ? `, ${plural(a.pessoas, "pessoa", "pessoas")} na equipe` : ""}`),
  ];
  if (r.licoes.length) linhas.push("", "Para o próximo PS:", ...r.licoes.map((l) => `- ${l}`));
  return linhas.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").trim();
}
