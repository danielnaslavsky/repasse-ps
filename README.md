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

O planejamento pode vir no formato de um documento de verdade, com tabela por subárea, dinâmica, entrevistas e observações. O teste `testes/plano-completo.test.mjs` usa um exemplo assim (`testes/exemplos/planejamento-completo.txt`).

- **Etapas com a equipe** (dinâmica em grupo, entrevistas): cada membro que participa recebe a sua task, uma pessoa por vaga ("6 membros para facilitar" vira 6 tasks para 6 pessoas diferentes). Entrevistas sem detalhes contam 30 min por aspirante, com dois membros em cada.
- **Compromissos internos** (reunião geral, deliberação): ficam só no calendário da equipe. Não vão para o Discord nem para a planilha dos aspirantes. Uma regra confere o que a IA devolve e marca esses itens mesmo quando ela deixa passar.
- **Responsáveis citados no texto** ("o Rafael prepara o case de Dados"): aparecem no aviso da prévia, para a gerência trocar o responsável antes de confirmar. O repasse não tenta adivinhar a qual task o nome se refere.

Sem IA disponível, regras locais leem um item por linha ("Desafio de Dados: lançamento 23/11, entrega 27/11") e tabelas com uma linha por subárea (lançamento, entrega, treinamento).

## Modo demonstração e modo equipe

- **Demonstração** (o link puro do site): dados fictícios salvos no navegador de cada pessoa. Cada avaliador explora a sua cópia, e "Restaurar dados de demonstração" volta ao início. Nada sai para fora: o Discord e a planilha reais só recebem publicações do modo equipe (o servidor exige um código válido).
- **Equipe** (`/?c=CÓDIGO`): os dados ficam no servidor (Upstash Redis) e são os mesmos para todos. A gerência entra com o código definido em `PS_CODIGO_GERENTE`; cada membro recebe um link próprio, que abre direto nas suas tasks (Equipe → Links de acesso da equipe). "Novo link" invalida o anterior. As gravações usam controle de versão: se duas pessoas mexem ao mesmo tempo, ninguém sobrescreve o outro sem perceber.

### Planilha na demonstração

No link puro do site, "Atualizar planilha" grava numa aba separada, **Demonstração** (e **Demonstração · calendário**), e o botão "Abrir planilha (demonstração)" abre essa aba. Assim, quem avalia vê a planilha reagir sem tocar no cronograma real. O servidor monta os títulos a partir do tipo e da subárea ("Desafio de Dados", "Aviso aos aspirantes"): nenhum texto digitado no site chega à planilha, e itens internos ficam de fora. Se o Apps Script ainda for a versão antiga, que não conhece essa aba, o servidor não envia nada. As abas **Cronograma** e **Calendário** só mudam pelo modo equipe.

### Discord na demonstração

No link puro, publicar no Discord (cronograma, lembretes, novo item, mudança, cancelamento) abre uma prévia da mensagem exatamente como o bot a publica no canal dos aspirantes. Assim, quem avalia vê o recurso funcionando sem precisar entrar no servidor. Se `DISCORD_WEBHOOK_DEMO` estiver definida (um canal só para a demonstração), a mensagem também é publicada lá; com `DISCORD_CONVITE_DEMO`, a prévia mostra "Ver no Discord". Como na planilha, os títulos são montados pelo servidor e ninguém é marcado. O canal real dos aspirantes só recebe mensagens do modo equipe.

## Piloto automático

Regras que rodam sozinhas, sem a gerência clicar (ao abrir o site e a cada minuto com ele aberto). Cada uma pode ser ligada ou desligada no painel, que também mostra o que o piloto fez:

- **Não aceitou em 24h:** a task vai para a próxima pessoa mais bem pontuada.
- **Task atrasada:** avisa a equipe no Discord, ou repassa sozinha com prazo para o dia seguinte.
- **Tasks acompanham o cronograma:** se um treinamento muda de data, os prazos de preparar e conduzir mudam junto, e quem estiver indisponível na nova data é trocado. Se um item é cancelado, as tasks dele são canceladas.
- **Planilha dos aspirantes:** a cada mudança no cronograma, a planilha do Google Sheets é atualizada.
- **Rotina diária no servidor (8h):** no modo equipe, a Vercel roda o piloto mesmo com o site fechado, manda aos aspirantes o lembrete do dia, manda à equipe o resumo (vence hoje, atrasadas, esperando aceite) e atualiza a planilha. A gerência pode disparar a rotina na hora pelo painel.

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
api/estado.js         estado compartilhado da equipe (modo equipe)
api/_armazem.js       acesso ao Upstash Redis com gravação atômica por versão
api/cron.js           rotina diária do servidor (piloto, lembretes, resumo, planilha)
js/regras.js          regras de negócio usadas no navegador e no servidor
js/sincronia.js       modo equipe no navegador (links, salvar, buscar mudanças)
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
node testes/estado.test.cjs
node testes/cron.test.cjs
```

## Publicar na Vercel

1. Crie um projeto na Vercel importando este repositório. Framework: **Other**. Não há comando de build.
2. Em *Settings → Environment Variables*, crie `GEMINI_API_KEY` com a chave do Google AI Studio.
3. Opcional: `GEMINI_MODEL` para escolher outro modelo (padrão: `gemini-flash-lite-latest`).
4. Faça um novo deploy para a variável valer.
5. Para conferir, abra `/api/ia?diagnostico=1`: deve aparecer `"ok": true`.

### Modo equipe (dados compartilhados)

1. Na Vercel, aba **Storage** → **Create Database** → **Upstash for Redis** (plano gratuito) → conecte ao projeto. As variáveis do banco são criadas sozinhas.
2. Em *Environment Variables*, crie `PS_CODIGO_GERENTE` (o código da gerência, ex.: `gerencia-ps-2026`) e `CRON_SECRET` (qualquer texto longo; a Vercel usa para chamar a rotina diária).
3. Redeploy. Para conferir: `/api/estado?diagnostico=1`.
4. Abra `/?c=SEU_CÓDIGO_DA_GERÊNCIA`, escolha como começar e mande a cada membro o link dele.

### Discord

1. No servidor do PS, abra as configurações do canal dos aspirantes → **Integrações** → **Webhooks** → **Novo webhook** → **Copiar URL do webhook**.
2. Na Vercel, crie `DISCORD_WEBHOOK_ASPIRANTES` com essa URL.
3. Opcional: `DISCORD_WEBHOOK_EQUIPE` (canal da equipe) e `DISCORD_PIN` (código que a gerência digita para publicar; recomendado num site público).
4. Redeploy. Para conferir, abra `/api/discord`: mostra quais canais estão configurados.

## Limitações e próximos passos

- No modo equipe, o acesso é por link com código (sem senha). Quem tem o link de um membro age como ele; por isso os links são individuais e revogáveis. Login com conta Google é um próximo passo.
- A rotina do servidor roda uma vez por dia (limite do plano gratuito da Vercel). Avisar cada membro direto no Discord, com botões de aceitar e repassar, exige um bot do Discord: é o próximo passo.
- Os pesos do motor são fixos. Uma versão futura deixaria a gerência ajustá-los e aprenderia com as trocas manuais que ela faz.
