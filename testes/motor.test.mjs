import assert from "node:assert/strict";
import { dadosDemonstracao } from "../js/dados.js";
import { proporDistribuicao, ranquear, redistribuir } from "../js/motor.js";
import { interpretarLocal, lerPrazo } from "../js/interpretador.js";

const hoje = "2026-11-17"; // terça
const e = dadosDemonstracao(hoje);

// prazos
assert.equal(lerPrazo("até sexta", hoje), "2026-11-20");
assert.equal(lerPrazo("pra amanhã", hoje), "2026-11-18");
assert.equal(lerPrazo("até 25/11", hoje), "2026-11-25");
assert.equal(lerPrazo("na terça", hoje), "2026-11-24");

// interpretação local
const p = interpretarLocal("Chegaram 14 entregas do desafio de Marketing, corrigir até sexta", e, hoje);
console.log(p);
assert.equal(p.area, "Marketing"); assert.equal(p.quantidade, 14); assert.equal(p.tipoId, "tp_corrigir"); assert.equal(p.prazo, "2026-11-20");

// distribuição divisível: só Marketing (área obrigatória)
const prop = proporDistribuicao(e, p, hoje);
console.log(prop.partes.map(x => [x.membroId, x.unidades, x.esforcoH, x.cargaDepois, x.capacidade, x.pontos]));
assert.equal(prop.partes.reduce((s,x)=>s+x.unidades,0), 14);
assert.ok(prop.partes.every(x => ["m_carla","m_gabi"].includes(x.membroId)));

// task única não divisível
const p2 = interpretarLocal("Consolidar notas dos desafios até quinta", e, hoje);
assert.equal(p2.tipoId, "tp_consolidar");
const prop2 = proporDistribuicao(e, p2, hoje);
console.log(p2.area, prop2.partes.map(x=>[x.membroId,x.motivos]), prop2.alternativas.map(a=>a.membroId));

const pt = interpretarLocal("Preparar o treinamento síncrono de Produto até amanhã", e, hoje);
assert.equal(pt.tipoId, "tp_preparar"); assert.equal(pt.area, "Produto"); assert.equal(pt.prazo, "2026-11-18");
// Felipe indisponível até amanhã: tarefa com prazo amanhã deve excluí-lo
const r = ranquear(e, { titulo:"x", tipoId:"tp_corrigir", area:"Desenvolvimento", prazo:"2026-11-18", esforcoH:1, recusadoPor:[] }, hoje);
assert.ok(r.inelegiveis.some(i => i.membroId==="m_felipe"));
console.log(r.inelegiveis);

// redistribuição exclui quem recusou
const task = e.tasks[1];
task.recusadoPor = ["m_iara"];
const novo = redistribuir(e, task, hoje);
console.log("redistribui para", novo && novo.membroId);
assert.equal(novo.membroId, "m_ana");

// maxPessoas
const prop3 = proporDistribuicao(e, { ...interpretarLocal("Responder 20 dúvidas dos aspirantes até amanhã", e, hoje), maxPessoas: 2 }, hoje);
assert.equal(interpretarLocal("Responder 20 dúvidas dos aspirantes até amanhã", e, hoje).tipoId, "tp_duvidas");
console.log(prop3.partes.map(x=>[x.membroId,x.unidades]));
assert.ok(prop3.partes.length <= 2);
console.log("OK");
import { lerMaxPessoas } from "../js/interpretador.js";
assert.equal(lerMaxPessoas("até quinta, no máximo 3 pessoas"), 3);

console.log("OK2");
const p3 = interpretarLocal("Responder 30 dúvidas da segunda fase até quinta, no máximo 3 pessoas", e, hoje);
assert.equal(p3.tipoId, "tp_duvidas"); assert.equal(p3.prazo, "2026-11-19"); assert.equal(p3.quantidade, 30); assert.equal(p3.maxPessoas, 3);
assert.equal(lerPrazo("entrega na segunda", hoje), "2026-11-23");
console.log("OK3");
import { validarRespostaIA } from "../js/interpretador.js";
const loc = interpretarLocal("Conduzir o treinamento de Dados até quinta", e, hoje);
assert.equal(loc.tipoId, "tp_conduzir");
assert.equal(validarRespostaIA({ prazo: "2026-11-20", tipoId: "tp_conduzir" }, loc, e).prazo, "2026-11-19");
console.log("OK4");
