// Estado da aplicação, dados de demonstração e persistência no navegador.

import { hojeISO, somarDias } from "./datas.js";

const CHAVE = "ps-tasks:v1";

export const AREAS = ["Comercial", "Marketing", "Dados", "Desenvolvimento", "Gente e Gestão", "Projetos"];

export function novoId(prefixo) {
  return `${prefixo}_${Math.random().toString(36).slice(2, 9)}`;
}

export function dadosDemonstracao(hoje = hojeISO()) {
  const d = (n) => somarDias(hoje, n);

  const tipos = [
    { id: "tp_corrigir", chave: "corrigir", nome: "Corrigir desafio", esforcoPadraoH: 0.5, divisivel: true, areaObrigatoria: true },
    { id: "tp_entrevista", chave: "entrevista", nome: "Conduzir entrevista", esforcoPadraoH: 1, divisivel: true, areaObrigatoria: false },
    { id: "tp_responder", chave: "responder", nome: "Responder aspirantes", esforcoPadraoH: 0.25, divisivel: true, areaObrigatoria: false },
    { id: "tp_dinamica", chave: "dinamica", nome: "Organizar dinâmica", esforcoPadraoH: 3, divisivel: false, areaObrigatoria: false, areaPadrao: "Gente e Gestão" },
    { id: "tp_consolidar", chave: "consolidar", nome: "Consolidar notas", esforcoPadraoH: 2, divisivel: false, areaObrigatoria: false, areaPadrao: "Gente e Gestão" },
    { id: "tp_divulgacao", chave: "divulgacao", nome: "Divulgação do PS", esforcoPadraoH: 2, divisivel: false, areaObrigatoria: false, areaPadrao: "Marketing" },
    { id: "tp_outra", chave: "outra", nome: "Outra", esforcoPadraoH: 1, divisivel: false, areaObrigatoria: false },
  ];

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
    t({ titulo: "Corrigir entregas do desafio de Dados (6 de 12)", tipoId: "tp_corrigir", area: "Dados", prazo: d(2), esforcoH: 3, responsavelId: "m_ana", status: "em_andamento" }),
    t({ titulo: "Corrigir entregas do desafio de Dados (6 de 12)", tipoId: "tp_corrigir", area: "Dados", prazo: d(2), esforcoH: 3, responsavelId: "m_iara", status: "atribuida" }),
    t({ titulo: "Entrevistas da segunda fase — bloco da manhã", tipoId: "tp_entrevista", area: "Geral", prazo: d(1), esforcoH: 4, responsavelId: "m_elisa", status: "em_andamento" }),
    t({ titulo: "Responder dúvidas dos aspirantes no e-mail", tipoId: "tp_responder", area: "Geral", prazo: d(-1), esforcoH: 1.5, responsavelId: "m_diego", status: "atribuida", criadaEm: d(-4), atribuidaEm: d(-4) }),
    t({ titulo: "Post de lembrete do prazo do desafio", tipoId: "tp_divulgacao", area: "Marketing", prazo: d(0), esforcoH: 2, responsavelId: "m_carla", status: "em_andamento" }),
    t({ titulo: "Corrigir entregas do desafio de Desenvolvimento", tipoId: "tp_corrigir", area: "Desenvolvimento", prazo: d(3), esforcoH: 4, responsavelId: "m_bruno", status: "em_andamento" }),
    t({ titulo: "Organizar dinâmica em grupo", tipoId: "tp_dinamica", area: "Gente e Gestão", prazo: d(-2), esforcoH: 3, responsavelId: "m_elisa", status: "concluida", concluidaEm: d(-2), criadaEm: d(-6), atribuidaEm: d(-6) }),
    t({ titulo: "Corrigir entregas do desafio Comercial", tipoId: "tp_corrigir", area: "Comercial", prazo: d(-1), esforcoH: 3, responsavelId: "m_heitor", status: "concluida", concluidaEm: d(-1), criadaEm: d(-5), atribuidaEm: d(-5) }),
  ];

  return {
    versao: 1,
    hojeDemo: hoje,
    areas: AREAS,
    tipos,
    membros,
    tasks,
    registro: [
      { em: new Date().toISOString(), texto: "Dados de demonstração carregados." },
    ],
  };
}

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const estado = JSON.parse(bruto);
      if (estado && estado.versao === 1) return estado;
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
