# repasse.

**Quem faz o quê no PS, sem planilha e sem cobrança no grupo.**

O repasse distribui as tasks da equipe que organiza o processo seletivo (PS) de uma empresa júnior. A gerência escreve o que precisa ser feito numa frase. O sistema entende o pedido, decide quem faz considerando área, carga e prazos, explica cada escolha e, quando alguém não pode, repassa a task sozinho para a próxima pessoa.

> Projeto desenvolvido para o Desafio de Inovação do processo seletivo do CITi. Os dados da demonstração são fictícios.

## O problema

Num PS, a gerência distribui dezenas de tasks curtas e com prazo apertado: corrigir os desafios de cada área, conduzir entrevistas, responder aspirantes, organizar dinâmicas, consolidar notas. Normalmente isso acontece no grupo do WhatsApp e numa planilha: alguém pergunta quem pode, divide na mão, anota, cobra quem esqueceu e redivide quando alguém desiste. O trabalho de organizar quem faz o quê consome o tempo de quem deveria estar avaliando candidatos.

## Como funciona

**Perfis**

- **Gerente do PS:** cria tasks, confirma a distribuição proposta, acompanha o painel, ajusta a equipe e os tipos de task.
- **Membro do PS:** vê só as próprias tasks, aceita, conclui ou aperta "Não consigo", e avisa ausências.

**Fluxo**

1. **Pede.** A gerente escreve, por exemplo: *"Chegaram 14 entregas do desafio de Marketing, corrigir até sexta"*. A IA (Gemini) transforma a frase em uma task estruturada: tipo, área, prazo, quantidade e horas por unidade. Se a IA estiver indisponível, regras locais fazem a leitura, e a gerente confere os campos de qualquer forma.
2. **Distribui.** O motor de atribuição calcula quem deve fazer. Tasks divisíveis (14 correções, 8 entrevistas) são repartidas entre várias pessoas. Cada escolha vem com os motivos e a carga antes e depois.
3. **Confirma e avisa.** A gerente confirma com um clique (ou troca alguém). Cada membro passa a ver a sua parte, e o sistema gera a mensagem pronta para o grupo do WhatsApp.
4. **Repassa.** Quem não pode aperta "Não consigo". A task vai automaticamente para a próxima pessoa mais bem pontuada, e o histórico registra o motivo. Quem avisa uma ausência pode repassar de uma vez todas as tasks com prazo nesse período.
5. **Acompanha.** O painel mostra tasks atrasadas, gente acima da capacidade e a carga da semana. Um botão gera, com IA, um resumo do dia: o que está em risco e o que fazer hoje.

## O motor de atribuição

A decisão é determinística e explicável: a IA interpreta o pedido, mas quem escolhe as pessoas é uma regra que a gerência consegue auditar.

Primeiro saem da disputa quem não pode receber a task: inativos, quem já recusou, quem está ausente até o prazo e, em tipos que exigem a área, quem é de outra área. Os demais recebem pontos:

| Critério | Pontos |
|---|---|
| É da área da task | +30 |
| Folga na semana depois de receber a task | até +40, proporcional às horas livres |
| Outros prazos a até 1 dia deste | até +15 (−5 por prazo) |
| Rodízio: tasks recebidas nos últimos 7 dias | até +15 (−3 por task) |
| Ausente hoje, mas volta antes do prazo | −10 |

Tasks divisíveis são repartidas unidade a unidade: cada unidade vai para quem estiver mais bem pontuado naquele momento, já contando o que recebeu na mesma rodada. Isso equilibra a carga sem a gerência fazer conta. Também é possível limitar o número de pessoas ("no máximo 3 pessoas").

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript puros (módulos ES), sem framework e sem etapa de build.
- **IA:** Google Gemini, chamado por uma função serverless da Vercel (`api/ia.js`). A chave fica numa variável de ambiente, nunca no navegador.
- **Dados:** salvos no navegador (localStorage), com dados de demonstração e um botão para restaurá-los. Cada avaliador explora a própria cópia sem interferir na dos outros.
- **Hospedagem:** Vercel.
- **Testes:** Node.js (`testes/`) para o motor, o interpretador e a função de IA, e Playwright (`testes/fluxo_e2e.py`) para o fluxo completo no navegador.

## Estrutura

```
index.html            página única
css/estilo.css        estilo
js/app.js             interface (telas do gerente e do membro)
js/motor.js           motor de atribuição (pontuação, divisão, repasse)
js/interpretador.js   leitura do pedido: IA com regras locais de reserva
js/dados.js           estado, dados de demonstração e persistência
js/datas.js           utilitários de data
api/ia.js             função serverless que chama o Gemini
testes/               testes automatizados
```

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Sem a Vercel, a IA não responde e o sistema usa as regras locais. Para testar a IA localmente, use `vercel dev` com a variável `GEMINI_API_KEY` definida.

Testes:

```bash
node testes/motor.test.mjs
node testes/api.test.cjs
```

## Publicar na Vercel

1. Crie um projeto na Vercel importando este repositório. Framework: **Other**. Não há comando de build.
2. Em *Settings → Environment Variables*, crie `GEMINI_API_KEY` com a chave do Google AI Studio.
3. Opcional: `GEMINI_MODEL` para escolher outro modelo (padrão: `gemini-flash-lite-latest`).
4. Faça um novo deploy para a variável valer.
5. Para conferir, abra `/api/ia?diagnostico=1`: deve aparecer `"ok": true`.

## Limitações e próximos passos

- Os dados ficam no navegador de cada pessoa. Para uso real pela equipe, o próximo passo é um banco compartilhado (por exemplo, Supabase) com login.
- Avisos pelo WhatsApp hoje são uma mensagem pronta para copiar. A integração direta (WhatsApp Business API ou um bot no Discord) é o passo seguinte.
- Os pesos do motor são fixos. Uma versão futura deixaria a gerência ajustá-los e aprenderia com as trocas manuais que ela faz.
