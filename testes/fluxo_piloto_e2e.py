# Teste de ponta a ponta no navegador. Rode antes, na raiz: python3 -m http.server 8765 e mkdir capturas
# Requer: pip install playwright && playwright install chromium
import json
from playwright.sync_api import sync_playwright
erros=[]; google=[]; discord=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.route("**/api/discord", lambda r: (discord.append(json.loads(r.request.post_data)), r.fulfill(json={"ok":True})))
    def g(r):
        if r.request.method=="GET": r.fulfill(json={"configurado":True,"planilha":"https://docs.google.com/spreadsheets/d/x"})
        else: google.append(json.loads(r.request.post_data)); r.fulfill(json={"ok":True,"itens":len(google[-1]["eventos"])})
    pg.route("**/api/google", g)
    pg.route("**/api/ia", lambda r: r.fulfill(status=503, json={"erro":"sem chave"}))
    pg.goto("http://localhost:8765/")
    pg.click("text=Marina Costa"); pg.wait_for_timeout(500)
    pg.screenshot(path="capturas/e1-painel.png", full_page=True)
    pg.select_option("#piloto-atrasadas","repassar"); pg.wait_for_timeout(200)
    pg.click("button.aba:has-text('Cronograma')")
    pg.click("text=Atualizar planilha"); pg.wait_for_timeout(300)
    # muda data de um treinamento com tasks: Treinamento de Produto (seed task preparar Produto has no eventoId) -> use plan
    pg.click("text=Montar a partir do planejamento"); pg.click("text=Usar um exemplo"); pg.click("text=Gerar plano"); pg.wait_for_selector("text=O que cada um vai fazer")
    pg.click("text=Confirmar e criar tudo"); pg.wait_for_selector(".cal"); pg.wait_for_timeout(300)
    pg.click("[data-acao=crono-vista][data-id=lista]")
    pg.click("[data-acao=editar-evento] >> nth=2")
    val=pg.input_value("#ev-data"); print("data antes", val)
    pg.fill("#ev-data", "2026-11-27"); pg.click("[data-acao=salvar-evento]"); pg.wait_for_timeout(300)
    pg.click("[data-acao=excluir-evento] >> nth=-1"); pg.wait_for_timeout(300)
    pg.click("button.aba:has-text('Painel')")
    pg.screenshot(path="capturas/e2-painel.png", full_page=True)
    print(pg.inner_text(".cartao:has(h2:text('Piloto automático'))")[-700:])
    b.close()
print("ERROS:", erros); print("google posts:", len(google), "discord:", [d["tipo"] for d in discord])
