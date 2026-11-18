# Planejamento completo com a resposta da IA simulada. Rode antes, na raiz: python3 -m http.server 8765 e mkdir capturas
import json, sys
from playwright.sync_api import sync_playwright
texto = open("testes/exemplos/planejamento-completo.txt", encoding="utf-8").read()
def ev(tipo, titulo, area, data, **k):
    return {"tipo": tipo, "titulo": titulo, "area": area, "data": data, "entrega": k.get("entrega"), "hora": k.get("hora"), "local": k.get("local", ""), "descricao": k.get("descricao", ""), "pessoas": k.get("pessoas"), "duracaoH": k.get("duracaoH"), "interno": k.get("interno", False)}
areas = [("Comercial","01","05","02","19:00"),("Marketing","01","05","03","19:00"),("Dados","02","07","03","20:30"),("Desenvolvimento","02","08","04","19:00"),("Produto","03","08","04","20:30"),("Gente e Gestão","03","09","05","10:00"),("Inovação","04","10","07","19:00")]
eventos = [ev("aviso","Palestra de abertura do PS","Geral","2026-11-30",hora="19:00",local="Google Meet")]
for a,l,e,t,h in areas:
    eventos.append(ev("desafio",f"Desafio de {a}",a,f"2026-12-{l}",entrega=f"2026-12-{e}"))
    eventos.append(ev("treinamento",f"Treinamento síncrono de {a}",a,f"2026-12-{t}",hora=h,local="canal de voz #treinamentos"))
eventos += [
    ev("etapa","Dinâmica em grupo","Geral","2026-12-12",hora="09:00",local="sala de reuniões do CITi",pessoas=6,duracaoH=3),
    ev("aviso","Divulgação de quem passou para a dinâmica","Geral","2026-12-10"),
    ev("aviso","Planilha de horários das entrevistas","Geral","2026-12-13"),
    ev("etapa","Entrevistas individuais","Geral","2026-12-14",descricao="de 14/12 a 16/12",pessoas=8,duracaoH=5),
    ev("aviso","Reunião geral","Geral","2026-12-08",interno=True),
    ev("aviso","Deliberação da equipe","Geral","2026-12-17",hora="18:00",interno=True),
    ev("aviso","Divulgação do resultado final","Geral","2026-12-18"),
]
resposta = {"eventos": eventos, "observacoes": ["O texto diz que o Rafael prepara o case de Dados e a Beatriz corrige o desafio de Gente e Gestão: ajuste os responsáveis na prévia."]}
erros=[]; discord=[]; planilha=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.route("**/api/discord", lambda r: (discord.append(json.loads(r.request.post_data or "{}")), r.fulfill(json={"ok":True})))
    pg.route("**/api/google", lambda r: (planilha.append(json.loads(r.request.post_data or "{}")), r.fulfill(json={"ok":True})))
    pg.route("**/api/ia", lambda r: r.fulfill(json=resposta))
    pg.goto("http://localhost:8765/")
    pg.evaluate("localStorage.clear()"); pg.reload()
    pg.click("text=Marina Costa")
    pg.click("text=Montar o PS a partir do planejamento")
    pg.fill("textarea", texto); pg.fill("[data-campo=plano-n]","40"); pg.dispatch_event("[data-campo=plano-n]","change")
    pg.click("text=Gerar plano"); pg.wait_for_selector("text=O que cada um vai fazer")
    corpo = pg.inner_text("main")
    pg.screenshot(path="capturas/pc1-revisao.png", full_page=True)
    checks = {
        "observação dos responsáveis": "Rafael prepara o case" in corpo,
        "etiqueta etapa": "Etapa com a equipe" in corpo,
        "etiqueta só equipe": "só equipe" in corpo,
        "participar da dinâmica": "Participar: Dinâmica em grupo" in corpo,
        "comunicar deliberação ausente": "Comunicar: Deliberação" not in corpo,
    }
    n_din = pg.locator("text=Participar: Dinâmica em grupo").count()
    pg.click("text=Confirmar e criar tudo"); pg.wait_for_selector(".cal")
    pg.wait_for_timeout(500)
    pg.click("text=Painel"); pg.click("text=Todas"); pg.wait_for_timeout(200)
    painel = pg.inner_text("main")
    checks["task de dinâmica sem '(1 de 6)'"] = "Participar: Dinâmica em grupo (" not in painel
    checks["seis tasks de dinâmica"] = painel.count("Participar: Dinâmica em grupo") == 6
    pg.click("text=Cronograma"); pg.wait_for_timeout(200)
    pg.screenshot(path="capturas/pc2-cronograma.png", full_page=True)
    # editar a deliberação abre o formulário com "só para a equipe" marcado
    b.close()
print("ERROS:", erros)
for k,v in checks.items(): print(("ok   " if v else "FALHA"), k)
print("discord chamado (demonstração não publica):", len(discord), "| planilha:", len(planilha))
sys.exit(0 if all(checks.values()) and not erros else 1)
