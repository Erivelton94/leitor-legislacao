/* =====================================================================
   ZOOM PRÓPRIO (pinça com dois dedos) nas leis e nos resumos.
   O zoom do navegador é bloqueado nessas telas; quem aumenta é o próprio
   texto. Assim as barras de ferramentas nunca se mexem nem mudam de tamanho.
   ===================================================================== */
let zoomConteudo = 1, larguraBaseZoom = 0, pinca = null, zoomBase = 1;
const fz = () => ($("#zoom-caixa") ? zoomConteudo : 1);
function zerarZoom() {
  zoomConteudo = 1; larguraBaseZoom = 0; pinca = null; zoomBase = 1;
  $(".zoom-rolagem.propria")?.classList.remove("propria");
  $("#selo-zoom")?.remove();
}
function ajustarCaixaZoom() {
  const cont = $("#texto-lei"), caixa = $("#zoom-caixa");
  if (!cont || !caixa) return;
  if (zoomConteudo === 1) { caixa.style.width = ""; caixa.style.height = ""; return; }
  caixa.style.width = cont.offsetWidth * zoomConteudo + "px";
  caixa.style.height = cont.offsetHeight * zoomConteudo + "px";
}
/* Com zoom, a área do texto vira uma janela que rola sozinha nas duas direções (para os lados e para baixo
   no mesmo gesto, com o embalo natural do iPad). Sem zoom, a página rola normalmente. */
function topoDaJanela() {
  let fim = 0;
  for (const el of [$(".topo"), $("#barra-docx:not(.oculto)")]) {
    if (!el) continue;
    const pos = getComputedStyle(el).position;
    if (pos === "sticky" || pos === "fixed" && !document.body.classList.contains("tela-cheia")) fim = Math.max(fim, el.getBoundingClientRect().bottom);
  }
  return Math.max(0, fim);
}
function rolagemPropria(ligar) {
  const rol = $(".zoom-rolagem"); if (!rol) return;
  if (ligar === rol.classList.contains("propria")) { if (ligar) ajustarAlturaJanela(); return; }
  const topo = topoDaJanela();
  if (ligar) {
    const dentro = Math.max(0, topo - rol.getBoundingClientRect().top);          // quanto do texto já tinha passado
    rol.classList.add("propria");
    ajustarAlturaJanela(topo);
    window.scrollBy(0, rol.getBoundingClientRect().top - topo);
    rol.scrollTop = dentro;
  } else {
    const st = rol.scrollTop;
    rol.classList.remove("propria"); rol.style.height = "";
    window.scrollBy(0, rol.getBoundingClientRect().top - topo + st);
  }
}
function ajustarAlturaJanela(topo = topoDaJanela()) { const rol = $(".zoom-rolagem.propria"); if (rol) rol.style.height = Math.max(200, window.innerHeight - topo) + "px"; }
window.addEventListener("resize", () => setTimeout(() => ajustarAlturaJanela(), 250));
/* rola o que estiver rolando: a janela do texto (com zoom) ou a página */
function rolarConteudo(dx, dy) {
  const rol = $(".zoom-rolagem.propria");
  if (rol) { rol.scrollLeft += dx; rol.scrollTop += dy; return; }
  const rh = $(".zoom-rolagem.ampliado");
  if (rh && dx) rh.scrollLeft += dx;
  window.scrollBy(0, dy);
}
function aplicarZoom(novo, cx = window.innerWidth / 2, cy = window.innerHeight / 2) {
  const cont = $("#texto-lei"), caixa = $("#zoom-caixa"), rolagem = $(".zoom-rolagem");
  if (!cont || !caixa) return;
  novo = Math.min(3, Math.max(zoomBase, Math.round(novo * 100) / 100));
  if (novo === zoomConteudo) return;
  const r0 = cont.getBoundingClientRect();
  const lx = (cx - r0.left) / zoomConteudo, ly = (cy - r0.top) / zoomConteudo;       // o ponto entre os dedos fica parado
  if (zoomConteudo === 1) { larguraBaseZoom = cont.offsetWidth; cont.style.width = larguraBaseZoom + "px"; }
  zoomConteudo = novo;
  cont.style.transform = novo === 1 ? "" : `scale(${novo})`;
  cont.classList.toggle("com-zoom", novo !== 1);
  rolagem?.classList.toggle("ampliado", novo !== 1);
  if (novo === 1 && !cont.classList.contains("paginas-resumo")) cont.style.width = "";
  ajustarCaixaZoom();
  rolagemPropria(novo > zoomBase + 0.001 && zoomDePaginas());
  const r1 = cont.getBoundingClientRect();
  rolarConteudo(r1.left + lx * novo - cx, r1.top + ly * novo - cy);
  mostrarSeloZoom();
}
/* telas estreitas (celular): a página do PDF/Word é reduzida para caber inteira na largura */
function caberNaTela() {
  const cont = $("#texto-lei"), visor = $(".visor-original");
  if (!cont || !visor || !cont.classList.contains("paginas-resumo")) return;
  const larg = cont.offsetWidth, disp = visor.clientWidth - 16;
  const base = larg > disp ? Math.max(0.3, Math.floor(disp / larg * 100) / 100) : 1;
  const estavaNaBase = zoomConteudo === zoomBase;
  zoomBase = base;
  if (estavaNaBase || zoomConteudo < base) {
    if (zoomConteudo === base) zoomConteudo += 0.001;          // força o redesenho no tamanho certo
    aplicarZoom(base, 0, 0);
    const rolagem = $(".zoom-rolagem"); if (rolagem) rolagem.scrollLeft = 0;
  }
}
window.addEventListener("resize", () => { if ($(".paginas-resumo")) setTimeout(caberNaTela, 200); });
function mostrarSeloZoom() {
  let s = $("#selo-zoom");
  if (zoomConteudo === zoomBase) { s?.remove(); return; }
  if (!s) {
    s = document.createElement("button");
    s.id = "selo-zoom"; s.className = "selo-zoom";
    s.onclick = () => { aplicarZoom(zoomBase); redesenharPaginasNitidas(); };
    ($("#camada-fixa") || document.body).appendChild(s);
  }
  s.textContent = zoomBase < 1 ? `🔍 ${Math.round(zoomConteudo / zoomBase * 100)}% · caber na tela` : `🔍 ${Math.round(zoomConteudo * 100)}% · voltar a 100%`;
}
let tempoNitidez = null;
function redesenharPaginasNitidas() {        // PDF: depois do zoom, as páginas visíveis são redesenhadas mais nítidas
  clearTimeout(tempoNitidez);
  tempoNitidez = setTimeout(() => {
    for (const n of [...visor.desenhadas.keys()]) { const div = document.getElementById("art-p" + n); if (div) pedirPaginaPdf(n, div, true); }
  }, 250);
}
const distancia = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
const dedosDaTela = e => [...e.touches].filter(t => t.touchType !== "stylus");
document.addEventListener("touchstart", e => {
  if (!$("#zoom-caixa")) return;
  const ts = dedosDaTela(e);
  if (ts.length === 2) pinca = { d0: distancia(ts), z0: zoomConteudo, ativo: false };
}, { passive: true });
const fimDaPinca = () => { const c = $("#texto-lei"); if (c) c.style.willChange = ""; };
/* Pinça sem travar (leis com milhares de linhas): tudo o que precisa medir a página é medido UMA vez, no começo.
   Durante o movimento só muda a escala e a posição da rolagem — nenhuma medida que obrigue a página a se recalcular. */
