// Rotina diária do servidor (Vercel Cron, 8h de Brasília). Roda mesmo com o site fechado:
//  1. piloto automático (repasses, atrasos) sobre o estado da equipe;
//  2. lembrete do dia para os aspirantes no Discord;
//  3. resumo do dia para a equipe no Discord;
//  4. planilha do Google atualizada.
// Também pode ser disparada pela gerência: /api/cron?codigo=PS_CODIGO_GERENTE

const A = require("./_armazem.js");
const { postar } = require("./discord.js");
const { enviarPlanilha } = require("./google.js");

const PREFIXO = "Rotina diária: ";

function hojeEmSaoPaulo() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // AAAA-MM-DD
}

function autorizado(req) {
  const segredo = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (segredo && auth === `Bearer ${segredo}`) return true;
  const codigo = (req.query && req.query.codigo) || req.headers["x-codigo"];
  return !!(process.env.PS_CODIGO_GERENTE && codigo === process.env.PS_CODIGO_GERENTE);
}

async function executar() {
  const R = await import("../js/regras.js");
  const D = await import("../js/datas.js");
  const hoje = hojeEmSaoPaulo();
  const amanha = D.somarDias(hoje, 1);

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { estado, versao } = await A.lerEstado();
    if (!estado) return { ok: true, nada: "a gerência ainda não iniciou o PS" };
    const pl = estado.piloto || {};
    const avisos = [];
    const resultado = { hoje, acoes: [], aspirantes: null, equipe: null, planilha: null };

    // 1. Piloto automático
    resultado.acoes = R.rodarPiloto({ estado, hoje, avisar: (c) => avisos.push(c) });

    // 2. Lembrete do dia para os aspirantes (uma vez por dia)
    const doDia = R.eventosDoDia(estado, hoje, { publico: true });
    const deAmanha = R.eventosDoDia(estado, amanha, { publico: true });
    const doDiaEquipe = R.eventosDoDia(estado, hoje);
    const lembrar = pl.lembreteDiario !== false && estado.ultimoLembrete !== hoje && (doDia.length || deAmanha.length);

    // 3. Resumo para a equipe
    const nome = (id) => {
      const m = estado.membros.find((x) => x.id === id);
      return m ? m.nome.split(" ")[0] : "sem responsável";
    };
    const abertas = estado.tasks.filter((t) => t.status !== "concluida");
    const resumo = {
      tipo: "resumo-equipe",
      titulo: `Bom dia, equipe do PS · ${D.formatarCurto(hoje)}`,
      secoes: [
        { nome: "Vencem hoje", itens: abertas.filter((t) => t.prazo === hoje).map((t) => `${t.titulo} (${nome(t.responsavelId)})`) },
        { nome: "Atrasadas", itens: abertas.filter((t) => t.prazo < hoje).map((t) => `${t.titulo} (${nome(t.responsavelId)})`) },
        { nome: "Esperando aceite", itens: abertas.filter((t) => t.status === "atribuida").map((t) => `${t.titulo} (${nome(t.responsavelId)})`) },
        { nome: "No cronograma hoje", itens: doDiaEquipe.map((e) => e.titulo) },
      ],
    };

    if (resultado.acoes.length || lembrar) {
      if (lembrar) estado.ultimoLembrete = hoje;
      estado.ultimaRotina = { em: new Date().toISOString(), acoes: resultado.acoes.length };
      for (const a of resultado.acoes) {
        // o rodarPiloto já registrou com o prefixo do piloto; deixa claro que veio do servidor
        const r = estado.registro.find((x) => x.texto.endsWith(a));
        if (r) r.texto = r.texto.replace(R.PREFIXO_PILOTO, `${R.PREFIXO_PILOTO}(servidor) `);
      }
    } else {
      estado.ultimaRotina = { em: new Date().toISOString(), acoes: 0 };
    }

    const gravou = await A.gravarEstado(estado, versao);
    if (!gravou.ok) continue; // alguém alterou ao mesmo tempo: relê e roda de novo

    // Só publica depois de gravar, para não avisar duas vezes.
    if (lembrar) resultado.aspirantes = await postar({ tipo: "lembrete", hoje: doDia, amanha: deAmanha });
    for (const c of avisos) await postar(c);
    resultado.equipe = await postar(resumo);
    if (pl.sincronizarGoogle !== false) {
      const eventos = R.eventosOrdenados(estado, { publico: true }).map((e) => ({ ...e, tipoRotulo: { desafio: "Desafio", treinamento: "Treinamento síncrono", etapa: "Etapa", aviso: "Aviso" }[e.tipo] }));
      resultado.planilha = await enviarPlanilha(eventos);
    }
    const resumir = (r) => (r == null ? "não enviado" : r.ok ? "ok" : r.naoConfigurado ? "não configurado" : `erro: ${r.erro}`);
    return {
      ok: true,
      hoje,
      acoes: resultado.acoes,
      aspirantes: lembrar ? resumir(resultado.aspirantes) : "nada para lembrar hoje",
      equipe: resumir(resultado.equipe),
      planilha: resumir(resultado.planilha),
    };
  }
  return { ok: false, erro: "Muitas alterações ao mesmo tempo; tente de novo." };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!autorizado(req)) {
    res.status(401).json({ erro: "Não autorizado" });
    return;
  }
  try {
    res.status(200).json(await executar());
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message, naoConfigurado: !!e.naoConfigurado });
  }
};

module.exports.executar = executar;
module.exports.PREFIXO = PREFIXO;
