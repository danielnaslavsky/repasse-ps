# Demonstração: "Atualizar planilha" grava na aba Demonstração e o link abre essa aba.
# Rode antes, na raiz: python3 -m http.server 8765
import json, sys
from playwright.sync_api import sync_playwright
posts=[]; erros=[]
def google(route):
    req=route.request
    if req.method=="GET": return route.fulfill(json={"configurado":True,"planilha":"https://docs.google.com/spreadsheets/d/ABC/edit?gid=1#gid=1"})
    posts.append(json.loads(req.post_data or "{}")); route.fulfill(json={"ok":True,"demonstracao":True,"itens":13,"gid":777})
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/api/google**", google)
    pg.route("**/api/discord", lambda r: r.fulfill(json={"ok":True}))
    pg.goto("http://localhost:8765/"); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.click("text=Marina Costa"); pg.click("button:has-text('Cronograma')")
    antes = pg.get_attribute("a:has-text('Abrir planilha')", "href")
    pg.click("text=Atualizar planilha"); pg.wait_for_selector(".toast"); pg.wait_for_timeout(300)
    toast = pg.inner_text(".toast")
    depois = pg.get_attribute("a:has-text('Abrir planilha')", "href")
    rotulo = pg.inner_text("a:has-text('Abrir planilha')")
    b.close()
checks = {
  "enviou com demo:true": bool(posts) and posts[-1].get("demo") is True,
  "mensagem da aba Demonstração": "Demonstração" in toast,
  "link abre a aba gid=777": depois.endswith("/edit#gid=777"),
  "rótulo indica demonstração": "demonstração" in rotulo,
}
print("ERROS:", erros); print("antes:", antes, "| depois:", depois); print("toast:", toast)
for k,v in checks.items(): print(("ok   " if v else "FALHA"), k)
sys.exit(0 if all(checks.values()) and not erros else 1)