/* Nos resumos (páginas do PDF/Word), o texto vira uma janela própria de rolagem e amplia como imagem durante a pinça.
   Nas leis (um texto enorme), o Safari trava com esses dois recursos: lá a página rola normalmente, como antes. */
const zoomDePaginas = () => !!$("#texto-lei.paginas-resumo");
function comecarPinca(cx, cy, alvoZ) {
  const cont = $("#texto-lei"); if (!cont) return null;
  if (zoomDePaginas()) cont.style.willChange = "transform";  // amplia como imagem enquanto os dedos se mexem (fluido)
  if (zoomConteudo === 1) { larguraBaseZoom = cont.offsetWidth; cont.style.width = larguraBaseZoom + "px"; }
  if (alvoZ > zoomBase + 0.001 && zoomDePaginas()) rolagemPropria(true);
  const rol = $(".zoom-rolagem.propria");
  const adormecidos = zoomDePaginas() ? [] : manterNoLugar(cx, cy, () => adormecerArtigosLonge(alvoZ));
  const r0 = cont.getBoundingClientRect();
  const s0 = rol ? [rol.scrollLeft, rol.scrollTop] : [window.scrollX, window.scrollY];
  const rh = rol ? null : $(".zoom-rolagem");                 // leis: rolagem para os lados na caixa do texto, para baixo na página
  return { cont, adormecidos, caixa: $("#zoom-caixa"), rolagem: $(".zoom-rolagem"), rol, rh, w: cont.offsetWidth, h: cont.offsetHeight,
           origem: rol ? [r0.left + s0[0], r0.top + s0[1]] : [r0.left + (rh ? rh.scrollLeft : 0), r0.top + window.scrollY],
           ponto: [(cx - r0.left) / zoomConteudo, (cy - r0.top) / zoomConteudo] };
}
function moverPinca(m, novo, cx, cy) {
  novo = Math.min(3, Math.max(zoomBase, Math.round(novo * 100) / 100));
  if (novo !== zoomConteudo) {
    zoomConteudo = novo;
    m.cont.style.transform = novo === 1 ? "" : `scale(${novo})`;
    m.cont.classList.toggle("com-zoom", novo !== 1);
    m.rolagem?.classList.toggle("ampliado", novo !== 1);
    if (novo === 1) { m.caixa.style.width = ""; m.caixa.style.height = ""; }
    else { m.caixa.style.width = m.w * novo + "px"; m.caixa.style.height = m.h * novo + "px"; }
  }
  const x = m.origem[0] + m.ponto[0] * novo - cx, y = m.origem[1] + m.ponto[1] * novo - cy;     // o ponto entre os dedos fica parado
  if (m.rol) { m.rol.scrollLeft = x; m.rol.scrollTop = y; }
  else { if (m.rh) m.rh.scrollLeft = x; window.scrollTo(window.scrollX, y); }
}
/* Leis grandes: durante a pinça, os artigos longe da tela "dormem" (o Safari deixa de recalculá-los a cada
   quadro) mantendo o tamanho exato, e o acompanhamento de qual artigo está na tela pausa. Ao soltar, tudo volta. */
const suportaAdormecer = typeof CSS !== "undefined" && CSS.supports && CSS.supports("content-visibility", "hidden");
/* o trecho que está entre os dedos fica exatamente no mesmo lugar da tela, mesmo que algo acima mude de altura */
function manterNoLugar(cx, cy, mudar) {
  const alvo = document.elementFromPoint(cx, cy)?.closest("#texto-lei > *") || $$("#texto-lei > *").find(el => el.getBoundingClientRect().bottom > cy);
  const t0 = alvo ? alvo.getBoundingClientRect().top : 0;
  const r = mudar();
  if (alvo && alvo.isConnected) { const d = alvo.getBoundingClientRect().top - t0; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
  return r;
}
function adormecerArtigosLonge(alvoZ) {
  if (typeof observador !== "undefined" && observador) observador.disconnect();
  const arts = $$("#texto-lei > *:not(.rodape-fonte)");
  if (arts.length < 40) return [];                             // texto curto: não precisa
  const alt = window.innerHeight, folga = alt * 2.5 * Math.max(1, zoomConteudo / Math.max(zoomBase, 0.3));
  const longe = [];
  for (const el of arts) {                                     // mede tudo de uma vez (uma só conta da página)
    const r = el.getBoundingClientRect();
    if (r.bottom < -folga || r.top > alt + folga) longe.push([el, r.height / zoomConteudo]);    // altura real, com o espaçamento
  }
  for (const [el, h] of longe) { el.style.height = h.toFixed(2) + "px"; el.classList.add("dormindo"); if (!suportaAdormecer) el.classList.add("dormindo-sem-cv"); }
  return longe.map(x => x[0]);
}
function acordarArtigos(lista) {
  for (const el of lista || []) { el.classList.remove("dormindo", "dormindo-sem-cv"); el.style.height = ""; }
  if (leiAberta && !String(leiAberta).startsWith("resumo:") && typeof observarPosicao === "function" && $("#texto-lei .artigo")) observarPosicao(leiAberta);
}
function terminarPinca(m, cx = window.innerWidth / 2, cy = window.innerHeight / 2) {
  fimDaPinca();
  if (m && m.adormecidos && m.adormecidos.length) manterNoLugar(cx, cy, () => acordarArtigos(m.adormecidos));
  if (zoomConteudo <= zoomBase + 0.001) {
    rolagemPropria(false);
    const cont = $("#texto-lei");
    if (cont && zoomConteudo === 1 && !cont.classList.contains("paginas-resumo")) cont.style.width = "";
  }
  mostrarSeloZoom();
  redesenharPaginasNitidas();
}
document.addEventListener("touchmove", e => {
  if (!pinca) return;
  const ts = dedosDaTela(e);
  if (ts.length !== 2) return;
  const d = distancia(ts);
  if (!pinca.ativo && Math.abs(d / pinca.d0 - 1) < 0.06) return;      // movimento de rolar com dois dedos, não de pinça
  e.preventDefault();
  const cx = (ts[0].clientX + ts[1].clientX) / 2, cy = (ts[0].clientY + ts[1].clientY) / 2;
  pinca.alvo = { z: pinca.z0 * d / pinca.d0, x: cx, y: cy };
  if (!pinca.ativo) { pinca.ativo = true; pinca.m = comecarPinca(cx, cy, pinca.alvo.z); }
  if (!pinca.quadro) pinca.quadro = requestAnimationFrame(() => { if (!pinca || !pinca.m) return; pinca.quadro = 0; moverPinca(pinca.m, pinca.alvo.z, pinca.alvo.x, pinca.alvo.y); });
}, { passive: false });
for (const tipoFim of ["touchend", "touchcancel"]) document.addEventListener(tipoFim, e => {
  if (pinca && (tipoFim === "touchcancel" || dedosDaTela(e).length < 2)) {
    const m = pinca.m, alvo = pinca.alvo;
    if (pinca.ativo && m) { cancelAnimationFrame(pinca.quadro); moverPinca(m, alvo.z, alvo.x, alvo.y); terminarPinca(m, alvo.x, alvo.y); }
    pinca = null;
  }
});
// Safari (iPad): impede o zoom da página inteira nas telas que têm zoom próprio
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, e => { if ($("#zoom-caixa")) e.preventDefault(); }, { passive: false });

