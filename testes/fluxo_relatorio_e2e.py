# Relatório do PS na demonstração. Rode antes, na raiz: python3 -m http.server 8765
import sys
from playwright.sync_api import sync_playwright
erros=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":1280,"height":900}); ctx.grant_permissions(["clipboard-read","clipboard-write"], origin="http://localhost:8765")
    pg=ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/api/**", lambda r: r.fulfill(status=503, json={"erro":"offline"}))
    pg.goto("http://localhost:8765/"); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.click("text=Marina Costa"); pg.click("button.aba:has-text('Relatório')"); pg.wait_for_selector("text=Para o próximo PS")
    corpo=pg.inner_text("main"); pg.screenshot(path="capturas/r1-relatorio.png", full_page=True)
    pg.click("text=Copiar como texto"); pg.wait_for_selector(".toast")
    copiado=pg.evaluate("navigator.clipboard.readText()")
    m=b.new_page(viewport={"width":390,"height":844}); m.on("pageerror", lambda e: erros.append(str(e)))
    m.route("**/api/**", lambda r: r.fulfill(status=503, json={"erro":"offline"}))
    m.goto("http://localhost:8765/"); m.click("text=Marina Costa"); m.click("button.aba:has-text('Relatório')"); m.wait_for_selector("text=Por pessoa")
    m.screenshot(path="capturas/r2-celular.png", full_page=True)
    largura=m.evaluate("document.documentElement.scrollWidth")
    b.close()
checks={"cabeçalho e números":"Relatório do PS" in corpo and "de trabalho" in corpo,
 "lições":"não receberam nenhuma task" in corpo,
 "tabelas":"Por subárea" in corpo and "Por tipo de task" in corpo,
 "copiou o texto": copiado.startswith("Relatório do PS (repasse)"),
 "sem rolagem lateral no celular": largura<=392}
print("ERROS:",erros, "| largura celular:", largura)
for k,v in checks.items(): print(("ok   " if v else "FALHA"),k)
sys.exit(0 if all(checks.values()) and not erros else 1)
