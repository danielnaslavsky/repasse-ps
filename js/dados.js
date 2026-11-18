// Estado da aplicação, dados de demonstração e persistência no navegador.

import { hojeISO, somarDias } from "./datas.js";

const CHAVE = "ps-tasks:v2";
const VERSAO = 2;

export const AREAS = ["Comercial", "Marketing", "Dados", "Desenvolvimento", "Produto", "Gente e Gestão", "Inovação"];

export const TIPOS_EVENTO = {
  desafio: "Desafio",
  treinamento: "Treinamento síncrono",
  etapa: "Etapa com a equipe",
  aviso: "Aviso",
};

// Tipos de task que todo PS tem. Estados antigos ganham os que faltarem.
export const TIPOS_PADRAO = [
  { id: "tp_corrigir", chave: "corrigir", nome: "Corrigir desafio", esforcoPadraoH: 0.5, divisivel: true, areaObrigatoria: true },
  { id: "tp_preparar", chave: "preparar", nome: "Preparar treinamento síncrono", esforcoPadraoH: 3, divisivel: false, areaObrigatoria: true },
  { id: "tp_conduzir", chave: "conduzir", nome: "Conduzir treinamento síncrono", esforcoPadraoH: 2, divisivel: false, areaObrigatoria: true },
  { id: "tp_duvidas", chave: "duvidas", nome: "Tirar dúvidas dos aspirantes", esforcoPadraoH: 0.25, divisivel: true, areaObrigatoria: false },
  { id: "tp_etapa", chave: "etapa", nome: "Participar de etapa (dinâmica, entrevista)", esforcoPadraoH: 3, divisivel: true, areaObrigatoria: false },
  { id: "tp_consolidar", chave: "consolidar", nome: "Consolidar notas", esforcoPadraoH: 2, divisivel: false, areaObrigatoria: false, areaPadrao: "Gente e Gestão" },
  { id: "tp_avisos", chave: "avisos", nome: "Comunicar aspirantes", esforcoPadraoH: 1, divisivel: false, areaObrigatoria: false, areaPadrao: "Marketing" },
  { id: "tp_outra", chave: "outra", nome: "Outra", esforcoPadraoH: 1, divisivel: false, areaObrigatoria: false },
];

export function garantirTipos(estado) {
  if (!estado || !Array.isArray(estado.tipos)) return estado;
  for (const t of TIPOS_PADRAO) {
    if (estado.tipos.some((x) => x.id === t.id)) continue;
    const iOutra = estado.tipos.findIndex((x) => x.id === "tp_outra");
    estado.tipos.splice(iOutra < 0 ? estado.tipos.length : iOutra, 0, { ...t });
  }
  return estado;
}

export function novoId(prefixo) {
  return `${prefixo}_${Math.random().toString(36).slice(2, 9)}`;
}

