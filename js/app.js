// Interface do repasse: telas do gerente e do membro.

import { carregar, salvar, restaurar, registrar, novoId, TIPOS_EVENTO } from "./dados.js";
import { hojeISO, formatarCurto, prazoRelativo, diferencaDias, somarDias } from "./datas.js";
import { proporDistribuicao, redistribuir, pontuar, cargaSemana, explicar } from "./motor.js";
import { montarPlano, exemploPlanejamento, lerPlanejamento, tarefasDoEvento, resumoPlano } from "./planejador.js";
import { interpretar, interpretarLocal, resumirComIA } from "./interpretador.js";
import { enviarDiscord, eventoParaDiscord, quandoEvento, resumoDatas, horaBR } from "./discord.js";
import { gradeMes, itensDoDia, MESES } from "./calendario.js";

const raiz = document.getElementById("app");
const CHAVE_PERFIL = "ps-tasks:perfil";

let estado = carregar();
const hoje = hojeISO();

// Explicação para tasks que vieram da demonstração sem ela.
function completarExplicacoes() {
  for (const t of estado.tasks) {
    if (t.explicacao || !t.responsavelId || t.status === "concluida") continue;
    const m = estado.membros.find((x) => x.id === t.responsavelId);
    if (m) t.explicacao = explicar(m.nome.split(" ")[0], pontuar(estado, m, { ...t, esforcoH: 0 }, hoje));
  }
}
completarExplicacoes();

const ui = {
  perfilId: lerPerfil(),
  aba: null,
  filtro: "abertas",
  nova: novaVazia(),
  recusando: null,
  resumo: { texto: "", carregando: false, erro: "" },
  conflitosAusencia: [],
  calMes: hojeISO().slice(0, 7),
  calDia: hojeISO(),
  evEditando: null, // id do evento, "novo" ou null
  evSugestoes: null, // id do evento cujas tasks sugeridas estão abertas
  enviando: false,
  cronoVista: "lista", // "lista" ou "calendario"
  ausenciaAberta: false,
  google: { configurado: false, planilha: null, sincronizando: false },
  plano: null, // { passo: "texto" | "lendo" | "revisao", texto, nAspirantes, substituir, publicar, lido, resultado }
};

function novaVazia() {
  return { passo: 1, texto: "", pedido: null, proposta: null, carregando: false, criadas: null };
}

function lerPerfil() {
  try { return sessionStorage.getItem(CHAVE_PERFIL); } catch (e) { return null; }
}
function gravarPerfil(id) {
  try {
    if (id) sessionStorage.setItem(CHAVE_PERFIL, id);
    else sessionStorage.removeItem(CHAVE_PERFIL);
  } catch (e) { /* sem sessionStorage */ }
}

// ---------- Utilidades ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const membro = (id) => estado.membros.find((m) => m.id === id);
const tipo = (id) => estado.tipos.find((t) => t.id === id);
const primeiroNome = (id) => (membro(id) ? membro(id).nome.split(" ")[0] : "—");
const horas = (h) => `${String(Math.round(h * 10) / 10).replace(".", ",")}h`;
const cargaAtual = (id) => cargaSemana(estado, id, hoje, hoje);
const membrosAtivos = () => estado.membros.filter((m) => m.papel === "membro" && m.ativo);

function statusDe(t) {
  if (t.status === "concluida") return "concluida";
  if (!t.responsavelId) return "sem_responsavel";
  if (t.prazo < hoje) return "atrasada";
  return t.status;
}
const ROTULO = {
  atribuida: "Aguardando aceite",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  atrasada: "Atrasada",
  sem_responsavel: "Sem responsável",
};
function etiqueta(t) {
  const s = statusDe(t);
  return `<span class="etiqueta ${s}">${ROTULO[s]}</span>`;
}
function prazoHtml(t) {
  if (t.status === "concluida") return `<span class="prazo">${formatarCurto(t.prazo)}</span>`;
  const n = diferencaDias(hoje, t.prazo);
  const cls = n < 0 ? "atrasado" : n === 0 ? "hoje" : "";
  return `<span class="prazo ${cls}">${formatarCurto(t.prazo)} · ${prazoRelativo(t.prazo, hoje)}</span>`;
}
function barraCarga(carga, cap) {
  const p = cap ? carga / cap : 0;
  const cls = p > 1 ? "alta" : p > 0.8 ? "media" : "";
  return `<div class="barra ${cls}"><i style="width:${Math.min(100, p * 100)}%"></i></div>`;
}

function persistir() {
  salvar(estado);
}

let timerToast;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.remove(), 3800);
}

// ---------- Regras de negócio da interface ----------
function atribuirTask(task, membroId, motivo) {
  const antes = task.responsavelId;
  task.responsavelId = membroId;
  task.status = membroId ? "atribuida" : "sem_responsavel";
  task.atribuidaEm = hoje;
  task.atribuidaTs = Date.now();
  delete task.atrasoTratado;
  delete task.aceiteCobrado;
  task.historico.push({ em: new Date().toISOString(), texto: motivo });
  if (membroId) {
    const r = pontuar(estado, membro(membroId), { ...task, esforcoH: 0 }, hoje);
    task.explicacao = explicar(membro(membroId).nome.split(" ")[0], r);
  }
  return antes;
}

// Quando alguém não pode: escolhe outra pessoa sem passar pelo gerente.
function repassar(task, quemSaiu, motivo) {
  if (quemSaiu && !task.recusadoPor.includes(quemSaiu)) task.recusadoPor.push(quemSaiu);
  const proximo = redistribuir(estado, task, hoje);
  const nomeSaiu = quemSaiu ? primeiroNome(quemSaiu) : "—";
  if (proximo) {
    atribuirTask(task, proximo.membroId, `Repassada de ${nomeSaiu} para ${primeiroNome(proximo.membroId)}${motivo ? ` (${motivo})` : ""}.`);
    registrar(estado, `"${task.titulo}": ${nomeSaiu} não pôde${motivo ? ` (${motivo})` : ""}; repassada automaticamente para ${primeiroNome(proximo.membroId)}.`);
    avisarEquipe({ tipo: "repasse", texto: `"${task.titulo}" foi repassada de ${nomeSaiu} para ${primeiroNome(proximo.membroId)}${motivo ? ` (${motivo})` : ""}. Prazo: ${formatarCurto(task.prazo)}.` });
    return proximo.membroId;
  }
  task.responsavelId = null;
  task.status = "sem_responsavel";
  registrar(estado, `"${task.titulo}": ${nomeSaiu} não pôde e ninguém elegível sobrou. A gerência precisa decidir.`);
  return null;
}

// ---------- Telas ----------
function render() {
  const p = ui.perfilId && membro(ui.perfilId);
  if (!p) {
    raiz.innerHTML = telaEntrada();
    return;
  }
  if (!ui.aba) ui.aba = p.papel === "gerente" ? "painel" : "minhas";
  const conteudo =
    p.papel === "gerente"
      ? ({ painel: telaPainel, nova: telaNova, cronograma: telaCronograma, equipe: telaEquipe }[ui.aba] || telaPainel)()
      : ({ minhas: telaMinhas, calendario: telaCalendario }[ui.aba] || telaMinhas)();
  raiz.innerHTML = topo(p) + `<main>${conteudo}</main>`;
}

function topo(p) {
  const abas =
    p.papel === "gerente"
      ? [
          ["painel", "Painel", contarAtencao()],
          ["nova", "Nova task"],
          ["cronograma", "Cronograma"],
          ["equipe", "Equipe"],
        ]
      : [["minhas", "Minhas tasks", estado.tasks.filter((t) => t.responsavelId === p.id && t.status === "atribuida").length]];
  return `<header class="topo"><div class="topo-dentro">
    <div class="marca">repasse<span>.</span><small>PS</small></div>
    <nav class="abas" aria-label="Seções">
      ${abas
        .map(
          ([id, nome, n]) =>
            `<button class="aba ${ui.aba === id ? "ativa" : ""}" data-acao="aba" data-id="${id}">${nome}${n ? `<span class="contador">${n}</span>` : ""}</button>`
        )
        .join("")}
    </nav>
    <div class="perfil">
      <div class="perfil-nome">${esc(p.nome)}<small>${p.papel === "gerente" ? "Gerente do PS" : `Membro · ${esc(p.area)}`}</small></div>
      <button class="botao pequeno" data-acao="sair">Trocar perfil</button>
    </div>
  </div></header>`;
}

function telaEntrada() {
  const gerentes = estado.membros.filter((m) => m.papel === "gerente");
  const membros = estado.membros.filter((m) => m.papel === "membro" && m.ativo);
  const cartao = (m) => {
    const abertas = estado.tasks.filter((t) => t.responsavelId === m.id && t.status !== "concluida").length;
    return `<button class="perfil-cartao ${m.papel}" data-acao="entrar" data-id="${m.id}">
      <b>${esc(m.nome)}</b>
      <span>${m.papel === "gerente" ? "Gerente do PS" : esc(m.area)} · ${abertas} task${abertas === 1 ? "" : "s"} aberta${abertas === 1 ? "" : "s"}</span>
    </button>`;
  };
  return `<header class="topo"><div class="topo-dentro"><div class="marca">repasse<span>.</span><small>PS</small></div></div></header>
  <main>
    <section class="entrada-topo">
      <h1>Cole o planejamento do PS. O repasse monta o resto.</h1>
      <p class="sub">Cronograma, calendário e quem faz o quê, distribuído pela área e pela carga de cada membro. Depois, o piloto automático cobra, repassa e avisa os aspirantes sozinho.</p>
    </section>
    <div class="como">
      <div><b>01 · monta</b>A gerência cola o texto de como o PS vai ser. Desafios, treinamentos e todas as tasks da equipe saem distribuídos em segundos.</div>
      <div><b>02 · distribui</b>Cada task vai para quem é da área e tem folga na semana, com o motivo da escolha. Uma frase também cria uma task avulsa.</div>
      <div><b>03 · segue sozinho</b>Quem não pode aperta um botão e a task muda de dono. Mudanças no cronograma vão para o Discord e para a planilha dos aspirantes.</div>
    </div>
    <div class="bloco">
      <h2>Entrar como</h2>
      <div class="perfis">${gerentes.map(cartao).join("")}</div>
    </div>
    <div class="bloco">
      <h2>Membros da equipe do PS</h2>
      <div class="perfis">${membros.map(cartao).join("")}</div>
    </div>
    <div class="rodape-demo">
      <span>Demonstração com pessoas fictícias. Os dados ficam salvos neste navegador.</span>
      <button class="botao texto" data-acao="restaurar">Restaurar dados de demonstração</button>
    </div>
  </main>`;
}

// ---------- Gerente: painel ----------
function itensAtencao() {
  const itens = [];
  for (const t of estado.tasks) {
    const s = statusDe(t);
    if (s === "sem_responsavel") itens.push({ t, tipo: "sem" });
    else if (s === "atrasada") itens.push({ t, tipo: "atrasada" });
  }
  for (const m of membrosAtivos()) {
    const c = cargaAtual(m.id);
    if (c > m.capacidadeSemanal) itens.push({ m, c, tipo: "sobrecarga" });
  }
  return itens;
}
function contarAtencao() {
  return itensAtencao().length;
}

