# repasse.

**Quem faz o quê no PS, sem planilha e sem cobrança no grupo.**

O repasse distribui as tasks da equipe que organiza o processo seletivo (PS) de uma empresa júnior. A gerência escreve o que precisa ser feito numa frase. O sistema entende o pedido, decide quem faz considerando área, carga e prazos, explica cada escolha e, quando alguém não pode, repassa a task sozinho para a próxima pessoa.

> Projeto desenvolvido para o Desafio de Inovação do processo seletivo do CITi. Os dados da demonstração são fictícios.

## O problema

Num PS, a gerência distribui dezenas de tasks curtas e com prazo apertado: corrigir os desafios de cada área, conduzir entrevistas, responder aspirantes, organizar dinâmicas, consolidar notas. Normalmente isso acontece no grupo do WhatsApp e numa planilha: alguém pergunta quem pode, divide na mão, anota, cobra quem esqueceu e redivide quando alguém desiste. O trabalho de organizar quem faz o quê consome o tempo de quem deveria estar avaliando candidatos.

## Como funciona

**Perfis**

- **Gerente do PS:** cria tasks, confirma a distribuição proposta, acompanha o painel, ajusta a equipe e os tipos de task.
- **Membro do PS:** uma tela só, com as próprias tasks. Aceita, conclui ou aperta "Não consigo", e avisa ausências com "Vou me ausentar".

**Fluxo do dia a dia**

1. **Pede.** A gerente escreve, por exemplo: *"Chegaram 14 entregas do desafio de Marketing, corrigir até sexta"*. A IA (Gemini) transforma a frase em uma task estruturada: tipo, área, prazo, quantidade e horas por unidade. Se a IA estiver indisponível, regras locais fazem a leitura, e a gerente confere os campos de qualquer forma.
2. **Distribui.** O motor de atribuição calcula quem deve fazer. Tasks divisíveis (14 correções, 8 entrevistas) são repartidas entre várias pessoas. Cada escolha vem com os motivos e a carga antes e depois.
3. **Confirma e avisa.** A gerente confirma com um clique (ou troca alguém). Cada membro passa a ver a sua parte, e o sistema gera a mensagem pronta para o grupo do WhatsApp.
4. **Repassa.** Quem não pode aperta "Não consigo". A task vai automaticamente para a próxima pessoa mais bem pontuada, e o histórico registra o motivo. Quem avisa uma ausência pode repassar de uma vez todas as tasks com prazo nesse período.
5. **Acompanha.** O painel mostra tasks atrasadas, gente acima da capacidade e a carga da semana. Um botão gera, com IA, um resumo do dia: o que está em risco e o que fazer hoje.

## Montar o PS a partir do planejamento

A gerência cola o texto de como o PS vai ser estruturado (ou abre um .txt) e informa quantos aspirantes entregam cada desafio. A IA extrai o cronograma: cada desafio com lançamento e entrega, cada treinamento síncrono com data e horário, cada aviso. Para cada item, o repasse cria as tasks da equipe e distribui todas de uma vez, equilibrando a carga semana a semana. A gerência revisa numa prévia (pode excluir itens e trocar responsáveis) e confirma: o cronograma, o calendário e as tasks de cada membro ficam prontos, e o cronograma pode ir direto para o Discord dos aspirantes.

Sem IA disponível, regras locais leem um item por linha ("Desafio de Dados: lançamento 23/11, entrega 27/11").

## Piloto automático

Regras que rodam sozinhas, sem a gerência clicar (ao abrir o site e a cada minuto com ele aberto). Cada uma pode ser ligada ou desligada no painel, que também mostra o que o piloto fez:

- **Não aceitou em 24h:** a task vai para a próxima pessoa mais bem pontuada.
- **Task atrasada:** avisa a equipe no Discord, ou repassa sozinha com prazo para o dia seguinte.
- **Tasks acompanham o cronograma:** se um treinamento muda de data, os prazos de preparar e conduzir mudam junto, e quem estiver indisponível na nova data é trocado. Se um item é cancelado, as tasks dele são canceladas.
- **Planilha dos aspirantes:** a cada mudança no cronograma, a planilha do Google Sheets é atualizada.

## Planilha do Google Sheets (e Google Agenda)

