// Função serverless da Vercel que publica no Discord por webhook.
// Variáveis de ambiente (configuradas na Vercel):
//   DISCORD_WEBHOOK_ASPIRANTES  webhook do canal dos aspirantes (cronograma, mudanças, lembretes)
//   DISCORD_WEBHOOK_EQUIPE      opcional: webhook do canal da equipe do PS (novas tasks, repasses)
//   DISCORD_PIN                 opcional: código que a gerência digita para poder publicar

const CORES = { normal: 0x0e5a47, mudanca: 0xa86a12, cancelado: 0xb0302a, equipe: 0x2b5c8a };

// Ninguém é marcado (@everyone, @here, cargos) a partir de texto vindo do site.
function limpo(s, max = 200) {
  return String(s == null ? "" : s)
    .replace(/@/g, "@​")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function linhaEvento(e) {
  const partes = [`**${limpo(e.quando, 60)}** · ${limpo(e.titulo, 120)}`];
  if (e.entrega) partes.push(`entrega até ${limpo(e.entrega, 40)}`);
  if (e.local) partes.push(limpo(e.local, 120));
  return partes.join(" — ");
}

function lista(eventos, max = 25) {
  return (Array.isArray(eventos) ? eventos : []).slice(0, max).map(linhaEvento).join("\n") || "Nada previsto.";
}

function montar(corpo) {
  const rodape = { text: "repasse · processo seletivo" };
  switch (corpo.tipo) {
    case "cronograma":
      return {
        canal: "aspirantes",
        embeds: [
          {
            title: limpo(corpo.titulo || "Cronograma do processo seletivo", 120),
            description: lista(corpo.eventos).slice(0, 4000),
            color: CORES.normal,
            footer: rodape,
          },
        ],
      };
    case "novo":
      return {
        canal: "aspirantes",
        embeds: [
          {
            title: `Novo no cronograma: ${limpo(corpo.evento && corpo.evento.titulo, 200)}`,
            description: [linhaEvento(corpo.evento || {}), limpo(corpo.evento && corpo.evento.descricao, 500)].filter(Boolean).join("\n\n"),
            color: CORES.normal,
            footer: rodape,
          },
        ],
      };
    case "mudanca":
      return {
        canal: "aspirantes",
        embeds: [
          {
            title: `Mudança no cronograma: ${limpo(corpo.evento && corpo.evento.titulo, 200)}`,
            description: `**Antes:** ${limpo(corpo.antes, 200)}\n**Agora:** ${limpo(corpo.depois, 200)}`,
            color: CORES.mudanca,
            footer: rodape,
          },
        ],
      };
    case "cancelado":
      return {
        canal: "aspirantes",
        embeds: [
          {
            title: `Cancelado: ${limpo(corpo.evento && corpo.evento.titulo, 200)}`,
            description: `Estava previsto para ${limpo(corpo.evento && corpo.evento.quando, 80)}. Fique de olho neste canal para novidades.`,
            color: CORES.cancelado,
            footer: rodape,
          },
        ],
      };
    case "lembrete":
      return {
        canal: "aspirantes",
        embeds: [
          {
            title: "Lembretes do processo seletivo",
            fields: [
              { name: "Hoje", value: lista(corpo.hoje, 10).slice(0, 1000) },
              { name: "Amanhã", value: lista(corpo.amanha, 10).slice(0, 1000) },
            ],
            color: CORES.normal,
            footer: rodape,
          },
        ],
      };
    case "task":
      return {
        canal: "equipe",
        embeds: [
          {
            title: `Nova task: ${limpo(corpo.titulo, 200)}`,
            description: [
              `Prazo: **${limpo(corpo.prazo, 60)}**`,
              ...(Array.isArray(corpo.partes) ? corpo.partes.slice(0, 20).map((p) => `• ${limpo(p, 120)}`) : []),
              "Aceite ou repasse no repasse.",
            ].join("\n"),
            color: CORES.equipe,
            footer: rodape,
          },
        ],
      };
    case "resumo-equipe":
      return {
        canal: "equipe",
        embeds: [
          {
            title: limpo(corpo.titulo || "Bom dia, equipe do PS", 120),
            fields: (Array.isArray(corpo.secoes) ? corpo.secoes : []).slice(0, 5).map((sec) => ({
              name: limpo(sec.nome, 100),
              value: (Array.isArray(sec.itens) && sec.itens.length ? sec.itens.slice(0, 15).map((i) => `• ${limpo(i, 150)}`).join("\n") : "Nada.").slice(0, 1000),
            })),
            color: CORES.equipe,
            footer: rodape,
          },
        ],
      };
    case "repasse":
      return {
        canal: "equipe",
        content: limpo(corpo.texto, 500),
      };
    default:
      return null;
  }
}

function webhookDe(canal) {
  return canal === "equipe" ? process.env.DISCORD_WEBHOOK_EQUIPE : process.env.DISCORD_WEBHOOK_ASPIRANTES;
}

// Monta e publica uma mensagem. Devolve { ok, status, erro, naoConfigurado, canal }.
async function postar(corpo) {
  const mensagem = montar(corpo);
  if (!mensagem) return { ok: false, status: 400, erro: "Tipo de mensagem desconhecido" };
  const url = webhookDe(mensagem.canal);
  if (!url) return { ok: false, status: 503, naoConfigurado: true, erro: `Webhook do canal "${mensagem.canal}" não configurado na Vercel` };
  try {
    const resp = await fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "repasse · PS", content: mensagem.content, embeds: mensagem.embeds, allowed_mentions: { parse: [] } }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, status: 502, erro: `Discord respondeu ${resp.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, status: 200, canal: mensagem.canal };
  } catch (e) {
    return { ok: false, status: 500, erro: e.message };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({
      aspirantes: !!process.env.DISCORD_WEBHOOK_ASPIRANTES,
      equipe: !!process.env.DISCORD_WEBHOOK_EQUIPE,
      pinExigido: !!process.env.DISCORD_PIN,
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Use POST" });
    return;
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try {
      corpo = JSON.parse(corpo);
    } catch (e) {
      res.status(400).json({ erro: "JSON inválido" });
      return;
    }
  }
  corpo = corpo || {};
  if (process.env.DISCORD_PIN && corpo.pin !== process.env.DISCORD_PIN) {
    res.status(401).json({ erro: "Código da gerência inválido" });
    return;
  }
  const r = await postar(corpo);
  if (r.ok) res.status(200).json({ ok: true, canal: r.canal });
  else res.status(r.status).json({ erro: r.erro, naoConfigurado: !!r.naoConfigurado });
};

module.exports.montar = montar;
module.exports.postar = postar;