function telaPainel() {
  const atencao = itensAtencao();

  const atencaoHtml = atencao.length
    ? atencao
        .map((i) => {
          if (i.tipo === "sobrecarga")
            return `<div class="alerta-item"><p><b>${esc(i.m.nome)}</b> está com ${horas(i.c)} de ${horas(i.m.capacidadeSemanal)}<br><small>Acima da capacidade semanal</small></p>
            <button class="botao pequeno" data-acao="aba" data-id="equipe">Ver equipe</button></div>`;
          const t = i.t;
          return `<div class="alerta-item"><p><b>${esc(t.titulo)}</b><br><small>${
            i.tipo === "sem" ? "Ninguém elegível aceitou" : `${esc(primeiroNome(t.responsavelId))} · ${prazoRelativo(t.prazo, hoje)}`
          }</small></p>
          <button class="botao pequeno" data-acao="repassar-gerente" data-id="${t.id}">${i.tipo === "sem" ? "Tentar atribuir" : "Repassar"}</button></div>`;
        })
        .join("")
    : `<p class="vazio">Nada atrasado, ninguém acima da capacidade.</p>`;

  const carga = membrosAtivos()
    .map((m) => ({ m, c: cargaAtual(m.id) }))
    .sort((a, b) => b.c / b.m.capacidadeSemanal - a.c / a.m.capacidadeSemanal)
    .map(
      ({ m, c }) => `<div class="carga">
        <div class="carga-nome">${esc(m.nome)}<small>${esc(m.area)}${m.indisponivelAte && m.indisponivelAte >= hoje ? " · ausente" : ""}</small></div>
        ${barraCarga(c, m.capacidadeSemanal)}
        <div class="carga-valor">${horas(c)}/${m.capacidadeSemanal}h</div>
      </div>`
    )
    .join("");

  const resumo = ui.resumo;
  const resumoHtml =
    resumo.texto || resumo.erro
      ? `<div class="resumo-caixa">${resumo.texto ? `<p class="resumo-ia">${esc(resumo.texto)}</p>` : ""}${resumo.erro ? `<p class="nota erro">${esc(resumo.erro)}</p>` : ""}</div>`
      : "";

  return `
  <div class="linha-titulo"><div><h1>Painel do PS</h1><p class="sub" style="margin:0">${formatarCurto(hoje)}</p></div>
  <div class="acoes"><button class="botao" data-acao="abrir-plano">Montar o PS a partir do planejamento</button>
  <button class="botao primario" data-acao="aba" data-id="nova">+ Nova task</button></div></div>
  <div style="height:20px"></div>
  <div class="grade grade-3-1 bloco">
    <div>
      <div class="cartao">
        <div class="linha-titulo"><h2>Precisa de atenção</h2>
          <button class="botao texto" data-acao="resumo" ${resumo.carregando ? "disabled" : ""}>${resumo.carregando ? "Gerando resumo…" : "Resumo com IA"}</button></div>
        ${resumoHtml}${atencaoHtml}
      </div>
      ${cartaoProximos()}
    </div>
    <div>${cartaoPiloto()}<div class="cartao"><h2>Carga da semana</h2>${carga}</div></div>
  </div>
  ${tabelaTasks()}`;
}

function tabelaTasks() {
  const filtros = [
    ["abertas", "Abertas"],
    ["atrasadas", "Atrasadas"],
    ["concluidas", "Concluídas"],
    ["todas", "Todas"],
  ];
  let lista = estado.tasks.slice();
  if (ui.filtro === "abertas") lista = lista.filter((t) => t.status !== "concluida");
  if (ui.filtro === "atrasadas") lista = lista.filter((t) => statusDe(t) === "atrasada");
  if (ui.filtro === "concluidas") lista = lista.filter((t) => t.status === "concluida");
  lista.sort((a, b) => a.prazo.localeCompare(b.prazo));

  const opcoes = (t) =>
    `<option value="">— ninguém —</option>` +
    membrosAtivos()
      .map((m) => `<option value="${m.id}" ${m.id === t.responsavelId ? "selected" : ""}>${esc(m.nome)} (${esc(m.area)})</option>`)
      .join("");

  const linhas = lista
    .map(
      (t) => `<tr>
      <td><b>${esc(t.titulo)}</b><br><span class="prazo">${esc(tipo(t.tipoId)?.nome || "")} · ${horas(t.esforcoH)}</span></td>
      <td class="estreito">${
        t.status === "concluida"
          ? esc(membro(t.responsavelId)?.nome || "—")
          : `<select data-campo="responsavel" data-id="${t.id}" aria-label="Responsável">${opcoes(t)}</select>`
      }</td>
      <td class="estreito">${prazoHtml(t)}</td>
      <td class="estreito">${etiqueta(t)}</td>
    </tr>`
    )
    .join("");

  return `<div class="cartao">
    <div class="linha-titulo"><h2>Tasks</h2>
      <div class="filtros">${filtros
        .map(([id, n]) => `<button class="filtro ${ui.filtro === id ? "ativo" : ""}" data-acao="filtro" data-id="${id}">${n}</button>`)
        .join("")}</div>
    </div>
    ${lista.length ? `<div class="tabela-rolagem"><table><thead><tr><th>Task</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<p class="vazio">Nenhuma task neste filtro.</p>`}
  </div>`;
}

// ---------- Gerente: nova task ----------
const EXEMPLOS = [
  "Chegaram 14 entregas do desafio de Marketing, corrigir até sexta",
  "Preparar o treinamento síncrono de Produto até amanhã",
  "Responder 20 dúvidas dos aspirantes no Discord até quinta, no máximo 2 pessoas",
  "Consolidar as notas de todos os desafios para a deliberação até 25/11",
];

function telaNova() {
  const n = ui.nova;
  const passos = ["Pedido", "Conferir", "Distribuição"];
  const cab = `<h1>Nova task</h1><p class="sub">Escreva como mandaria no grupo. O repasse entende, calcula quem faz e espera sua confirmação.</p>
  <div class="passos">${passos
    .map((p, i) => `<div class="passo ${n.passo > i + 1 ? "feito" : n.passo === i + 1 ? "atual" : ""}"><b>${i + 1}</b>${p}</div>`)
    .join("")}</div>`;

  if (n.criadas) return cab + telaCriadas();

  let corpo = `<div class="cartao">
    <label for="pedido">O que precisa ser feito?</label>
    <textarea id="pedido" data-campo="texto-pedido" placeholder="Ex.: chegaram 14 entregas do desafio de Marketing, corrigir até sexta">${esc(n.texto)}</textarea>
    <div class="exemplos">${EXEMPLOS.map((e, i) => `<button class="exemplo" data-acao="exemplo" data-i="${i}">${esc(e)}</button>`).join("")}</div>
    <div class="acoes" style="margin-top:14px">
      <button class="botao primario" data-acao="interpretar" ${n.carregando ? "disabled" : ""}>${n.carregando ? "Lendo o pedido…" : "Interpretar pedido"}</button>
      <button class="botao texto" data-acao="manual">Preencher manualmente</button>
    </div>
  </div>`;

  if (n.pedido) corpo += formularioPedido();
  if (n.proposta) corpo += telaProposta();
  return cab + corpo;
}

function formularioPedido() {
  const p = ui.nova.pedido;
  const t = tipo(p.tipoId);
  const origem =
    p.fonte === "ia"
      ? `<div class="origem ia">Interpretado pela IA.${p.observacao ? ` Atenção: ${esc(p.observacao)}` : ""} Confira os campos antes de continuar.</div>`
      : p.fonte === "manual"
        ? ""
        : p.fonte === "cronograma"
          ? `<div class="origem ia">Gerada a partir do cronograma. Ajuste a quantidade e o prazo se precisar.</div>`
        : `<div class="origem">${esc(p.avisoIA || "Interpretado pelas regras locais.")} Confira os campos.</div>`;
  return `<div class="cartao">
    <h2>Conferir</h2>
    ${origem}
    <div class="campos">
      <div class="campo-largo"><label>Título</label><input type="text" data-campo="pedido" data-chave="titulo" value="${esc(p.titulo)}"></div>
      <div><label>Tipo</label><select data-campo="pedido" data-chave="tipoId">${estado.tipos
        .map((x) => `<option value="${x.id}" ${x.id === p.tipoId ? "selected" : ""}>${esc(x.nome)}</option>`)
        .join("")}</select></div>
      <div><label>Área</label><select data-campo="pedido" data-chave="area">${[...estado.areas, "Geral"]
        .map((a) => `<option ${a === p.area ? "selected" : ""}>${a}</option>`)
        .join("")}</select></div>
      <div><label>Prazo${p.prazoInferido ? " (sugerido)" : ""}</label><input type="date" data-campo="pedido" data-chave="prazo" value="${p.prazo}" min="${hoje}"></div>
      <div><label>Quantidade</label><input type="number" min="1" max="500" data-campo="pedido" data-chave="quantidade" value="${p.quantidade}"></div>
      <div><label>Horas por unidade</label><input type="number" min="0.1" step="0.25" data-campo="pedido" data-chave="esforcoPorUnidadeH" value="${p.esforcoPorUnidadeH}"></div>
      ${t && t.divisivel ? `<div><label>Máx. de pessoas (opcional)</label><input type="number" min="1" data-campo="pedido" data-chave="maxPessoas" value="${p.maxPessoas || ""}" placeholder="sem limite"></div>` : ""}
    </div>
    <p class="nota">${t ? `${esc(t.nome)}: ${t.divisivel ? "pode ser dividida entre várias pessoas" : "fica com uma pessoa só"}${t.areaObrigatoria ? "; exige alguém da área" : ""}.` : ""} Total: ${horas(p.quantidade * p.esforcoPorUnidadeH)}.</p>
    <div class="acoes" style="margin-top:14px"><button class="botao primario" data-acao="calcular">Calcular distribuição</button></div>
  </div>`;
}

function telaProposta() {
  const pr = ui.nova.proposta;
  const p = ui.nova.pedido;
  const elegiveis = membrosAtivos();
  if (!pr.partes.length) {
    return `<div class="cartao"><h2>Distribuição</h2><p class="nota erro">Ninguém pode receber esta task.</p>${listaInelegiveis(pr)}</div>`;
  }
  const linhas = pr.partes
    .map(
      (parte, i) => `<div class="proposta-linha">
      <div>
        <select data-campo="parte-membro" data-i="${i}" aria-label="Pessoa">${elegiveis
          .map((m) => `<option value="${m.id}" ${m.id === parte.membroId ? "selected" : ""}>${esc(m.nome)}</option>`)
          .join("")}</select>
        <div class="prazo" style="margin-top:4px">${esc(membro(parte.membroId).area)}</div>
      </div>
      <div class="proposta-parte">${
        pr.divisivel && pr.quantidade > 1 ? `<b>${parte.unidades}</b> <small>de ${pr.quantidade}</small><br>` : ""
      }<small>${horas(parte.esforcoH)}</small></div>
      <div class="proposta-motivos">
        ${barraCarga(parte.cargaDepois, parte.capacidade)}
        <div style="margin-top:4px" class="num">${horas(parte.cargaAntes)} → ${horas(parte.cargaDepois)} de ${parte.capacidade}h</div>
        <ul>${parte.motivos.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      </div>
      <div class="pontos">${parte.pontos}<small>pontos</small></div>
    </div>`
    )
    .join("");

  const alternativas = pr.alternativas.length
    ? `<p class="nota">Próximas opções: ${pr.alternativas.map((a) => `${esc(primeiroNome(a.membroId))} (${a.pontos})`).join(", ")}.</p>`
    : "";

  return `<div class="cartao">
    <div class="linha-titulo"><h2>Distribuição proposta</h2><span class="prazo">até ${formatarCurto(p.prazo)}</span></div>
    ${pr.semResponsavel ? `<p class="nota erro">${pr.semResponsavel} unidade(s) ficaram sem responsável: não há gente elegível suficiente.</p>` : ""}
    ${linhas}
    ${alternativas}
    ${listaInelegiveis(pr)}
    <details><summary>Como a pontuação funciona</summary>
      <ul>
        <li>Área: +30 se a pessoa é da área da task.</li>
        <li>Folga: até +40, proporcional às horas que sobram na semana depois de receber a task.</li>
        <li>Prazos: até +15, menos 5 por outro prazo seu a até 1 dia deste.</li>
        <li>Rodízio: até +15, menos 3 por task recebida nos últimos 7 dias.</li>
        <li>Ausência: −10 se está ausente hoje mas volta antes do prazo. Quem está ausente até o prazo não entra.</li>
        <li>Tasks divisíveis são repartidas unidade a unidade, sempre para quem está mais bem pontuado naquele momento.</li>
      </ul>
    </details>
    <div class="acoes" style="margin-top:16px">
      <button class="botao primario" data-acao="confirmar">Confirmar e avisar a equipe</button>
      <button class="botao" data-acao="calcular">Recalcular</button>
    </div>
  </div>`;
}

