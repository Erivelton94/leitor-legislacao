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
import google_falso
import re as _re

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


def nomes_repetidos():
    """Duas funções com o mesmo nome em arquivos diferentes: a segunda apaga a primeira sem avisar."""
    vistos, repetidos = {}, []
    for nome in sorted(os.listdir(os.path.join(RAIZ, "js"))):
        for m in _re.finditer(r"^(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)", open(os.path.join(RAIZ, "js", nome), encoding="utf-8").read(), _re.M):
            if m.group(1) in vistos: repetidos.append(f"{m.group(1)} ({vistos[m.group(1)]} e {nome})")
            vistos[m.group(1)] = nome
    return repetidos


async def testes(b):
    rep = nomes_repetidos()
    confere("Nenhum nome de função repetido entre os arquivos", not rep, rep[:3])
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

    # 3b) Caneta nova: cor por ferramenta, pressão, rabiscar para apagar, laço
    await pg.evaluate("""()=>{window.__pen=(pts,pr)=>{const el0=document.elementFromPoint(pts[0][0],pts[0][1]);
      const ev=(tp,[x,y],p)=>((tp==='pointerdown'?el0:document.elementFromPoint(x,y))||el0).dispatchEvent(new PointerEvent(tp,{pointerId:7,pointerType:'pen',pressure:p,clientX:x,clientY:y,bubbles:true,cancelable:true}));
      ev('pointerdown',pts[0],pr?pr[0]:0.5); for(let i=1;i<pts.length;i++) ev('pointermove',pts[i],pr?pr[i]:0.5); ev('pointerup',pts[pts.length-1],0);}}""")
    await pg.click("#btn-caneta")
    await pg.click("[data-ferramenta=caneta]"); await pg.click("#cn-opcoes"); await pg.click("[data-cor-caneta='#1E5BD8']")
    await pg.click("[data-ferramenta=marca]"); await pg.click("#cn-opcoes"); await pg.click("[data-cor-caneta='#15803D']")
    await pg.click("[data-ferramenta=caneta]")
    cores = await pg.evaluate("[caneta.cor, caneta.corMarca, JSON.parse(localStorage.getItem('preferencias-caneta')).corCaneta]")
    confere("Cada ferramenta lembra a sua cor", cores == ["#1E5BD8", "#15803D", "#1E5BD8"], cores)
    await pg.evaluate("document.getElementById('art-112').scrollIntoView({block:'start'}); scrollBy(0,-80)"); await pg.wait_for_timeout(300)
    bx = await pg.locator("#art-112").bounding_box()
    y2 = bx["y"] + 90
    await pg.evaluate("([x,y])=>__pen(Array.from({length:30},(_,i)=>[x+i*6,y+Math.sin(i/4)*3]), Array.from({length:30},(_,i)=>0.2+i*0.025))", [bx["x"] + 60, y2])
    await pg.wait_for_timeout(300)
    info = await pg.evaluate("(()=>{const t=tintaVisivel('lep','112'); const u=t.tracos[t.tracos.length-1]; return [!!u.pr, u.pr&&u.pr.length*2===u.pts.length, document.querySelectorAll('#art-112 svg.tinta g[data-traco] path').length]})()")
    confere("Traço com pressão do Pencil (espessura varia)", info[0] and info[1] and info[2] >= 2, info)
    antes_n = await pg.evaluate("tintaVisivel('lep','112').tracos.length")
    zig = [[bx["x"] + 60 + (abs((j % 20) - 10) * 18), y2 - 8 + j * 0.2] for j in range(81)]   # 8 idas e voltas
    await pg.evaluate("(pts)=>__pen(pts)", zig); await pg.wait_for_timeout(300)
    depois_n = await pg.evaluate("tintaVisivel('lep','112').tracos.length")
    confere("Rabiscar por cima apaga o traço", depois_n == antes_n - 1, f"{antes_n} → {depois_n}")
    await pg.click("#cn-desfazer"); await pg.wait_for_timeout(300)
    confere("Desfazer traz de volta o que o rabisco apagou", await pg.evaluate("tintaVisivel('lep','112').tracos.length") == antes_n)
    # laço: contorna o traço, arrasta, troca a cor e apaga
    await pg.click("[data-ferramenta=laco]")
    x0 = bx["x"] + 40
    await pg.evaluate("([x,y])=>__pen([[x,y-30],[x+220,y-30],[x+220,y+30],[x,y+30],[x,y-29]])", [x0, y2]); await pg.wait_for_timeout(300)
    sel = await pg.evaluate("caneta.selecao ? caneta.selecao.partes.reduce((s,p)=>s+p.tr.size,0) : 0")
    caixa = await pg.locator("#selecao-laco").bounding_box()
    confere("Laço seleciona o que foi contornado", sel >= 1 and caixa and caixa["width"] > 50, sel)
    x_antes = await pg.evaluate("(()=>{const t=tintaVisivel('lep','112');return t.tracos.find(u=>u.pr).pts[0]})()")
    await pg.mouse.move(caixa["x"] + caixa["width"] / 2, caixa["y"] + caixa["height"] / 2); await pg.mouse.down()
    await pg.mouse.move(caixa["x"] + caixa["width"] / 2 + 100, caixa["y"] + caixa["height"] / 2 + 20, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(400)
    x_depois = await pg.evaluate("(()=>{const t=tintaVisivel('lep','112');return t.tracos.find(u=>u.pr).pts[0]})()")
    confere("Arrastar a seleção move a escrita", abs(x_depois - x_antes - 100) < 3, f"{x_antes} → {x_depois}")
    alca = await pg.locator("#selecao-laco .alca-laco").bounding_box(); esp0 = await pg.evaluate("tintaVisivel('lep','112').tracos.find(u=>u.pr).esp")
    await pg.mouse.move(alca["x"] + 14, alca["y"] + 14); await pg.mouse.down(); await pg.mouse.move(alca["x"] + 120, alca["y"] + 40, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(400)
    esp1 = await pg.evaluate("tintaVisivel('lep','112').tracos.find(u=>u.pr).esp")
    confere("Puxar o canto muda o tamanho", esp1 > esp0 * 1.1, f"{esp0} → {esp1}")
    await pg.click("#selecao-laco [data-cor-laco='#D32F2F']"); await pg.wait_for_timeout(300)
    confere("Trocar a cor da seleção", await pg.evaluate("tintaVisivel('lep','112').tracos.find(u=>u.pr).cor") == "#D32F2F")
    await pg.click("#selecao-laco [data-laco=apagar]"); await pg.wait_for_timeout(300)
    confere("Apagar a seleção", await pg.evaluate("!tintaVisivel('lep','112').tracos.some(u=>u.pr)") and not await pg.locator("#selecao-laco").is_visible())
    await pg.click("#cn-desfazer"); await pg.wait_for_timeout(300)
    # traço ao vivo numa camada própria: aparece na hora, sem mexer no desenho do artigo até soltar
    await pg.click("[data-ferramenta=caneta]")
    bx = await pg.locator("#art-112").bounding_box(); y3 = bx["y"] + 120
    vivo = await pg.evaluate("""([x,y])=>{const el=document.elementFromPoint(x,y); const ev=(tp,xx,p)=>el.dispatchEvent(new PointerEvent(tp,{pointerId:9,pointerType:'pen',pressure:p,clientX:xx,clientY:y,bubbles:true,cancelable:true}));
        const antes=document.querySelectorAll('#art-112 svg.tinta [data-traco]').length; ev('pointerdown',x,0.5);
        const t0=performance.now(); for(let i=1;i<=400;i++) ev('pointermove',x+i*0.8,0.3+0.4*Math.abs(Math.sin(i/30)));
        const ms=(performance.now()-t0)/400;
        const cv=document.querySelector('canvas.tinta-ao-vivo'); const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let pintado=0; for(let i=3;i<d.length;i+=4) if(d[i]) {pintado++; if(pintado>50) break;}
        const durante=document.querySelectorAll('#art-112 svg.tinta [data-traco]').length;
        ev('pointerup',x+320,0); const d2=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let resto=0; for(let i=3;i<d2.length;i+=4) if(d2[i]) {resto++; break;}
        return [ms, pintado>50, durante===antes, document.querySelectorAll('#art-112 svg.tinta [data-traco]').length===antes+1, resto===0];}""", [bx["x"] + 60, y3])
    confere("Traço ao vivo numa camada própria (sem redesenhar o artigo)", all(vivo[1:]), vivo)
    confere("Caneta rápida: cada movimento do Pencil leva menos de 1,5 ms", vivo[0] < 1.5, f"{vivo[0]:.3f} ms por movimento")
    await pg.click("#cn-desfazer"); await pg.wait_for_timeout(200)
    # suavização: desligada guarda o traço exato; ligada tira a tremedeira e termina onde o Pencil parou
    async def traco_tremido(modo):
        await pg.evaluate(f"caneta.suavizacao='{modo}'")
        return await pg.evaluate("""async ([x,y])=>{const el=document.elementFromPoint(x,y); const ev=(tp,xx,yy)=>el.dispatchEvent(new PointerEvent(tp,{pointerId:11,pointerType:'pen',pressure:0.5,clientX:xx,clientY:yy,bubbles:true,cancelable:true}));
            ev('pointerdown',x,y); const ys=[];
            for(let i=1;i<=60;i++){ const yy=y+(i%2?1.6:-1.6); ys.push(yy); ev('pointermove',x+i*3,yy); await new Promise(r=>setTimeout(r,8)); }
            ev('pointerup',x+180,y+1.6); await new Promise(r=>setTimeout(r,200));
            const t=tintaVisivel('lep','112'); const u=t.tracos[t.tracos.length-1]; const r=document.getElementById('art-112').getBoundingClientRect();
            const yl=[]; for(let i=3;i<u.pts.length-2;i+=2) yl.push(u.pts[i]); const m=yl.reduce((a,b)=>a+b,0)/yl.length; const dp=Math.sqrt(yl.reduce((a,b)=>a+(b-m)**2,0)/yl.length);
            return [dp, Math.abs(u.pts[u.pts.length-2]-(x+180-r.left)) < 1.5];}""", [bx["x"] + 60, y3 + 30])
    sem = await traco_tremido("nenhuma"); com = await traco_tremido("media")
    confere("Suavização: desligada guarda o traço exato; ligada tira a tremedeira e termina no ponto certo", sem[0] > 1.2 and com[0] < sem[0] * 0.5 and com[1], f"tremor sem {sem[0]:.2f} · com {com[0]:.2f}")
    await pg.evaluate("caneta.suavizacao='nenhuma'")
    await pg.click("#cn-desfazer"); await pg.click("#cn-desfazer"); await pg.wait_for_timeout(200)
    tracos_lei = await pg.evaluate("tintaVisivel('lep','112').tracos.length")
    await pg.click("#cn-fechar")

    # 4) Desenho acompanha o texto com outra letra
    await pg.evaluate("ajustes.fonte=23; aplicarAjustes()"); await pg.wait_for_timeout(500)
    confere("Desenho aparece ajustado com outro tamanho de letra", await pg.locator("#art-112 svg.tinta .adaptado").count() >= 1)
    await pg.evaluate("ajustes.fonte=19; aplicarAjustes()"); await pg.wait_for_timeout(300)

    # 5) Zoom próprio: barra parada
    sob = "document.elementFromPoint(590,400)?.closest('.artigo')?.id"
    await pg.click("#btn-caneta"); b0 = await pg.locator("#barra-caneta").bounding_box()
    art_antes = await pg.evaluate(sob)
    cdp = await ctx.new_cdp_session(pg)
    pts = lambda d: [{"x": 590 - d / 2, "y": 400, "id": 1}, {"x": 590 + d / 2, "y": 400, "id": 2}]
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pts(150)})
    dormindo = 0
    for k in range(1, 9):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pts(150 + 20 * k)}); await pg.wait_for_timeout(30)
        if k == 4: dormindo = await pg.evaluate("document.querySelectorAll('#texto-lei .dormindo').length")
    await pg.wait_for_timeout(100)
    antes_soltar = await pg.evaluate("(()=>{const el=document.elementFromPoint(590,400).closest('#texto-lei > *'); window._alvo=el; return el.getBoundingClientRect().top})()")
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await pg.wait_for_timeout(400)
    depois_soltar = await pg.evaluate("window._alvo.getBoundingClientRect().top")
    confere("Soltar a pinça não dá pulo (o texto entre os dedos fica no lugar)", abs(depois_soltar - antes_soltar) < 3, f"{antes_soltar:.1f} → {depois_soltar:.1f}")
    acordados = await pg.evaluate("document.querySelectorAll('#texto-lei .dormindo').length === 0 && !!observador")
    confere("Pinça em lei grande: artigos longe da tela dormem durante o gesto e acordam ao soltar", dormindo > 100 and acordados, f"{dormindo} artigos dormindo")
    b1 = await pg.locator("#barra-caneta").bounding_box()
    z = await pg.evaluate("zoomConteudo")
    confere("Zoom com pinça amplia e a barra fica parada", z > 1.3 and round(b0["y"]) == round(b1["y"]), f"zoom {z}")
    lei_zoom = await pg.evaluate(f"[!document.querySelector('.zoom-rolagem').classList.contains('propria'), document.getElementById('texto-lei').style.willChange === '', {sob}]")
    confere("Zoom nas leis: página rola como antes e o artigo entre os dedos continua no lugar", lei_zoom[0] and lei_zoom[1] and lei_zoom[2] == art_antes, f"{lei_zoom} (antes {art_antes})")
    await pg.click("#cn-fechar"); await pg.evaluate("aplicarZoom(1)")

    # 5b) Ordem das leis: alterada sobe; fixada fica em primeiro; PDF da lei
    await pg.goto(U + "#/acervo"); await pg.wait_for_timeout(800)
    ordem = await pg.evaluate("[...document.querySelectorAll('.lei-item')].map(e=>e.querySelector('[data-abrir]').dataset.abrir)")
    await pg.evaluate("alternarFixada('codigo-penal')"); await pg.evaluate("rotear()"); await pg.wait_for_timeout(600)
    ordem2 = await pg.evaluate("[...document.querySelectorAll('.lei-item')].map(e=>e.querySelector('[data-abrir]').dataset.abrir)")
    confere("Lei alterada sobe e lei fixada fica em primeiro", ordem[0] == "lep" and ordem2[0] == "codigo-penal", f"{ordem} → {ordem2}")
    await pg.evaluate("alternarFixada('codigo-penal')")
    tam = await pg.evaluate("(async()=>{ const a=prepararLei(await leiDoCache('lep')).arts; const b=await gerarPdfLei('lep', 0, 9, {grifos:true}); return b.size; })()")
    confere("Gerar PDF de um trecho da lei", tam > 3000, f"{tam} bytes")
    com, sem = await pg.evaluate("""(async()=>{ const arts=prepararLei(await leiDoCache('lep')).arts; const k=arts.findIndex(a=>a.id==='112');
        const c=await gerarPdfLei('lep', k, k, {grifos:true, desenhos:true, notas:true}); const s=await gerarPdfLei('lep', k, k, {grifos:false, desenhos:false, notas:false});
        return [c.size, s.size]; })()""")
    confere("PDF da lei leva caneta, ícones e grifos", com > sem + 500, f"com marcações {com} bytes, sem {sem} bytes")

    # 6) Revisão rápida e ouvir
    await pg.goto(U + "#/revisao/lep"); await pg.wait_for_timeout(1500)
    confere("Revisão rápida mostra só o que foi marcado", await pg.evaluate("[...document.querySelectorAll('#texto-lei .artigo')].map(d=>d.dataset.art).join()") == "112")
    confere("Revisão rápida na largura normal da leitura", await pg.evaluate("document.getElementById('texto-lei').getBoundingClientRect().width") > 500)
    await pg.goto(U + "#/lei/lep/112"); await pg.wait_for_timeout(1500)
    fala = await pg.evaluate("textoParaFala(document.getElementById('art-112'))[0]")
    confere("Texto para ouvir a lei é preparado", fala.startswith("Artigo 112"), fala[:40])

    # 7) Questões: resolver e importar caderno de PDF
    await pg.goto(U + "#/questoes/cadernos"); await pg.wait_for_timeout(1500)
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
    zoom = await pg.evaluate("""async()=>{ aplicarZoom(2.5); await new Promise(r=>setTimeout(r,600)); const rol=document.querySelector('.zoom-rolagem');
        const propria=rol.classList.contains('propria') && getComputedStyle(rol).overflowY==='auto'; const st0=rol.scrollTop, sl0=rol.scrollLeft; rolarConteudo(120, 400); const anda=rol.scrollTop>st0 && rol.scrollLeft>sl0;
        await new Promise(r=>setTimeout(r,800)); const maior=Math.max(...[...document.querySelectorAll('canvas.canvas-pagina')].map(c=>c.width*c.height));
        aplicarZoom(zoomBase); const volta=!rol.classList.contains('propria'); return [propria, anda, maior <= 6.1e6, volta, maior]; }""")
    confere("Zoom: o texto rola nas duas direções num só gesto e as páginas ficam leves", all(zoom[:4]), zoom)
    desf = await pg.evaluate("[pilhaDoc().hist.length, document.getElementById('cn-desfazer').disabled]")
    await pg.click("#cn-desfazer"); await pg.wait_for_timeout(300)
    lei_ok = await pg.evaluate("(estado.itens.get(idTinta('lep','112',19))||{tracos:[]}).tracos.length")
    confere("Desfazer separado: no resumo desfaz só o resumo, a lei fica igual", desf == [1, False] and await pg.locator("#art-p1 svg.tinta text").count() == 0 and lei_ok == tracos_lei, f"{desf}, lei {lei_ok}/{tracos_lei}")
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
    await pg6.goto(U + "#/leiseca"); await pg6.wait_for_timeout(800)
    ok_ls = await pg6.evaluate("document.documentElement.scrollWidth") <= 390
    confere("Celular: leitura, caneta e questões cabem na tela", ok_lei and ok_q and ok_ls, [ok_lei, ok_q, ok_ls])
    await ctx6.close()

    # 11) Boas-vindas na primeira abertura (e no modo claro, mesmo com o aparelho no escuro)
    ctx4 = await b.new_context(viewport={"width": 1180, "height": 820}, color_scheme="dark"); pg4 = await ctx4.new_page()
    await pg4.goto(U + "#/acervo"); await pg4.wait_for_timeout(2500)
    confere("Boas-vindas na primeira vez", "Bem-vindo" in (await pg4.inner_text("#painel-caixa") if await pg4.is_visible("#painel") else ""))
    confere("Primeira abertura no modo claro", await pg4.evaluate("ajustes.tema") == "light" and await pg4.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(245, 246, 242)")
    await ctx4.close()

    # 12) Sincronização entre dois aparelhos (GitHub de mentira, com senha)
    github_falso.iniciar(PORTA + 1)
    async def conectar(pg_, senha):
        await pg_.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}'))")
        await pg_.evaluate("fecharPainel()"); await pg_.goto(U + "#/acervo"); await pg_.wait_for_timeout(500)
        await pg_.goto(U + "#/ajustes"); await pg_.wait_for_timeout(1000)
        await pg_.click("#sync-github"); await pg_.fill("#gh-repo", "Eu/dados"); await pg_.fill("#gh-token", github_falso.TOKEN)
        await pg_.click("#gh-conectar"); await pg_.wait_for_timeout(6000)
    await conectar(pg, "")
    legivel = not any(v[:4] == b"LLC1" for v in github_falso.ARQUIVOS.values()) and "cripto.json" not in github_falso.ARQUIVOS
    confere("Sincronização envia tudo (sem senha)", len(github_falso.ARQUIVOS) >= 4 and legivel, f"{len(github_falso.ARQUIVOS)} arquivos na nuvem")
    ctx5, pg5 = await novo_aparelho(b, 820, 1180, leis=())
    await conectar(pg5, "")
    iguais = await pg5.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length") == await pg.evaluate("[...estado.itens.values()].filter(i=>!i.apagado).length")
    confere("Outro aparelho recebe tudo da nuvem", iguais and await pg5.evaluate("(async()=>(await bdTodos('arquivos')).length)()") == 2)
    await pg5.evaluate("salvarItem({id:'sinc-1',tipo:'anotacao',lei:'lep',art:'1',nota:'do outro aparelho',criadoEm:agoraISO()})")
    await pg5.evaluate("clearTimeout(sync.tempo); sincronizar('teste')"); await pg5.wait_for_timeout(3000)
    await pg.evaluate("sincronizar('teste')"); await pg.wait_for_timeout(3000)
    confere("Edição chega ao primeiro aparelho", await pg.evaluate("(estado.itens.get('sinc-1')||{}).nota") == "do outro aparelho")
    await ctx5.close()

    # 13) Google Drive (de mentira): sincronização em partes, enviar resumo e caderno ao Drive; seleção de vários
    google_falso.iniciar(PORTA + 2)
    ctx7, pg7 = await novo_aparelho(b)
    base = f"http://localhost:{PORTA + 2}"
    await pg7.evaluate(f"""localStorage.setItem('sync-google-base', JSON.stringify('{base}'));
      localStorage.setItem('google-token', JSON.stringify({{token:'{google_falso.TOKEN}', expira: Date.now()+3600000}}));
      localStorage.setItem('google-token-arquivos', JSON.stringify({{token:'{google_falso.TOKEN}', expira: Date.now()+3600000}}));""")
    await pg7.goto(U + "#/resumos"); await pg7.wait_for_timeout(700)
    await pg7.click("#importar-resumos"); await pg7.set_input_files("#imp-arquivos", [os.path.join(FIX, "resumo-teste.pdf"), os.path.join(FIX, "resumo-teste.docx")])
    await pg7.wait_for_selector("#imp-progresso .lista-cartoes", timeout=60000); await pg7.evaluate("fecharPainel()")
    await pg7.evaluate("gravarLS('sync-config', {provedor:'google', senha:'', conectadoEm:agoraISO()}); gravarLS('sync-estado', {hashes:{}, locais:{}})")
    await pg7.evaluate("sincronizar('teste')"); await pg7.wait_for_timeout(5000)
    arquivos_nuvem = [a for a in google_falso.ARQUIVOS.values() if a["name"].startswith("arquivos/")]
    confere("Sincronização pelo Google Drive envia os arquivos", len(arquivos_nuvem) == 2 and not await pg7.evaluate("estSync().erro"))
    await pg7.goto(U + "#/resumos"); await pg7.wait_for_timeout(800)
    await pg7.click("#selecionar-res")
    for t in await pg7.locator(".tile-resumo").all(): await t.click()
    await pg7.click("[data-sel=drive]"); await pg7.click("[data-versao=original]"); await pg7.wait_for_timeout(3000)
    no_drive = [a["name"] for a in google_falso.ARQUIVOS.values() if a.get("parents") and a["parents"][0] != "appDataFolder" and a.get("mimeType") != "application/vnd.google-apps.folder"]
    confere("Selecionar vários e enviar ao Google Drive", sorted(no_drive) == ["resumo-teste.docx", "resumo-teste.pdf"], no_drive)
    await pg7.evaluate("fecharPainel(); alternarSelecaoResumos(true)")
    for t in await pg7.locator(".tile-resumo").all(): await t.click()
    await pg7.click("[data-sel=duplicar]"); await pg7.wait_for_timeout(1500)
    confere("Duplicar vários de uma vez", await pg7.evaluate("resumosAtivos().length") == 4)
    # 14) Lixeira e renomear
    await pg7.evaluate("fecharPainel(); alternarSelecaoResumos(true)")
    for t in (await pg7.locator(".tile-resumo").all())[:2]: await t.click()
    await pg7.click("[data-sel=apagar]"); await pg7.wait_for_timeout(1000)
    na_lixeira = await pg7.evaluate("itensDaLixeira().total")
    await pg7.goto(U + "#/lixeira"); await pg7.wait_for_timeout(600)
    for _ in range(na_lixeira): await pg7.locator("[data-rest-res]").first.click(); await pg7.wait_for_timeout(500)
    confere("Lixeira: apagar e restaurar", na_lixeira == 2 and await pg7.evaluate("resumosAtivos().length") == 4 and await pg7.evaluate("itensDaLixeira().total") == 0)
    await pg7.evaluate("renomear('lei', 'lep', nomeLei('lep'), 'x')") if False else None
    await pg7.evaluate("salvarItem({id:'nome-lei|lep', tipo:'nome-lei', alvo:'lep', nome:'Minha LEP'})")
    confere("Renomear lei", await pg7.evaluate("nomeLei('lep')") == "Minha LEP")
    await ctx7.close()

    # 15) Armazenamento: apagar marcações escolhidas (todas as leis)
    ctx8, pg8 = await novo_aparelho(b)
    await pg8.evaluate("""(async()=>{ await salvarItem({id:'g9',tipo:'grifo',lei:'lep',art:'1',cor:'verde',texto:'x',criadoEm:agoraISO()});
      await salvarItem({id:'t9',tipo:'tinta',lei:'lep',art:'1',fonte:19,tracos:[{id:'z',pts:[0,0,9,9],cor:'#000',esp:2}],carimbos:[]}); })()""")
    await pg8.goto(U + "#/ajustes"); await pg8.wait_for_timeout(1800)
    await pg8.click("#arm-leis"); await pg8.click("#leis-marcacoes"); await pg8.wait_for_timeout(1200)
    confere("Armazenamento: apagar grifos, caneta e ícones", await pg8.evaluate("itens('grifo').length + itens('tinta').length") == 0 and await pg8.evaluate("Object.keys(lerLS('info-leis',{})).length") == 2)
    await ctx8.close()

    # 16) Apagar todos os meus dados: esvazia a conta (nuvem e outros aparelhos), mas continua conectado
    github_falso.ARQUIVOS.clear(); github_falso.ARQUIVOS["README.md"] = b"# dados"
    ctx9, pg9 = await novo_aparelho(b)
    await pg9.evaluate("salvarItem({id:'z1',tipo:'anotacao',lei:'lep',art:'1',nota:'x',criadoEm:agoraISO()})")
    await conectar(pg9, "")
    ctx10, pg10 = await novo_aparelho(b, leis=()); await conectar(pg10, "")
    await pg9.goto(U + "#/acervo"); await pg9.goto(U + "#/ajustes"); await pg9.wait_for_timeout(1800)
    ordem_arm = [t.strip() for t in await pg9.locator("#secao-armazenamento .linha-arm strong").all_inner_texts()]
    confere("Armazenamento com Leis, Questões e Resumos", ordem_arm[:3] == ["Leis", "Questões", "Resumos"], ordem_arm)
    await pg9.evaluate("() => { window.prompt = () => 'APAGAR'; }")
    await pg9.click("#arm-tudo"); await pg9.wait_for_timeout(5000)
    a_ok = await pg9.evaluate("estado.itens.size") == 0 and await pg9.evaluate("!!cfgSync()")
    await pg10.evaluate("sincronizar('teste')"); await pg10.wait_for_timeout(4000)
    b_ok = await pg10.evaluate("estado.itens.size") == 0 and await pg10.evaluate("!!cfgSync()")
    confere("Apagar todos os dados: conta vazia, sem desconectar, também no outro aparelho", a_ok and b_ok and "README.md" in github_falso.ARQUIVOS)
    await ctx9.close(); await ctx10.close()

    # 17) Quem usava senha numa versão anterior: a senha é removida e os dados continuam
    github_falso.ARQUIVOS.clear()
    ctx11, pg11 = await novo_aparelho(b, leis=())
    await pg11.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}'))")
    await pg11.evaluate("""(async()=>{                       // monta uma nuvem como a da versão antiga, com senha
      gravarLS('sync-config', {provedor:'github', repo:'Eu/d', token:'""" + github_falso.TOKEN + """', senha:'velha'});
      const p = provedorAtual(); await p.preparar();
      const sal = crypto.getRandomValues(new Uint8Array(16)); const k = await chaveDaSenha('velha', sal);
      const enc = async b => { const iv = crypto.getRandomValues(new Uint8Array(12)); const c = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, k, b));
        const o = new Uint8Array(16 + c.length); o.set(MARCA_CIFRA); o.set(iv, 4); o.set(c, 16); return o; };
      await p.enviar('cripto.json', paraBytes({sal: bytesParaBase64(sal), teste: bytesParaBase64(await enc(new TextEncoder().encode('leitor-ok')))}), null);
      await p.enviar('itens.json', await enc(paraBytes([{id:'velho', tipo:'anotacao', lei:'lep', art:'1', nota:'feita com senha', atualizadoEm:'2026-01-01T00:00:00'}])), null);
      gravarLS('sync-estado', {hashes:{}, locais:{}});
    })()""")
    await pg11.evaluate("sincronizar('teste')"); await pg11.wait_for_timeout(4000)
    sem_cifra = "cripto.json" not in github_falso.ARQUIVOS and not github_falso.ARQUIVOS["itens.json"].startswith(b"LLC1")
    confere("Senha antiga removida sem perder dados", sem_cifra and await pg11.evaluate("(estado.itens.get('velho')||{}).nota") == "feita com senha"
            and await pg11.evaluate("cfgSync().senha === undefined"))
    await ctx11.close()

    # 17b) Seção "Dono do app" escondida; aparece com 15 toques no título "Configurações"
    ctx13, pg13 = await novo_aparelho(b, leis=())
    await pg13.goto(U + "#/ajustes"); await pg13.wait_for_timeout(1200)
    escondida = await pg13.locator("#secao-dono").count() == 0
    for _ in range(14): await pg13.click("#titulo"); await pg13.wait_for_timeout(60)
    ainda = await pg13.locator("#secao-dono").count() == 0
    await pg13.click("#titulo"); await pg13.wait_for_timeout(500)
    confere("Dono do app: escondido e revelado com 15 toques no título", escondida and ainda and await pg13.locator("#secao-dono").count() == 1)
    await ctx13.close()

    # 18) Dono do app: visível para outros (publica/despublica), arquivar e excluir cadernos e pastas
    github_falso.ARQUIVOS.clear()
    github_falso.ARQUIVOS["dados/questoes/indice.json"] = json.dumps({"cadernos": []}).encode()
    ctx12, pg12 = await novo_aparelho(b)
    await pg12.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}')); localStorage.setItem('dono-config', JSON.stringify({{repo:'Erivelton94/leitor-legislacao', token:'{github_falso.TOKEN}'}}))")
    await pg12.goto(U + "#/questoes/cadernos"); await pg12.wait_for_timeout(1500)
    await pg12.click("#importar-caderno"); await pg12.set_input_files("#impq-arq", os.path.join(FIX, "caderno-teste.pdf"))
    await pg12.wait_for_selector("#impq-salvar", timeout=60000); await pg12.click("#impq-salvar"); await pg12.wait_for_timeout(1200); await pg12.evaluate("fecharPainel()")
    cid = await pg12.evaluate("Object.values(estado.cadernos).find(c=>c.local).id")
    await pg12.evaluate(f"menuCaderno('{cid}')"); await pg12.click("#c-visivel"); await pg12.wait_for_timeout(2500)
    publicado = f"dados/questoes/{cid}.json" in github_falso.ARQUIVOS and cid in github_falso.ARQUIVOS["dados/questoes/indice.json"].decode()
    await pg12.evaluate(f"menuCaderno('{cid}')"); await pg12.click("#c-visivel"); await pg12.wait_for_timeout(2500)
    despublicado = f"dados/questoes/{cid}.json" not in github_falso.ARQUIVOS and cid not in github_falso.ARQUIVOS["dados/questoes/indice.json"].decode() and await pg12.evaluate(f"!!estado.cadernos['{cid}']")
    confere("Dono: ligar e desligar “visível para outros usuários”", publicado and despublicado)
    await pg12.evaluate(f"menuCaderno('{cid}')"); await pg12.click("#c-arquivar"); await pg12.wait_for_timeout(1200)
    some = await pg12.locator(f"[data-menu-cad='{cid}']").count() == 0
    await pg12.goto(U + "#/questoes/arquivados"); await pg12.wait_for_timeout(800)
    confere("Arquivar caderno: some da lista e aparece em Arquivados", some and await pg12.locator(f"[data-menu-cad='{cid}']").count() == 1)
    await pg12.evaluate(f"(async()=>{{ await arquivarCaderno('{cid}', false); const p = await salvarItem({{id:'pq1', tipo:'pasta', area:'questoes', nome:'Teste', leis:[], cadernos:['{cid}']}}); }})()")
    await pg12.goto(U + "#/questoes/cadernos"); await pg12.wait_for_timeout(800)
    await pg12.click("[data-menu-pasta='pq1']"); await pg12.click("#pu-lixeira"); await pg12.wait_for_timeout(1500)
    confere("Excluir pasta de questões leva os cadernos para a lixeira", await pg12.evaluate(f"!estado.cadernos['{cid}'] && itensDaLixeira().cads.length === 1"))
    await ctx12.close()

    # 13) Pastas em vários níveis, seleção de várias, lixeira das leis, resumos migrados
    ctx13, p13 = await novo_aparelho(b)
    await p13.evaluate("(async()=>{ await salvarItem({id:'acv|lep',tipo:'acervo',lei:'lep'}); await salvarItem({id:'acv|codigo-penal',tipo:'acervo',lei:'codigo-penal'}); })()")
    ids = await p13.evaluate("""(async()=>{ const a = await novaPasta('leis', null, 'Penal'); const s = await novaPasta('leis', a.id, 'Execução');
        await moverParaPasta('leis', 'lep', s.id); return [a.id, s.id]; })()""")
    await p13.goto(U + "#/acervo"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    raiz = await p13.evaluate("[...document.querySelectorAll('.acervo .lei-item')].map(l=>l.dataset.selId||l.dataset.selPasta)")
    rot = await p13.inner_text(f"[data-sel-pasta='{ids[0]}'] .lei-num")
    await p13.goto(U + f"#/acervo/pasta/{ids[1]}"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    dentro = await p13.evaluate("[...document.querySelectorAll('.acervo .lei-item')].map(l=>l.dataset.selId)")
    trilha = await p13.inner_text(".trilha")
    confere("Leis: subpasta dentro de pasta, com caminho", "lep" not in raiz and ids[0] in raiz and "1 lei(s) · 1 subpasta(s)" in rot and dentro == ["lep"] and "Penal" in trilha and "Execução" in trilha, f"{raiz} | {rot} | {dentro} | {trilha}")
    ciclo = await p13.evaluate(f"moverPasta('{ids[0]}', '{ids[1]}')")
    confere("Pasta não entra dentro dela mesma", ciclo is False)
    await p13.goto(U + "#/acervo"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    await p13.click("#selecionar-lista"); await p13.click("[data-sel-id='codigo-penal']"); await p13.click(f"[data-sel-pasta='{ids[0]}']")
    n_sel = await p13.inner_text("#barra-sel-lista .sel-n")
    await p13.click("[data-sel-l=fixar]"); await p13.wait_for_timeout(600)
    fix = await p13.evaluate(f"[ehFixada('codigo-penal'), !!estado.itens.get('{ids[0]}').fixada]")
    confere("Selecionar várias leis e pastas e fixar no topo", n_sel.startswith("2") and fix == [True, True], f"{n_sel} {fix}")
    await p13.click("#selecionar-lista"); await p13.click("[data-sel-id='codigo-penal']"); await p13.click("[data-sel-l=arquivar]"); await p13.wait_for_timeout(600)
    some = await p13.locator("[data-sel-id='codigo-penal']").count() == 0
    await p13.goto(U + "#/acervo/arquivadas"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(600)
    confere("Arquivar lei: some do acervo e aparece em Arquivadas", some and await p13.locator("[data-sel-id='codigo-penal']").count() == 1)
    await p13.evaluate("alternarArquivarLei('codigo-penal', false)")
    await p13.evaluate("leiParaLixeira('codigo-penal')"); await p13.wait_for_timeout(300)
    na_lixeira = await p13.evaluate("[!noAcervo('codigo-penal'), itensDaLixeira().soltos.leis.length]")
    await p13.evaluate("restaurarLei('codigo-penal')"); await p13.wait_for_timeout(800)
    confere("Lei removida vai para a lixeira e volta ao restaurar", na_lixeira == [True, 1] and await p13.evaluate("noAcervo('codigo-penal') && !itensDaLixeira().soltos.leis.length"), na_lixeira)
    await p13.evaluate(f"pastaParaLixeira('{ids[0]}')"); await p13.wait_for_timeout(500)
    sumiu = await p13.evaluate(f"[!noAcervo('lep'), !pastaViva(estado.itens.get('{ids[0]}')), !pastaViva(estado.itens.get('{ids[1]}')), itensDaLixeira().grupos.size]")
    await p13.goto(U + "#/lixeira"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    await p13.click("[data-rest-grupo]"); await p13.wait_for_timeout(1500)
    voltou = await p13.evaluate(f"[noAcervo('lep'), pastaViva(estado.itens.get('{ids[1]}')), pastaDoItem('leis','lep')==='{ids[1]}', paiDe(estado.itens.get('{ids[1]}'))==='{ids[0]}']")
    confere("Pasta inteira vai para a lixeira e volta com as subpastas e as leis", sumiu == [True, True, True, 1] and voltou == [True, True, True, True], f"{sumiu} {voltou}")
    # resumos: pastas antigas (matéria › assunto) viram pastas comuns, sem perder nada
    await p13.evaluate("""(async()=>{ await salvarItem({id:'m1',tipo:'materia',nome:'Direito Penal'}); await salvarItem({id:'a1',tipo:'assunto',materia:'Direito Penal',nome:'Homicídio'});
        await bdGravar('resumos',{id:'r1',titulo:'Resumo velho',materia:'Direito Penal',assunto:'Homicídio',formato:'html',atualizadoEm:agoraISO()});
        await bdGravar('resumos',{id:'r2',titulo:'Outro',materia:'Português',assunto:'',formato:'html',atualizadoEm:agoraISO()});
        await bdGravar('resumos_conteudo',{id:'r1',html:'<p>Matar alguém. Pena de seis a vinte anos.</p><p>Segundo parágrafo do resumo.</p>',texto:''});
        resumos.lista=null; await carregarResumos(); })()""")
    mig = await p13.evaluate("""(()=>{ const r1=resumos.lista.get('r1'), r2=resumos.lista.get('r2'); return [textoCaminho(r1.pasta), textoCaminho(r2.pasta), r1.materia===undefined, itens('materia').length+itens('assunto').length, pastasDe('resumos').length]; })()""")
    confere("Resumos: matéria › assunto viram pastas comuns", mig == ["Direito Penal › Homicídio", "Português", True, 0, 3], mig)
    await p13.goto(U + "#/resumos/materia/Direito%20Penal/Homic%C3%ADdio"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(1200)
    confere("Endereço antigo de pasta de resumos ainda abre a pasta", "/resumos/pasta/" in p13.url and await p13.locator(".tile-resumo[data-id='r1']").count() == 1, p13.url)
    pid = await p13.evaluate("resumos.lista.get('r1').pasta")
    sub = await p13.evaluate(f"(async()=>{{ const s = await novaPasta('resumos', '{pid}', 'Qualificado'); await moverParaPasta('resumos','r1', s.id); return textoCaminho(resumos.lista.get('r1').pasta); }})()")
    await p13.goto(U + "#/resumos"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    confere("Resumos: subpasta em 3º nível e botão “+ Nova pasta”", sub == "Direito Penal › Homicídio › Qualificado" and await p13.locator("#nova-pasta-res").count() == 1 and await p13.locator("#nova-materia").count() == 0, sub)
    await p13.evaluate("(async()=>{ const r=resumos.lista.get('r2'); r.fixado=true; await salvarMeta(r,false); })()")
    await p13.goto(U + f"#/resumos/pasta/{pid}"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(300)
    await p13.goto(U + "#/resumo/r1"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(1200)
    blocos = await p13.evaluate("blocosDoResumo(resumos.lista.get('r1')).map(b=>b.partes.join(' | '))")
    confere("Ouvir resumo: texto dividido em frases para ler", len(blocos) == 2 and "Matar alguém. | Pena de seis a vinte anos." in blocos[0], blocos)
    # questões: subpasta e mover vários de uma vez
    await p13.goto(U + "#/questoes/cadernos"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(1500)
    cads = await p13.evaluate("Object.keys(estado.cadernos).slice(0,2)")
    qp = await p13.evaluate("(async()=>{ const a = await novaPasta('questoes', null, 'PCPE'); const s = await novaPasta('questoes', a.id, 'Penal'); return [a.id, s.id]; })()")
    await p13.goto(U + "#/questoes/cadernos"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(800)
    await p13.click("#selecionar-lista")
    for c in cads: await p13.click(f"[data-sel-id='{c}']")
    await p13.click("[data-sel-l=mover]"); await p13.click(f"#painel-caixa [data-dest='{qp[1]}']"); await p13.wait_for_timeout(800)
    movidos = await p13.evaluate(f"itensDaPasta('questoes','{qp[1]}')")
    await p13.goto(U + f"#/questoes/pasta/{qp[0]}"); await p13.evaluate("rotear()"); await p13.wait_for_timeout(600)
    confere("Questões: mover vários cadernos para uma subpasta", sorted(movidos) == sorted(cads) and await p13.locator(f"[data-sel-pasta='{qp[1]}']").count() == 1, movidos)
    confere("Nenhum erro de programa nas pastas", not p13.erros, p13.erros[:3])
    await ctx13.close()

    # 14) Resumos compartilhados pelo dono: ligar, outro usuário copia, desligar
    pasta_pub = os.path.join(RAIZ, "dados", "resumos")
    ja_existiam = set(os.listdir(pasta_pub)) if os.path.isdir(pasta_pub) else set()     # resumos já compartilhados de verdade: não mexer
    indice_real = open(os.path.join(pasta_pub, "indice.json"), "rb").read() if "indice.json" in ja_existiam else None
    criados = []
    ctx14, d14 = await novo_aparelho(b)
    try:
        await d14.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}')); localStorage.setItem('dono-config', JSON.stringify({{repo:'Erivelton94/leitor-legislacao', token:'{github_falso.TOKEN}'}}))")
        await d14.evaluate("""(async()=>{ await carregarResumos(); const p = await novaPasta('resumos', null, 'Penal compartilhado'); const s = await novaPasta('resumos', p.id, 'Homicídio');
            for (const [id,t,pa] of [['c1','Resumo solto',''],['c2','Dentro da pasta',p.id],['c3','Na subpasta',s.id]]) {
              await gravarConteudo(id, `<p>${t}: texto do resumo.</p>`); await salvarMeta({id, titulo:t, origem:t+'.html', pasta:pa, formato:'html'}); }
            window._pp = [p.id, s.id]; })()""")
        await d14.goto(U + "#/resumos"); await d14.evaluate("rotear()"); await d14.wait_for_timeout(800)
        await d14.evaluate("menuResumo('c1')"); await d14.click("#r-visivel"); await d14.click("[data-comp-modo]"); await d14.wait_for_timeout(1500)
        pid = await d14.evaluate("window._pp[0]")
        await d14.evaluate(f"menuPasta('{pid}')"); await d14.click("#pu-visivel"); await d14.click("[data-comp-modo]"); await d14.wait_for_timeout(2000)
        idx = json.loads(github_falso.ARQUIVOS.get("dados/resumos/indice.json", b"{}"))
        ok_pub = sorted(r["id"] for r in idx.get("resumos", [])) == ["c1", "c2", "c3"] and len(idx.get("pastas", [])) == 2 and "dados/resumos/c3.html" in github_falso.ARQUIVOS
        selo = await d14.evaluate("resumos.lista.get('c1').publicado && estado.itens.get(window._pp[0]).publicada === true")
        confere("Dono: ligar “visível para outros usuários” num resumo e numa pasta (com subpasta)", ok_pub and selo, [r["id"] for r in idx.get("resumos", [])])
        # outro usuário (sem chave de dono) vê e copia
        os.makedirs(pasta_pub, exist_ok=True)
        for c, v in github_falso.ARQUIVOS.items():
            if c.startswith("dados/resumos/"):
                open(os.path.join(RAIZ, c), "wb").write(v)
                if os.path.basename(c) not in ja_existiam or c.endswith("indice.json"): criados.append(os.path.join(RAIZ, c))
        ctx15, u15 = await novo_aparelho(b)
        await u15.goto(U + "#/resumos"); await u15.evaluate("rotear()"); await u15.wait_for_timeout(1500)
        tile = await u15.locator(".tile-compartilhados").count()
        await u15.goto(U + "#/resumos/compartilhados"); await u15.wait_for_timeout(1200)
        await u15.click("[data-comp='c1']"); await u15.wait_for_timeout(1500)
        aberto = "/resumo/" in u15.url
        await u15.goto(U + f"#/resumos/compartilhados/{pid}"); await u15.wait_for_timeout(1000)
        await u15.click("#copiar-tudo"); await u15.wait_for_timeout(2000)
        copias = await u15.evaluate("[...resumos.lista.values()].filter(r=>r.deCompartilhado).map(r=>[r.deCompartilhado, textoCaminho(r.pasta)]).sort()")
        confere("Outro usuário vê “Compartilhados pelo app” e copia para os próprios resumos (com as pastas)", tile == 1 and aberto and copias == [["c1", "Compartilhados pelo app"], ["c2", "Compartilhados pelo app › Penal compartilhado"], ["c3", "Compartilhados pelo app › Penal compartilhado › Homicídio"]], copias)
        confere("Nenhum erro de programa ao receber compartilhados", not u15.erros, u15.erros[:3])
        await ctx15.close()
        # desligar e arquivar tiram do ar
        await d14.evaluate(f"menuPasta('{pid}')"); await d14.click("#pu-visivel"); await d14.wait_for_timeout(1500)
        await d14.evaluate("(async()=>{ const r=resumos.lista.get('c1'); r.arquivado=true; await tirarDoArSeDono([r]); await salvarMeta(r); })()"); await d14.wait_for_timeout(1200)
        idx2 = json.loads(github_falso.ARQUIVOS.get("dados/resumos/indice.json", b"{}"))
        confere("Desligar a pasta e arquivar o resumo tiram do app dos outros", idx2.get("resumos") == [] and idx2.get("pastas") == [] and "dados/resumos/c1.html" not in github_falso.ARQUIVOS, idx2)
        # janela do Google Drive: abas organizadas e vários arquivos de uma vez
        drive = await d14.evaluate("""(async()=>{ const reg={views:[],features:[]};
            window.carregarScript=async()=>{}; window.tokenDrive=async()=>'tk';
            window.gapi={load:(n,cb)=>cb()};
            class DocsView{constructor(id){this.o={id}} setMimeTypes(m){this.o.m=m;return this} setMode(m){return this} setParent(p){this.o.pai=p;return this} setIncludeFolders(v){this.o.pastas=v;return this}
              setSelectFolderEnabled(){return this} setOwnedByMe(v){this.o.meus=v;return this} setStarred(v){this.o.estrela=v;return this} setEnableDrives(v){this.o.drives=v;return this} setLabel(l){this.o.rotulo=l;return this}}
            class PickerBuilder{addView(v){reg.views.push(v.o);return this} enableFeature(f){reg.features.push(f);return this} setMaxItems(){return this} setOAuthToken(){return this} setDeveloperKey(){return this}
              setAppId(){return this} setLocale(){return this} setTitle(){return this} setCallback(cb){this.cb=cb;return this} build(){const cb=this.cb;return {setVisible(){cb({action:'picked',docs:[]})}}}}
            window.google={picker:{DocsView,PickerBuilder,ViewId:{DOCS:'docs'},DocsViewMode:{LIST:'list'},Feature:{MULTISELECT_ENABLED:'multi',SUPPORT_DRIVES:'drives'},Action:{PICKED:'picked',CANCEL:'cancel'}}};
            const r = await arquivosDoDrive(['application/pdf']); return {n:r.length, rotulos:reg.views.map(v=>v.rotulo), raiz:reg.views[0].pai, recentesSemPastas:reg.views[1].pastas===false, multi:reg.features.includes('multi')}; })()""")
        confere("Google Drive: abas Meu Drive (com pastas), Recentes, Compartilhados comigo e escolha de vários", drive["rotulos"][:3] == ["Meu Drive", "Recentes", "Compartilhados comigo"] and drive["raiz"] == "root" and drive["recentesSemPastas"] and drive["multi"], drive)
        ipad = await d14.evaluate("""(async()=>{ window.ehAparelhoApple=()=>true; let token=false; window.tokenDrive=async()=>{token=true; return 'tk'};
            let aberto=null; const orig=HTMLInputElement.prototype.click;
            HTMLInputElement.prototype.click=function(){ if(this.type==='file'){ aberto={multi:this.multiple, accept:this.accept}; setTimeout(()=>this.dispatchEvent(new Event('cancel')),50); } else orig.call(this); };
            const r = await arquivosDoDrive(['application/pdf']); HTMLInputElement.prototype.click=orig; return {token, aberto, n:r.length}; })()""")
        confere("iPad: “Escolher no Google Drive” abre a janela de arquivos do iPad (vários de uma vez)", not ipad["token"] and ipad["aberto"] and ipad["aberto"]["multi"], ipad)
        confere("Nenhum erro de programa no compartilhamento", not d14.erros, d14.erros[:3])
    finally:
        for c in criados:
            if os.path.basename(c) in ja_existiam: continue
            try: os.remove(c)
            except OSError: pass
        if indice_real is not None: open(os.path.join(pasta_pub, "indice.json"), "wb").write(indice_real)
        elif os.path.isdir(pasta_pub) and not os.listdir(pasta_pub): os.rmdir(pasta_pub)
        await ctx14.close()

    # 15) Questões de Lei Seca (Verdadeiro ou Falso): entrada, listas em pastas, filtro, resolver ligado à lei
    ctx16, p16 = await novo_aparelho(b)
    await p16.goto(U + "#/questoes"); await p16.evaluate("rotear()"); await p16.wait_for_timeout(1500)
    confere("Questões: entrada com Lei Seca e Cadernos", await p16.locator(".cartao-plataforma").count() == 2)
    pastas_ls = await p16.evaluate("(async()=>{ const a = await novaPasta('leiseca', null, 'Crimes contra a Pessoa'); const s = await novaPasta('leiseca', a.id, 'Homicídio'); return [a.id, s.id]; })()")
    await p16.goto(U + f"#/leiseca/listas/pasta/{pastas_ls[1]}"); await p16.wait_for_timeout(800)
    await p16.click("#importar-lista-ls"); await p16.set_input_files("#ls-arq", os.path.join(FIX, "leiseca-teste.pdf"))
    await p16.wait_for_selector("#ls-salvar", timeout=60000); await p16.click("#ls-salvar"); await p16.wait_for_timeout(1500); await p16.evaluate("fecharPainel()")
    lista = await p16.evaluate("""(()=>{ const c = Object.values(estado.cadernos).find(x => x.plataforma === 'leiseca'); const Q = Object.fromEntries(c.questoes.map(q => [q.numero, q]));
        return { n: c.questoes.length, pasta: pastaDoItem('leiseca', c.id), json: JSON.stringify(c),
          q1: [Q[1].gabarito, Q[1].banca, Q[1].ano, Q[1].cargo, Q[1].instituicao, Q[1].refs.map(r => r.lei + ' ' + r.art + ' ' + r.disp)],
          q2: [Q[2].gabarito, Q[2].banca, Q[2].cargo, Q[2].instituicao, Q[2].refs.map(r => r.lei + ' ' + r.art)],
          q3: [Q[3].banca], q4: [Q[4].refs.map(r => r.art), Q[4].enunciado.join(' '), Q[4].resolucao[0]] }; })()""")
    confere("Lei Seca: lê a lista em PDF (4 questões, gabarito, banca, cargo, instituição e artigos)", lista["n"] == 4 and lista["pasta"] == pastas_ls[1]
        and lista["q1"] == ["E", "FGV", "2026", "Delegado de Polícia", "PC-PI", ["codigo-penal 121 § 1º"]]
        and lista["q2"] == ["C", "CESPE/CEBRASPE", "Técnico Judiciário - Agente da Polícia Judicial", "STM", ["codigo-penal 121", "ctb 305"]]
        and lista["q4"][0] == ["124", "126", "127"], {k: lista[k] for k in ("n", "q1", "q2", "q4")})
    confere("Lei Seca: sem rodapé nem nome da fonte; palavras partidas consertadas", "http" not in lista["json"] and "ecorando" not in lista["json"] and "Página" not in lista["json"]
        and lista["q3"] == ["Questão inédita"] and "artigo 124" in lista["q4"][1] and "aborto provocado" in lista["q4"][1] and lista["q4"][2].startswith("Aborto provocado"), [lista["q3"], lista["q4"][1:]])
    await p16.goto(U + "#/leiseca"); await p16.wait_for_timeout(800)
    total_btn = await p16.inner_text("#ls-filtrar")
    await p16.click("[data-campo=bancas]"); await p16.click(".opcao-ls input[value='FGV']"); await p16.click("#campo-aplicar"); await p16.wait_for_timeout(300)
    uma = await p16.inner_text("#ls-filtrar")
    await p16.click("#ls-limpar")
    campos = {}
    for c in ("leis", "assuntos", "subassuntos"):
        await p16.click(f"[data-campo={c}]"); campos[c] = await p16.evaluate("[...document.querySelectorAll('.opcao-ls input')].map(i=>i.value)"); await p16.evaluate("fecharPainel()")
    assuntos = [campos["leis"], campos["assuntos"], campos["subassuntos"]]
    await p16.click("[data-campo=artigos]")
    artigos = await p16.evaluate("[...document.querySelectorAll('.opcao-ls span:nth-child(2)')].map(s=>s.textContent)")
    await p16.click(".opcao-ls input[value='codigo-penal|121']"); await p16.click("#campo-aplicar"); await p16.wait_for_timeout(300)
    so121 = await p16.inner_text("#ls-filtrar")
    confere("Filtro: Código/Lei = pasta, Assunto = subpasta, SubAssunto = arquivo; artigo e banca; quantidade ao vivo", "(4)" in total_btn and "(1)" in uma and "(2)" in so121 and assuntos == [["Crimes contra a Pessoa"], ["Homicídio"], ["leiseca-teste"]]
        and "Art. 121 — CP" in artigos and "Art. 305 — CTB" in artigos, [total_btn, uma, so121, assuntos, artigos[:4]])
    await p16.click("#ls-salvar-filtro"); await p16.wait_for_timeout(400)
    await p16.click("#ls-limpar"); await p16.click("#ls-salvos"); await p16.click("[data-aplicar-filtro]"); await p16.wait_for_timeout(400)
    confere("Filtros salvos: salvar e aplicar pelo botão do topo", await p16.evaluate("itens('filtro-ls').length === 1") and "(2)" in await p16.inner_text("#ls-filtrar") and await p16.locator("#ls-salvo").count() == 0)
    await p16.click("#ls-filtrar"); await p16.wait_for_timeout(800)
    no_resolver = "/leiseca/resolver" in p16.url and await p16.locator(".vf-btn").count() == 2
    await p16.click("[data-vf=E]"); await p16.wait_for_timeout(500)
    res = await p16.evaluate("[document.querySelector('.res-q')?.textContent || '', !!document.querySelector('.resolucao-ls'), itens('resposta').length]")
    confere("Resolver: Verdadeiro/Falso, resultado, resolução e resposta guardada", no_resolver and "acertou" in res[0] and res[1] and res[2] == 1, res)
    await p16.click("#ls-aleatoria"); await p16.wait_for_timeout(300)
    confere("Resolver: botão Aleatória vai para uma questão ainda não respondida", await p16.evaluate("lerLS('sessao-ls',{}).pos") == 1 and await p16.locator(".vf-btn:not([disabled])").count() == 2)
    await p16.click("[data-nav-ls='-1']"); await p16.wait_for_timeout(300)
    await p16.click(".resolucao-ls [data-ref='0']"); await p16.wait_for_timeout(1200)
    destaque = await p16.evaluate("[...document.querySelectorAll('#painel-caixa .destaque-ls')].map(p=>p.textContent.slice(0,12))")
    confere("Resolução liga ao artigo da lei com o parágrafo destacado", destaque and destaque[0].startswith("§ 1") and not any(d.startswith("Homic") for d in destaque), destaque)
    await p16.evaluate("fecharPainel()")
    await p16.goto(U + "#/lei/codigo-penal/121"); await p16.wait_for_timeout(2500)
    await p16.evaluate("menuArtigo('121')"); await p16.wait_for_timeout(300)
    btn_ls = await p16.inner_text("#m-ls") if await p16.locator("#m-ls").count() else ""
    await p16.click("#m-ls"); await p16.wait_for_timeout(800)
    sessao_art = await p16.evaluate("lerLS('sessao-ls',{}).ids.length")
    confere("Na lei: “Questões de lei seca deste artigo” abre só as do artigo", "(2)" in btn_ls and sessao_art == 2, [btn_ls, sessao_art])
    await p16.goto(U + "#/questoes/cadernos"); await p16.wait_for_timeout(800)
    confere("Cadernos tradicionais não mostram as listas de lei seca", await p16.evaluate("![...document.querySelectorAll('[data-href^=\"#/caderno/\"]')].some(b => b.dataset.href.includes('ls-'))"))
    await p16.evaluate(f"localStorage.setItem('sync-api-base', JSON.stringify('http://localhost:{PORTA + 1}')); localStorage.setItem('dono-config', JSON.stringify({{repo:'Erivelton94/leitor-legislacao', token:'{github_falso.TOKEN}'}}))")
    lid = await p16.evaluate("Object.values(estado.cadernos).find(x => x.plataforma === 'leiseca').id")
    await p16.evaluate(f"publicarCaderno('{lid}')"); await p16.wait_for_timeout(1500)
    idx_q = json.loads(github_falso.ARQUIVOS.get("dados/questoes/indice.json", b"{}"))
    pub = json.loads(github_falso.ARQUIVOS.get(f"dados/questoes/{lid}.json", b"{}"))
    entrada = next((x for x in idx_q.get("cadernos", []) if x["id"] == lid), {})
    confere("Lista de lei seca visível para outros usuários (com assunto e subassunto)", entrada.get("plataforma") == "leiseca" and pub.get("caminho") == ["Crimes contra a Pessoa", "Homicídio"], [entrada.get("plataforma"), pub.get("caminho")])
    await p16.evaluate(f"despublicarCaderno('{lid}')"); await p16.wait_for_timeout(1200)
    confere("Nenhum erro de programa na Lei Seca", not p16.erros, p16.erros[:3])
    await ctx16.close()

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
