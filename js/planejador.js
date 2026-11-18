// Planejador: transforma o texto do planejamento do PS em cronograma + tasks distribuídas.

import { somarDias, formatarCurto, deISO, paraISO } from "./datas.js";
import { lerArea } from "./interpretador.js";
import { proporDistribuicao } from "./motor.js";
import { novoId, garantirTipos } from "./dados.js";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

// Texto de exemplo, com datas a partir da próxima segunda-feira.
export function exemploPlanejamento(hoje) {
  const dow = deISO(hoje).getDay();
  const seg = somarDias(hoje, ((8 - dow) % 7) || 7);
  const d = (n) => ddmm(somarDias(seg, n));
  return `Processo seletivo — estrutura

Semana 1
Desafio de Dados: lançamento ${d(0)}, entrega ${d(4)}
Desafio de Marketing: lançamento ${d(0)}, entrega ${d(4)}
Treinamento síncrono de Dados em ${d(1)} às 19h, no canal de voz #treinamentos
Treinamento síncrono de Marketing em ${d(2)} às 19h, no canal de voz #treinamentos
Desafio de Comercial: lançamento ${d(2)}, entrega ${d(7)}

Semana 2
Desafio de Desenvolvimento: lançamento ${d(7)}, entrega ${d(11)}
Desafio de Produto: lançamento ${d(7)}, entrega ${d(11)}
Treinamento síncrono de Desenvolvimento em ${d(8)} às 19h30
Treinamento síncrono de Produto em ${d(9)} às 18h30
Desafio de Gente e Gestão: lançamento ${d(9)}, entrega ${d(14)}

Resultado final em ${d(16)} às 18h`;
}

function lerDatas(linha, hoje) {
  const ano = deISO(hoje).getFullYear();
  const datas = [];
  for (const m of linha.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    let a = m[3] ? Number(m[3]) : ano;
    if (a < 100) a += 2000;
    let iso = paraISO(new Date(a, Number(m[2]) - 1, Number(m[1])));
    if (!m[3] && iso < somarDias(hoje, -30)) iso = paraISO(new Date(a + 1, Number(m[2]) - 1, Number(m[1])));
    datas.push(iso);
  }
  return datas;
}

function lerHora(linha) {
  const m = linha.match(/\b(\d{1,2})(?:h|:)(\d{2})?\b/i);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
}

function lerLocal(linha) {
  const m = linha.match(/\b(?:no|na|em)\s+(canal[^,.;]*|sala[^,.;]*|https?:\/\/\S+|google meet[^,.;]*|discord[^,.;]*)/i);
  return m ? m[1].trim() : "";
}

const ETAPA = /din[aâ]mica|entrevista|assessment|case em grupo|painel/;
const INTERNO = /reuni[aã]o geral|reuni[aã]o da equipe|reuni[aã]o interna|delibera|alinhamento interno/;

function lerPessoas(linha) {
  const m = linha.match(/\b(\d{1,2})\s+(?:membros|pessoas|facilitadores|avaliadores|entrevistadores)\b/i);
  return m ? Math.min(20, Math.max(1, Number(m[1]))) : null;
}

// Linha de tabela: | Subárea | lançamento | entrega | treinamento |
function lerLinhaTabela(linha, estado, hoje) {
  const celulas = linha.split("|").map((c) => c.trim()).filter(Boolean);
  if (celulas.length < 3) return [];
  const area = lerArea(celulas[0], estado.areas);
  if (area === "Geral") return [];
  const datas = celulas.slice(1).map((c) => ({ c, d: lerDatas(c, hoje)[0] })).filter((x) => x.d);
  if (datas.length < 2) return [];
  const eventos = [{ tipo: "desafio", titulo: `Desafio de ${area}`, area, data: datas[0].d, hora: null, entrega: datas[1].d, local: "", descricao: "" }];
  if (datas[2]) eventos.push({ tipo: "treinamento", titulo: `Treinamento síncrono de ${area}`, area, data: datas[2].d, hora: lerHora(datas[2].c), entrega: null, local: "", descricao: "" });
  return eventos;
}