function listaInelegiveis(pr) {
  if (!pr.inelegiveis.length) return "";
  const porMotivo = {};
  for (const i of pr.inelegiveis) (porMotivo[i.motivo] ||= []).push(primeiroNome(i.membroId));
  return `<details><summary>Quem ficou de fora (${pr.inelegiveis.length})</summary><ul>${Object.entries(porMotivo)
    .map(([motivo, nomes]) => `<li>${esc(nomes.join(", "))}: ${esc(motivo)}</li>`)
    .join("")}</ul></details>`;
}

function textoAviso(criadas, pedido) {
  const porPessoa = {};
  for (const t of criadas) {
    const k = t.responsavelId;
    porPessoa[k] = porPessoa[k] || { unidades: 0, horas: 0 };
    porPessoa[k].unidades += t.unidades || 1;
    porPessoa[k].horas += t.esforcoH;
  }
  const t0 = tipo(pedido.tipoId);
  const linhas = Object.entries(porPessoa).map(
    ([id, v]) =>
      `• ${membro(id).nome.split(" ")[0]}: ${t0 && t0.divisivel && pedido.quantidade > 1 ? `${v.unidades} de ${pedido.quantidade} · ` : ""}${horas(v.horas)}`
  );
  return `*Nova task do PS:* ${pedido.titulo}\nPrazo: ${formatarCurto(pedido.prazo)}\n\n${linhas.join("\n")}\n\nAceite ou repasse no repasse: ${location.origin}${location.pathname}`;
}

function telaCriadas() {
  const { lista, pedido } = ui.nova.criadas;
  return `<div class="cartao">
    <h2>Pronto: ${lista.length} task${lista.length > 1 ? "s" : ""} criada${lista.length > 1 ? "s" : ""}</h2>
    <p class="sub" style="margin-bottom:12px">Cada pessoa já vê a sua parte em "Minhas tasks". Se quiser avisar também no grupo do WhatsApp, copie a mensagem:</p>
    <textarea class="aviso-copia" id="aviso" readonly>${esc(textoAviso(lista, pedido))}</textarea>
    <div class="acoes" style="margin-top:12px">
      <button class="botao" data-acao="copiar-aviso">Copiar mensagem</button>
      <button class="botao primario" data-acao="outra-task">Criar outra task</button>
      <button class="botao texto" data-acao="aba" data-id="painel">Ir para o painel</button>
    </div>
  </div>`;
}

// ---------- Gerente: equipe e tipos ----------
function telaEquipe() {
  const linhas = estado.membros
    .filter((m) => m.papel === "membro")
    .map((m) => {
      const c = cargaAtual(m.id);
      return `<tr>
        <td><b>${esc(m.nome)}</b></td>
        <td><select data-campo="membro" data-id="${m.id}" data-chave="area">${estado.areas
          .map((a) => `<option ${a === m.area ? "selected" : ""}>${a}</option>`)
          .join("")}</select></td>
        <td class="estreito"><input type="number" min="1" max="40" style="width:80px;min-width:0" data-campo="membro" data-id="${m.id}" data-chave="capacidadeSemanal" value="${m.capacidadeSemanal}"></td>
        <td class="estreito"><input type="date" data-campo="membro" data-id="${m.id}" data-chave="indisponivelAte" value="${m.indisponivelAte || ""}"></td>
        <td style="min-width:140px">${barraCarga(c, m.capacidadeSemanal)}<span class="prazo num">${horas(c)}/${m.capacidadeSemanal}h</span></td>
        <td class="estreito"><label class="check"><input type="checkbox" data-campo="membro" data-id="${m.id}" data-chave="ativo" ${m.ativo ? "checked" : ""}> ativo</label></td>
      </tr>`;
    })
    .join("");
  return `<h1>Equipe do PS</h1>
  <p class="sub">Área, horas na semana e ausências: é com isso que o repasse decide.</p>
  <div class="cartao bloco"><div class="tabela-rolagem"><table>
    <thead><tr><th>Nome</th><th>Área</th><th>Horas/semana</th><th>Ausente até</th><th>Carga atual</th><th></th></tr></thead>
    <tbody>${linhas}</tbody></table></div></div>
  <div class="cartao">
    <h2>Adicionar membro</h2>
    <div class="campos">
      <div><label>Nome</label><input type="text" id="novo-nome" placeholder="Nome e sobrenome"></div>
      <div><label>Área</label><select id="novo-area">${estado.areas.map((a) => `<option>${a}</option>`).join("")}</select></div>
      <div><label>Horas por semana</label><input type="number" id="novo-cap" value="6" min="1" max="40"></div>
    </div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" data-acao="add-membro">Adicionar</button></div>
  </div>
  <details class="secao"><summary>Tipos de task <span class="prazo">quanto tempo cada uma leva, se divide e se exige a área</span></summary>${secaoTipos()}</details>
  <details class="secao"><summary>Histórico <span class="prazo">tudo o que o repasse decidiu</span></summary>${secaoRegistro()}</details>`;
}

function secaoTipos() {
  const linhas = estado.tipos
    .map(
      (t) => `<tr>
      <td><input type="text" data-campo="tipo" data-id="${t.id}" data-chave="nome" value="${esc(t.nome)}"></td>
      <td class="estreito"><input type="number" min="0.1" step="0.25" style="width:90px;min-width:0" data-campo="tipo" data-id="${t.id}" data-chave="esforcoPadraoH" value="${t.esforcoPadraoH}"></td>
      <td class="estreito"><label class="check"><input type="checkbox" data-campo="tipo" data-id="${t.id}" data-chave="divisivel" ${t.divisivel ? "checked" : ""}> divisível</label></td>
      <td class="estreito"><label class="check"><input type="checkbox" data-campo="tipo" data-id="${t.id}" data-chave="areaObrigatoria" ${t.areaObrigatoria ? "checked" : ""}> exige a área</label></td>
    </tr>`
    )
    .join("");
  return `<div class="cartao bloco"><div class="tabela-rolagem"><table>
    <thead><tr><th>Tipo</th><th>Horas por unidade</th><th>Divisão</th><th>Área</th></tr></thead>
    <tbody>${linhas}</tbody></table></div></div>
  <div class="cartao"><h2>Novo tipo</h2>
    <div class="campos">
      <div><label>Nome</label><input type="text" id="tipo-nome" placeholder="Ex.: Reservar sala"></div>
      <div><label>Horas por unidade</label><input type="number" id="tipo-h" value="1" min="0.1" step="0.25"></div>
    </div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" data-acao="add-tipo">Adicionar</button></div>
  </div>`;
}

function secaoRegistro() {
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return `<div class="cartao">${estado.registro.map((r) => `<div class="registro-item"><time>${fmt(r.em)}</time><div>${esc(r.texto)}</div></div>`).join("")}</div>`;
}

// ---------- Membro ----------
function cartaoTask(t) {
  const s = statusDe(t);
  const recusando = ui.recusando === t.id;
  let acoes = "";
  if (t.status === "atribuida")
    acoes = `<button class="botao primario pequeno" data-acao="aceitar" data-id="${t.id}">Aceitar</button><button class="botao pequeno" data-acao="recusar" data-id="${t.id}">Não consigo</button>`;
  else if (t.status === "em_andamento")
    acoes = `<button class="botao primario pequeno" data-acao="concluir" data-id="${t.id}">Concluí</button><button class="botao pequeno" data-acao="recusar" data-id="${t.id}">Não consigo mais</button>`;
  return `<div class="task-cartao ${s === "atrasada" ? "atrasada" : ""}">
    <div>
      <h3>${esc(t.titulo)}</h3>
      <div class="task-meta">${etiqueta(t)} ${prazoHtml(t)} <span>${horas(t.esforcoH)}</span> <span class="etiqueta area">${esc(t.area)}</span></div>
    </div>
    <div class="task-acoes">${acoes}</div>
    ${recusando ? `<div class="recusa"><input type="text" id="motivo" placeholder="Motivo (opcional): prova, viagem, já estou cheio…"><button class="botao pequeno" data-acao="confirmar-recusa" data-id="${t.id}">Repassar</button><button class="botao texto" data-acao="cancelar-recusa">Cancelar</button></div>` : ""}
    ${t.explicacao && t.status !== "concluida" ? `<div class="task-porque">Por que você: ${esc(t.explicacao.replace(/^[^:]+:\s*/, ""))}</div>` : ""}
  </div>`;
}

function telaMinhas() {
  const eu = membro(ui.perfilId);
  const minhas = estado.tasks.filter((t) => t.responsavelId === eu.id).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const aguardando = minhas.filter((t) => t.status === "atribuida");
  const andamento = minhas.filter((t) => t.status === "em_andamento");
  const feitas = minhas.filter((t) => t.status === "concluida").slice(-5).reverse();
  const c = cargaAtual(eu.id);
  const sec = (titulo, lista, vazio) =>
    `<div class="bloco"><h2>${titulo} <span class="prazo num">${lista.length}</span></h2>${lista.length ? lista.map(cartaoTask).join("") : `<p class="vazio">${vazio}</p>`}</div>`;
  const ausente = eu.indisponivelAte && eu.indisponivelAte >= hoje;
  return `<div class="linha-titulo"><div><h1>Olá, ${esc(eu.nome.split(" ")[0])}</h1>
    <p class="sub" style="margin:0">${horas(c)} de ${eu.capacidadeSemanal}h nesta semana${ausente ? ` · ausente até ${formatarCurto(eu.indisponivelAte)}` : ""}</p></div>
    <div class="acoes">
      <button class="botao" data-acao="abrir-ausencia">${ausente ? "Minha ausência" : "Vou me ausentar"}</button>
      <button class="botao" data-acao="aba" data-id="calendario">Ver calendário</button>
    </div></div>
  <div style="height:20px"></div>
  ${ui.ausenciaAberta ? blocoAusencia(eu) : ""}
  ${sec("Aguardando seu aceite", aguardando, "Nenhuma task nova.")}
  ${sec("Em andamento", andamento, "Nada em andamento.")}
  ${feitas.length ? sec("Concluídas", feitas, "") : ""}`;
}