/* =====================================================================
   IMAGENS NOS RESUMOS
   - Em qualquer resumo (PDF ou Word): ferramenta 🖼️ na barra da caneta
     coloca uma imagem por cima da página (como um adesivo).
   - No Word em edição: colar, arrastar ou 🖼️ insere a imagem no texto.
   As imagens são comprimidas e guardadas junto com o resumo, entram no
   backup e saem nos arquivos baixados.
   ===================================================================== */
const urlsFiguras = new Map();
async function urlDaFigura(id) {
  if (!urlsFiguras.has(id)) { const r = await bdLer("imagens", id); if (r) urlsFiguras.set(id, URL.createObjectURL(r.blob)); }
  return urlsFiguras.get(id) || "";
}
function elFigura(f) {
  const el = document.createElementNS(NS_SVG, "image");
  el.setAttribute("x", f.x); el.setAttribute("y", f.y); el.setAttribute("width", f.w); el.setAttribute("height", f.h);
  el.setAttribute("preserveAspectRatio", "none");
  el.setAttribute("class", "figura" + (caneta.figuraSel && caneta.figuraSel.id === f.id ? " figura-sel" : ""));
  el.dataset.figura = f.id;
  const pronto = urlsFiguras.get(f.img);
  if (pronto) el.setAttribute("href", pronto);
  else urlDaFigura(f.img).then(u => { if (u) el.setAttribute("href", u); });
  return el;
}
function acharFigura(item, x, y) {
  return [...(item.figuras || [])].reverse().find(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
}
const blobParaDataUrl = blob => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
async function escolherFiguraPendente() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const comp = f.type === "image/gif" ? f : await comprimirImagem(f);
    const id = uid();
    await bdGravar("imagens", { id, blob: comp, tipoMime: comp.type, atualizadoEm: agoraISO(), dono: "resumo" });
    const bmp = await createImageBitmap(comp);
    caneta.figuraPendente = { img: id, proporcao: bmp.height / bmp.width };
    bmp.close && bmp.close();
    caneta.opcoesAbertas = false; montarBarraCaneta();
  };
  inp.click();
}
function colocarFigura(div, p) {
  const pend = caneta.figuraPendente;
  const item = itemTintaAtual(div);
  item.figuras = item.figuras || [];
  const antes = fotografar(item);
  const w = Math.round(Math.min(div.offsetWidth * 0.45, 360)), h = Math.round(w * pend.proporcao);
  const f = { id: uid().slice(0, 8), img: pend.img, x: Math.round(p[0] - w / 2), y: Math.round(p[1] - h / 2), w, h };
  item.figuras.push(f);
  caneta.figuraPendente = null;
  caneta.figuraSel = { art: div.dataset.art, id: f.id };
  desenharTracos(div, item);
  salvarItem(item).then(() => registrarAcao(item, antes));
  montarBarraCaneta();
  return f;
}
async function mudarFiguraSelecionada(acao) {
  const sel = caneta.figuraSel; if (!sel) return;
  const div = document.getElementById("art-" + sel.art); if (!div) return;
  const item = tintaVisivel(leiAberta, sel.art); if (!item) return;
  const f = (item.figuras || []).find(x => x.id === sel.id); if (!f) return;
  const antes = fotografar(item);
  if (acao === "excluir") { item.figuras = item.figuras.filter(x => x !== f); caneta.figuraSel = null; }
  else {
    const k = acao === "maior" ? 1.25 : 0.8;
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    f.w = Math.round(Math.max(40, Math.min(1400, f.w * k))); f.h = Math.round(f.w * (f.h / (f.w / k)));
    f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2);
  }
  desenharTracos(div, item);
  await salvarItem(item); registrarAcao(item, antes);
  montarBarraCaneta();
}

