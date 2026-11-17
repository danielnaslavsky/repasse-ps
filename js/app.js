// Interface do repasse: telas do gerente e do membro.

import { carregar, salvar, restaurar, registrar, novoId } from "./dados.js";
import { hojeISO, formatarCurto, prazoRelativo, diferencaDias, somarDias } from "./datas.js";
import { proporDistribuicao, redistribuir, pontuar, cargaAberta, explicar } from "./motor.js";
import { interpretar, interpretarLocal, resumirComIA } from "./interpretador.js";

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
      ? { painel: telaPainel, nova: telaNova, equipe: telaEquipe, tipos: telaTipos, registro: telaRegistro }[ui.aba]()
      : { minhas: telaMinhas, disponibilidade: telaDisponibilidade }[ui.aba]();
  raiz.innerHTML = topo(p) + `<main>${conteudo}</main>`;
}

function topo(p) {
  const abas =
    p.papel === "gerente"
      ? [
          ["painel", "Painel", contarAtencao()],
          ["nova", "Nova task"],
          ["equipe", "Equipe"],
          ["tipos", "Tipos de task"],
          ["registro", "Histórico"],
        ]
      : [
          ["minhas", "Minhas tasks", estado.tasks.filter((t) => t.responsavelId === p.id && t.status === "atribuida").length],
          ["disponibilidade", "Minha disponibilidade"],
        ];
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
      <h1>Quem faz o quê no PS, sem planilha e sem cobrança no grupo.</h1>
      <p class="sub">A gerência escreve o que precisa ser feito. O repasse decide quem faz, considerando área, carga e prazos, explica a escolha e repassa sozinho quando alguém não pode.</p>
    </section>
    <div class="como">
      <div><b>01 · pede</b>"Chegaram 14 entregas de Marketing, corrigir até sexta." Uma frase, sem formulário.</div>
      <div><b>02 · distribui</b>O sistema divide entre quem é da área e tem folga, e mostra o motivo de cada escolha.</div>
      <div><b>03 · repassa</b>Quem não pode aperta um botão. A task vai para a próxima pessoa, sem a gerência intervir.</div>
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
    const c = cargaAberta(estado, m.id);
    if (c > m.capacidadeSemanal) itens.push({ m, c, tipo: "sobrecarga" });
  }
  return itens;
}
function contarAtencao() {
  return itensAtencao().length;
}

