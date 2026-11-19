# Teste de ponta a ponta no navegador. Rode antes, na raiz: python3 -m http.server 8765 e mkdir capturas
# Requer: pip install playwright && playwright install chromium
import json
from playwright.sync_api import sync_playwright

def fechar_previa(pg):
    """Na demonstração, publicar no Discord abre uma prévia; fecha para seguir o teste."""
    try:
        if pg.locator(".dc-janela").count(): pg.click(".dc-cab >> text=Fechar")
    except Exception: pass

erros=[]; discord=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.route("**/api/discord", lambda r: (discord.append(json.loads(r.request.post_data)), r.fulfill(json={"ok":True})))
    pg.route("**/api/ia", lambda r: r.fulfill(status=503, json={"erro":"sem chave"}))
    pg.goto("http://localhost:8765/")
    pg.click("text=Marina Costa")
    pg.click("text=Montar o PS a partir do planejamento")
    pg.click("text=Usar um exemplo"); pg.fill("[data-campo=plano-n]","16"); pg.dispatch_event("[data-campo=plano-n]","change")
    pg.screenshot(path="capturas/d1-texto.png", full_page=True)
    pg.click("text=Gerar plano"); pg.wait_for_selector("text=O que cada um vai fazer")
    pg.screenshot(path="capturas/d2-revisao.png", full_page=True)
    pg.uncheck("[data-campo=plano-incluir][data-i='10']"); pg.wait_for_timeout(200)
    pg.select_option("[data-campo=plano-parte] >> nth=0", index=3); pg.wait_for_timeout(200)
    pg.click("text=Confirmar e criar tudo"); pg.wait_for_selector(".cal"); pg.wait_for_timeout(500); fechar_previa(pg)
    pg.screenshot(path="capturas/d3-cal.png", full_page=True)
    pg.click("[data-acao=cal-mes][data-id='1']"); pg.wait_for_timeout(100)
    pg.click("text=Trocar perfil"); pg.click("text=João Prado"); pg.screenshot(path="capturas/d4-joao.png", full_page=True)
    b.close()
print("ERROS:", erros); print([d["tipo"] for d in discord], len(discord[-1].get("eventos",[])) if discord else 0)