// Leitura sem IA: uma linha por item (tabelas com uma linha por subárea).
export function interpretarPlanoLocal(texto, estado, hoje) {
  const eventos = [];
  for (const bruta of texto.split(/\n+/)) {
    const linha = bruta.trim().replace(/^[-•*]\s*/, "");
    if (!linha) continue;
    const baixa = linha.toLowerCase();
    if ((linha.match(/\|/g) || []).length >= 2) {
      eventos.push(...lerLinhaTabela(linha, estado, hoje));
      continue;
    }
    const datas = lerDatas(linha, hoje);
    if (!datas.length) continue;
    const area = lerArea(linha, estado.areas);
    const tituloLivre = linha.replace(/\s+(em|no dia|dia|de)\s+\d.*$/i, "").split(/[:(]/)[0].trim().slice(0, 80);
    if (ETAPA.test(baixa) && !/divulga|planilha|resultado/.test(baixa)) {
      eventos.push({ tipo: "etapa", titulo: tituloLivre, area: "Geral", data: datas[0], hora: lerHora(linha), entrega: null, local: lerLocal(linha), descricao: "", pessoas: lerPessoas(linha), interno: false });
    } else if (/desafio/.test(baixa)) {
      const entrega = datas[1] || null;
      eventos.push({ tipo: "desafio", titulo: area !== "Geral" ? `Desafio de ${area}` : linha.split(/[:,–-]/)[0].trim(), area, data: datas[0], hora: null, entrega, local: lerLocal(linha), descricao: "" });
    } else if (/treinamento|aula|workshop|capacita/.test(baixa)) {
      eventos.push({ tipo: "treinamento", titulo: area !== "Geral" ? `Treinamento síncrono de ${area}` : linha.split(/[:,–-]/)[0].trim(), area, data: datas[0], hora: lerHora(linha), entrega: null, local: lerLocal(linha), descricao: "" });
    } else {
      eventos.push({ tipo: "aviso", titulo: tituloLivre, area: "Geral", data: datas[0], hora: lerHora(linha), entrega: null, local: lerLocal(linha), descricao: "", interno: INTERNO.test(baixa) });
    }
  }
  return eventos;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validarEventosIA(lista, estado) {
  if (!Array.isArray(lista)) return [];
  const areas = [...estado.areas, "Geral"];
  const ok = [];
  for (const bruto of lista.slice(0, 60)) {
    if (!bruto || !["desafio", "treinamento", "etapa", "aviso"].includes(bruto.tipo)) continue;
    // Rede de segurança: a IA às vezes deixa passar etapas e compromissos internos.
    const e = { ...bruto };
    const nome = String(e.titulo || "").toLowerCase();
    if (e.tipo === "aviso" && ETAPA.test(nome) && !/divulga|planilha|resultado|envio|aviso/.test(nome)) e.tipo = "etapa";
    if (e.tipo === "aviso" && INTERNO.test(nome)) e.interno = true;
    if (!ISO.test(e.data || "")) continue;
    const entrega = e.tipo === "desafio" && ISO.test(e.entrega || "") && e.entrega >= e.data ? e.entrega : null;
    ok.push({
      tipo: e.tipo,
      titulo: String(e.titulo || "").trim().slice(0, 90) || ({ desafio: "Desafio", treinamento: "Treinamento síncrono", etapa: "Etapa" }[e.tipo] || "Aviso"),
      area: areas.includes(e.area) ? e.area : "Geral",
      data: e.data,
      hora: /^\d{2}:\d{2}$/.test(e.hora || "") ? e.hora : null,
      entrega,
      local: String(e.local || "").slice(0, 120),
      descricao: String(e.descricao || "").slice(0, 240),
      pessoas: e.tipo === "etapa" && Number(e.pessoas) >= 1 ? Math.min(20, Math.round(Number(e.pessoas))) : null,
      duracaoH: e.tipo === "etapa" && Number(e.duracaoH) > 0 ? Math.min(40, Number(e.duracaoH)) : null,
      interno: e.tipo === "aviso" && e.interno === true,
    });
  }
  return ok;
}

// Lê o planejamento: IA primeiro, regras locais se a IA falhar ou não achar nada.
export async function lerPlanejamento(texto, estado, hoje) {
  const local = interpretarPlanoLocal(texto, estado, hoje);
  try {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 30000);
    const resp = await fetch("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "planejar", texto, hoje, areas: estado.areas }),
      signal: controle.signal,
    });
    clearTimeout(timer);
    const dados = await resp.json();
    if (!resp.ok || dados.erro) throw new Error(dados.erro || `HTTP ${resp.status}`);
    const eventos = validarEventosIA(dados.eventos, estado);
    if (!eventos.length) throw new Error("a IA não encontrou itens");
    return { eventos, fonte: "ia", observacoes: Array.isArray(dados.observacoes) ? dados.observacoes.slice(0, 8).map(String) : [] };
  } catch (e) {
    return { eventos: local, fonte: "regras", aviso: `IA indisponível (${e.name === "AbortError" ? "demorou demais" : e.message}): lido pelas regras locais.`, observacoes: [] };
  }
}

