import assert from "node:assert/strict";
import { dadosDemonstracao } from "../js/dados.js";
import { gerarRelatorio, relatorioEmTexto } from "../js/relatorio.js";

const hoje = "2026-11-18";
const e = dadosDemonstracao(hoje);
let r = gerarRelatorio(e, hoje);
assert.equal(r.totais.tasks, e.tasks.length);
assert.equal(r.totais.concluidas, 2);
assert.equal(r.totais.noPrazoPct, 100);
assert.equal(r.totais.horas, Math.round(e.tasks.reduce((s, t) => s + t.esforcoH, 0) * 10) / 10);
assert.ok(r.licoes.some((l) => /não receberam nenhuma task/.test(l)));
assert.ok(!/\d\.\d/.test(relatorioEmTexto(r)), "número decimal com ponto em vez de vírgula");

// Repasse, atraso e sobrecarga aparecem nos números e nas lições.
const t0 = e.tasks[0];
t0.recusadoPor = ["m_iara"];
e.registro.unshift({ em: "x", texto: `Piloto automático: "${t0.titulo}" não foi aceita por Iara em 24h; repassada para Ana.` });
e.tasks.push({ id: "x1", titulo: "Corrigir tudo", tipoId: "tp_corrigir", area: "Produto", prazo: "2026-11-19", esforcoH: 20, responsavelId: "m_joao", status: "atribuida", recusadoPor: [], historico: [], atribuidaEm: hoje });
r = gerarRelatorio(e, hoje);
assert.equal(r.totais.tasksRepassadas, 1);
assert.equal(r.totais.repassesPiloto, 1);
const joao = r.pessoas.find((p) => p.id === "m_joao");
assert.equal(joao.semanasAcima, 1);
assert.equal(r.pessoas[0].id, "m_joao"); // ordenado por horas
assert.ok(r.licoes.some((l) => /Produto tem uma pessoa só/.test(l)));
assert.ok(r.licoes.some((l) => /João passou da capacidade/.test(l)));
assert.ok(r.licoes.some((l) => /piloto automático repassou 1 task sozinho/.test(l)));
// Iara fica sem nenhuma task depois de repassar: aparece como "repassou tudo", não como "não recebeu".
for (const t of e.tasks) if (t.responsavelId === "m_iara") t.responsavelId = "m_ana";
r = gerarRelatorio(e, hoje);
assert.ok(r.licoes.some((l) => /Iara repassou tudo o que recebeu/.test(l)), r.licoes.join(" | "));
assert.ok(!r.licoes.some((l) => /Iara[^:]*não receb/.test(l)));
const txt = relatorioEmTexto(r);
assert.ok(txt.includes("Horas de trabalho:") && /\d,\dh|\dh/.test(txt));
assert.ok(txt.includes("Para o próximo PS:"));

// PS vazio não quebra.
const vazio = { ...dadosDemonstracao(hoje), tasks: [], registro: [] };
r = gerarRelatorio(vazio, hoje);
assert.equal(r.periodo, null);
assert.equal(r.totais.noPrazoPct, null);
relatorioEmTexto(r);
console.log("relatório: ok");
