# Teste de ponta a ponta no navegador. Rode antes: python3 -m http.server 8765 (na raiz) e mkdir capturas
# Requer: pip install playwright && playwright install chromium
import json, sys
from playwright.sync_api import sync_playwright
erros=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: m.type=="error" and erros.append(m.text))
    # IA simulada
    def ia(route):
        body=json.loads(route.request.post_data)
        if body["acao"]=="interpretar":
            route.fulfill(json={"titulo":"Conduzir entrevistas da segunda fase","tipoId":"tp_entrevista","area":"Geral","prazo":"2026-11-20","quantidade":8,"esforcoPorUnidadeH":1,"observacao":""})
        else:
            route.fulfill(json={"texto":"Diego está com a resposta aos aspirantes atrasada. Gabriela tem folga."})
    pg.route("**/api/ia", ia)
    pg.goto("http://localhost:8765/")
    pg.screenshot(path="capturas/1-entrada.png", full_page=True)
    pg.click("text=Marina Costa")
    pg.screenshot(path="capturas/2-painel.png", full_page=True)
    pg.click("text=Gerar com IA"); pg.wait_for_selector(".resumo-ia")
    pg.click("button.aba:has-text('Nova task')")
    pg.click(".exemplo >> nth=0")
    pg.unroute("**/api/ia")  # força regras locais para o 1º exemplo
    pg.click("text=Interpretar pedido"); pg.wait_for_selector("text=Conferir")
    pg.click("text=Calcular distribuição"); pg.wait_for_selector("text=Distribuição proposta")
    pg.screenshot(path="capturas/3-proposta.png", full_page=True)
    pg.click("text=Confirmar e avisar a equipe"); pg.wait_for_selector("text=Pronto")
    pg.screenshot(path="capturas/4-criadas.png", full_page=True)
    # IA simulada para o 2º
    pg.route("**/api/ia", ia)
    pg.click("text=Criar outra task")
    pg.click(".exemplo >> nth=1"); pg.click("text=Interpretar pedido"); pg.wait_for_selector(".origem.ia")
    pg.click("text=Calcular distribuição"); pg.wait_for_selector("text=Distribuição proposta")
    pg.screenshot(path="capturas/5-proposta-ia.png", full_page=True)
    pg.click("text=Confirmar e avisar a equipe")
    # membro Gabriela recusa
    pg.click("text=Trocar perfil"); pg.click("text=Gabriela Souza")
    pg.screenshot(path="capturas/6-membro.png", full_page=True)
    pg.click("button:has-text('Não consigo') >> nth=0"); pg.fill("#motivo","semana de prova"); pg.click("button:text-is('Repassar')")
    pg.wait_for_timeout(300)
    print("toast:", pg.inner_text(".toast"))
    pg.click("button.aba:has-text('Minha disponibilidade')")
    pg.fill("#minha-ausencia","2026-11-25"); pg.click("text=Salvar")
    pg.screenshot(path="capturas/7-disp.png", full_page=True)
    if pg.locator("text=Repassar estas tasks").count(): pg.click("text=Repassar estas tasks"); print("toast:", pg.inner_text(".toast"))
    pg.click("text=Trocar perfil"); pg.click("text=Marina Costa"); pg.click("button.aba:has-text('Histórico')")
    pg.screenshot(path="capturas/8-historico.png", full_page=True)
    pg.click("button.aba:has-text('Equipe')"); pg.screenshot(path="capturas/9-equipe.png", full_page=True)
    m=b.new_page(viewport={"width":390,"height":844}); m.goto("http://localhost:8765/"); m.screenshot(path="capturas/10-mobile.png", full_page=True)
    b.close()
print("ERROS:", erros)
