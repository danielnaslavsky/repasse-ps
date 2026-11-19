# Comando direto: escrever o pedido e apertar Enter cria e distribui na hora; "Desfazer" volta atrás.
# Rode antes, na raiz: python3 -m http.server 8765
import json, sys
from playwright.sync_api import sync_playwright
erros=[]
resposta_ia={"titulo":"Corrigir desafio de Marketing","tipo":"corrigir","area":"Marketing","prazo":"2026-11-27","quantidade":14,"maxPessoas":None,"observacao":""}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900}); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/api/ia", lambda r: r.fulfill(status=503, json={"erro":"sem chave"}))
    pg.route("**/api/**", lambda r: r.fulfill(status=503, json={"erro":"offline"}) if "/api/ia" not in r.request.url else r.fallback())
    pg.goto("http://localhost:8765/"); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.click("text=Marina Costa")
    antes=pg.evaluate("JSON.parse(localStorage.getItem('ps-tasks:v2')).tasks.length")
    # 1. Do painel, com Enter
    pg.fill("#comando","Chegaram 14 entregas do desafio de Marketing, corrigir até sexta"); pg.press("#comando","Enter")
    pg.wait_for_selector("text=Criada e distribuída")
    depois=pg.evaluate("JSON.parse(localStorage.getItem('ps-tasks:v2')).tasks.length")
    res=pg.inner_text(".resultado-comando")
    pg.screenshot(path="capturas/c1-painel.png")
    caixa_vazia = pg.input_value("#comando")==""
    # 2. Desfazer
    pg.click("[data-acao=desfazer-comando]"); pg.wait_for_timeout(200)
    desfeito=pg.evaluate("JSON.parse(localStorage.getItem('ps-tasks:v2')).tasks.length")
    texto_voltou = "Marketing" in pg.input_value("#comando")
    # 3. Na aba Nova task, pelo botão
    pg.click("button.aba:has-text('Nova task')")
    pg.fill("#comando","Preparar o treinamento síncrono de Produto até amanhã"); pg.click("text=Criar e distribuir")
    pg.wait_for_selector("text=Criada e distribuída"); res2=pg.inner_text(".resultado-comando")
    # 4. Passo a passo ainda existe
    pg.click("text=Preencher passo a passo"); passo=pg.locator("text=Interpretar pedido").count()==1
    b.close()
checks={"criou sem confirmar": depois>antes, "mostra quem recebeu e por quê": "Marketing" in res and "Desfazer" in res,
 "caixa limpa para o próximo comando": caixa_vazia, "desfazer remove": desfeito==antes, "pedido volta para a caixa": texto_voltou,
 "funciona na aba Nova task": "Produto" in res2, "passo a passo continua disponível": passo}
print("ERROS:",erros, antes, depois, desfeito)
for k,v in checks.items(): print(("ok   " if v else "FALHA"),k)
sys.exit(0 if all(checks.values()) and not erros else 1)
