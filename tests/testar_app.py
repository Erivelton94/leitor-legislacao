"""Testes automáticos do Leitor Inteligente de Legislação.

Abre o app num navegador de verdade (Chromium, tamanho de iPad) e confere as funções
principais. Roda sozinho no GitHub a cada atualização do app (Actions → "Testes do app").
Usa os dados reais do repositório (leis e cadernos) e arquivos fictícios de tests/fixtures.

Para rodar no computador:  pip install playwright && python -m playwright install chromium
                            python tests/testar_app.py
"""
import asyncio, http.server, json, os, sys, threading, functools, datetime
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import github_falso

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(RAIZ, "tests", "fixtures")
PORTA = 8899
U = f"http://localhost:{PORTA}/"
resultados = []   # (nome, ok, detalhe)


def servir():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("localhost", PORTA), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def confere(nome, cond, detalhe=""):
    resultados.append((nome, bool(cond), detalhe))
    print(("✅" if cond else "❌"), nome, ("— " + str(detalhe)) if detalhe else "")


async def novo_aparelho(b, largura=1180, altura=820, leis=("lep", "codigo-penal")):
    ctx = await b.new_context(viewport={"width": largura, "height": altura}, accept_downloads=True, has_touch=True)
    pg = await ctx.new_page()
    pg.erros = []
    pg.on("pageerror", lambda e: pg.erros.append(str(e)))
    pg.on("dialog", lambda d: asyncio.ensure_future(d.accept("Teste") if d.type == "prompt" else d.accept()))
    await pg.goto(U + "#/acervo")
    hoje = datetime.date.today().isoformat()
    info = {l: {"hash": "x", "versao": "2026-01-01"} for l in leis}
    await pg.evaluate(f"localStorage.setItem('info-leis', {json.dumps(json.dumps(info))}); localStorage.setItem('lembrete-backup-dia', JSON.stringify('{hoje}')); localStorage.setItem('boas-vindas-vista', 'true')")
    await pg.reload(); await pg.wait_for_timeout(3000)
    return ctx, pg


