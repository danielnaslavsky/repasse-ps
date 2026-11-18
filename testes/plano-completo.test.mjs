// Planejamento completo, no formato de um documento real (tabela, dinâmica, entrevistas, itens internos).
import assert from "node:assert/strict";
import fs from "node:fs";
import { dadosDemonstracao, garantirTipos } from "../js/dados.js";
import { interpretarPlanoLocal, validarEventosIA, montarPlano } from "../js/planejador.js";
import { eventosDoDia, eventosOrdenados } from "../js/regras.js";

const hoje = "2026-11-18";
const estado = dadosDemonstracao(hoje);
const texto = fs.readFileSync(new URL("./exemplos/planejamento-completo.txt", import.meta.url), "utf8");

// 1. Regras locais leem a tabela: 7 desafios e 7 treinamentos, com datas e horários.
const evs = interpretarPlanoLocal(texto, estado, hoje);
const desafios = evs.filter((e) => e.tipo === "desafio");
const treinos = evs.filter((e) => e.tipo === "treinamento");
assert.equal(desafios.length, 7);
assert.equal(treinos.length, 7);
const dados = desafios.find((e) => e.area === "Dados");
assert.deepEqual([dados.data, dados.entrega], ["2026-12-02", "2026-12-07"]);
assert.equal(treinos.find((e) => e.area === "Gente e Gestão").hora, "10:00");
assert.equal(treinos.find((e) => e.area === "Dados").hora, "20:30");

// 2. Dinâmica e entrevistas são etapas; deliberação é interna.
const dinamica = evs.find((e) => /din[aâ]mica em grupo/i.test(e.titulo));
assert.equal(dinamica.tipo, "etapa");
assert.equal(dinamica.pessoas, 6);
assert.equal(evs.find((e) => /entrevistas/i.test(e.titulo)).tipo, "etapa");
assert.equal(evs.find((e) => /delibera/i.test(e.titulo)).interno, true);
assert.equal(evs.find((e) => /divulga.*din/i.test(e.titulo)).tipo, "aviso");
assert.equal(evs.find((e) => /integra/i.test(e.titulo)).data, "2027-02-05");

// 3. Plano: cada facilitador da dinâmica é uma pessoa diferente; item interno não gera task de aviso.
const plano = montarPlano(estado, evs, { hoje, nAspirantes: 40 });
const part = plano.tarefas.find((t) => t.pedido.titulo.startsWith("Participar: Din"));
assert.equal(part.partes.length, 6);
assert.equal(new Set(part.partes.map((p) => p.membroId)).size, 6);
assert.ok(part.partes.every((p) => p.unidades === 1 && p.esforcoH === 3));
const ent = plano.tarefas.find((t) => t.pedido.titulo.startsWith("Participar: Entrevistas"));
const horasEnt = ent.partes.reduce((s, p) => s + p.esforcoH, 0);
assert.ok(Math.abs(horasEnt - 40) < 1, `entrevistas somam ${horasEnt}h`); // 40 aspirantes × 30 min × 2 membros
const delib = plano.eventos.find((e) => /delibera/i.test(e.titulo));
assert.equal(plano.tarefas.filter((t) => t.pedido.eventoId === delib.id).length, 0);

// 4. Itens internos ficam fora do que vai para os aspirantes.
const est2 = { ...estado, eventos: plano.eventos };
assert.ok(eventosOrdenados(est2).some((e) => e.interno));
assert.ok(!eventosOrdenados(est2, { publico: true }).some((e) => e.interno));
assert.equal(eventosDoDia(est2, "2026-12-17", { publico: true }).length, 0);
assert.equal(eventosDoDia(est2, "2026-12-17").length, 1);

// 5. Resposta da IA com os campos novos é validada.
const ia = validarEventosIA([
  { tipo: "etapa", titulo: "Entrevistas", area: "Geral", data: "2026-12-14", pessoas: 8, duracaoH: 5, interno: true },
  { tipo: "aviso", titulo: "Reunião geral", area: "Geral", data: "2026-12-08", interno: true },
  { tipo: "aviso", titulo: "Resultado", area: "Geral", data: "2026-12-18", interno: "sim" },
], estado);
assert.deepEqual([ia[0].pessoas, ia[0].duracaoH, ia[0].interno], [8, 5, false]);
assert.equal(ia[1].interno, true);
assert.equal(ia[2].interno, false);

// 6. Estado antigo (sem o tipo de etapa) ganha o tipo que falta.
const antigo = dadosDemonstracao(hoje);
antigo.tipos = antigo.tipos.filter((t) => t.id !== "tp_etapa");
garantirTipos(antigo);
assert.ok(antigo.tipos.some((t) => t.id === "tp_etapa"));
assert.equal(antigo.tipos[antigo.tipos.length - 1].id, "tp_outra");

console.log("plano completo: ok");