/* ---------- Word em edição: imagens dentro do texto (ficam guardadas no próprio resumo) ---------- */
async function imagemParaDataUrl(arq) {
  const comp = arq.type === "image/gif" ? arq : await comprimirImagem(arq);
  return blobParaDataUrl(comp);
}
async function inserirImagensDocx(arquivos) {
  for (const a of arquivos) {
    if (!a.type.startsWith("image/")) continue;
    const url = await imagemParaDataUrl(a);
    document.execCommand("insertHTML", false, `<img src="${url}" style="max-width:100%;width:60%" alt="">`);
  }
}
async function internalizarImagensDocx(raiz) {        // imagem colada pelo sistema com endereço temporário vira imagem guardada
  for (const img of $$("img", raiz)) {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:")) continue;
    try { const r = await fetch(src); if (!r.ok) throw 0; img.setAttribute("src", await imagemParaDataUrl(await r.blob())); }
    catch { /* não dá para recuperar: mantém como está */ }
  }
}
function ferramentasImagemDocx(img) {
  let b = $("#ferr-img-docx");
  if (!img) { b?.remove(); return; }
  if (!b) {
    b = document.createElement("div"); b.id = "ferr-img-docx"; b.className = "ferramentas-imagem";
    b.innerHTML = `<span class="contagem">Imagem:</span>${[25, 50, 75, 100].map(p => `<button data-larg-docx="${p}">${p}%</button>`).join("")}<button data-apagar-img-docx style="color:var(--alt)">Excluir</button>`;
    ($("#camada-fixa") || document.body).appendChild(b);
  }
  b.onclick = e => {
    const bt = e.target.closest("button"); if (!bt) return;
    if (bt.dataset.largDocx) { img.style.width = bt.dataset.largDocx + "%"; img.style.maxWidth = "100%"; img.style.height = "auto"; }
    if (bt.dataset.apagarImgDocx !== undefined) { img.remove(); b.remove(); }
    $("#texto-lei").dispatchEvent(new Event("input"));
  };
}

/* =====================================================================
   IMPORTAR CADERNO DE QUESTÕES A PARTIR DO PDF (listas impressas do TEC)
   Lê banca, cargo, órgão, ano, matéria, assunto, enunciado, alternativas
   (ou Certo/Errado) e gabarito. Endereços e números do site são descartados.
   ===================================================================== */
const SIGLAS_LEI = { CP: "codigo-penal", CPP: "cpp", CF: "cf-1988", "CF/88": "cf-1988", CTB: "ctb", ECA: "eca", CC: "codigo-civil", CPC: "cpc",
  CDC: "cdc", CLT: "clt", CTN: "ctn", CPM: "cpm", CPPM: "cppm", LEP: "lep", LINDB: "lindb", ADCT: "cf-1988" };
function vinculoDoAssunto(assunto, catalogo) {
  const m = assunto.match(/\(arts?\.\s*([\d\-A-Z]+)(?:\s*(?:a|e|até)\s*([\d\-A-Z]+))?\s*(?:,\s*)?(?:do|da|de)\s+([^)]+)\)/i);
  if (!m) return null;
  const alvo = m[3].trim();
  let lei = SIGLAS_LEI[alvo.toUpperCase().replace(/\s+/g, "")];
  if (!lei) {                                          // "Lei 11.340/2006", "Lei nº 7.210/84"…
    const n = alvo.match(/(\d{1,2}\.?\d{3})\s*\/\s*(\d{2,4})/);
    if (n && catalogo) {
      const num = n[1].replace(/\./g, "");
      const achado = catalogo.find(l => String(l.n || "").replace(/\D/g, "") === num);
      if (achado) lei = achado.id;
    }
  }
  if (!lei) return null;
  const limpa = x => x.toUpperCase().replace(/[º°O]$/, "");
  return { lei, de: limpa(m[1]), ate: limpa(m[2] || m[1]) };
}
function hashCurto(txt) {                             // identificador estável: reimportar não duplica nem perde respostas
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < txt.length; i++) { const c = txt.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 12);
}
async function questoesDePdf(pdfjsLib, dados, catalogo, aoProgresso) {
  const doc = await pdfjsLib.getDocument({ data: dados, disableFontFace: true, isEvalSupported: false }).promise;
  const linhas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const itens = tc.items.filter(i => i.str).map(i => ({ x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]), s: i.str, b: false, i: false }));
    for (const l of agruparLinhas(itens)) linhas.push({ t: l.texto, fim: l.fim, larg: vp.width });
    pg.cleanup();
    if (aoProgresso) aoProgresso(n, doc.numPages);
  }
  await doc.destroy();
  // cabeçalho, rodapé e endereços do site saem
  const lixo = [/^\d{2}\/\d{2}\/\d{4},?\s*\d{1,2}:\d{2}/, /tecconcursos\.com\.br\/(questoes\/cadernos|s\/)/i, /^\d+\s*\/\s*\d+$/, /^Ordenação:/i];
  const linhaTitulo = linhas.find(l => /(?:^|\s)Caderno\s+\S/i.test(l.t));
  const tituloCaderno = linhaTitulo ? linhaTitulo.t.replace(/^.*?(?:^|\s)Caderno\s+/i, "").trim() : "";
  const uteis = linhas.filter(l => !lixo.some(r => r.test(l.t)) && !/^Caderno\s+/i.test(l.t));
  const margem = Math.max(...uteis.map(l => l.fim)) || 1;
  const RE_ID = /tecconcursos\.com\.br\/questoes\/\d+/i;
  const RE_META = /^(.+?)\s+-\s+(.+?)\/(.+?)\/(\d{4})$/;
  const questoes = [];
  let q = null, parte = null, alvo = null, ordem = 0, semGabarito = 0;
  const fechar = () => {
    if (!q) return;
    if (!q.gabarito) semGabarito++;
    else questoes.push(q);
    q = null;
  };
  const juntar = (lista, l, anterior) => {
    // linha que continua o parágrafo anterior (a de cima foi até a margem) é emendada; senão, parágrafo novo
    if (lista.length && anterior && anterior.fim > margem * 0.8) lista[lista.length - 1] += " " + l.t;
    else lista.push(l.t);
  };
  let anterior = null;
  for (let i = 0; i < uteis.length; i++) {
    const l = uteis[i], t = l.t;
    if (RE_ID.test(t)) { fechar(); q = { enunciado: [], alternativas: [], gabarito: "" }; parte = "meta"; anterior = null; continue; }
    if (!q) continue;
    let m;
    if (parte === "meta" && (m = t.match(RE_META))) {
      q.banca = m[1].trim(); q.cargo = m[2].trim(); q.orgao = m[3].trim(); q.ano = Number(m[4]); parte = "assunto"; continue;
    }
    if (parte === "assunto") {
      const k = t.indexOf(" - ");
      q.materia = k > 0 ? t.slice(0, k).trim() : t.trim();
      q.assunto = k > 0 ? t.slice(k + 3).trim() : "";
      parte = "enunciado"; anterior = null; continue;
    }
    if ((m = t.match(/^Gabarito:\s*(.+)$/i))) {
      const g = m[1].trim();
      q.gabarito = /^certo$/i.test(g) ? "C" : /^errado$/i.test(g) ? "E" : g.toUpperCase().slice(0, 1);
      parte = "fim"; continue;
    }
    if (parte === "fim") continue;
    if (parte === "enunciado" && (m = t.match(/^\d+\)\s*(.*)$/)) && !q.enunciado.length) { q.enunciado.push(m[1]); anterior = l; continue; }
    if ((parte === "enunciado" || parte === "alt") && (m = t.match(/^([a-e])\)\s*(.*)$/))) {
      q.alternativas.push({ letra: m[1].toUpperCase(), texto: m[2] }); parte = "alt"; anterior = l; continue;
    }
    if (/^(Certo|Errado)$/i.test(t) && parte === "enunciado") { q.tipo = "CE"; anterior = l; continue; }
    if (parte === "enunciado") { juntar(q.enunciado, l, anterior); anterior = l; continue; }
    if (parte === "alt") { const a = q.alternativas[q.alternativas.length - 1]; a.texto += " " + t; anterior = l; continue; }
  }
  fechar();
  for (const x of questoes) {
    if (x.tipo === "CE" || !x.alternativas.length) { x.tipo = "CE"; x.alternativas = [{ letra: "C", texto: "Certo" }, { letra: "E", texto: "Errado" }]; }
    else x.tipo = "ME";
    x.id = "q-" + hashCurto([x.banca, x.ano, x.enunciado.join(" "), x.alternativas.map(a => a.texto).join("|")].join("§"));
    x.area = "";
    x.vinculo = vinculoDoAssunto(x.assunto || "", catalogo);
    x.ordem = ++ordem;
  }
  const assuntos = [...new Set(questoes.map(x => x.assunto).filter(Boolean))];
  const materias = questoes.map(x => x.materia).filter(Boolean);
  const materia = materias.sort((a, b) => materias.filter(v => v === b).length - materias.filter(v => v === a).length)[0] || "";
  return { titulo: tituloCaderno, materia, assuntos, questoes, semGabarito };
}