// Tasks que a equipe precisa fazer para um item do cronograma.
export function tarefasDoEvento(ev, hoje, nAspirantes = 12) {
  const naoAntesDeHoje = (iso) => (iso < hoje ? hoje : iso);
  const minusc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const base = { eventoId: ev.id, area: ev.area };
  if (ev.tipo === "treinamento")
    return [
      { ...base, tipoId: "tp_preparar", titulo: `Preparar ${minusc(ev.titulo)}`, prazo: naoAntesDeHoje(somarDias(ev.data, -1)), quantidade: 1 },
      { ...base, tipoId: "tp_conduzir", titulo: `Conduzir ${minusc(ev.titulo)}`, prazo: naoAntesDeHoje(ev.data), quantidade: 1 },
    ];
  if (ev.tipo === "desafio") {
    const fim = ev.entrega || ev.data;
    return [
      { ...base, area: "Geral", tipoId: "tp_duvidas", titulo: `Tirar dúvidas do ${minusc(ev.titulo)}`, prazo: naoAntesDeHoje(fim), quantidade: Math.max(1, Math.round(nAspirantes / 2)), maxPessoas: 2 },
      { ...base, tipoId: "tp_corrigir", titulo: `Corrigir ${minusc(ev.titulo)}`, prazo: naoAntesDeHoje(somarDias(fim, 3)), quantidade: nAspirantes },
    ];
  }
  const comunicar = { ...base, area: "Geral", tipoId: "tp_avisos", titulo: `Comunicar: ${ev.titulo}`, prazo: naoAntesDeHoje(somarDias(ev.data, -1)), quantidade: 1 };
  if (ev.tipo === "etapa") {
    // Dinâmica, entrevistas etc.: cada pessoa da equipe que participa recebe a sua task.
    // Entrevistas sem detalhe no texto: 30 min por aspirante, com dois membros em cada.
    const entrevista = /entrevista/i.test(ev.titulo);
    const totalH = entrevista ? nAspirantes * 0.5 * 2 : null;
    const pessoas = ev.pessoas || (entrevista ? Math.max(2, Math.ceil(totalH / 6)) : 2);
    const horas = ev.duracaoH || (entrevista ? Math.round((totalH / pessoas) * 10) / 10 : null);
    return [
      comunicar,
      { ...base, area: "Geral", tipoId: "tp_etapa", titulo: `Participar: ${ev.titulo}`, prazo: naoAntesDeHoje(ev.data), quantidade: pessoas, umPorPessoa: true, esforcoPorUnidadeH: horas },
    ];
  }
  // Compromisso interno (reunião geral, deliberação): só entra no calendário da equipe.
  if (ev.interno) return [];
  return [comunicar];
}

// Gera e distribui todas as tasks do plano, considerando a carga que o próprio plano cria.
export function montarPlano(estado, eventosLidos, { hoje, nAspirantes = 12 }) {
  const eventos = eventosLidos.map((e) => ({ id: e.id || novoId("e"), ...e }));
  garantirTipos(estado);
  const sim = { ...estado, tasks: estado.tasks.slice() };
  const tarefas = [];
  const pedidos = eventos.flatMap((ev) => tarefasDoEvento(ev, hoje, nAspirantes));
  pedidos.sort((a, b) => a.prazo.localeCompare(b.prazo));
  for (const p of pedidos) {
    const tipo = estado.tipos.find((t) => t.id === p.tipoId);
    const pedido = { ...p, esforcoPorUnidadeH: p.esforcoPorUnidadeH || (tipo ? tipo.esforcoPadraoH : 1), maxPessoas: p.maxPessoas || null };
    const proposta = proporDistribuicao(sim, pedido, hoje);
    const partes = proposta.partes.map((x) => ({ membroId: x.membroId, unidades: x.unidades, esforcoH: x.esforcoH, motivos: x.motivos }));
    for (const parte of partes) {
      sim.tasks.push({ id: novoId("sim"), responsavelId: parte.membroId, status: "atribuida", prazo: p.prazo, esforcoH: parte.esforcoH, atribuidaEm: hoje, recusadoPor: [] });
    }
    tarefas.push({ id: novoId("pt"), pedido, partes, divisivel: proposta.divisivel, semResponsavel: proposta.semResponsavel || (partes.length ? 0 : pedido.quantidade) });
  }
  return { eventos, tarefas };
}

export function resumoPlano(plano, estado) {
  const porPessoa = new Map();
  for (const t of plano.tarefas)
    for (const p of t.partes) porPessoa.set(p.membroId, (porPessoa.get(p.membroId) || 0) + p.esforcoH);
  const totalH = [...porPessoa.values()].reduce((a, b) => a + b, 0);
  return {
    itens: plano.eventos.length,
    tasks: plano.tarefas.reduce((s, t) => s + Math.max(1, t.partes.length), 0),
    pessoas: porPessoa.size,
    totalH: Math.round(totalH * 10) / 10,
    porPessoa: [...porPessoa.entries()]
      .map(([id, h]) => ({ membro: estado.membros.find((m) => m.id === id), h: Math.round(h * 10) / 10 }))
      .sort((a, b) => b.h - a.h),
  };
}

export { formatarCurto, DIAS };