async def testes(b):
    # 1) Abertura e leitura
    ctx, pg = await novo_aparelho(b)
    confere("App abre sem erros", not pg.erros, pg.erros[:2])
    await pg.evaluate("location.hash='#/lei/lep/112'"); await pg.wait_for_timeout(2000)
    n = await pg.locator("#texto-lei .artigo").count()
    confere("Lei de Execução Penal abre com os artigos", n > 100, f"{n} artigos")

    # 2) Grifo e anotação
    await pg.evaluate("""()=>{const div=document.getElementById('art-112');const w=document.createTreeWalker(div,NodeFilter.SHOW_TEXT);let n;
      while((n=w.nextNode())){const i=n.data.indexOf('pena');if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+4);getSelection().removeAllRanges();getSelection().addRange(r);return;}}}""")
    await pg.wait_for_timeout(600); await pg.click("[data-cor=verde]"); await pg.wait_for_timeout(300)
    confere("Grifar um trecho", await pg.locator("#art-112 mark.grifo").count() == 1)

    # 3) Caneta: traço, ícone, borracha, desfazer
    await pg.evaluate("document.getElementById('art-112').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(300)
    await pg.click("#btn-caneta")
    bx = await pg.locator("#art-112").bounding_box()
    x, y = bx["x"] + 80, bx["y"] + 40
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 250, y, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(300)
    await pg.evaluate("caneta.ferramenta='icone'; montarBarraCaneta()"); await pg.mouse.click(bx["x"] - 15, y); await pg.wait_for_timeout(300)
    confere("Caneta desenha e coloca ícone", await pg.locator("#art-112 svg.tinta path").count() >= 1 and await pg.locator("#art-112 svg.tinta text").count() == 1)
    await pg.evaluate("caneta.ferramenta='borracha'; caneta.modoBorracha='traco'; montarBarraCaneta()")
    await pg.mouse.move(x + 100, y - 15); await pg.mouse.down(); await pg.mouse.move(x + 100, y + 15, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(300)
    apagou = await pg.locator("#art-112 svg.tinta path").count() == 0
    await pg.click("#cn-desfazer"); await pg.wait_for_timeout(300)
    confere("Borracha apaga e Desfazer traz de volta", apagou and await pg.locator("#art-112 svg.tinta path").count() == 1)
    await pg.click("#cn-fechar")

    # 4) Desenho acompanha o texto com outra letra
    await pg.evaluate("ajustes.fonte=23; aplicarAjustes()"); await pg.wait_for_timeout(500)
    confere("Desenho aparece ajustado com outro tamanho de letra", await pg.locator("#art-112 svg.tinta .adaptado").count() >= 1)
    await pg.evaluate("ajustes.fonte=19; aplicarAjustes()"); await pg.wait_for_timeout(300)

    # 5) Zoom próprio: barra parada
    await pg.click("#btn-caneta"); b0 = await pg.locator("#barra-caneta").bounding_box()
    cdp = await ctx.new_cdp_session(pg)
    pts = lambda d: [{"x": 590 - d / 2, "y": 400, "id": 1}, {"x": 590 + d / 2, "y": 400, "id": 2}]
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pts(150)})
    for k in range(1, 9):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pts(150 + 20 * k)}); await pg.wait_for_timeout(30)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await pg.wait_for_timeout(400)
    b1 = await pg.locator("#barra-caneta").bounding_box()
    z = await pg.evaluate("zoomConteudo")
    confere("Zoom com pinça amplia e a barra fica parada", z > 1.3 and round(b0["y"]) == round(b1["y"]), f"zoom {z}")
    await pg.click("#cn-fechar"); await pg.evaluate("aplicarZoom(1)")

    # 6) Revisão rápida e ouvir
    await pg.goto(U + "#/revisao/lep"); await pg.wait_for_timeout(1500)
    confere("Revisão rápida mostra só o que foi marcado", await pg.evaluate("[...document.querySelectorAll('#texto-lei .artigo')].map(d=>d.dataset.art).join()") == "112")
    await pg.goto(U + "#/lei/lep/112"); await pg.wait_for_timeout(1500)
    fala = await pg.evaluate("textoParaFala(document.getElementById('art-112'))[0]")
    confere("Texto para ouvir a lei é preparado", fala.startswith("Artigo 112"), fala[:40])

    # 7) Questões: resolver e importar caderno de PDF
    await pg.goto(U + "#/questoes"); await pg.wait_for_timeout(1500)
    await pg.click("#importar-caderno"); await pg.set_input_files("#impq-arq", os.path.join(FIX, "caderno-teste.pdf"))
    await pg.wait_for_selector("#impq-salvar", timeout=60000)
    previa = await pg.inner_text("#impq-res")
    confere("Importar caderno de PDF lê as questões", "3 questões" in previa, previa.replace("\n", " ")[:80])
    await pg.click("#impq-salvar"); await pg.wait_for_timeout(1200); await pg.click("[data-fechar]")
    cad = await pg.evaluate("Object.values(estado.cadernos).find(c=>c.local)")
    ok = cad and [q["gabarito"] for q in cad["questoes"]] == ["C", "A", "B"] and cad["questoes"][1]["vinculo"]["de"] == "157"
    confere("Gabaritos, tipos e artigos das questões importadas", ok)
    await pg.goto(U + f"#/caderno/{cad['id']}"); await pg.wait_for_timeout(1200)
    antes_r = await pg.evaluate("itens('resposta').length")
    await pg.locator("#conteudo .alt").first.click(); await pg.click("#btn-responder"); await pg.wait_for_timeout(600)
    depois_r = await pg.evaluate("itens('resposta').length")
    confere("Resolver questão registra a resposta", depois_r == antes_r + 1, f"{antes_r} → {depois_r}; {(await pg.inner_text('#conteudo'))[:80]}")

    # 8) Resumos: Word e PDF no visual original, ícone no PDF
    await pg.goto(U + "#/resumos"); await pg.wait_for_timeout(800)
    await pg.click("#importar-resumos")
    await pg.set_input_files("#imp-arquivos", [os.path.join(FIX, "resumo-teste.docx"), os.path.join(FIX, "resumo-teste.pdf")])
    await pg.wait_for_selector("#imp-progresso .lista-cartoes", timeout=60000)
    confere("Importar Word e PDF", "2 de 2" in await pg.inner_text("#imp-progresso"))
    await pg.click("[data-fechar]")
    for _ in range(30):                                   # as miniaturas são feitas uma de cada vez
        if await pg.evaluate("document.querySelectorAll('.miniatura > img, .miniatura > .mini-html').length") == 2: break
        await pg.wait_for_timeout(500)
    mini = await pg.evaluate("[document.querySelectorAll('.tile-resumo').length, document.querySelectorAll('.miniatura > img, .miniatura > .mini-html').length]")
    confere("Miniaturas da primeira página", mini[1] == 2, f"{mini[1]} de {mini[0]}")
    await pg.click("text=resumo-teste.pdf"); await pg.wait_for_timeout(2500)
    confere("PDF abre no visual original", await pg.locator("canvas.canvas-pagina").count() >= 1)
    await pg.click("#res-caneta"); await pg.evaluate("caneta.ferramenta='icone'; montarBarraCaneta()")
    bp = await pg.locator("#art-p1").bounding_box()
    await pg.evaluate("""([x,y])=>{const t=document.elementFromPoint(x,y);const ev=tp=>t.dispatchEvent(new PointerEvent(tp,{pointerId:5,pointerType:'pen',clientX:x,clientY:y,bubbles:true,cancelable:true}));ev('pointerdown');ev('pointerup');}""", [bp["x"] + 200, bp["y"] + 120])
    await pg.wait_for_timeout(300)
    confere("Ícone com o Pencil no PDF", await pg.locator("#art-p1 svg.tinta text").count() == 1)
    await pg.click("#cn-fechar")
    await pg.goto(U + "#/resumos"); await pg.wait_for_timeout(600); await pg.click("text=resumo-teste.docx"); await pg.wait_for_timeout(2500)
    confere("Word abre no visual original", await pg.locator("section.docx").count() >= 1 and await pg.locator("#texto-lei img").count() == 1)

    # 9) Backup completo e restauração exata em outro aparelho
    await pg.goto(U + "#/ajustes"); await pg.wait_for_timeout(800)
    async with pg.expect_download() as dl:
        await pg.click("#btn-exportar")
    arq = os.path.join(RAIZ, "tests", "_backup-teste.json")
    await (await dl.value).save_as(arq)
    antes = await pg.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length")
    ctx2, pg2 = await novo_aparelho(b, 820, 1180, leis=("maria-da-penha",))
    await pg2.goto(U + "#/ajustes"); await pg2.wait_for_timeout(800)
    await pg2.set_input_files("#entrada-backup", arq); await pg2.wait_for_timeout(800)
    await pg2.click("#rest-exato"); await pg2.wait_for_timeout(4000)
    depois = await pg2.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length")
    leis2 = await pg2.evaluate("Object.keys(lerLS('info-leis',{})).sort().join()")
    confere("Backup completo restaura igual em outro aparelho", antes == depois and leis2 == "codigo-penal,lep", f"{antes} → {depois} itens; leis: {leis2}")
    os.remove(arq)

    # 10) Constituição: ADCT depois da parte principal (quando o robô já gravou a ordem)
    cf = os.path.join(RAIZ, "dados", "leis", "cf-1988.json")
    if os.path.exists(cf) and all("ordem" in a for a in json.load(open(cf, encoding="utf-8"))["artigos"].values()):
        ctx3, pg3 = await novo_aparelho(b, leis=("cf-1988",))
        await pg3.evaluate("location.hash='#/lei/cf-1988/250'"); await pg3.wait_for_timeout(2500)
        seq = await pg3.evaluate("[...document.querySelectorAll('#texto-lei .artigo')].map(d=>d.dataset.art)")
        k = seq.index("250") if "250" in seq else -1
        confere("Constituição: ADCT vem depois do Art. 250", k >= 0 and seq[k + 1] == "1#2", seq[k + 1:k + 3] if k >= 0 else "sem art. 250")
        await ctx3.close()

    # 10b) Celular: nada passa da largura da tela
    ctx6, pg6 = await novo_aparelho(b, 390, 844)
    await pg6.evaluate("location.hash='#/lei/lep/112'"); await pg6.wait_for_timeout(2000)
    await pg6.click("#btn-caneta"); await pg6.wait_for_timeout(300)
    fx = await pg6.locator("#cn-fechar").bounding_box()
    ok_lei = await pg6.evaluate("document.documentElement.scrollWidth") <= 390 and fx["x"] + fx["width"] <= 390
    await pg6.evaluate("alternarCaneta(false)")
    await pg6.goto(U + "#/questoes"); await pg6.wait_for_timeout(1200)
    ok_q = await pg6.evaluate("document.documentElement.scrollWidth") <= 390
    confere("Celular: leitura, caneta e questões cabem na tela", ok_lei and ok_q)
    await ctx6.close()

    # 11) Boas-vindas na primeira abertura
    ctx4 = await b.new_context(viewport={"width": 1180, "height": 820}); pg4 = await ctx4.new_page()
    await pg4.goto(U + "#/acervo"); await pg4.wait_for_timeout(2500)
    confere("Boas-vindas na primeira vez", "Bem-vindo" in (await pg4.inner_text("#painel-caixa") if await pg4.is_visible("#painel") else ""))
    await ctx4.close()

    # 12) Sincronização entre dois aparelhos (GitHub de mentira, com senha)
    github_falso.iniciar(PORTA + 1)
    async def conectar(pg_, senha):
        await pg_.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}'))")
        await pg_.evaluate("fecharPainel()"); await pg_.goto(U + "#/acervo"); await pg_.wait_for_timeout(500)
        await pg_.goto(U + "#/ajustes"); await pg_.wait_for_timeout(1000)
        await pg_.click("#sync-github"); await pg_.fill("#gh-repo", "Eu/dados"); await pg_.fill("#gh-token", github_falso.TOKEN); await pg_.fill("#gh-senha", senha)
        await pg_.click("#gh-conectar"); await pg_.wait_for_timeout(6000)
    await conectar(pg, "senha-teste")
    embaralhado = all(v[:4] == b"LLC1" for k, v in github_falso.ARQUIVOS.items() if k != "cripto.json")
    confere("Sincronização envia tudo protegido pela senha", len(github_falso.ARQUIVOS) >= 4 and embaralhado, f"{len(github_falso.ARQUIVOS)} arquivos na nuvem")
    ctx5, pg5 = await novo_aparelho(b, 820, 1180, leis=())
    await conectar(pg5, "senha-teste")
    iguais = await pg5.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length") == await pg.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length")
    confere("Outro aparelho recebe tudo da nuvem", iguais and await pg5.evaluate("(async()=>(await bdTodos('arquivos')).length)()") == 2)
    await pg5.evaluate("salvarItem({id:'sinc-1',tipo:'anotacao',lei:'lep',art:'1',nota:'do outro aparelho',criadoEm:agoraISO()})")
    await pg5.evaluate("clearTimeout(sync.tempo); sincronizar('teste')"); await pg5.wait_for_timeout(3000)
    await pg.evaluate("sincronizar('teste')"); await pg.wait_for_timeout(3000)
    confere("Edição chega ao primeiro aparelho", await pg.evaluate("(estado.itens.get('sinc-1')||{}).nota") == "do outro aparelho")
    await ctx5.close()

    erros = pg.erros + pg2.erros
    confere("Nenhum erro de programa durante os testes", not erros, erros[:3])
    await ctx.close(); await ctx2.close()


async def main():
    srv = servir()
    async with async_playwright() as p:
        local = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
        b = await p.chromium.launch(executable_path=local if os.path.exists(local) else None, args=["--no-sandbox"])
        try:
            await testes(b)
        except Exception as e:
            confere("Os testes rodaram até o fim", False, repr(e)[:300])
        await b.close()
    srv.shutdown()
    falhas = [r for r in resultados if not r[1]]
    resumo = f"## Testes do app: {len(resultados) - len(falhas)} de {len(resultados)} passaram\n\n| | Teste | Detalhe |\n|---|---|---|\n" + \
        "\n".join(f"| {'✅' if ok else '❌'} | {n} | {str(d)[:120]} |" for n, ok, d in resultados)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(resumo + "\n")
    print("\n" + resumo)
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    asyncio.run(main())
