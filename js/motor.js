// Motor de atribuição: decide quem faz cada task e explica por quê.
// Funções puras: recebem o estado e devolvem uma proposta, sem alterar nada.

import { diferencaDias, somarDias, deISO } from "./datas.js";

export const PESOS = {
  area: 30, // pessoa da mesma área da task
  folga: 40, // capacidade livre na semana depois de receber a task
  prazos: 15, // poucos prazos colados no mesmo período
  rodizio: 15, // recebeu pouca coisa nos últimos 7 dias
  ausenciaAgora: -10, // está ausente hoje, mas volta antes do prazo
};

export function tasksAbertas(estado) {
  return estado.tasks.filter((t) => t.status !== "concluida" && t.responsavelId);
}

export function cargaAberta(estado, membroId) {
  return tasksAbertas(estado)
    .filter((t) => t.responsavelId === membroId)
    .reduce((soma, t) => soma + t.esforcoH, 0);
}

// Segunda-feira da semana de uma data.
export function inicioSemana(iso) {
  const dia = (deISO(iso).getDay() + 6) % 7;
  return somarDias(iso, -dia);
}

// Horas que a pessoa já tem na semana de um prazo. Task atrasada conta na semana atual.
export function cargaSemana(estado, membroId, prazo, hoje, ignorarId) {
  const alvo = inicioSemana(prazo < hoje ? hoje : prazo);
  return tasksAbertas(estado)
    .filter((t) => t.id !== ignorarId && t.responsavelId === membroId && inicioSemana(t.prazo < hoje ? hoje : t.prazo) === alvo)
    .reduce((soma, t) => soma + t.esforcoH, 0);
}

function prazosProximos(estado, membroId, prazo, ignorarId) {
  return tasksAbertas(estado).filter(
    (t) => t.id !== ignorarId && t.responsavelId === membroId && Math.abs(diferencaDias(t.prazo, prazo)) <= 1
  ).length;
}

function recebidasRecentes(estado, membroId, hoje, ignorarId) {
  const limite = somarDias(hoje, -7);
  return estado.tasks.filter(
    (t) => t.id !== ignorarId && t.responsavelId === membroId && t.atribuidaEm && t.atribuidaEm >= limite
  ).length;
}

function arred(n) {
  return Math.round(n * 10) / 10;
}

const h = (n) => `${String(arred(n)).replace(".", ",")}h`;

// Por que uma pessoa não pode receber a task (ou null se pode).
export function motivoInelegivel(membro, task, tipo, hoje) {
  if (!membro.ativo) return "inativo no PS";
  if (membro.papel !== "membro") return "perfil de gerente";
  if (task.recusadoPor && task.recusadoPor.includes(membro.id)) return "já recusou esta task";
  if (membro.indisponivelAte && membro.indisponivelAte >= task.prazo)
    return `indisponível até ${membro.indisponivelAte.split("-").reverse().join("/")}`;
  if (tipo && tipo.areaObrigatoria && task.area !== "Geral" && membro.area !== task.area)
    return `a task exige alguém de ${task.area}`;
  return null;
}

// Pontua uma pessoa para uma task. cargaExtra simula horas já propostas nesta mesma rodada.
export function pontuar(estado, membro, task, hoje, cargaExtra = 0) {
  const carga = cargaSemana(estado, membro.id, task.prazo, hoje) + cargaExtra;
  const cap = membro.capacidadeSemanal;
  const folgaDepois = cap - carga - task.esforcoH;
  const motivos = [];
  const partes = {};

  // Área
  if (task.area !== "Geral" && membro.area === task.area) {
    partes.area = PESOS.area;
    motivos.push(`é de ${membro.area}`);
  } else {
    partes.area = 0;
  }

  // Folga de capacidade
  const proporcaoLivre = Math.max(0, Math.min(1, folgaDepois / cap));
  partes.folga = PESOS.folga * proporcaoLivre;
  if (folgaDepois < 0) {
    motivos.push(`ficaria ${h(-folgaDepois)} acima da capacidade da semana`);
  } else {
    motivos.push(`fica com ${h(folgaDepois)} livres de ${h(cap)} na semana`);
  }

  // Prazos colados
  const colados = prazosProximos(estado, membro.id, task.prazo, task.id);
  partes.prazos = Math.max(0, PESOS.prazos - 5 * colados);
  if (colados === 0) motivos.push("nenhum outro prazo perto deste");
  else motivos.push(`${colados} outro(s) prazo(s) perto deste`);

  // Rodízio
  const recentes = recebidasRecentes(estado, membro.id, hoje, task.id);
  partes.rodizio = Math.max(0, PESOS.rodizio - 3 * recentes);
  if (recentes === 0) motivos.push("não recebeu tasks nos últimos 7 dias");
  else if (recentes >= 3) motivos.push(`já recebeu ${recentes} tasks na semana`);

  // Ausente hoje, mas volta antes do prazo
  partes.ausencia = 0;
  if (membro.indisponivelAte && membro.indisponivelAte >= hoje) {
    partes.ausencia = PESOS.ausenciaAgora;
    motivos.push("está ausente agora, mas volta antes do prazo");
  }

  const pontos = Object.values(partes).reduce((a, b) => a + b, 0);
  return {
    membroId: membro.id,
    pontos: Math.round(pontos),
    partes,
    motivos,
    cargaAntes: arred(carga),
    cargaDepois: arred(carga + task.esforcoH),
    capacidade: cap,
    acimaDaCapacidade: folgaDepois < 0,
  };
}