function blocoAusencia(eu) {
  const conflitos = ui.conflitosAusencia
    .map((id) => estado.tasks.find((t) => t.id === id))
    .filter((t) => t && t.responsavelId === eu.id && t.status !== "concluida");
  return `<div class="cartao bloco">
    <h2>Vou me ausentar</h2>
    <p class="nota" style="margin:0 0 12px">Prova, viagem, doença: avise uma vez e o repasse para de te mandar tasks com prazo nesse período.</p>
    <div class="campos">
      <div><label>Estou fora até (inclusive)</label><input type="date" id="minha-ausencia" min="${hoje}" value="${eu.indisponivelAte || ""}"></div>
      <div><label>Horas que tenho nesta semana</label><input type="number" min="1" max="40" id="minha-cap" value="${eu.capacidadeSemanal}"></div>
    </div>
    <div class="acoes" style="margin-top:14px">
      <button class="botao primario" data-acao="salvar-disp">Salvar</button>
      ${eu.indisponivelAte ? `<button class="botao texto" data-acao="limpar-ausencia">Não vou mais me ausentar</button>` : ""}
      <button class="botao texto" data-acao="fechar-ausencia">Fechar</button>
    </div>
    ${
      conflitos.length
        ? `<div class="sugestoes" style="margin-top:14px"><b>${conflitos.length} task${conflitos.length > 1 ? "s vencem" : " vence"} durante a ausência</b>
          ${conflitos.map((t) => `<div class="sugestao"><span>${esc(t.titulo)}</span><small class="prazo">${prazoRelativo(t.prazo, hoje)}</small></div>`).join("")}
          <div class="acoes" style="margin-top:8px"><button class="botao primario pequeno" data-acao="repassar-conflitos">Repassar estas tasks</button></div></div>`
        : ""
    }
  </div>`;
}

// ---------- Discord ----------
// Avisos para o canal da equipe: silenciosos (se o webhook da equipe não existir, nada acontece).
function avisarEquipe(corpo) {
  enviarDiscord(corpo, { perguntarPin: false }).catch(() => {});
}

async function publicarAspirantes(corpo, mensagemOk) {
  ui.enviando = true;
  render();
  const r = await enviarDiscord(corpo);
  ui.enviando = false;
  render();
  if (r.ok) toast(mensagemOk);
  else if (r.naoConfigurado) toast("O Discord ainda não está configurado na Vercel (DISCORD_WEBHOOK_ASPIRANTES).");
  else toast(`Não foi possível publicar no Discord: ${r.erro}`);
  if (r.ok) registrar(estado, `Discord: ${mensagemOk}`), persistir();
  return r.ok;
}

function eventosOrdenados() {
  return (estado.eventos || []).slice().sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
}

// Eventos que "acontecem" num dia: treinamentos e avisos na data; desafios no lançamento e na entrega.
function eventosDoDia(iso) {
  const lista = [];
  for (const ev of eventosOrdenados()) {
    if (ev.tipo === "desafio") {
      if (ev.data === iso) lista.push({ ...eventoParaDiscord(ev), titulo: `Lançamento: ${ev.titulo}`, quando: formatarCurto(iso) });
      if (ev.entrega === iso) lista.push({ titulo: `Entrega: ${ev.titulo}`, quando: formatarCurto(iso), local: ev.local || "" });
    } else if (ev.data === iso) {
      lista.push(eventoParaDiscord(ev));
    }
  }
  return lista;
}

function cartaoProximos() {
  const hojeLista = eventosDoDia(hoje);
  const amanhaLista = eventosDoDia(somarDias(hoje, 1));
  const linha = (e) => `<div class="alerta-item"><p><b>${esc(e.titulo)}</b><br><small>${esc(e.quando)}${e.local ? ` · ${esc(e.local)}` : ""}</small></p></div>`;
  return `<div class="cartao">
    <div class="linha-titulo"><h2>Cronograma: hoje e amanhã</h2>
      <button class="botao pequeno" data-acao="enviar-lembretes" ${ui.enviando ? "disabled" : ""}>Lembrar aspirantes no Discord</button></div>
    <h3 class="prazo">Hoje</h3>${hojeLista.length ? hojeLista.map(linha).join("") : `<p class="vazio">Nada no cronograma.</p>`}
    <h3 class="prazo" style="margin-top:10px">Amanhã</h3>${amanhaLista.length ? amanhaLista.map(linha).join("") : `<p class="vazio">Nada no cronograma.</p>`}
  </div>`;
}

// ---------- Gerente: cronograma ----------
function sugestoesDoEvento(ev) {
  return tarefasDoEvento(ev, hoje, 12);
}

function formEvento() {
  const ev =
    ui.evEditando === "novo"
      ? { tipo: "treinamento", titulo: "", area: estado.areas[0], data: hoje, hora: "19:00", entrega: "", local: "", descricao: "" }
      : estado.eventos.find((e) => e.id === ui.evEditando);
  if (!ev) return "";
  const areas = [...estado.areas, "Geral"];
  return `<div class="cartao bloco" id="form-evento">
    <h2>${ui.evEditando === "novo" ? "Novo item do cronograma" : "Editar item do cronograma"}</h2>
    <div class="campos">
      <div><label>Tipo</label><select id="ev-tipo" data-campo="ev-tipo">${Object.entries(TIPOS_EVENTO)
        .map(([k, v]) => `<option value="${k}" ${k === ev.tipo ? "selected" : ""}>${v}</option>`)
        .join("")}</select></div>
      <div class="campo-largo"><label>Título</label><input type="text" id="ev-titulo" value="${esc(ev.titulo)}" placeholder="Ex.: Treinamento síncrono de Dados"></div>
      <div><label>Subárea</label><select id="ev-area">${areas.map((a) => `<option ${a === ev.area ? "selected" : ""}>${a}</option>`).join("")}</select></div>
      <div><label id="ev-data-rotulo">${ev.tipo === "desafio" ? "Lançamento" : "Data"}</label><input type="date" id="ev-data" value="${ev.data}"></div>
      <div><label>Horário (opcional)</label><input type="time" id="ev-hora" value="${ev.hora || ""}"></div>
      <div id="ev-entrega-campo" ${ev.tipo === "desafio" ? "" : 'style="display:none"'}><label>Entrega</label><input type="date" id="ev-entrega" value="${ev.entrega || ""}"></div>
      <div class="campo-largo"><label>Local ou link</label><input type="text" id="ev-local" value="${esc(ev.local)}" placeholder="Ex.: canal de voz #treinamentos"></div>
      <div class="campo-largo"><label>Descrição (opcional)</label><input type="text" id="ev-descricao" value="${esc(ev.descricao)}"></div>
    </div>
    <label class="check" style="margin-top:14px"><input type="checkbox" id="ev-avisar" checked> Avisar os aspirantes no Discord ${ui.evEditando === "novo" ? "(novo item)" : "(se data, horário ou local mudar)"}</label>
    <div class="acoes" style="margin-top:14px">
      <button class="botao primario" data-acao="salvar-evento">Salvar</button>
      <button class="botao texto" data-acao="fechar-evento">Cancelar</button>
    </div>
  </div>`;
}

function telaCronograma() {
  if (ui.plano) return telaPlano();
  const evs = eventosOrdenados();
  const porSemana = new Map();
  for (const ev of evs) {
    const d = new Date(ev.data + "T12:00:00");
    const seg = somarDias(ev.data, -((d.getDay() + 6) % 7));
    if (!porSemana.has(seg)) porSemana.set(seg, []);
    porSemana.get(seg).push(ev);
  }
  const linhaEv = (ev) => {
    const sug = ui.evSugestoes === ev.id ? sugestoesHtml(ev) : "";
    const passado = (ev.entrega || ev.data) < hoje;
    return `<div class="evento-linha ${passado ? "passado" : ""}">
      <div class="evento-quando num">${formatarCurto(ev.data)}${ev.hora ? `<br><small>${horaBR(ev.hora)}</small>` : ""}</div>
      <div>
        <span class="etiqueta ev-${ev.tipo}">${TIPOS_EVENTO[ev.tipo]}</span> <span class="etiqueta area">${esc(ev.area)}</span>
        <div class="evento-titulo">${esc(ev.titulo)}</div>
        <div class="prazo">${ev.tipo === "desafio" && ev.entrega ? `Entrega: ${formatarCurto(ev.entrega)}` : ""}${ev.local ? `${ev.tipo === "desafio" && ev.entrega ? " · " : ""}${esc(ev.local)}` : ""}</div>
      </div>
      <div class="acoes">
        <button class="botao pequeno" data-acao="sugestoes-evento" data-id="${ev.id}">${ui.evSugestoes === ev.id ? "Fechar" : "Tasks da equipe"}</button>
        <button class="botao texto" data-acao="editar-evento" data-id="${ev.id}">Editar</button>
        <button class="botao texto perigo" data-acao="excluir-evento" data-id="${ev.id}">Cancelar</button>
      </div>
      ${sug}
    </div>`;
  };
  const semanas = [...porSemana.entries()]
    .map(([seg, lista]) => `<div class="bloco"><h3 class="prazo">Semana de ${formatarCurto(seg)}</h3><div class="cartao" style="padding:6px 18px">${lista.map(linhaEv).join("")}</div></div>`)
    .join("");
  const vista = `<div class="segmentado" role="tablist">
      <button class="${ui.cronoVista === "lista" ? "ativo" : ""}" data-acao="crono-vista" data-id="lista">Lista</button>
      <button class="${ui.cronoVista === "calendario" ? "ativo" : ""}" data-acao="crono-vista" data-id="calendario">Calendário</button>
    </div>`;
  return `<div class="linha-titulo"><div><h1>Cronograma do PS</h1>
    <p class="sub" style="margin:0">Desafios, treinamentos síncronos e avisos. Mudanças vão para o Discord dos aspirantes.</p></div>${vista}</div>
    <div class="acoes" style="margin:18px 0 22px">
      <button class="botao primario" data-acao="abrir-plano">Montar a partir do planejamento</button>
      <button class="botao" data-acao="novo-evento">+ Novo item</button>
      <button class="botao" data-acao="publicar-cronograma" ${ui.enviando ? "disabled" : ""}>Publicar no Discord</button>
      <button class="botao" data-acao="enviar-lembretes" ${ui.enviando ? "disabled" : ""}>Lembrar hoje e amanhã</button>
      <button class="botao" data-acao="sincronizar-google" ${ui.google.sincronizando ? "disabled" : ""}>${ui.google.sincronizando ? "Atualizando planilha…" : "Atualizar planilha"}</button>
      ${ui.google.planilha ? `<a class="botao" href="${esc(ui.google.planilha)}" target="_blank" rel="noopener">Abrir planilha</a>` : ""}
    </div>
    ${ui.evEditando ? formEvento() : ""}
    ${ui.cronoVista === "calendario" ? calendarioHtml(true) : semanas || `<p class="vazio">Nenhum item no cronograma.</p>`}`;
}

