# Demonstração: publicar no Discord mostra a prévia da mensagem; editar um item atualiza a planilha sozinho.
# Rode antes, na raiz: python3 -m http.server 8765
import json, sys, importlib.util
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("x", "/dev/null")
discord=[]; google=[]; erros=[]
# o servidor de verdade monta a mensagem; aqui usamos o mesmo código via node
import subprocess
def montar(pedido):
    js = "const d=require('./api/discord.js');const m=d.montar(d.corpoDemonstracao(JSON.parse(process.argv[1])));for(const e of m.embeds)e.footer={text:'repasse · demonstração com dados fictícios'};console.log(JSON.stringify(m.embeds))"
    return json.loads(subprocess.check_output(["node","-e",js,json.dumps(pedido)]))
def rota_discord(route):
    p=json.loads(route.request.post_data or "{}"); discord.append(p)
    route.fulfill(json={"ok":True,"demonstracao":True,"previa":montar(p),"publicado":False,"convite":None})
def rota_google(route):
    if route.request.method=="GET": return route.fulfill(json={"configurado":True,"planilha":"https://docs.google.com/spreadsheets/d/ABC/edit"})
    google.append(json.loads(route.request.post_data or "{}")); route.fulfill(json={"ok":True,"demonstracao":True,"itens":13,"gid":5})
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/api/discord", rota_discord); pg.route("**/api/google**", rota_google)
    pg.goto("http://localhost:8765/"); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.click("text=Marina Costa"); pg.click("button:has-text('Cronograma')")
    pg.click("text=Publicar no Discord"); pg.wait_for_selector(".dc-janela")
    previa = pg.inner_text(".dc-janela")
    pg.screenshot(path="capturas/dc1-previa.png")
    pg.click(".dc-janela .dc-titulo")  # clicar dentro não fecha
    dentro_ok = pg.locator(".dc-janela").count()==1
    pg.click(".dc-cab >> text=Fechar"); fechou = pg.locator(".dc-janela").count()==0
    n_google_antes = len(google)
    # editar um treinamento: muda a data, publica "mudança" e atualiza a planilha sozinho
    pg.locator("button:has-text('Editar')").nth(3).click()
    pg.fill("#ev-data", "2026-12-01"); pg.click("text=Salvar")
    pg.wait_for_selector(".dc-janela"); mud = pg.inner_text(".dc-janela")
    pg.wait_for_timeout(500)
    b.close()
checks = {
  "prévia do cronograma": "Cronograma do processo seletivo" in previa and "dados fictícios" in previa,
  "clicar dentro não fecha": dentro_ok, "Fechar fecha": fechou,
  "mudança com antes e agora": "Mudança no cronograma" in mud and "Antes:" in mud and "Agora:" in mud,
  "pedido de mudança leva o item antes e depois": discord[-1].get("tipo")=="mudanca" and discord[-1]["antes"]["data"]!=discord[-1]["evento"]["data"],
  "planilha atualizada sozinha após editar": len(google) > n_google_antes,
}
print("ERROS:", erros)
for k,v in checks.items(): print(("ok   " if v else "FALHA"), k)
sys.exit(0 if all(checks.values()) and not erros else 1)
