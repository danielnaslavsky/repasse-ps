// Estado compartilhado da equipe do PS.
// GET  /api/estado            → { estado, versao, perfil }   (cabeçalho x-codigo)
// GET  /api/estado?versao=1   → { versao }                   (para saber se algo mudou)
// PUT  /api/estado            → { estado, versaoBase }       (grava se ninguém gravou antes; senão 409 com o atual)
// GET  /api/estado?diagnostico=1 → o que está configurado

const A = require("./_armazem.js");

const LIMITE_BYTES = 900 * 1024;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET" && req.query && req.query.diagnostico) {
      const info = { banco: A.config() ? "configurado" : "FALTANDO (conecte o Upstash na Vercel)", PS_CODIGO_GERENTE: process.env.PS_CODIGO_GERENTE ? "definido" : "FALTANDO" };
      if (A.config()) {
        try {
          info.versaoAtual = await A.lerVersao();
          info.conexao = "ok";
        } catch (e) {
          info.conexao = `erro: ${e.message}`;
        }
      }
      res.status(200).json(info);
      return;
    }

    if (!process.env.PS_CODIGO_GERENTE) {
      res.status(503).json({ erro: "Modo equipe não configurado (PS_CODIGO_GERENTE)", naoConfigurado: true });
      return;
    }
    const codigo = String(req.headers["x-codigo"] || "");

    if (req.method === "GET") {
      const { estado, versao } = await A.lerEstado();
      const perfil = A.identificar(codigo, estado);
      if (!perfil) {
        res.status(401).json({ erro: "Link de acesso inválido" });
        return;
      }
      if (req.query && req.query.versao) {
        res.status(200).json({ versao });
        return;
      }
      if (!estado && perfil.papel !== "gerente") {
        res.status(404).json({ erro: "A gerência ainda não iniciou o PS" });
        return;
      }
      res.status(200).json({ estado, versao, perfil });
      return;
    }

    if (req.method === "PUT") {
      let corpo = req.body;
      if (typeof corpo === "string") corpo = JSON.parse(corpo);
      const { estado, versaoBase } = corpo || {};
      if (!estado || !Array.isArray(estado.membros) || !Array.isArray(estado.tasks)) {
        res.status(400).json({ erro: "Estado inválido" });
        return;
      }
      if (JSON.stringify(estado).length > LIMITE_BYTES) {
        res.status(413).json({ erro: "Dados grandes demais" });
        return;
      }
      const atual = await A.lerEstado();
      // Quem grava precisa ter um código válido no estado atual (ou ser a gerência iniciando o PS).
      const perfil = A.identificar(codigo, atual.estado || estado);
      if (!perfil) {
        res.status(401).json({ erro: "Link de acesso inválido" });
        return;
      }
      const r = await A.gravarEstado(estado, Number(versaoBase) || 0);
      if (!r.ok) {
        const agora = await A.lerEstado();
        res.status(409).json({ erro: "Outra pessoa alterou antes", estado: agora.estado, versao: agora.versao });
        return;
      }
      res.status(200).json({ ok: true, versao: r.versao });
      return;
    }

    res.status(405).json({ erro: "Método não permitido" });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message, naoConfigurado: !!e.naoConfigurado });
  }
};