function sugestoesHtml(ev) {
  const lista = sugestoesDoEvento(ev);
  return `<div class="sugestoes">
    <p class="nota" style="margin-top:0">Tasks que a equipe precisa fazer para este item. "Distribuir" abre a Nova task já preenchida.</p>
    ${lista
      .map((sg, i) => {
        const feitas = estado.tasks.filter((t) => t.eventoId === ev.id && t.tipoId === sg.tipoId);
        return `<div class="sugestao">
          <div><b>${esc(sg.titulo)}</b><br><small class="prazo">${esc(tipo(sg.tipoId)?.nome || "")} · até ${formatarCurto(sg.prazo)}</small></div>
          ${
            feitas.length
              ? `<span class="etiqueta em_andamento">Já distribuída (${feitas.map((t) => esc(primeiroNome(t.responsavelId))).join(", ")})</span>`
              : `<button class="botao pequeno primario" data-acao="distribuir-sugestao" data-id="${ev.id}" data-i="${i}">Distribuir</button>`
          }
        </div>`;
      })
      .join("")}
  </div>`;
}

// ---------- Calendário (gerente e membros) ----------
function telaCalendario() {
  return `<div class="linha-titulo"><div><h1>Calendário</h1>
    <p class="sub" style="margin:0">Cronograma do PS e os prazos das suas tasks.</p></div>
    <button class="botao" data-acao="aba" data-id="minhas">← Minhas tasks</button></div>
    <div style="height:20px"></div>${calendarioHtml(false)}`;
}

function calendarioHtml(gerente) {
  const eu = membro(ui.perfilId);
  const [ano, mes] = ui.calMes.split("-").map(Number);
  const semanas = gradeMes(ano, mes - 1);
  const dias = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const celula = (d) => {
    const itens = itensDoDia(estado, d.iso, { perfilId: eu.id, gerente });
    const mostrar = itens.slice(0, 3);
    const resto = itens.length - mostrar.length;
    return `<button class="cal-dia ${d.doMes ? "" : "fora"} ${d.iso === hoje ? "hoje" : ""} ${d.iso === ui.calDia ? "sel" : ""}" data-acao="cal-dia" data-id="${d.iso}">
      <span class="cal-num num">${Number(d.iso.slice(8))}</span>
      ${mostrar.map((i) => `<span class="cal-item ${i.cls}" title="${esc(i.texto)}">${i.rotuloHora ? `${i.rotuloHora} ` : ""}${esc(i.curto || i.texto)}</span>`).join("")}
      ${resto > 0 ? `<span class="cal-mais">+${resto}</span>` : ""}
    </button>`;
  };
  const grade = `<div class="cal">
    ${dias.map((d) => `<div class="cal-cab">${d}</div>`).join("")}
    ${semanas.map((s) => s.map(celula).join("")).join("")}
  </div>`;

  const itensSel = itensDoDia(estado, ui.calDia, { perfilId: eu.id, gerente });
  const detalhe = itensSel.length
    ? itensSel
        .map((i) => {
          if (i.task) {
            const t = i.task;
            return `<div class="alerta-item"><p><span class="cal-ponto task"></span><b>${esc(t.titulo)}</b><br><small>Prazo da task · ${esc(membro(t.responsavelId)?.nome || "sem responsável")} · ${ROTULO[statusDe(t)]}</small></p></div>`;
          }
          const ev = i.evento;
          return `<div class="alerta-item"><p><span class="cal-ponto ${i.cls}"></span><b>${esc(i.texto)}</b><br><small>${TIPOS_EVENTO[ev.tipo]} · ${esc(ev.area)}${i.rotuloHora ? ` · ${i.rotuloHora}` : ""}${ev.local ? ` · ${esc(ev.local)}` : ""}</small></p>${gerente ? `<button class="botao pequeno" data-acao="ir-evento" data-id="${ev.id}">Abrir no cronograma</button>` : ""}</div>`;
        })
        .join("")
    : `<p class="vazio">Nada neste dia.</p>`;

  return `<div class="grade grade-3-1">
      <div class="cartao">
        <div class="linha-titulo">
          <h2 style="text-transform:capitalize">${MESES[mes - 1]} ${ano}</h2>
          <div class="acoes">
            <button class="botao pequeno" data-acao="cal-mes" data-id="-1" aria-label="Mês anterior">‹</button>
            <button class="botao pequeno" data-acao="cal-mes" data-id="0">Hoje</button>
            <button class="botao pequeno" data-acao="cal-mes" data-id="1" aria-label="Próximo mês">›</button>
          </div>
        </div>
        ${grade}
        <div class="cal-legenda"><span><i class="cal-ponto desafio"></i>Lançamento de desafio</span><span><i class="cal-ponto entrega"></i>Entrega de desafio</span><span><i class="cal-ponto treinamento"></i>Treinamento síncrono</span><span><i class="cal-ponto aviso"></i>Aviso</span><span><i class="cal-ponto task"></i>${gerente ? "Prazo de task" : "Prazo seu"}</span></div>
      </div>
      <div class="cartao"><h2>${formatarCurto(ui.calDia)}</h2>${detalhe}</div>
    </div>`;
}

// ---------- Piloto automático ----------
const PREFIXO_PILOTO = "Piloto automático: ";
const UM_DIA = 24 * 60 * 60 * 1000;

function idadeAtribuicao(t) {
  if (t.atribuidaTs) return Date.now() - t.atribuidaTs;
  return Math.max(0, diferencaDias(t.atribuidaEm || hoje, hoje)) * UM_DIA;
}

// Regras que rodam sozinhas: ao abrir o site e a cada minuto com ele aberto.
function rodarPiloto() {
  const pl = estado.piloto;
  const acoes = [];
  if (pl.aceite24h) {
    for (const t of estado.tasks) {
      if (t.status !== "atribuida" || !t.responsavelId) continue;
      if (idadeAtribuicao(t) < UM_DIA || t.aceiteCobrado) continue;
      const antes = primeiroNome(t.responsavelId);
      // Só repassa se houver para quem: senão mantém com a pessoa e avisa (nunca deixa a task sem dono).
      const candidato = redistribuir(estado, { ...t, recusadoPor: [...(t.recusadoPor || []), t.responsavelId] }, hoje);
      if (!candidato) {
        t.aceiteCobrado = true;
        acoes.push(`"${t.titulo}" não foi aceita por ${antes} em 24h, mas não há outra pessoa elegível; continua com ${antes} e a equipe foi avisada.`);
        avisarEquipe({ tipo: "repasse", texto: `${antes}, a task "${t.titulo}" está esperando o seu aceite há mais de 24h.` });
        continue;
      }
      if (t.prazo < hoje) t.prazo = somarDias(hoje, 1);
      const novo = repassar(t, t.responsavelId, "não aceitou em 24h");
      acoes.push(`"${t.titulo}" não foi aceita por ${antes} em 24h; repassada para ${primeiroNome(novo)}${t.prazo === somarDias(hoje, 1) ? " com prazo para amanhã" : ""}.`);
    }
  }
  if (pl.atrasadas !== "desligado") {
    for (const t of estado.tasks) {
      if (t.status === "concluida" || !t.responsavelId || t.prazo >= hoje || t.atrasoTratado) continue;
      if (pl.atrasadas === "repassar") {
        const antes = primeiroNome(t.responsavelId);
        t.prazo = somarDias(hoje, 1);
        const novo = repassar(t, t.responsavelId, "atrasada");
        t.atrasoTratado = true;
        acoes.push(`"${t.titulo}" estava atrasada com ${antes}; ${novo ? `repassada para ${primeiroNome(novo)} com prazo para amanhã` : "ninguém elegível, ficou para a gerência"}.`);
      } else {
        t.atrasoTratado = true;
        acoes.push(`"${t.titulo}" está atrasada com ${primeiroNome(t.responsavelId)}; a equipe foi avisada.`);
        avisarEquipe({ tipo: "repasse", texto: `Atenção: "${t.titulo}" está atrasada (prazo ${formatarCurto(t.prazo)}, com ${primeiroNome(t.responsavelId)}).` });
      }
    }
  }
  for (const a of acoes) registrar(estado, PREFIXO_PILOTO + a);
  if (acoes.length) persistir();
  return acoes.length;
}

// Quando um item do cronograma muda de data, as tasks ligadas a ele acompanham.
function ajustarTasksDoEvento(ev) {
  if (!estado.piloto.seguirCronograma) return 0;
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
    const resp = t.responsavelId && membro(t.responsavelId);
    if (resp && resp.indisponivelAte && resp.indisponivelAte >= t.prazo) {
      const novo = repassar(t, resp.id, "indisponível na nova data");
      registrar(estado, `${PREFIXO_PILOTO}"${t.titulo}" mudou de ${formatarCurto(antes)} para ${formatarCurto(t.prazo)}; ${resp.nome.split(" ")[0]} está indisponível, ${novo ? `repassada para ${primeiroNome(novo)}` : "ficou para a gerência"}.`);
    } else {
      registrar(estado, `${PREFIXO_PILOTO}"${t.titulo}" acompanhou o cronograma: prazo de ${formatarCurto(antes)} para ${formatarCurto(t.prazo)}.`);
    }
  }
  return n;
}

function cancelarTasksDoEvento(ev) {
  if (!estado.piloto.seguirCronograma) return 0;
  const canceladas = estado.tasks.filter((t) => t.eventoId === ev.id && t.status !== "concluida");
  if (!canceladas.length) return 0;
  estado.tasks = estado.tasks.filter((t) => !canceladas.includes(t));
  registrar(estado, `${PREFIXO_PILOTO}${canceladas.length} task(s) de "${ev.titulo}" canceladas junto com o item.`);
  return canceladas.length;
}

// ---------- Google Sheets ----------
async function consultarGoogle() {
  try {
    const r = await fetch("/api/google");
    if (!r.ok) return;
    const d = await r.json();
    ui.google.configurado = !!d.configurado;
    ui.google.planilha = d.planilha || null;
    render();
  } catch (e) { /* sem função da Vercel (ex.: rodando localmente) */ }
}