export function dadosDemonstracao(hoje = hojeISO()) {
  const d = (n) => somarDias(hoje, n);

  const tipos = TIPOS_PADRAO.map((t) => ({ ...t }));

  const membros = [
    { id: "m_marina", nome: "Marina Costa", papel: "gerente", area: "Gente e Gestão", capacidadeSemanal: 10, indisponivelAte: null, ativo: true },
    { id: "m_ana", nome: "Ana Lima", papel: "membro", area: "Dados", capacidadeSemanal: 8, indisponivelAte: null, ativo: true },
    { id: "m_bruno", nome: "Bruno Alves", papel: "membro", area: "Desenvolvimento", capacidadeSemanal: 6, indisponivelAte: null, ativo: true },
    { id: "m_carla", nome: "Carla Menezes", papel: "membro", area: "Marketing", capacidadeSemanal: 8, indisponivelAte: null, ativo: true },
    { id: "m_diego", nome: "Diego Rocha", papel: "membro", area: "Comercial", capacidadeSemanal: 6, indisponivelAte: null, ativo: true },
    { id: "m_elisa", nome: "Elisa Barros", papel: "membro", area: "Gente e Gestão", capacidadeSemanal: 10, indisponivelAte: null, ativo: true },
    { id: "m_felipe", nome: "Felipe Nunes", papel: "membro", area: "Desenvolvimento", capacidadeSemanal: 8, indisponivelAte: d(1), ativo: true },
    { id: "m_gabi", nome: "Gabriela Souza", papel: "membro", area: "Marketing", capacidadeSemanal: 6, indisponivelAte: null, ativo: true },
    { id: "m_heitor", nome: "Heitor Pires", papel: "membro", area: "Comercial", capacidadeSemanal: 8, indisponivelAte: null, ativo: true },
    { id: "m_iara", nome: "Iara Freitas", papel: "membro", area: "Dados", capacidadeSemanal: 6, indisponivelAte: null, ativo: true },
    { id: "m_joao", nome: "João Prado", papel: "membro", area: "Produto", capacidadeSemanal: 8, indisponivelAte: null, ativo: true },
    { id: "m_laura", nome: "Laura Teixeira", papel: "membro", area: "Inovação", capacidadeSemanal: 8, indisponivelAte: null, ativo: true },
  ];

  const ev = (o) => ({ id: novoId("e"), hora: null, entrega: null, local: "", descricao: "", ...o });
  const eventos = [
    ev({ tipo: "desafio", area: "Comercial", titulo: "Desafio de Comercial", data: d(-6), entrega: d(-2) }),
    ev({ tipo: "desafio", area: "Dados", titulo: "Desafio de Dados", data: d(-5), entrega: d(-1) }),
    ev({ tipo: "desafio", area: "Desenvolvimento", titulo: "Desafio de Desenvolvimento", data: d(-4), entrega: d(0) }),
    ev({ tipo: "desafio", area: "Marketing", titulo: "Desafio de Marketing", data: d(-2), entrega: d(2) }),
    ev({ tipo: "desafio", area: "Inovação", titulo: "Desafio de Inovação", data: d(-1), entrega: d(2) }),
    ev({ tipo: "desafio", area: "Produto", titulo: "Desafio de Produto", data: d(0), entrega: d(4) }),
    ev({ tipo: "desafio", area: "Gente e Gestão", titulo: "Desafio de Gente e Gestão", data: d(1), entrega: d(5) }),
    ev({ tipo: "treinamento", area: "Dados", titulo: "Treinamento síncrono de Dados", data: d(-3), hora: "19:00", local: "Canal de voz #treinamentos" }),
    ev({ tipo: "treinamento", area: "Inovação", titulo: "Treinamento síncrono de Inovação", data: d(0), hora: "20:00", local: "Canal de voz #treinamentos" }),
    ev({ tipo: "treinamento", area: "Marketing", titulo: "Treinamento síncrono de Marketing", data: d(1), hora: "19:00", local: "Canal de voz #treinamentos" }),
    ev({ tipo: "treinamento", area: "Produto", titulo: "Treinamento síncrono de Produto", data: d(2), hora: "18:30", local: "Canal de voz #treinamentos" }),
    ev({ tipo: "treinamento", area: "Gente e Gestão", titulo: "Treinamento síncrono de Gente e Gestão", data: d(3), hora: "19:00", local: "Canal de voz #treinamentos" }),
    ev({ tipo: "aviso", area: "Geral", titulo: "Resultado da primeira fase", data: d(7), hora: "18:00", descricao: "Divulgação no canal #avisos." }),
  ];

  const t = (o) => ({
    id: novoId("t"),
    recusadoPor: [],
    historico: [],
    criadaEm: d(-3),
    atribuidaEm: d(-3),
    ...o,
  });

  const tasks = [
    t({ titulo: "Corrigir desafio — Dados (6 de 12)", tipoId: "tp_corrigir", area: "Dados", prazo: d(2), esforcoH: 3, responsavelId: "m_ana", status: "em_andamento" }),
    t({ titulo: "Corrigir desafio — Dados (6 de 12)", tipoId: "tp_corrigir", area: "Dados", prazo: d(2), esforcoH: 3, responsavelId: "m_iara", status: "atribuida", atribuidaEm: d(-2) }),
    t({ titulo: "Preparar treinamento síncrono — Marketing", tipoId: "tp_preparar", area: "Marketing", prazo: d(0), esforcoH: 3, responsavelId: "m_carla", status: "em_andamento" }),
    t({ titulo: "Conduzir treinamento síncrono — Inovação", tipoId: "tp_conduzir", area: "Inovação", prazo: d(0), esforcoH: 2, responsavelId: "m_laura", status: "em_andamento" }),
    t({ titulo: "Tirar dúvidas do desafio de Desenvolvimento no Discord", tipoId: "tp_duvidas", area: "Geral", prazo: d(-1), esforcoH: 1.5, responsavelId: "m_diego", status: "atribuida", criadaEm: d(-4), atribuidaEm: d(-4) }),
    t({ titulo: "Preparar treinamento síncrono — Produto", tipoId: "tp_preparar", area: "Produto", prazo: d(1), esforcoH: 3, responsavelId: "m_joao", status: "atribuida", atribuidaEm: d(0) }),
    t({ titulo: "Corrigir desafio — Desenvolvimento", tipoId: "tp_corrigir", area: "Desenvolvimento", prazo: d(3), esforcoH: 4, responsavelId: "m_bruno", status: "atribuida", atribuidaEm: d(0) }),
    t({ titulo: "Conduzir treinamento síncrono — Dados", tipoId: "tp_conduzir", area: "Dados", prazo: d(-3), esforcoH: 2, responsavelId: "m_ana", status: "concluida", concluidaEm: d(-3), criadaEm: d(-6), atribuidaEm: d(-6) }),
    t({ titulo: "Corrigir desafio — Comercial", tipoId: "tp_corrigir", area: "Comercial", prazo: d(-1), esforcoH: 3, responsavelId: "m_heitor", status: "concluida", concluidaEm: d(-1), criadaEm: d(-5), atribuidaEm: d(-5) }),
  ];

  return {
    versao: VERSAO,
    hojeDemo: hoje,
    areas: AREAS,
    tipos,
    membros,
    tasks,
    eventos,
    piloto: pilotoPadrao(),
    registro: [{ em: new Date().toISOString(), texto: "Dados de demonstração carregados." }],
  };
}

export function pilotoPadrao() {
  return { aceite24h: true, atrasadas: "avisar", seguirCronograma: true, sincronizarGoogle: true, lembreteDiario: true };
}

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const estado = JSON.parse(bruto);
      if (estado && estado.versao === VERSAO) {
        if (!estado.piloto) estado.piloto = pilotoPadrao();
        return garantirTipos(estado);
      }
    }
  } catch (e) {
    // localStorage indisponível ou corrompido: segue com a demonstração
  }
  const estado = dadosDemonstracao();
  salvar(estado);
  return estado;
}

export function salvar(estado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (e) {
    // sem persistência neste navegador; o app continua funcionando na memória
  }
}

export function restaurar() {
  const estado = dadosDemonstracao();
  salvar(estado);
  return estado;
}

export function registrar(estado, texto) {
  estado.registro.unshift({ em: new Date().toISOString(), texto });
  if (estado.registro.length > 200) estado.registro.length = 200;
}