/* ---------- importar caderno pelo PDF: tela ---------- */
function catalogoParaVinculo() {
  return Object.entries(estado.status || {}).map(([id, s]) => ({ id, n: ((s.numero || s.nome || "").match(/(\d{1,2}\.?\d{3})\s*\//) || [])[1] || "" }));
}
function painelImportarCaderno() {
  abrirPainel(`<h2>Importar caderno de questões ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Escolha o PDF da lista impressa (como os cadernos do TEC). O app lê banca, ano, cargo, assunto, enunciado, alternativas e gabarito, e liga cada questão ao artigo da lei quando o assunto indica (ex.: "art. 121 do CP"). Os endereços e números do site são descartados. Dá para escolher vários PDFs.</p>
    <p class="contagem">Também aceita o arquivo de caderno exportado pelo app (.json), que é como se passa um caderno pronto para outra pessoa.</p>
    <div class="acoes"><button class="botao primario" id="impq-escolher">Escolher arquivo</button><button class="botao" id="impq-drive">☁️ Escolher no Google Drive</button></div>
    <input type="file" id="impq-arq" accept="application/pdf,.pdf,application/json,.json" multiple hidden>
    <div id="impq-res"></div>`);
  $("#impq-escolher").onclick = () => $("#impq-arq").click();
  $("#impq-drive").onclick = async () => {
    const res = $("#impq-res");
    try { res.innerHTML = '<p class="contagem">Abrindo o Google Drive…</p>'; const arqs = await arquivosDoDrive(["application/pdf", "application/json"]); res.innerHTML = ""; if (arqs.length) processar(arqs); }
    catch (err) { res.innerHTML = `<p class="alerta">⚠️ ${esc(err.message)}</p>`; }
  };
  $("#impq-arq").onchange = e => { const arqs = [...e.target.files]; e.target.value = ""; processar(arqs); };
  const processar = async arqs => {
    const res = $("#impq-res");
    for (const arq of arqs) {
      res.innerHTML = `<p class="contagem">Lendo ${esc(arq.name)}…</p>`;
      let r;
      try {
        if (/\.json$/i.test(arq.name) || arq.type === "application/json") {          // caderno exportado pelo app
          const j = JSON.parse(await arq.text());
          if (!Array.isArray(j.questoes)) throw new Error("este arquivo não é um caderno do app");
          r = { titulo: j.titulo || tituloDoArquivo(arq.name).replace(/\.caderno$/, ""), materia: j.materia || "", assuntos: j.assuntos || [...new Set(j.questoes.map(q => q.assunto).filter(Boolean))], questoes: j.questoes, semGabarito: 0 };
        } else {
          const pdfjs = await abrirPdfJs();
          r = await questoesDePdf(pdfjs, new Uint8Array(await arq.arrayBuffer()), catalogoParaVinculo(), (a, b) => { res.innerHTML = `<p class="contagem">Lendo ${esc(arq.name)}: página ${a} de ${b}…</p>`; });
        }
      } catch (err) { res.innerHTML = `<p class="alerta">Não foi possível ler ${esc(arq.name)}: ${esc(err.message)}</p>`; continue; }
      if (!r.questoes.length) { res.innerHTML = `<p class="alerta">Nenhuma questão encontrada em ${esc(arq.name)}. O PDF precisa ser uma lista impressa com "Gabarito:" em cada questão.</p>`; continue; }
      const me = r.questoes.filter(q => q.tipo === "ME").length, ce = r.questoes.length - me;
      const ligadas = r.questoes.filter(q => q.vinculo).length;
      res.innerHTML = `<div class="cartao" style="margin-top:12px">
        <label class="contagem">Nome do caderno</label>
        <input class="campo" id="impq-titulo" value="${esc(r.titulo || tituloDoArquivo(arq.name))}">
        <p><strong>${r.questoes.length} questões</strong> (${me} de múltipla escolha, ${ce} de Certo/Errado) · ${r.assuntos.length} assunto(s) · ${esc(r.materia || "")}</p>
        <p class="contagem">${ligadas} ligada(s) a um artigo de lei.${r.semGabarito ? ` ${r.semGabarito} questão(ões) sem gabarito foram deixadas de fora.` : ""}</p>
        <div class="acoes"><button class="botao primario" id="impq-salvar">Adicionar caderno</button></div></div>`;
      await new Promise(ok => {
        $("#impq-salvar").onclick = async () => {
          const titulo = $("#impq-titulo").value.trim() || "Caderno importado";
          const id = "local-" + semAcento(titulo).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + hashCurto(r.questoes.map(q => q.id).join(""));
          const cad = { id, titulo, materia: r.materia, versao: new Date().toISOString().slice(0, 10), assuntos: r.assuntos, observacao: "Importado de PDF no app.", questoes: r.questoes };
          const url = `dados/questoes/local/${id}.json`;
          const cache = await caches.open(CACHE_DADOS);
          await cache.put(new Request(url), new Response(JSON.stringify(cad), { headers: { "content-type": "application/json" } }));
          const locais = lerLS("cadernos-locais", []).filter(c => c.id !== id);
          locais.push({ id, titulo, materia: r.materia, url, qtd: r.questoes.length, atualizadoEm: agoraISO() });
          gravarLS("cadernos-locais", locais);
          await carregarQuestoes();
          res.innerHTML = `<p class="txt-ok" style="margin-top:12px">✓ "${esc(titulo)}" adicionado com ${r.questoes.length} questões. <a href="#/caderno/${esc(id)}" data-fechar>Abrir o caderno</a></p>`;
          const pq = location.hash.match(/^#\/questoes\/(cadernos|pasta\/([^/]+))/);
          if (pq) telaQuestoes(pq[2] || null);                  // atualiza a lista sem fechar o painel
          ok();
        };
      });
    }
  };
}

/* =====================================================================
   REVISÃO RÁPIDA: só o que você marcou numa lei (grifos, anotações,
   favoritos e desenhos), em sequência, com o texto completo do artigo.
   ===================================================================== */
async function telaRevisao(leiId) {
  const lei = await leiDoCache(leiId);
  if (!lei) { $("#conteudo").innerHTML = `<p class="vazio">Lei não encontrada neste aparelho.</p>`; return; }
  leiAberta = leiId; larguraCache = null;
  definirTopo({ titulo: "Revisão: " + nomeLei(leiId), voltar: `#/lei/${leiId}` });
  $("#abas").classList.add("oculto");
  $("#conteudo").classList.add("modo-leitor");
  const marcas = marcasDaLei(leiId);
  const favs = new Set(itens("favorito", f => f.lei === leiId && f.art).map(f => f.art));
  const prep = prepararLei(lei);
  const escolhidos = prep.arts.filter(a => marcas.has(a.id) || favs.has(a.id));
  if (!escolhidos.length) {
    $("#conteudo").innerHTML = `<div class="vazio"><p>Você ainda não marcou nada nesta lei.</p><p>Grife trechos, anote, favorite artigos ou desenhe com a caneta: tudo isso aparece aqui na revisão.</p></div>`;
    return;
  }
  let h = `<div class="leitor-wrap revisao"><div class="zoom-rolagem"><div id="zoom-caixa"><article class="texto-lei" id="texto-lei" lang="pt-BR">
    <p class="contagem revisao-cab">${escolhidos.length} artigo(s) marcado(s) · na ordem da lei · toque em “ver no texto completo” para abrir o artigo no lugar dele</p>`;
  for (const a of escolhidos) {
    const notas = marcas.get(a.id)?.notas || [];
    h += artigoHTML({ ...a, antes: [] }, null, leiId).replace(/<\/div>\s*$/, "") +
      (notas.length ? `<div class="revisao-notas">${notas.map(n => `<div class="revisao-nota">📝 ${esc(n.nota || "")}</div>`).join("")}</div>` : "") +
      `<a class="revisao-ir" href="#/lei/${esc(leiId)}/${encodeURIComponent(a.id)}">ver no texto completo ›</a></div>`;
  }
  h += `</article></div></div></div>`;
  $("#conteudo").innerHTML = h;
  $$("#texto-lei .artigo").forEach(div => aplicarMarcacoes(leiId, div));
}

/* =====================================================================
   OUVIR A LEI: leitura em voz alta (voz do próprio iPad, sem internet)
   ===================================================================== */
const ouvir = { ativo: false, fila: [], pos: 0, vel: lerLS("ouvir-vel", 1), falando: null };
function romanoParaNumero(r) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let n = 0;
  for (let i = 0; i < r.length; i++) { const a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; }
  return n;
}
function textoParaFala(div) {
  const clone = div.cloneNode(true);
  clone.querySelectorAll(".nota, .notalinha, .ind-notas, svg, .aviso-tinta, .rotulo-extra, button:not(.rotulo)").forEach(e => e.remove());
  return [...clone.querySelectorAll("p, .linha, li")].map(p => p.textContent).filter(Boolean).join("\n").split("\n")
    .map(l => l.replace(/\((Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Vide|Vig[êe]ncia|Acrescid[oa]|Renumerad[oa])[^)]*\)/gi, "")
      .replace(/^\s*Art\.\s*/i, "Artigo ")
      .replace(/§§/g, "parágrafos").replace(/§\s*/g, "parágrafo ")
      .replace(/^\s*([IVXLC]+)\s*[-–—]\s*/, (m, r) => `inciso ${romanoParaNumero(r)}: `)
      .replace(/^\s*([a-z])\)\s*/, (m, a) => `alínea ${a}: `)
      .replace(/\s+/g, " ").trim())
    .filter(l => l.length > 1);
}
function vozPortugues() {
  const vozes = speechSynthesis.getVoices();
  return vozes.find(v => v.lang === "pt-BR" && /luciana|felipe|google|premium|enhanced/i.test(v.name)) || vozes.find(v => v.lang === "pt-BR") || vozes.find(v => /^pt/.test(v.lang)) || null;
}
function ouvirAPartirDe(art) {
  if (!("speechSynthesis" in window)) { alert("Este aparelho não oferece leitura em voz alta no navegador."); return; }
  const divs = $$("#texto-lei .artigo");
  const k = Math.max(0, divs.findIndex(d => d.dataset.art === art));
  ouvir.fila = divs.slice(k).map(d => d.dataset.art);
  ouvir.pos = 0; ouvir.ativo = true; ouvir.modo = "artigos";
  montarPlayer();
  falarAtual();
}
function artigoNoTopo() {
  const divs = $$("#texto-lei .artigo");
  return (divs.find(d => d.getBoundingClientRect().bottom > 120) || divs[0])?.dataset.art;
}
function falarAtual() {
  speechSynthesis.cancel();
  $$(".artigo.lendo, .lendo").forEach(d => d.classList.remove("lendo"));
  if (!ouvir.ativo) return;
  if (ouvir.modo === "blocos") return falarBloco();
  const art = ouvir.fila[ouvir.pos];
  const div = art && document.getElementById("art-" + art);
  if (!div) { pararOuvir(); return; }
  div.classList.add("lendo");
  div.scrollIntoView({ block: "start", behavior: "smooth" });
  const partes = textoParaFala(div);
  const voz = vozPortugues();
  let i = 0;
  const proxima = () => {
    if (!ouvir.ativo || ouvir.fila[ouvir.pos] !== art) return;
    if (i >= partes.length) { ouvir.pos++; atualizarPlayer(); setTimeout(falarAtual, 350); return; }
    const u = new SpeechSynthesisUtterance(partes[i++]);
    u.lang = "pt-BR"; u.rate = ouvir.vel; if (voz) u.voice = voz;
    u.onend = proxima; u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") proxima(); };
    ouvir.falando = u;
    speechSynthesis.speak(u);
  };
  atualizarPlayer();
  proxima();
}
function pararOuvir() {
  ouvir.ativo = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $$(".artigo.lendo").forEach(d => d.classList.remove("lendo"));
  $("#player-ouvir")?.remove();
}
function montarPlayer() {
  $("#player-ouvir")?.remove();
  const p = document.createElement("div");
  p.id = "player-ouvir"; p.className = "player-ouvir";
  p.innerHTML = `<button data-ouvir="ant" title="Artigo anterior" aria-label="Artigo anterior">⏮</button>
    <button data-ouvir="pausa" id="ouvir-pausa" title="Pausar" aria-label="Pausar">⏸</button>
    <button data-ouvir="prox" title="Próximo artigo" aria-label="Próximo artigo">⏭</button>
    <span class="ouvir-rot" id="ouvir-rot"></span>
    <button data-ouvir="vel" id="ouvir-vel" title="Velocidade">${ouvir.vel}×</button>
    <button data-ouvir="fechar" title="Parar" aria-label="Parar">✕</button>`;
  ($("#camada-fixa") || document.body).appendChild(p);
  p.onclick = e => {
    const b = e.target.closest("[data-ouvir]"); if (!b) return;
    const a = b.dataset.ouvir;
    if (a === "fechar") return pararOuvir();
    if (a === "pausa") {
      if (speechSynthesis.paused) { speechSynthesis.resume(); b.textContent = "⏸"; }
      else if (speechSynthesis.speaking) { speechSynthesis.pause(); b.textContent = "▶️"; }
      else { b.textContent = "⏸"; falarAtual(); }
      return;
    }
    if (a === "ant") { ouvir.pos = Math.max(0, ouvir.pos - 1); falarAtual(); }
    if (a === "prox") { ouvir.pos = Math.min(ouvir.fila.length - 1, ouvir.pos + 1); falarAtual(); }
    if (a === "vel") {
      const vs = [0.8, 1, 1.2, 1.4, 1.7]; ouvir.vel = vs[(vs.indexOf(ouvir.vel) + 1) % vs.length]; gravarLS("ouvir-vel", ouvir.vel);
      b.textContent = ouvir.vel + "×"; falarAtual();
    }
  };
}
function atualizarPlayer() {
  const r = $("#ouvir-rot"); if (!r) return;
  const art = ouvir.fila[ouvir.pos];
  if (ouvir.modo === "blocos") { r.textContent = art ? `🔊 ${art.rotulo || ""}` : ""; return; }
  r.textContent = art ? `🔊 ${rotuloArt(art)}` : "";
}
/* OUVIR OS RESUMOS: o texto é dividido em blocos (parágrafos ou páginas) e lido a partir de onde você está */
function ouvirBlocos(blocos, k = 0) {
  if (!("speechSynthesis" in window)) { alert("Este aparelho não oferece leitura em voz alta no navegador."); return; }
  if (!blocos.length) { alert("Não encontrei texto para ler neste resumo."); return; }
  ouvir.modo = "blocos"; ouvir.fila = blocos; ouvir.pos = Math.max(0, Math.min(k, blocos.length - 1)); ouvir.ativo = true;
  montarPlayer();
  falarAtual();
}
function falarBloco() {
  const b = ouvir.fila[ouvir.pos];
  if (!b) { pararOuvir(); return; }
  if (!b.partes) { b.carregar().then(p => { b.partes = p; if (ouvir.ativo && ouvir.fila[ouvir.pos] === b) falarAtual(); }).catch(() => { b.partes = []; falarAtual(); }); return; }
  if (b.el) { b.el.classList.add("lendo"); b.el.scrollIntoView({ block: "start", behavior: "smooth" }); }
  const voz = vozPortugues();
  let i = 0;
  const proxima = () => {
    if (!ouvir.ativo || ouvir.fila[ouvir.pos] !== b) return;
    if (i >= b.partes.length) { ouvir.pos++; atualizarPlayer(); setTimeout(falarAtual, 250); return; }
    const u = new SpeechSynthesisUtterance(b.partes[i++]);
    u.lang = "pt-BR"; u.rate = ouvir.vel; if (voz) u.voice = voz;
    u.onend = proxima; u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") proxima(); };
    ouvir.falando = u;
    speechSynthesis.speak(u);
  };
  atualizarPlayer();
  proxima();
}
const frasesDe = t => (t || "").replace(/\s+/g, " ").trim().replace(/([.!?;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9§"“(])/g, "$1\n").split("\n").flatMap(f => f.length > 260 ? f.match(/.{1,240}(\s|$)/g) : [f]).map(f => f.trim()).filter(f => f.length > 1);
/* monta os blocos do resumo aberto: texto (parágrafos), Word (parágrafos de cada página) ou PDF (texto de cada página) */
function blocosDoResumo(r) {
  if (r.formato === "pdf") {
    return $$("#texto-lei .pagina-resumo").map(div => {
      const n = Number(div.dataset.pagina);
      return { el: div, rotulo: `página ${n}`, carregar: async () => { const pg = await visor.doc.getPage(n); const tc = await pg.getTextContent(); return frasesDe(tc.items.map(i => i.str + (i.hasEOL ? " " : "")).join("")); } };
    });
  }
  const raiz = r.formato === "docx" ? $("#texto-lei") : $("#leitura-resumo");
  if (!raiz) return [];
  return $$("h1, h2, h3, h4, p, li, td", raiz).filter(el => !el.closest("li p, td p") || el.tagName === "P").filter(el => el.textContent.trim().length > 1 && !el.closest(".meta-resumo, .aviso-tinta, svg"))
    .map(el => ({ el, rotulo: el.closest(".pagina-resumo") ? "página " + (el.closest(".pagina-resumo").dataset.art || "").slice(1) : "", partes: frasesDe(el.textContent) }));
}
function ouvirResumo(r) {
  if (ouvir.ativo) { pararOuvir(); return; }
  const blocos = blocosDoResumo(r);
  const k = blocos.findIndex(b => b.el && b.el.getBoundingClientRect().bottom > 140);
  ouvirBlocos(blocos, k < 0 ? 0 : k);
}

/* =====================================================================
   DESENHOS QUE ACOMPANHAM O TEXTO (leis)
   Cada traço e ícone guarda a letra do texto onde começou ("âncora").
   Com outro tamanho de letra ou outra largura de tela, o desenho é
   reposicionado junto com aquele trecho e redimensionado na proporção.
   ===================================================================== */
function nosDeTexto(div) {
  const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest("svg, .aviso-tinta, .ind-notas")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const lista = []; let n;
  while ((n = w.nextNode())) lista.push(n);
  return lista;
}
function ancoraDe(div, x, y) {                          // x, y: posição do desenho dentro do artigo
  if (!document.caretRangeFromPoint) return null;
  const r = div.getBoundingClientRect(), z = fz();
  const caneta = document.body.classList.contains("modo-caneta");
  if (caneta) document.body.classList.remove("modo-caneta");          // com a caneta ligada o texto fica "invisível" para o toque
  const naMesmaLinha = o => { const q = retanguloDoCaractere(div, o); return q && y >= q[1] - q[2] * 0.6 && y <= q[1] + q[2] * 1.6 ? q : null; };
  const tentar = cx => {
    const cr = document.caretRangeFromPoint(r.left + cx * z, r.top + y * z);
    if (!cr || !div.contains(cr.startContainer) || cr.startContainer.nodeType !== 3) return null;
    let o = 0;
    for (const n of nosDeTexto(div)) { if (n === cr.startContainer) { o += cr.startOffset; break; } o += n.data.length; }
    const q = naMesmaLinha(o);
    return q ? { o, x: q[0], y: q[1] } : null;
  };
  // primeiro onde o desenho começou; se ali não há texto desta linha (ex.: ícone na margem), procura a letra mais perto na mesma linha
  let a = tentar(x);
  const larg = r.width / z;
  for (let d = 12; !a && d < larg; d += 12) a = tentar(x + d) || (x - d > 0 ? tentar(x - d) : null);
  if (caneta) document.body.classList.add("modo-caneta");
  return a;
}
function retanguloDoCaractere(div, o) {
  let resto = o;
  for (const n of nosDeTexto(div)) {
    if (resto <= n.data.length) {
      const rg = document.createRange();
      rg.setStart(n, Math.min(resto, n.data.length)); rg.setEnd(n, Math.min(resto + 1, n.data.length));
      const q = rg.getClientRects()[0] || rg.getBoundingClientRect();
      if (!q || (!q.width && !q.height)) return null;
      const rr = div.getBoundingClientRect(), z = fz();
      return [+((q.left - rr.left) / z).toFixed(1), +((q.top - rr.top) / z).toFixed(1), +(q.height / z).toFixed(1)];
    }
    resto -= n.data.length;
  }
  return null;
}
function posicaoDoCaractere(div, o) {
  let resto = o;
  for (const n of nosDeTexto(div)) {
    if (resto <= n.data.length) {
      const rg = document.createRange();
      rg.setStart(n, Math.min(resto, n.data.length)); rg.setEnd(n, Math.min(resto + 1, n.data.length));
      const q = rg.getClientRects()[0] || rg.getBoundingClientRect();
      if (!q || (!q.width && !q.height)) return null;
      const r = div.getBoundingClientRect(), z = fz();
      return [+((q.left - r.left) / z).toFixed(1), +((q.top - r.top) / z).toFixed(1)];
    }
    resto -= n.data.length;
  }
  return null;
}
/* desenhos feitos com outro tamanho de letra / outra largura: mostrados ajustados (só para ver) */
function elementosAdaptados(div, item) {
  if (ehResumoAberto()) return [];
  const s = fonteAtual() / (item.fonte || fonteAtual());
  const mover = (anc, pts) => {
    if (anc) { const p = posicaoDoCaractere(div, anc.o); if (p) return pts.map((v, i) => +((i % 2 ? (v - anc.y) * s + p[1] : (v - anc.x) * s + p[0])).toFixed(1)); }
    return pts.map(v => +(v * s).toFixed(1));
  };
  const els = [];
  for (const t of item.tracos || []) {
    const el = elTraco({ ...t, pts: mover(t.anc, t.pts), esp: t.esp * s });
    el.removeAttribute("data-traco"); el.classList.add("adaptado"); els.push(el);
  }
  for (const c of item.carimbos || []) {
    const [x, y] = mover(c.anc, [c.x, c.y]);
    const el = elCarimbo({ ...c, x, y, tam: c.tam * s });
    el.removeAttribute("data-carimbo"); el.classList.add("adaptado"); els.push(el);
  }
  return els;
}
/* desenhos antigos (sem âncora) ganham âncora quando aparecem no tamanho em que foram feitos */
const ancorasPendentes = new Set();
function completarAncoras(div, item) {
  if (ehResumoAberto() || ancorasPendentes.has(item.id)) return;
  const longe = (anc, y) => anc && Math.abs(y - anc.y) > 45;                 // âncora numa linha distante: refaz
  const falta = (item.tracos || []).some(t => (!t.anc || longe(t.anc, t.pts[1])) && t.pts.length >= 2) || (item.carimbos || []).some(c => !c.anc || longe(c.anc, c.y));
  if (!falta) return;
  ancorasPendentes.add(item.id);
  requestAnimationFrame(async () => {
    let mudou = false;
    item.tracos = (item.tracos || []).map(t => { if ((t.anc && !longe(t.anc, t.pts[1])) || t.pts.length < 2) return t; const a = ancoraDe(div, t.pts[0], t.pts[1]); if (a) { mudou = true; return { ...t, anc: a }; } return t; });
    item.carimbos = (item.carimbos || []).map(c => { if (c.anc && !longe(c.anc, c.y)) return c; const a = ancoraDe(div, c.x, c.y); if (a) { mudou = true; return { ...c, anc: a }; } return c; });
    if (mudou) await bdGravar("itens", item);          // sem mudar a data: não é uma alteração sua
    ancorasPendentes.delete(item.id);
  });
}