async function sincronizarGoogle({ manual = false } = {}) {
  if (!manual && !estado.piloto.sincronizarGoogle) return;
  if (!manual && !ui.google.configurado) return;
  ui.google.sincronizando = true;
  if (manual) render();
  const eventos = eventosOrdenados().map((e) => ({ ...e, tipoRotulo: TIPOS_EVENTO[e.tipo] }));
  try {
    const r = await fetch("/api/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventos }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.erro || `HTTP ${r.status}`);
    estado.googleSinc = { em: new Date().toISOString(), erro: null };
    if (manual) toast(`Planilha atualizada (${d.itens} itens).`);
  } catch (e) {
    estado.googleSinc = { em: new Date().toISOString(), erro: e.message };
    if (manual) toast(d_naoConfig(e.message));
  }
  ui.google.sincronizando = false;
  persistir();
  render();
}
function d_naoConfig(msg) {
  return /não configurada/.test(msg) ? "A planilha do Google ainda não está configurada na Vercel (GOOGLE_SCRIPT_URL)." : `Não foi possível atualizar a planilha: ${msg}`;
}

function cartaoPiloto() {
  const pl = estado.piloto;
  const ultimas = estado.registro.filter((r) => r.texto.startsWith(PREFIXO_PILOTO)).slice(0, 4);
  const sinc = estado.googleSinc;
  const chk = (campo, txt, ligado) => `<label class="check piloto-regra"><input type="checkbox" data-campo="piloto" data-chave="${campo}" ${ligado ? "checked" : ""}> ${txt}</label>`;
  return `<div class="cartao">
    <div class="linha-titulo"><h2>Piloto automático</h2><span class="etiqueta em_andamento">ligado</span></div>
    ${chk("aceite24h", "Repassar se não aceitar em 24h", pl.aceite24h)}
    <div class="piloto-regra"><label for="piloto-atrasadas" style="margin:0;color:var(--tinta);font-size:14px">Task atrasada:</label>
      <select id="piloto-atrasadas" data-campo="piloto" data-chave="atrasadas" style="width:auto">
        <option value="avisar" ${pl.atrasadas === "avisar" ? "selected" : ""}>avisar a equipe</option>
        <option value="repassar" ${pl.atrasadas === "repassar" ? "selected" : ""}>repassar sozinho</option>
        <option value="desligado" ${pl.atrasadas === "desligado" ? "selected" : ""}>não fazer nada</option>
      </select></div>
    ${chk("seguirCronograma", "Tasks acompanham mudanças do cronograma", pl.seguirCronograma)}
    ${chk("sincronizarGoogle", `Atualizar a planilha dos aspirantes${ui.google.configurado ? "" : " (configure na Vercel)"}`, pl.sincronizarGoogle)}
    ${sinc ? `<p class="nota ${sinc.erro ? "erro" : ""}">Planilha: ${sinc.erro ? esc(sinc.erro) : `atualizada em ${new Date(sinc.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}</p>` : ""}
    <h3 class="prazo" style="margin-top:14px">O que ele fez</h3>
    ${ultimas.length ? ultimas.map((r) => `<p class="piloto-acao">${esc(r.texto.slice(PREFIXO_PILOTO.length))}</p>`).join("") : `<p class="vazio">Nada ainda.</p>`}
  </div>`;
}

// ---------- Gerente: montar o PS a partir do planejamento ----------
function telaPlano() {
  const pl = ui.plano;
  const cab = `<div class="linha-titulo"><div><h1>Montar o PS a partir do planejamento</h1>
    <p class="sub" style="margin:0">Cole como o PS vai ser estruturado. O repasse monta o cronograma, cria as tasks de cada item e distribui tudo pela equipe.</p></div>
    <button class="botao texto" data-acao="fechar-plano">Cancelar</button></div><div style="height:20px"></div>`;
  if (pl.passo !== "revisao") {
    const lendo = pl.passo === "lendo";
    return cab + `<div class="cartao">
      <label for="plano-texto">Planejamento do PS</label>
      <textarea id="plano-texto" data-campo="plano-texto" style="min-height:260px" placeholder="Ex.: Desafio de Dados: lançamento 23/11, entrega 27/11&#10;Treinamento síncrono de Dados em 24/11 às 19h, no canal #treinamentos&#10;…">${esc(pl.texto)}</textarea>
      <div class="acoes" style="margin-top:10px">
        <button class="botao pequeno" data-acao="plano-exemplo">Usar um exemplo</button>
        <label class="botao pequeno" style="margin:0">Abrir arquivo .txt<input type="file" id="plano-arquivo" accept=".txt,.md,text/plain" hidden></label>
      </div>
      <div class="campos" style="margin-top:16px">
        <div><label>Quantos aspirantes entregam cada desafio?</label><input type="number" min="1" max="500" data-campo="plano-n" value="${pl.nAspirantes}"></div>
      </div>
      <p class="nota">Esse número define quantas correções e dúvidas serão divididas por desafio.</p>
      <div class="acoes" style="margin-top:14px">
        <button class="botao primario" data-acao="gerar-plano" ${lendo ? "disabled" : ""}>${lendo ? "Lendo o planejamento…" : "Gerar plano"}</button>
      </div>
    </div>`;
  }

  const r = pl.resultado;
  const incluidos = r.eventos.filter((_, i) => pl.lido.incluir[i]);
  const res = resumoPlano(r, estado);
  const maxH = Math.max(1, ...res.porPessoa.map((x) => x.h));
  const origem =
    pl.lido.fonte === "ia"
      ? `<div class="origem ia">Lido pela IA. Confira as datas antes de confirmar.${pl.lido.observacoes.length ? ` Atenção: ${pl.lido.observacoes.map(esc).join(" ")}` : ""}</div>`
      : `<div class="origem">${esc(pl.lido.aviso || "Lido pelas regras locais.")} Confira as datas.</div>`;

  const opcoesMembros = (sel) =>
    membrosAtivos()
      .map((m) => `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(m.nome.split(" ")[0])} · ${esc(m.area)}</option>`)
      .join("");

  const blocos = pl.lido.eventos
    .map((ev, i) => {
      const incluir = pl.lido.incluir[i];
      const evPlano = incluir ? r.eventos.find((x) => x._origem === i) : null;
      const tarefas = evPlano ? r.tarefas.filter((t) => t.pedido.eventoId === evPlano.id) : [];
      return `<div class="plano-item ${incluir ? "" : "excluido"}">
        <div class="plano-cab">
          <label class="check"><input type="checkbox" data-campo="plano-incluir" data-i="${i}" ${incluir ? "checked" : ""}></label>
          <span class="num plano-data">${formatarCurto(ev.data)}${ev.hora ? ` · ${horaBR(ev.hora)}` : ""}</span>
          <span class="etiqueta ev-${ev.tipo}">${TIPOS_EVENTO[ev.tipo]}</span>
          <b>${esc(ev.titulo)}</b>
          ${ev.entrega ? `<span class="prazo">entrega ${formatarCurto(ev.entrega)}</span>` : ""}
        </div>
        ${tarefas
          .map(
            (t) => `<div class="plano-task">
            <div><span>${esc(t.pedido.titulo)}</span><br><small class="prazo">até ${formatarCurto(t.pedido.prazo)} · ${horas(t.pedido.quantidade * t.pedido.esforcoPorUnidadeH)}</small></div>
            <div class="plano-partes">${
              t.partes.length
                ? t.partes
                    .map(
                      (p, j) => `<span class="plano-parte"><select data-campo="plano-parte" data-t="${t.id}" data-p="${j}" aria-label="Responsável">${opcoesMembros(p.membroId)}</select>
                      <small class="num">${t.divisivel && t.pedido.quantidade > 1 ? `${p.unidades}/${t.pedido.quantidade} · ` : ""}${horas(p.esforcoH)}</small></span>`
                    )
                    .join("")
                : `<span class="etiqueta sem_responsavel">ninguém elegível</span>`
            }</div>
          </div>`
          )
          .join("")}
      </div>`;
    })
    .join("");

  return cab + `${origem}
  <div class="kpis">
    <div class="kpi"><b>${incluidos.length}</b><span>itens no cronograma</span></div>
    <div class="kpi"><b>${res.tasks}</b><span>tasks distribuídas</span></div>
    <div class="kpi"><b>${res.pessoas}</b><span>pessoas envolvidas</span></div>
    <div class="kpi"><b>${horas(res.totalH)}</b><span>de trabalho no total</span></div>
  </div>
  <div class="grade grade-3-1 bloco">
    <div class="cartao"><h2>O que cada um vai fazer</h2>${blocos || `<p class="vazio">Nenhum item encontrado. Volte e confira o texto.</p>`}</div>
    <div>
      <div class="cartao"><h2>Horas por pessoa no PS</h2>
        ${res.porPessoa
          .map(
            ({ membro: m, h }) => `<div class="carga"><div class="carga-nome">${esc(m.nome)}<small>${esc(m.area)}</small></div>
            <div class="barra"><i style="width:${(h / maxH) * 100}%"></i></div><div class="carga-valor">${horas(h)}</div></div>`
          )
          .join("")}
        <p class="nota">O repasse equilibra a carga semana a semana, respeitando as horas de cada um.</p>
      </div>
      <div class="cartao">
        <label class="check"><input type="checkbox" data-campo="plano-substituir" ${pl.substituir ? "checked" : ""}> Substituir o cronograma atual</label>
        <label class="check" style="margin-top:8px"><input type="checkbox" data-campo="plano-publicar" ${pl.publicar ? "checked" : ""}> Publicar o cronograma no Discord dos aspirantes</label>
        <div class="acoes" style="margin-top:14px">
          <button class="botao primario" data-acao="confirmar-plano" ${incluidos.length ? "" : "disabled"}>Confirmar e criar tudo</button>
          <button class="botao texto" data-acao="voltar-plano">Voltar ao texto</button>
        </div>
      </div>
    </div>
  </div>`;
}

function recalcularPlano() {
  const pl = ui.plano;
  const escolhidos = pl.lido.eventos.map((ev, i) => ({ ...ev, _origem: i })).filter((ev) => pl.lido.incluir[ev._origem]);
  pl.resultado = montarPlano(estado, escolhidos, { hoje, nAspirantes: pl.nAspirantes });
}

// ---------- Ações ----------
const acoes = {
  entrar(el) {
    ui.perfilId = el.dataset.id;
    ui.aba = null;
    gravarPerfil(ui.perfilId);
    render();
    window.scrollTo(0, 0);
  },
  sair() {
    ui.perfilId = null;
    ui.aba = null;
    ui.recusando = null;
    gravarPerfil(null);
    render();
  },
  restaurar() {
    if (!confirm("Apagar as alterações e voltar aos dados de demonstração?")) return;
    estado = restaurar();
    completarExplicacoes();
    ui.nova = novaVazia();
    ui.resumo = { texto: "", carregando: false, erro: "" };
    render();
    toast("Dados de demonstração restaurados.");
  },
  aba(el) {
    ui.aba = el.dataset.id;
    ui.recusando = null;
    if (ui.aba === "nova" && ui.nova.criadas) ui.nova = novaVazia();
    render();
    window.scrollTo(0, 0);
  },
  filtro(el) {
    ui.filtro = el.dataset.id;
    render();
  },

  // Nova task
  exemplo(el) {
    ui.nova.texto = EXEMPLOS[Number(el.dataset.i)];
    render();
  },
  async interpretar() {
    const texto = ui.nova.texto.trim();
    if (!texto) {
      toast("Escreva o que precisa ser feito.");
      return;
    }
    ui.nova.carregando = true;
    ui.nova.proposta = null;
    render();
    const pedido = await interpretar(texto, estado, hoje);
    ui.nova.carregando = false;
    ui.nova.pedido = pedido;
    ui.nova.passo = 2;
    render();
  },
  manual() {
    const base = interpretarLocal(ui.nova.texto || "Nova task", estado, hoje);
    ui.nova.pedido = { ...base, fonte: "manual" };
    ui.nova.proposta = null;
    ui.nova.passo = 2;
    render();
  },
  calcular() {
    const p = ui.nova.pedido;
    if (!p.titulo.trim()) return toast("Dê um título à task.");
    if (!p.prazo) return toast("Defina um prazo.");
    ui.nova.proposta = proporDistribuicao(estado, p, hoje);
    ui.nova.passo = 3;
    render();
  },
  confirmar() {
    const { pedido, proposta } = ui.nova;
    // junta partes que acabaram com a mesma pessoa após trocas manuais
    const porPessoa = new Map();
    for (const parte of proposta.partes) {
      const atual = porPessoa.get(parte.membroId) || { unidades: 0, esforcoH: 0 };
      atual.unidades += parte.unidades;
      atual.esforcoH += parte.esforcoH;
      porPessoa.set(parte.membroId, atual);
    }
    const grupoId = novoId("g");
    const dividida = proposta.divisivel && proposta.quantidade > 1 && porPessoa.size > 1;
    const criadas = [];
    for (const [membroId, v] of porPessoa) {
      const t = {
        id: novoId("t"),
        grupoId,
        titulo: dividida ? `${pedido.titulo} (${v.unidades} de ${proposta.quantidade})` : pedido.titulo,
        tipoId: pedido.tipoId,
        area: pedido.area,
        prazo: pedido.prazo,
        esforcoH: Math.round(v.esforcoH * 100) / 100,
        unidades: v.unidades,
        responsavelId: null,
        status: "atribuida",
        recusadoPor: [],
        historico: [],
        criadaEm: hoje,
        origem: ui.nova.texto,
        eventoId: pedido.eventoId || null,
      };
      estado.tasks.push(t);
      atribuirTask(t, membroId, `Atribuída a ${primeiroNome(membroId)} pelo repasse e confirmada pela gerência.`);
      criadas.push(t);
    }
    registrar(
      estado,
      `Nova task "${pedido.titulo}" distribuída: ${criadas.map((t) => `${primeiroNome(t.responsavelId)} (${horas(t.esforcoH)})`).join(", ")}.`
    );
    persistir();
    avisarEquipe({
      tipo: "task",
      titulo: pedido.titulo,
      prazo: formatarCurto(pedido.prazo),
      partes: criadas.map((t) => `${primeiroNome(t.responsavelId)}: ${dividida ? `${t.unidades} de ${proposta.quantidade} · ` : ""}${horas(t.esforcoH)}`),
    });
    ui.nova.criadas = { lista: criadas, pedido: { ...pedido } };
    render();
    window.scrollTo(0, 0);
  },
  async "copiar-aviso"() {
    const txt = document.getElementById("aviso").value;
    try {
      await navigator.clipboard.writeText(txt);
      toast("Mensagem copiada.");
    } catch (e) {
      document.getElementById("aviso").select();
      toast("Selecione e copie com Ctrl+C.");
    }
  },
  "outra-task"() {
    ui.nova = novaVazia();
    render();
  },

  // Gerente
  "repassar-gerente"(el) {
    const t = estado.tasks.find((x) => x.id === el.dataset.id);
    const novo = repassar(t, t.responsavelId, t.responsavelId ? "atrasada, repassada pela gerência" : "");
    persistir();
    render();
    toast(novo ? `Repassada para ${primeiroNome(novo)}.` : "Ninguém elegível. Ajuste a equipe ou o prazo.");
  },
  async resumo() {
    ui.resumo = { texto: ui.resumo.texto, carregando: true, erro: "" };
    render();
    const contexto = {
      hoje,
      membros: membrosAtivos().map((m) => ({
        nome: m.nome,
        area: m.area,
        capacidadeSemanalH: m.capacidadeSemanal,
        cargaAbertaH: cargaAtual(m.id),
        ausenteAte: m.indisponivelAte,
      })),
      tasksAbertas: estado.tasks
        .filter((t) => t.status !== "concluida")
        .map((t) => ({
          titulo: t.titulo,
          responsavel: membro(t.responsavelId)?.nome || null,
          prazo: t.prazo,
          status: ROTULO[statusDe(t)],
          horas: t.esforcoH,
        })),
    };
    try {
      const texto = await resumirComIA(contexto);
      ui.resumo = { texto, carregando: false, erro: "" };
    } catch (e) {
      ui.resumo = {
        texto: ui.resumo.texto,
        carregando: false,
        erro: `A IA não respondeu: ${e.message}`,
      };
    }
    render();
  },
  "add-membro"() {
    const nome = document.getElementById("novo-nome").value.trim();
    if (!nome) return toast("Informe o nome.");
    const m = {
      id: novoId("m"),
      nome,
      papel: "membro",
      area: document.getElementById("novo-area").value,
      capacidadeSemanal: Number(document.getElementById("novo-cap").value) || 6,
      indisponivelAte: null,
      ativo: true,
    };
    estado.membros.push(m);
    registrar(estado, `${nome} entrou na equipe do PS (${m.area}).`);
    persistir();
    render();
    toast(`${nome} adicionado.`);
  },
  "add-tipo"() {
    const nome = document.getElementById("tipo-nome").value.trim();
    if (!nome) return toast("Informe o nome do tipo.");
    estado.tipos.splice(estado.tipos.length - 1, 0, {
      id: novoId("tp"),
      chave: "personalizado",
      nome,
      esforcoPadraoH: Number(document.getElementById("tipo-h").value) || 1,
      divisivel: false,
      areaObrigatoria: false,
    });
    persistir();
    render();
  },


  // Cronograma
  "novo-evento"() {
    ui.evEditando = "novo";
    render();
    document.getElementById("ev-titulo")?.focus();
  },
  "editar-evento"(el) {
    ui.evEditando = el.dataset.id;
    render();
    document.getElementById("form-evento")?.scrollIntoView({ behavior: "smooth" });
  },
  "fechar-evento"() {
    ui.evEditando = null;
    render();
  },
  async "salvar-evento"() {
    const v = (id) => document.getElementById(id).value.trim();
    const dados = {
      tipo: v("ev-tipo"),
      titulo: v("ev-titulo"),
      area: v("ev-area"),
      data: v("ev-data"),
      hora: v("ev-hora") || null,
      entrega: v("ev-tipo") === "desafio" ? v("ev-entrega") || null : null,
      local: v("ev-local"),
      descricao: v("ev-descricao"),
    };
    const avisar = document.getElementById("ev-avisar").checked;
    if (!dados.titulo) return toast("Dê um título.");
    if (!dados.data) return toast("Defina a data.");
    if (dados.entrega && dados.entrega < dados.data) return toast("A entrega não pode ser antes do lançamento.");
    let corpo = null;
    let msg = "";
    if (ui.evEditando === "novo") {
      const ev = { id: novoId("e"), ...dados };
      estado.eventos.push(ev);
      registrar(estado, `Cronograma: "${ev.titulo}" adicionado (${resumoDatas(ev)}).`);
      corpo = { tipo: "novo", evento: eventoParaDiscord(ev) };
      msg = `aspirantes avisados sobre "${ev.titulo}".`;
      ui.evSugestoes = ev.id;
    } else {
      const ev = estado.eventos.find((e) => e.id === ui.evEditando);
      const antes = resumoDatas(ev);
      Object.assign(ev, dados);
      const depois = resumoDatas(ev);
      registrar(estado, `Cronograma: "${ev.titulo}" atualizado${antes !== depois ? ` (${antes} → ${depois})` : ""}.`);
      ajustarTasksDoEvento(ev);
      if (antes !== depois) {
        corpo = { tipo: "mudanca", evento: eventoParaDiscord(ev), antes, depois };
        msg = `aspirantes avisados da mudança em "${ev.titulo}".`;
      }
    }
    ui.evEditando = null;
    persistir();
    render();
    sincronizarGoogle();
    if (avisar && corpo) await publicarAspirantes(corpo, msg);
    else toast("Cronograma salvo.");
  },
  async "excluir-evento"(el) {
    const ev = estado.eventos.find((e) => e.id === el.dataset.id);
    const avisar = confirm(`Cancelar "${ev.titulo}"?\n\nOK cancela e avisa os aspirantes no Discord.`);
    if (!avisar) return;
    estado.eventos = estado.eventos.filter((e) => e.id !== ev.id);
    registrar(estado, `Cronograma: "${ev.titulo}" cancelado.`);
    cancelarTasksDoEvento(ev);
    persistir();
    render();
    sincronizarGoogle();
    await publicarAspirantes({ tipo: "cancelado", evento: eventoParaDiscord(ev) }, `aspirantes avisados do cancelamento de "${ev.titulo}".`);
  },
  "sugestoes-evento"(el) {
    ui.evSugestoes = ui.evSugestoes === el.dataset.id ? null : el.dataset.id;
    render();
  },
  "distribuir-sugestao"(el) {
    const ev = estado.eventos.find((e) => e.id === el.dataset.id);
    const sg = sugestoesDoEvento(ev)[Number(el.dataset.i)];
    const t = tipo(sg.tipoId);
    ui.nova = novaVazia();
    ui.nova.texto = sg.titulo;
    ui.nova.pedido = {
      titulo: sg.titulo,
      tipoId: sg.tipoId,
      area: sg.area,
      prazo: sg.prazo,
      prazoInferido: false,
      quantidade: sg.quantidade,
      esforcoPorUnidadeH: t.esforcoPadraoH,
      maxPessoas: null,
      eventoId: ev.id,
      fonte: "cronograma",
    };
    ui.nova.passo = 2;
    ui.aba = "nova";
    render();
    window.scrollTo(0, 0);
  },
  "ir-evento"(el) {
    ui.aba = "cronograma";
    ui.cronoVista = "lista";
    ui.evSugestoes = el.dataset.id;
    render();
  },
  async "publicar-cronograma"() {
    const futuros = eventosOrdenados().filter((e) => (e.entrega || e.data) >= hoje);
    await publicarAspirantes(
      { tipo: "cronograma", titulo: "Cronograma do processo seletivo", eventos: futuros.map(eventoParaDiscord) },
      `cronograma publicado (${futuros.length} itens).`
    );
  },
  async "enviar-lembretes"() {
    await publicarAspirantes(
      { tipo: "lembrete", hoje: eventosDoDia(hoje), amanha: eventosDoDia(somarDias(hoje, 1)) },
      "lembretes de hoje e amanhã enviados."
    );
  },


  // Montar o PS a partir do planejamento
  "abrir-plano"() {
    ui.plano = { passo: "texto", texto: "", nAspirantes: 12, substituir: true, publicar: true, lido: null, resultado: null };
    ui.aba = "cronograma";
    render();
    window.scrollTo(0, 0);
  },
  "fechar-plano"() {
    ui.plano = null;
    render();
  },
  "plano-exemplo"() {
    ui.plano.texto = exemploPlanejamento(hoje);
    render();
  },
  "voltar-plano"() {
    ui.plano.passo = "texto";
    render();
  },
  async "gerar-plano"() {
    const pl = ui.plano;
    if (!pl.texto.trim()) return toast("Cole o planejamento ou use o exemplo.");
    pl.passo = "lendo";
    render();
    const lido = await lerPlanejamento(pl.texto, estado, hoje);
    if (!ui.plano) return;
    lido.incluir = lido.eventos.map(() => true);
    pl.lido = lido;
    recalcularPlano();
    pl.passo = "revisao";
    render();
    window.scrollTo(0, 0);
  },
  async "confirmar-plano"() {
    const pl = ui.plano;
    const r = pl.resultado;
    if (pl.substituir) estado.eventos = [];
    const novosEventos = r.eventos.map(({ _origem, ...ev }) => ev);
    estado.eventos.push(...novosEventos);
    let criadas = 0;
    for (const t of r.tarefas) {
      const porPessoa = new Map();
      for (const p of t.partes) {
        const v = porPessoa.get(p.membroId) || { unidades: 0, esforcoH: 0 };
        v.unidades += p.unidades;
        v.esforcoH += p.esforcoH;
        porPessoa.set(p.membroId, v);
      }
      const dividida = t.divisivel && t.pedido.quantidade > 1 && porPessoa.size > 1;
      const grupoId = novoId("g");
      for (const [membroId, v] of porPessoa) {
        const task = {
          id: novoId("t"),
          grupoId,
          titulo: dividida ? `${t.pedido.titulo} (${v.unidades} de ${t.pedido.quantidade})` : t.pedido.titulo,
          tipoId: t.pedido.tipoId,
          area: t.pedido.area,
          prazo: t.pedido.prazo,
          esforcoH: Math.round(v.esforcoH * 100) / 100,
          unidades: v.unidades,
          responsavelId: null,
          status: "atribuida",
          recusadoPor: [],
          historico: [],
          criadaEm: hoje,
          origem: "planejamento",
          eventoId: t.pedido.eventoId,
        };
        estado.tasks.push(task);
        atribuirTask(task, membroId, `Atribuída a ${primeiroNome(membroId)} ao montar o PS a partir do planejamento.`);
        criadas++;
      }
    }
    registrar(estado, `PS montado a partir do planejamento: ${novosEventos.length} itens no cronograma e ${criadas} tasks distribuídas.`);
    persistir();
    avisarEquipe({ tipo: "repasse", texto: `O PS foi montado: ${novosEventos.length} itens no cronograma e ${criadas} tasks distribuídas. Cada um já pode ver as suas no repasse.` });
    const primeiro = novosEventos.map((e) => e.data).sort()[0] || hoje;
    const publicar = pl.publicar;
    ui.plano = null;
    ui.aba = "cronograma";
    ui.cronoVista = "calendario";
    ui.calMes = primeiro.slice(0, 7);
    ui.calDia = primeiro;
    render();
    window.scrollTo(0, 0);
    toast(`Pronto: ${novosEventos.length} itens e ${criadas} tasks criadas.`);
    sincronizarGoogle();
    if (publicar) {
      const futuros = eventosOrdenados().filter((e) => (e.entrega || e.data) >= hoje);
      await publicarAspirantes({ tipo: "cronograma", titulo: "Cronograma do processo seletivo", eventos: futuros.map(eventoParaDiscord) }, `cronograma publicado (${futuros.length} itens).`);
    }
  },
  "sincronizar-google"() {
    sincronizarGoogle({ manual: true });
  },
  "crono-vista"(el) {
    ui.cronoVista = el.dataset.id;
    render();
  },
  "abrir-ausencia"() {
    ui.ausenciaAberta = !ui.ausenciaAberta;
    render();
  },
  "fechar-ausencia"() {
    ui.ausenciaAberta = false;
    render();
  },
  // Calendário
  "cal-mes"(el) {
    const n = Number(el.dataset.id);
    if (n === 0) {
      ui.calMes = hoje.slice(0, 7);
      ui.calDia = hoje;
    } else {
      const [a, m] = ui.calMes.split("-").map(Number);
      const d = new Date(a, m - 1 + n, 1);
      ui.calMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    render();
  },
  "cal-dia"(el) {
    ui.calDia = el.dataset.id;
    render();
  },

  // Membro
  aceitar(el) {
    const t = estado.tasks.find((x) => x.id === el.dataset.id);
    t.status = "em_andamento";
    t.historico.push({ em: new Date().toISOString(), texto: `${primeiroNome(t.responsavelId)} aceitou.` });
    registrar(estado, `${primeiroNome(t.responsavelId)} aceitou "${t.titulo}".`);
    persistir();
    render();
  },
  concluir(el) {
    const t = estado.tasks.find((x) => x.id === el.dataset.id);
    t.status = "concluida";
    t.concluidaEm = hoje;
    registrar(estado, `${primeiroNome(t.responsavelId)} concluiu "${t.titulo}".`);
    persistir();
    render();
    toast("Boa! Task concluída.");
  },
  recusar(el) {
    ui.recusando = el.dataset.id;
    render();
    const campo = document.getElementById("motivo");
    if (campo) campo.focus();
  },
  "cancelar-recusa"() {
    ui.recusando = null;
    render();
  },
  "confirmar-recusa"(el) {
    const t = estado.tasks.find((x) => x.id === el.dataset.id);
    const motivo = (document.getElementById("motivo")?.value || "").trim();
    const novo = repassar(t, ui.perfilId, motivo);
    ui.recusando = null;
    persistir();
    render();
    toast(novo ? `Sem problema: repassada para ${primeiroNome(novo)}.` : "Repassada para a gerência decidir.");
  },
  "salvar-disp"() {
    const eu = membro(ui.perfilId);
    eu.capacidadeSemanal = Math.max(1, Number(document.getElementById("minha-cap").value) || eu.capacidadeSemanal);
    const aus = document.getElementById("minha-ausencia").value || null;
    eu.indisponivelAte = aus;
    if (aus) {
      registrar(estado, `${eu.nome.split(" ")[0]} avisou ausência até ${formatarCurto(aus)}.`);
      ui.conflitosAusencia = estado.tasks
        .filter((t) => t.responsavelId === eu.id && t.status !== "concluida" && t.prazo <= aus)
        .map((t) => t.id);
    } else {
      ui.conflitosAusencia = [];
    }
    persistir();
    render();
    toast("Disponibilidade salva.");
  },
  "limpar-ausencia"() {
    const eu = membro(ui.perfilId);
    eu.indisponivelAte = null;
    ui.conflitosAusencia = [];
    persistir();
    render();
  },
  "repassar-conflitos"() {
    const nomes = [];
    for (const id of ui.conflitosAusencia) {
      const t = estado.tasks.find((x) => x.id === id);
      if (!t || t.responsavelId !== ui.perfilId) continue;
      const novo = repassar(t, ui.perfilId, "ausência");
      nomes.push(novo ? primeiroNome(novo) : "gerência");
    }
    ui.conflitosAusencia = [];
    persistir();
    render();
    toast(`Repassadas: ${nomes.join(", ")}.`);
  },
};

// Campos editáveis
const campos = {
  piloto(el) {
    const k = el.dataset.chave;
    estado.piloto[k] = el.type === "checkbox" ? el.checked : el.value;
    registrar(estado, `Gerência ${el.type === "checkbox" ? (el.checked ? "ligou" : "desligou") : "ajustou"} a regra do piloto automático: ${k}.`);
    persistir();
    if (el.checked || el.type !== "checkbox") {
      const n = rodarPiloto();
      if (n) toast(`Piloto automático: ${n} ação(ões) agora.`);
    }
    return true;
  },
  "plano-n"(el) {
    ui.plano.nAspirantes = Math.max(1, Math.min(500, Number(el.value) || 12));
    return false;
  },
  "plano-incluir"(el) {
    ui.plano.lido.incluir[Number(el.dataset.i)] = el.checked;
    recalcularPlano();
    return true;
  },
  "plano-parte"(el) {
    const t = ui.plano.resultado.tarefas.find((x) => x.id === el.dataset.t);
    t.partes[Number(el.dataset.p)].membroId = el.value;
    return true;
  },
  "plano-substituir"(el) {
    ui.plano.substituir = el.checked;
    return false;
  },
  "plano-publicar"(el) {
    ui.plano.publicar = el.checked;
    return false;
  },
  "ev-tipo"(el) {
    const desafio = el.value === "desafio";
    document.getElementById("ev-entrega-campo").style.display = desafio ? "" : "none";
    document.getElementById("ev-data-rotulo").textContent = desafio ? "Lançamento" : "Data";
    return false;
  },
  "texto-pedido"(el) {
    ui.nova.texto = el.value;
  },
  pedido(el) {
    const k = el.dataset.chave;
    let v = el.value;
    if (["quantidade", "esforcoPorUnidadeH", "maxPessoas"].includes(k)) v = v === "" ? null : Number(v);
    ui.nova.pedido[k] = v;
    if (k === "prazo") ui.nova.pedido.prazoInferido = false;
    if (k === "tipoId") {
      const t = tipo(v);
      ui.nova.pedido.esforcoPorUnidadeH = t.esforcoPadraoH;
    }
    ui.nova.proposta = null;
    ui.nova.passo = 2;
    return true;
  },
  "parte-membro"(el) {
    const i = Number(el.dataset.i);
    const pr = ui.nova.proposta;
    const parte = pr.partes[i];
    const m = membro(el.value);
    const r = pontuar(estado, m, { ...ui.nova.pedido, esforcoH: parte.esforcoH, recusadoPor: [] }, hoje);
    pr.partes[i] = { ...r, unidades: parte.unidades, esforcoH: parte.esforcoH, motivos: ["escolhida manualmente pela gerência", ...r.motivos] };
    return true;
  },
  responsavel(el) {
    const t = estado.tasks.find((x) => x.id === el.dataset.id);
    const novo = el.value || null;
    if (novo === t.responsavelId) return false;
    const antes = t.responsavelId;
    atribuirTask(t, novo, `Reatribuída pela gerência de ${antes ? primeiroNome(antes) : "ninguém"} para ${novo ? primeiroNome(novo) : "ninguém"}.`);
    registrar(estado, `Gerência reatribuiu "${t.titulo}" para ${novo ? primeiroNome(novo) : "ninguém"}.`);
    persistir();
    toast("Responsável alterado.");
    return true;
  },
  membro(el) {
    const m = membro(el.dataset.id);
    const k = el.dataset.chave;
    if (k === "ativo") m.ativo = el.checked;
    else if (k === "capacidadeSemanal") m.capacidadeSemanal = Math.max(1, Number(el.value) || m.capacidadeSemanal);
    else if (k === "indisponivelAte") m.indisponivelAte = el.value || null;
    else m[k] = el.value;
    persistir();
    return true;
  },
  tipo(el) {
    const t = tipo(el.dataset.id);
    const k = el.dataset.chave;
    if (k === "divisivel" || k === "areaObrigatoria") t[k] = el.checked;
    else if (k === "esforcoPadraoH") t[k] = Math.max(0.1, Number(el.value) || t[k]);
    else t[k] = el.value;
    persistir();
    return true;
  },
};

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-acao]");
  if (!el) return;
  const fn = acoes[el.dataset.acao];
  if (fn) {
    ev.preventDefault();
    fn(el);
  }
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.campo === "texto-pedido") campos["texto-pedido"](el);
  if (el.dataset && el.dataset.campo === "plano-texto" && ui.plano) ui.plano.texto = el.value;
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.id === "plano-arquivo" && el.files && el.files[0] && ui.plano) {
    el.files[0].text().then((txt) => {
      ui.plano.texto = txt.slice(0, 20000);
      render();
    });
    return;
  }
  const fn = el.dataset && campos[el.dataset.campo];
  if (fn && el.dataset.campo !== "texto-pedido" && el.dataset.campo !== "plano-texto") {
    const rerender = fn(el);
    if (rerender) render();
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && ev.target.id === "pedido") acoes.interpretar();
  if (ev.key === "Enter" && ev.target.id === "motivo") {
    const btn = document.querySelector('[data-acao="confirmar-recusa"]');
    if (btn) acoes["confirmar-recusa"](btn);
  }
});

const acoesIniciais = rodarPiloto();
render();
if (acoesIniciais && ui.perfilId && membro(ui.perfilId)?.papel === "gerente")
  setTimeout(() => toast(`Piloto automático: ${acoesIniciais} ação(ões) desde a última visita. Veja no painel.`), 400);
consultarGoogle();
setInterval(() => {
  const n = rodarPiloto();
  if (n) {
    render();
    toast(`Piloto automático: ${n} ação(ões).`);
  }
}, 60000);