function telaPainel() {
  const abertas = estado.tasks.filter((t) => t.status !== "concluida");
  const aguardando = abertas.filter((t) => t.status === "atribuida").length;
  const atrasadas = abertas.filter((t) => statusDe(t) === "atrasada").length;
  const concl = estado.tasks.filter((t) => t.status === "concluida" && t.concluidaEm >= somarDias(hoje, -7)).length;
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
    .map((m) => ({ m, c: cargaAberta(estado, m.id) }))
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
  const resumoHtml = `<div class="cartao">
    <div class="linha-titulo"><h2>Resumo do dia</h2>
    <button class="botao pequeno" data-acao="resumo" ${resumo.carregando ? "disabled" : ""}>${resumo.carregando ? "Gerando…" : resumo.texto ? "Atualizar" : "Gerar com IA"}</button></div>
    ${resumo.texto ? `<p class="resumo-ia">${esc(resumo.texto)}</p>` : `<p class="vazio">A IA lê as tasks e a carga da equipe e diz o que está em risco e o que fazer hoje.</p>`}
    ${resumo.erro ? `<p class="nota erro">${esc(resumo.erro)}</p>` : ""}
  </div>`;

  return `
  <div class="linha-titulo"><div><h1>Painel do PS</h1><p class="sub" style="margin:0">${formatarCurto(hoje)} · ${membrosAtivos().length} membros ativos</p></div>
  <button class="botao primario" data-acao="aba" data-id="nova">+ Nova task</button></div>
  <div style="height:20px"></div>
  <div class="kpis">
    <div class="kpi"><b>${abertas.length}</b><span>tasks abertas</span></div>
    <div class="kpi"><b>${aguardando}</b><span>aguardando aceite</span></div>
    <div class="kpi ${atrasadas ? "alerta" : ""}"><b>${atrasadas}</b><span>atrasadas</span></div>
    <div class="kpi"><b>${concl}</b><span>concluídas em 7 dias</span></div>
  </div>
  <div class="grade grade-3-1 bloco">
    <div>
      <div class="cartao"><h2>Precisa de atenção</h2>${atencaoHtml}</div>
      ${resumoHtml}
    </div>
    <div class="cartao"><h2>Carga da semana</h2>${carga}</div>
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
  "Conduzir 8 entrevistas da segunda fase até quinta, no máximo 3 pessoas",
  "Responder 20 dúvidas dos aspirantes no e-mail até amanhã",
  "Consolidar as notas de todos os desafios para a deliberação até 25/11",
];

function telaNova() {
  const n = ui.nova;
  const passos = ["Pedido", "Conferir", "Distribuição"];
  const cab = `<h1>Nova task</h1><p class="sub">Escreva como você mandaria no grupo. O repasse entende o pedido, calcula quem faz e espera sua confirmação.</p>
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
      const c = cargaAberta(estado, m.id);
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
  <p class="sub">A área, as horas disponíveis na semana e as ausências são o que o repasse usa para decidir. Alterações valem na hora.</p>
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
  </div>`;
}

function telaTipos() {
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
  return `<h1>Tipos de task</h1>
  <p class="sub">Cada PS tem as suas tasks. Aqui a gerência define quanto tempo cada uma costuma levar, se pode ser dividida entre várias pessoas e se exige alguém da área.</p>
  <div class="cartao bloco"><div class="tabela-rolagem"><table>
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

function telaRegistro() {
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return `<h1>Histórico</h1><p class="sub">Tudo o que o repasse decidiu ou que alguém fez, para ninguém precisar perguntar no grupo.</p>
  <div class="cartao">${estado.registro.map((r) => `<div class="registro-item"><time>${fmt(r.em)}</time><div>${esc(r.texto)}</div></div>`).join("")}</div>`;
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
  const c = cargaAberta(estado, eu.id);
  const sec = (titulo, lista, vazio) =>
    `<div class="bloco"><h2>${titulo} <span class="prazo num">${lista.length}</span></h2>${lista.length ? lista.map(cartaoTask).join("") : `<p class="vazio">${vazio}</p>`}</div>`;
  return `<h1>Olá, ${esc(eu.nome.split(" ")[0])}</h1>
  <p class="sub">Você está com ${horas(c)} de ${eu.capacidadeSemanal}h nesta semana. Se não puder fazer algo, aperte "Não consigo": o repasse passa para outra pessoa e avisa a gerência.</p>
  ${sec("Aguardando seu aceite", aguardando, "Nenhuma task nova.")}
  ${sec("Em andamento", andamento, "Nada em andamento.")}
  ${feitas.length ? sec("Concluídas", feitas, "") : ""}`;
}

function telaDisponibilidade() {
  const eu = membro(ui.perfilId);
  const conflitos = ui.conflitosAusencia
    .map((id) => estado.tasks.find((t) => t.id === id))
    .filter((t) => t && t.responsavelId === eu.id && t.status !== "concluida");
  return `<h1>Minha disponibilidade</h1>
  <p class="sub">Semana de prova, viagem, doença: avise aqui uma vez e o repasse para de te mandar tasks com prazo nesse período.</p>
  <div class="cartao">
    <div class="campos">
      <div><label>Horas que tenho nesta semana</label><input type="number" min="1" max="40" id="minha-cap" value="${eu.capacidadeSemanal}"></div>
      <div><label>Estou fora até (inclusive)</label><input type="date" id="minha-ausencia" min="${hoje}" value="${eu.indisponivelAte || ""}"></div>
    </div>
    <div class="acoes" style="margin-top:14px">
      <button class="botao primario" data-acao="salvar-disp">Salvar</button>
      ${eu.indisponivelAte ? `<button class="botao texto" data-acao="limpar-ausencia">Não vou mais me ausentar</button>` : ""}
    </div>
  </div>
  ${
    conflitos.length
      ? `<div class="cartao"><h2>Você tem ${conflitos.length} task${conflitos.length > 1 ? "s" : ""} com prazo durante a ausência</h2>
        ${conflitos.map((t) => `<div class="alerta-item"><p><b>${esc(t.titulo)}</b><br><small>${prazoRelativo(t.prazo, hoje)}</small></p></div>`).join("")}
        <div class="acoes" style="margin-top:12px"><button class="botao primario" data-acao="repassar-conflitos">Repassar estas tasks</button></div></div>`
      : ""
  }`;
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
        cargaAbertaH: cargaAberta(estado, m.id),
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
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  const fn = el.dataset && campos[el.dataset.campo];
  if (fn && el.dataset.campo !== "texto-pedido") {
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

render();
