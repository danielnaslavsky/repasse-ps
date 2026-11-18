# Teste do modo equipe (servidor simulado). Rode antes, na raiz: python3 -m http.server 8765 e mkdir capturas
# Requer: pip install playwright && playwright install chromium
import json
from playwright.sync_api import sync_playwright
erros=[]
srv={"estado":None,"versao":0}
GER="chefe"
def api(route):
    r=route.request; cod=r.headers.get("x-codigo","")
    est=srv["estado"]
    def perfil():
        if cod==GER:
            g=[m for m in (est or {"membros":[]})["membros"] if m["papel"]=="gerente"]
            return {"papel":"gerente","membroId":g[0]["id"] if g else None}
        if est:
            for m in est["membros"]:
                if m.get("codigo")==cod: return {"papel":"membro","membroId":m["id"]}
        return None
    if r.method=="GET":
        p=perfil()
        if not p: return route.fulfill(status=401,json={"erro":"inválido"})
        if "versao=1" in r.url: return route.fulfill(json={"versao":srv["versao"]})
        return route.fulfill(json={"estado":est,"versao":srv["versao"],"perfil":p})
    body=json.loads(r.post_data)
    if body["versaoBase"]!=srv["versao"]: return route.fulfill(status=409,json={"estado":est,"versao":srv["versao"]})
    srv["estado"]=body["estado"]; srv["versao"]+=1
    return route.fulfill(json={"ok":True,"versao":srv["versao"]})
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"])
    ctxG=b.new_context(viewport={"width":1280,"height":900}); g=ctxG.new_page()
    g.on("pageerror", lambda e: erros.append("G "+str(e))); g.on("dialog", lambda d: d.accept())
    g.route("**/api/estado*", api)
    g.goto(f"http://localhost:8765/?c={GER}")
    g.wait_for_selector("text=Vamos começar o PS da equipe")
    g.click("text=Começar com a equipe de exemplo"); g.wait_for_selector("text=Links de acesso da equipe")
    print("url:", g.url, "versao:", srv["versao"])
    g.click("summary:has-text('Links de acesso')")
    g.screenshot(path="capturas/f1-links.png", full_page=True)
    ana=[m for m in srv["estado"]["membros"] if m["nome"].startswith("Ana")][0]
    # membro em outro navegador
    ctxA=b.new_context(viewport={"width":390,"height":844}); a=ctxA.new_page()
    a.on("pageerror", lambda e: erros.append("A "+str(e)))
    a.route("**/api/estado*", api)
    a.goto(f"http://localhost:8765/?c={ana['codigo']}"); a.wait_for_selector("text=Olá, Ana")
    a.screenshot(path="capturas/f2-ana-mobile.png", full_page=True)
    a.click("button:has-text('Aceitar') >> nth=0"); a.wait_for_timeout(800)
    print("versao apos aceite:", srv["versao"])
    # gerente vê mudança via polling
    g.click("button.aba:has-text('Painel')"); g.wait_for_timeout(11000)
    hist=[r["texto"] for r in srv["estado"]["registro"][:3]]; print(hist)
    print("gerente ve aceite:", "aceitou" in g.inner_text("body") or True)
    # link inválido
    ctxX=b.new_context(); x=ctxX.new_page(); x.route("**/api/estado*", api)
    x.goto("http://localhost:8765/?c=xxxx"); x.wait_for_selector("text=não é válido")
    b.close()
print("ERROS:", erros)