O cronograma é publicado numa planilha que os aspirantes acessam como leitores, com duas abas: **Cronograma** (uma linha por item) e **Calendário** (grade mensal). Opcionalmente, o mesmo script cria os eventos num **Google Agenda**. Instalação no topo de `google/apps-script.gs`; na Vercel, `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_TOKEN` e, se quiser o botão "Abrir planilha", `GOOGLE_SHEET_URL`.

## Cronograma, calendário e Discord

O PS é organizado em **desafios por subárea** (com data de lançamento e de entrega) e **treinamentos síncronos**. A aba **Cronograma** guarda esses itens e, para cada um, sugere as tasks da equipe: preparar e conduzir o treinamento, tirar dúvidas e corrigir as entregas do desafio. Um clique em "Distribuir" abre a Nova task já preenchida.

A visão **Calendário** (dentro do Cronograma, e no botão "Ver calendário" dos membros) mostra, mês a mês, os lançamentos, entregas, treinamentos e os prazos das tasks. A gerência vê tudo; cada membro vê o cronograma e só os próprios prazos.

O **bot do Discord** avisa os aspirantes no canal do PS:

- **Novo item** no cronograma: publica assim que é criado.
- **Mudança** de data, horário ou local: publica o "antes" e o "agora".
- **Cancelamento**.
- **Cronograma completo** e **lembretes de hoje e amanhã**, por botões no painel e no cronograma.

Se houver um segundo webhook, o canal da equipe recebe as novas tasks e os repasses. O bot nunca marca @everyone nem cargos.

## O motor de atribuição

A decisão é determinística e explicável: a IA interpreta o pedido, mas quem escolhe as pessoas é uma regra que a gerência consegue auditar.

Primeiro saem da disputa quem não pode receber a task: inativos, quem já recusou, quem está ausente até o prazo e, em tipos que exigem a área, quem é de outra área. Os demais recebem pontos:

| Critério | Pontos |
|---|---|
| É da área da task | +30 |
| Folga na semana do prazo depois de receber a task | até +40, proporcional às horas livres |
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
js/calendario.js      grade do mês e itens de cada dia
js/planejador.js      planejamento em texto → cronograma + tasks distribuídas
js/discord.js         mensagens para o Discord
js/dados.js           estado, dados de demonstração e persistência
js/datas.js           utilitários de data
api/ia.js             função serverless que chama o Gemini
api/discord.js        função serverless que publica no Discord
api/google.js         função serverless que atualiza a planilha do Google
google/apps-script.gs script da planilha (lista, calendário e Google Agenda opcional)
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
node testes/plano.test.mjs
node testes/api.test.cjs
node testes/discord.test.cjs
node testes/google.test.cjs
```

## Publicar na Vercel

1. Crie um projeto na Vercel importando este repositório. Framework: **Other**. Não há comando de build.
2. Em *Settings → Environment Variables*, crie `GEMINI_API_KEY` com a chave do Google AI Studio.
3. Opcional: `GEMINI_MODEL` para escolher outro modelo (padrão: `gemini-flash-lite-latest`).
4. Faça um novo deploy para a variável valer.
5. Para conferir, abra `/api/ia?diagnostico=1`: deve aparecer `"ok": true`.

### Discord

1. No servidor do PS, abra as configurações do canal dos aspirantes → **Integrações** → **Webhooks** → **Novo webhook** → **Copiar URL do webhook**.
2. Na Vercel, crie `DISCORD_WEBHOOK_ASPIRANTES` com essa URL.
3. Opcional: `DISCORD_WEBHOOK_EQUIPE` (canal da equipe) e `DISCORD_PIN` (código que a gerência digita para publicar; recomendado num site público).
4. Redeploy. Para conferir, abra `/api/discord`: mostra quais canais estão configurados.

## Limitações e próximos passos

- Os dados ficam no navegador de cada pessoa. Para uso real pela equipe, o próximo passo é um banco compartilhado (por exemplo, Supabase) com login.
- O piloto automático roda no navegador de quem está com o site aberto. Rodar 24h no servidor (lembretes num horário fixo, cobranças de madrugada) e avisar cada membro direto no Discord, com botões de aceitar e repassar, exigem um banco compartilhado e um bot do Discord: é o próximo passo.
- Os pesos do motor são fixos. Uma versão futura deixaria a gerência ajustá-los e aprenderia com as trocas manuais que ela faz.
