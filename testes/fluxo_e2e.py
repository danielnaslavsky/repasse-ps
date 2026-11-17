# Teste de ponta a ponta no navegador. Rode antes, na raiz: python3 -m http.server 8765 e mkdir capturas
# Requer: pip install playwright && playwright install chromium
import json
from playwright.sync_api import sync_playwright
erros=[]; discord=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    def dc(route):
        discord.append(json.loads(route.request.post_data)); route.fulfill(json={"ok":True})
    pg.route("**/api/discord", dc)
    pg.route("**/api/ia", lambda r: r.fulfill(status=503, json={"erro":"sem chave"}))
    pg.goto("http://localhost:8765/")
    pg.click("text=Marina Costa")
    pg.screenshot(path="capturas/b1-painel.png", full_page=True)
    pg.click("button.aba:has-text('Cronograma')")
    pg.screenshot(path="capturas/b2-crono.png", full_page=True)
    pg.click("text=Publicar cronograma no Discord"); pg.wait_for_timeout(300)
    pg.click("text=+ Novo item")
    pg.fill("#ev-titulo","Treinamento síncrono de Desenvolvimento"); pg.select_option("#ev-area","Desenvolvimento")
    pg.click("[data-acao=salvar-evento]"); pg.wait_for_timeout(300)
    pg.screenshot(path="capturas/b3-sugestoes.png", full_page=True)
    pg.click("[data-acao=distribuir-sugestao] >> nth=0"); pg.wait_for_selector("text=Gerada a partir do cronograma")
    pg.click("text=Calcular distribuição"); pg.click("text=Confirmar e avisar a equipe"); pg.wait_for_selector("text=Pronto")
    # editar evento -> mudança
    pg.click("button.aba:has-text('Cronograma')")
    pg.click("[data-acao=editar-evento] >> nth=0"); pg.fill("#ev-hora","21:00"); pg.click("[data-acao=salvar-evento]"); pg.wait_for_timeout(300)
    pg.click("[data-acao=excluir-evento] >> nth=-1"); pg.wait_for_timeout(300)
    pg.click("button.aba:has-text('Calendário')")
    pg.screenshot(path="capturas/b4-cal.png", full_page=True)
    pg.click("text=Trocar perfil"); pg.click("text=João Prado"); pg.click("button.aba:has-text('Calendário')")
    pg.screenshot(path="capturas/b5-cal-membro.png", full_page=True)
    m=b.new_page(viewport={"width":390,"height":844}); m.goto("http://localhost:8765/"); m.click("text=Marina Costa"); m.click("button.aba:has-text('Calendário')"); m.screenshot(path="capturas/b6-cal-mobile.png", full_page=True)
    b.close()
print("ERROS:", erros)
for d in discord: print(d["tipo"], json.dumps(d, ensure_ascii=False)[:160])