// Ranking de candidatos para uma task inteira.
export function ranquear(estado, task, hoje, cargasExtras = {}) {
  const tipo = estado.tipos.find((t) => t.id === task.tipoId);
  const elegiveis = [];
  const inelegiveis = [];
  for (const m of estado.membros) {
    if (m.papel !== "membro") continue;
    const motivo = motivoInelegivel(m, task, tipo, hoje);
    if (motivo) {
      inelegiveis.push({ membroId: m.id, motivo });
      continue;
    }
    elegiveis.push(pontuar(estado, m, task, hoje, cargasExtras[m.id] || 0));
  }
  elegiveis.sort((a, b) => b.pontos - a.pontos || a.cargaAntes - b.cargaAntes);
  return { elegiveis, inelegiveis };
}

// Monta a proposta de distribuição.
// pedido: { titulo, tipoId, area, prazo, quantidade, esforcoPorUnidadeH, maxPessoas }
// Tasks divisíveis com quantidade > 1 são repartidas unidade a unidade,
// sempre para quem estiver mais bem pontuado com a carga já proposta.
export function proporDistribuicao(estado, pedido, hoje) {
  const tipo = estado.tipos.find((t) => t.id === pedido.tipoId);
  const quantidade = Math.max(1, Math.floor(pedido.quantidade || 1));
  const esforcoUnidade = Number(pedido.esforcoPorUnidadeH) || (tipo ? tipo.esforcoPadraoH : 1);
  // umPorPessoa: cada unidade vai para uma pessoa diferente (ex.: 6 facilitadores da dinâmica).
  const umPorPessoa = !!pedido.umPorPessoa;
  const divisivel = umPorPessoa || (tipo ? tipo.divisivel : false);
  const base = {
    titulo: pedido.titulo,
    tipoId: pedido.tipoId,
    area: pedido.area,
    prazo: pedido.prazo,
    recusadoPor: [],
  };

  if (!divisivel || quantidade === 1) {
    const task = { ...base, esforcoH: arred(esforcoUnidade * quantidade) };
    const { elegiveis, inelegiveis } = ranquear(estado, task, hoje);
    return {
      partes: elegiveis.length
        ? [{ ...elegiveis[0], unidades: quantidade, esforcoH: task.esforcoH }]
        : [],
      alternativas: elegiveis.slice(1, 4),
      inelegiveis,
      quantidade,
      esforcoUnidade,
      divisivel,
    };
  }

  const maxPessoas = pedido.maxPessoas ? Math.max(1, Math.floor(pedido.maxPessoas)) : Infinity;
  const extras = {};
  const unidadesPor = {};
  const unidade = { ...base, esforcoH: esforcoUnidade };
  let inelegiveisFinal = [];

  for (let i = 0; i < quantidade; i++) {
    const { elegiveis, inelegiveis } = ranquear(estado, unidade, hoje, extras);
    inelegiveisFinal = inelegiveis;
    const escolhidos = Object.keys(unidadesPor);
    let candidatos = elegiveis;
    if (umPorPessoa) candidatos = elegiveis.filter((e) => !escolhidos.includes(e.membroId));
    else if (escolhidos.length >= maxPessoas) {
      candidatos = elegiveis.filter((e) => escolhidos.includes(e.membroId));
    }
    if (!candidatos.length) break;
    const melhor = candidatos[0];
    extras[melhor.membroId] = (extras[melhor.membroId] || 0) + esforcoUnidade;
    unidadesPor[melhor.membroId] = (unidadesPor[melhor.membroId] || 0) + 1;
  }

  // Pontuação final de cada escolhido, com a parte que recebeu.
  const partes = Object.entries(unidadesPor).map(([membroId, unidades]) => {
    const membro = estado.membros.find((m) => m.id === membroId);
    const esforcoH = arred(unidades * esforcoUnidade);
    const resultado = pontuar(estado, membro, { ...base, esforcoH }, hoje);
    return { ...resultado, unidades, esforcoH };
  });
  partes.sort((a, b) => b.unidades - a.unidades);

  return {
    partes,
    alternativas: [],
    inelegiveis: inelegiveisFinal,
    quantidade,
    esforcoUnidade,
    divisivel,
    semResponsavel: quantidade - partes.reduce((s, p) => s + p.unidades, 0),
  };
}

// Escolhe um novo responsável quando alguém recusa. Devolve o ranking ou null.
export function redistribuir(estado, task, hoje) {
  const { elegiveis } = ranquear(estado, task, hoje);
  return elegiveis.length ? elegiveis[0] : null;
}

// Frase de explicação a partir dos motivos.
export function explicar(nome, resultado) {
  const m = resultado.motivos.slice(0, 3).join(", ");
  return `${nome}: ${m}.`;
}
