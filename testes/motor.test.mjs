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
const prop2 = proporDistribuicao(e, p2, hoje);
console.log(p2.area, prop2.partes.map(x=>[x.membroId,x.motivos]), prop2.alternativas.map(a=>a.membroId));

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
const prop3 = proporDistribuicao(e, { ...interpretarLocal("Responder 20 mensagens de aspirantes até amanhã", e, hoje), maxPessoas: 2 }, hoje);
console.log(prop3.partes.map(x=>[x.membroId,x.unidades]));
assert.ok(prop3.partes.length <= 2);
console.log("OK");
import { lerMaxPessoas } from "../js/interpretador.js";
assert.equal(lerMaxPessoas("até quinta, no máximo 3 pessoas"), 3);
assert.equal(interpretarLocal("Conduzir 8 entrevistas da segunda fase até quinta, no máximo 3 pessoas", e, hoje).maxPessoas, 3);
console.log("OK2");
