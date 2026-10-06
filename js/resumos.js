/* =====================================================================
   MEUS RESUMOS — caderno digital
   - Lista mostra só título, matéria e prévia (o conteúdo só é lido ao abrir).
   - Imagens ficam no mesmo armazenamento das anotações, comprimidas, e só
     carregam quando aparecem na tela.
   - Leitores de Word e PDF só são baixados quando você importa um arquivo.
   ===================================================================== */
const resumos = { lista: null, textos: null };
async function carregarResumos() {
  if (resumos.lista) return;
  resumos.lista = new Map();
  for (const r of await bdTodos("resumos")) resumos.lista.set(r.id, r);
  await migrarPastasResumos();
}
/* As pastas antigas dos resumos (matéria › assunto) viram pastas comuns, que aceitam qualquer nível.
   O código de cada pasta sai do próprio nome: dois aparelhos convertendo ao mesmo tempo criam a mesma pasta. */
const idPastaLegada = (m, a) => "pasta-r-" + hashCurto(m + (a ? "\u0001" + a : ""));
let migrandoResumos = false;
async function migrarPastasResumos() {
  const antigas = itens("materia").concat(itens("assunto"));
  const pendentes = [...resumos.lista.values()].filter(r => !r.apagado && (r.materia || r.lixeira?.materia) && r.pasta === undefined);
  if (migrandoResumos || (!antigas.length && !pendentes.length)) return;
  migrandoResumos = true;
  try {
    const garantir = async (m, a) => {
      const idM = idPastaLegada(m);
      const pm = estado.itens.get(idM);
      if (!pm || pm.apagado) await salvarItem({ id: idM, tipo: "pasta", area: "resumos", nome: m, pai: null, leis: [], cadernos: [] });
      if (!a) return idM;
      const idA = idPastaLegada(m, a);
      const pa = estado.itens.get(idA);
      if (!pa || pa.apagado) await salvarItem({ id: idA, tipo: "pasta", area: "resumos", nome: a, pai: idM, leis: [], cadernos: [] });
      return idA;
    };
    for (const i of antigas) { await garantir(i.tipo === "materia" ? i.nome : i.materia, i.tipo === "assunto" ? i.nome : ""); await apagarItem(i.id); }
    for (const r of pendentes) {
      if (r.materia) r.pasta = await garantir(r.materia, r.assunto || "");
      else r.pasta = "";
      if (r.lixeira && r.lixeira.materia) { r.lixeira.pasta = await garantir(r.lixeira.materia, r.lixeira.assunto || ""); delete r.lixeira.materia; delete r.lixeira.assunto; }
      delete r.materia; delete r.assunto;
      await salvarMeta(r, false);
    }
  } finally { migrandoResumos = false; }
}
const pastaDoResumo = r => (pastaViva(estado.itens.get(r.pasta)) ? r.pasta : null);
const resumosAtivos = () => [...resumos.lista.values()].filter(r => !r.apagado && !r.lixeira);
async function salvarMeta(r, tocar = true) {
  if (tocar) r.atualizadoEm = agoraISO();
  if (!r.criadoEm) r.criadoEm = r.atualizadoEm;
  await bdGravar("resumos", r);
  resumos.lista.set(r.id, r);
  if (tocar) gravarLS("ultima-mudanca", r.atualizadoEm);
}
async function lerConteudo(id) { return (await bdLer("resumos_conteudo", id))?.html || ""; }
function textoPlanoDe(html) {
  const d = document.createElement("template");
  d.innerHTML = html;
  return d.content.textContent.replace(/\s+/g, " ").trim();
}
async function gravarConteudo(id, html) {
  const texto = textoPlanoDe(html);
  await bdGravar("resumos_conteudo", { id, html, texto });
  if (resumos.textos) resumos.textos.set(id, semAcento(texto));
  return texto;
}
const imagensDoHtml = html => [...html.matchAll(/data-img="([^"]+)"/g)].map(m => m[1]);
async function excluirResumo(id) {
  const meta = resumos.lista.get(id);
  if (meta?.arquivo) await bdApagar("arquivos", meta.arquivo);
  await bdApagar("miniaturas", id);
  for (const t of itens("tinta", t => t.lei === "resumo:" + id)) await apagarItem(t.id);
  const html = await lerConteudo(id);
  for (const img of imagensDoHtml(html)) await bdApagar("imagens", img);
  await bdApagar("resumos_conteudo", id);
  const r = resumos.lista.get(id);
  await salvarMeta({ id, apagado: true, titulo: r?.titulo || "" });     // "apagado" evita ressuscitar no backup
}
/* ---------- limpeza do HTML colado ou importado (só o que o editor entende) ---------- */
const TAGS_RESUMO = new Set(["P", "H1", "H2", "H3", "H4", "STRONG", "EM", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "BR",
  "SPAN", "MARK", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "A", "SUB", "SUP"]);
const TROCA_TAG = { B: "STRONG", I: "EM", DIV: "P", H5: "H4", H6: "H4", STRIKE: "S", DEL: "S", INS: "U", FONT: "SPAN" };
function limparHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const visitar = no => {
    for (const el of [...no.children]) {
      visitar(el);
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "META", "LINK", "TITLE", "NOSCRIPT", "SVG", "CANVAS", "VIDEO", "AUDIO"].includes(el.tagName)) { el.remove(); continue; }
      let alvo = el;
      const nova = TROCA_TAG[el.tagName];
      if (nova) { alvo = document.createElement(nova); alvo.append(...el.childNodes); el.replaceWith(alvo); }
      if (!TAGS_RESUMO.has(alvo.tagName)) { alvo.replaceWith(...alvo.childNodes); continue; }
      const estilo = alvo.style;
      const manter = {};
      if (estilo) {
        if (estilo.color && alvo.tagName === "SPAN") manter.color = estilo.color;
        if (estilo.backgroundColor && ["SPAN", "MARK"].includes(alvo.tagName)) manter["background-color"] = estilo.backgroundColor;
        if (estilo.textAlign && /^(P|H\d|LI|BLOCKQUOTE)$/.test(alvo.tagName)) manter["text-align"] = estilo.textAlign;
        if (alvo.tagName === "IMG" && /%$/.test(estilo.width)) manter.width = estilo.width;
      }
      const href = alvo.tagName === "A" ? alvo.getAttribute("href") : null;
      const img = alvo.dataset?.img, src = alvo.tagName === "IMG" ? alvo.getAttribute("src") : null;
      const classe = alvo.tagName === "BLOCKQUOTE" && alvo.classList.contains("obs") ? "obs" : (alvo.tagName === "IMG" && alvo.classList.contains("img-esq") ? "img-esq" : "");
      for (const a of [...alvo.attributes]) alvo.removeAttribute(a.name);
      const css = Object.entries(manter).map(([k, v]) => `${k}:${v}`).join(";");
      if (css) alvo.setAttribute("style", css);
      if (href && /^(https?:|#\/)/.test(href)) { alvo.setAttribute("href", href); if (/^https?:/.test(href)) { alvo.setAttribute("target", "_blank"); alvo.setAttribute("rel", "noopener"); } }
      if (img) alvo.setAttribute("data-img", img);
      else if (src) alvo.setAttribute("data-src-colado", src);             // convertido depois em imagem guardada
      if (classe) alvo.className = classe;
      if (alvo.tagName === "SPAN" && !alvo.getAttribute("style")) alvo.replaceWith(...alvo.childNodes);
    }
  };
  visitar(tpl.content);
  // parágrafos vazios em sequência viram no máximo um
  let h = tpl.innerHTML.replace(/(<p>(\s|&nbsp;|<br>)*<\/p>){2,}/g, "<p><br></p>").replace(/^(<p>(\s|&nbsp;|<br>)*<\/p>)+/, "");
  return h;
}
/* imagens coladas/importadas: comprimidas e guardadas; no HTML fica só a referência */
async function guardarImagem(blob) {
  let comp = blob.type === "image/gif" ? blob : await comprimirImagem(blob);
  if (comp.size >= blob.size && /^image\/(jpeg|png|webp)$/.test(blob.type) && blob.size < 400000) comp = blob;   // já era leve: fica o original
  const id = uid();
  await bdGravar("imagens", { id, blob: comp, tipoMime: comp.type, atualizadoEm: agoraISO(), dono: "resumo" });
  return id;
}
async function internalizarImagens(raiz) {
  let perdidas = 0;
  for (const img of $$("img[data-src-colado]", raiz)) {
    const src = img.getAttribute("data-src-colado");
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error();
      const id = await guardarImagem(await r.blob());
      img.removeAttribute("data-src-colado");
      img.setAttribute("data-img", id);
    } catch { img.remove(); perdidas++; }
  }
  return perdidas;
}
/* mostra as imagens só quando chegam perto da tela */
const urlsImagens = new Map();
let observadorImg = null;
function ativarImagensResumo(raiz) {
  if (observadorImg) observadorImg.disconnect();
  observadorImg = new IntersectionObserver(async entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observadorImg.unobserve(e.target);
      const id = e.target.dataset.img;
      if (!urlsImagens.has(id)) { const r = await bdLer("imagens", id); if (r) urlsImagens.set(id, URL.createObjectURL(r.blob)); }
      if (urlsImagens.has(id)) e.target.src = urlsImagens.get(id);
      else e.target.alt = "Imagem não encontrada neste aparelho";
    }
  }, { rootMargin: "600px 0px" });
  $$("img[data-img]", raiz).forEach(i => { if (!i.getAttribute("src")) observadorImg.observe(i); });
}

/* ---------- tela principal: pastas (em qualquer nível) e miniaturas ---------- */
/* ordem: 1º fixados · 2º os que você alterou (desenhou, marcou ou editou), o mais recente em cima · depois por nome */
function ultimaAlteracaoResumos() {
  const m = new Map();
  for (const t of itens("tinta", t => String(t.lei).startsWith("resumo:"))) {
    const id = t.lei.slice(7), q = t.atualizadoEm || "";
    if (q > (m.get(id) || "")) m.set(id, q);
  }
  for (const r of resumos.lista.values()) if (r.editadoEm && r.editadoEm > (m.get(r.id) || "")) m.set(r.id, r.editadoEm);
  return m;
}
function ordenarResumos(lista) {
  const modo = lerLS("ordem-resumos", "alterados");
  const alt = modo === "alterados" ? ultimaAlteracaoResumos() : new Map();
  const nome = (a, b) => (a.titulo || a.origem || "").localeCompare(b.titulo || b.origem || "", "pt-BR", { numeric: true });
  return lista.slice().sort((a, b) => {
    const fa = a.fixado ? 0 : 1, fb = b.fixado ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const ta = alt.get(a.id) || "", tb = alt.get(b.id) || "";
    if (ta !== tb) return ta && tb ? tb.localeCompare(ta) : ta ? -1 : 1;
    return nome(a, b);
  });
}
async function telaResumos(filtro = "todas", pastaId = null) {
  await carregarResumos();
  const pasta = pastaId ? estado.itens.get(pastaId) : null;
  if (pastaId && !pastaViva(pasta)) { location.hash = "#/resumos"; return; }
  definirTopo({ titulo: pasta ? pasta.nome : "Meus Resumos", voltar: pasta ? voltarDaPasta("resumos", pastaId) : null });
  marcarAba("resumos");
  const busca = sessionStorage.getItem("busca-resumos") || "";
  const nLixo = itensDaLixeira().total;
  const ordem = lerLS("ordem-resumos", "alterados");
  $("#conteudo").innerHTML = `<div class="secao">
    ${pasta ? trilhaPasta("resumos", pastaId) : ""}
    <div class="acoes-linha">
      <button class="botao primario" id="importar-resumos">Importar Word ou PDF</button>
      <button class="botao" id="nova-pasta-res">+ Nova pasta</button>
      <button class="botao" id="selecionar-res">☑️ Selecionar</button>
      ${nLixo ? `<a class="botao" href="#/lixeira" style="text-decoration:none">🗑 Lixeira (${nLixo})</a>` : ""}
      ${pasta ? `<button class="botao" data-menu-pasta="${esc(pastaId)}">⋯ Opções da pasta</button>` : ""}
    </div>
    <input class="campo" id="busca-res" type="search" placeholder="Pesquisar por título, pasta ou conteúdo" autocomplete="off" style="margin-top:12px" value="${esc(busca)}">
    <div class="filtros" style="margin-top:10px">
      ${pasta ? "" : `<div class="segmentado" id="filtro-res">
        ${[["todas", "Todas"], ["favoritos", "⭐ Favoritos"], ["recentes", "🕐 Recentes"], ["arquivados", "📦 Arquivados"]].map(([v, r]) => `<button data-filtro-res="${v}" aria-pressed="${filtro === v}">${r}</button>`).join("")}
      </div>`}
      <select class="campo" id="ordem-res" aria-label="Ordem dos arquivos" style="width:auto">
        <option value="alterados" ${ordem === "alterados" ? "selected" : ""}>Ordem: alterados primeiro</option>
        <option value="nome" ${ordem === "nome" ? "selected" : ""}>Ordem: por nome</option></select>
    </div>
    <div id="lista-res"></div></div>`;
  const render = async () => {
    const termo = semAcento($("#busca-res").value.trim());
    sessionStorage.setItem("busca-resumos", $("#busca-res").value);
    let lista = resumosAtivos();
    let pastas = [];
    let h = "";
    const naPasta = id => r => pastaDoResumo(r) === (id || null);
    if (termo.length >= 2) {
      if (!resumos.textos) { resumos.textos = new Map(); for (const c of await bdTodos("resumos_conteudo")) resumos.textos.set(c.id, semAcento(c.texto || "")); }
      lista = lista.filter(r => semAcento([r.titulo, r.origem, textoCaminho(r.pasta)].join(" ")).includes(termo) || (resumos.textos.get(r.id) || "").includes(termo));
      pastas = pastasDe("resumos").filter(p => semAcento(p.nome).includes(termo));
      h += `<p class="contagem">${lista.length} resumo(s) e ${pastas.length} pasta(s) encontrado(s)</p>`;
    } else if (pasta) {
      pastas = pastasDe("resumos", pastaId).filter(p => !p.arquivada);
      lista = lista.filter(r => naPasta(pastaId)(r) && !r.arquivado);
    }
    else if (filtro === "favoritos") lista = lista.filter(r => r.favorito && !r.arquivado);
    else if (filtro === "arquivados") { lista = lista.filter(r => r.arquivado); pastas = pastasDe("resumos").filter(p => p.arquivada); }
    else if (filtro === "recentes") lista = lista.filter(r => !r.arquivado).sort((a, b) => (b.abertoEm || b.atualizadoEm).localeCompare(a.abertoEm || a.atualizadoEm)).slice(0, 24);
    else {
      pastas = pastasDe("resumos", null).filter(p => !p.arquivada);
      lista = lista.filter(r => naPasta(null)(r) && !r.arquivado);
    }
    if (filtro !== "recentes" || termo.length >= 2) lista = ordenarResumos(lista);
    const comp = !pasta && filtro === "todas" && termo.length < 2 && temCompartilhados();
    if (pastas.length || lista.length || comp) {
      h += `<div class="grade-resumos">${comp ? `<div class="tile-pasta tile-compartilhados">
          <button class="tile-abrir" data-href="#/resumos/compartilhados" aria-label="Abrir os resumos compartilhados pelo app">
            <span class="icone-pasta-grande" aria-hidden="true">📚</span>
            <span class="nome-arquivo">Compartilhados pelo app</span><span class="qtd-pasta">${compartilhados.indice.resumos.length} arquivo(s)</span></button>
        </div>` : ""}${pastas.map(p => `<div class="tile-pasta">
          <button class="tile-abrir" data-href="${esc(rotaPastaArea("resumos", p.id))}" aria-label="Abrir a pasta ${esc(p.nome)}">
            <span class="icone-pasta-grande" aria-hidden="true">${ICONE_PASTA}</span>
            <span class="nome-arquivo">${p.fixada ? "📌 " : ""}${esc(p.nome)}${p.arquivada ? " 📦" : ""}${p.publicada === true && cfgDono() ? " 👁" : ""}</span><span class="qtd-pasta">${esc(rotuloQtd("resumos", p.id))}</span></button>
          <button class="tile-mais" data-menu-pasta="${esc(p.id)}" aria-label="Opções da pasta">⋯</button>
        </div>`).join("")}${lista.map(tileResumo).join("")}</div>`;
    } else h += `<p class="vazio">${filtro === "favoritos" ? "Nenhum resumo favorito." : filtro === "arquivados" ? "Nada arquivado." : pasta ? "Pasta vazia. Importe arquivos para cá, crie uma subpasta ou mova resumos pelo botão ⋯." : "Nenhum resumo ainda. Importe seus arquivos do Word ou PDF."}</p>`;
    $("#lista-res").innerHTML = h;
    ativarMiniaturasResumos($("#lista-res"));
  };
  $("#busca-res").oninput = aoParar(render, 200);
  window.renderListaResumos = render;
  $$("[data-filtro-res]").forEach(b => b.onclick = () => { history.replaceState(null, "", "#/resumos/" + b.dataset.filtroRes); telaResumos(b.dataset.filtroRes); });
  $("#ordem-res").onchange = e => { gravarLS("ordem-resumos", e.target.value); render(); };
  $("#importar-resumos").onclick = () => painelImportarResumos(pastaId);
  selecaoRes.ativa = false; selecaoRes.ids.clear(); atualizarBarraSelecao();
  $("#selecionar-res").onclick = () => alternarSelecaoResumos();
  $("#nova-pasta-res").onclick = async () => { if (await novaPasta("resumos", pastaId)) render(); };
  // arrastar vários arquivos para a tela (no computador) também importa
  const zona = $("#conteudo");
  zona.ondragover = e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === "file")) { e.preventDefault(); zona.classList.add("soltando"); } };
  zona.ondragleave = () => zona.classList.remove("soltando");
  zona.ondrop = e => {
    const arqs = [...(e.dataTransfer?.files || [])].filter(f => /\.(docx|pdf|txt|md)$/i.test(f.name));
    zona.classList.remove("soltando");
    if (!arqs.length) return;
    e.preventDefault();
    painelImportarResumos(pastaId, arqs);
  };
  render();
  if (!compartilhados.indice) carregarCompartilhados().then(() => { if (temCompartilhados() && window.renderListaResumos === render) render(); });
}
function tileResumo(r) {
  const nome = r.origem || r.titulo || "Sem título";
  return `<div class="tile-resumo" data-id="${esc(r.id)}">
    <button class="tile-abrir" data-href="#/resumo/${esc(r.id)}" title="${esc(r.titulo || nome)}">
      <span class="miniatura" data-mini="${esc(r.id)}"><span class="mini-carregando">${r.formato === "pdf" ? "PDF" : r.formato === "docx" ? "DOC" : "TXT"}</span></span>
      <span class="nome-arquivo">${esc(nome)}</span>
    </button>
    ${r.favorito ? '<span class="selo-fav" aria-label="Favorito">★</span>' : ""}${r.fixado ? '<span class="selo-fixo" aria-label="Fixado no topo">📌</span>' : ""}${r.publicado && cfgDono() ? '<span class="selo-vis-res" title="Visível para outros usuários">👁</span>' : ""}
    <button class="tile-mais" data-menu-resumo="${esc(r.id)}" aria-label="Opções de ${esc(nome)}">⋯</button>
  </div>`;
}
/* cartão antigo (usado na pesquisa geral) continua disponível */
function cartaoResumo(r) {
  return `<li class="cartao-nota cartao-resumo">
    <div class="cab-resumo"><button class="origem titulo-resumo" data-href="#/resumo/${esc(r.id)}">${esc(r.titulo || "Sem título")}</button>
      <button class="icone-btn" data-menu-resumo="${esc(r.id)}" aria-label="Opções do resumo">⋯</button></div>
    <div class="meta">${esc(textoCaminho(r.pasta) || "Fora das pastas")} · ${esc(r.origem || "")}</div>
    ${r.previa ? `<div class="previa-resumo">${esc(r.previa)}</div>` : ""}</li>`;
}

/* ---------- miniaturas da primeira página (geradas uma vez e guardadas) ---------- */
let filaMiniaturas = Promise.resolve();
let observadorMini = null;
function ativarMiniaturasResumos(raiz) {
  if (observadorMini) observadorMini.disconnect();
  observadorMini = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observadorMini.unobserve(e.target);
      const el = e.target;
      filaMiniaturas = filaMiniaturas.then(() => mostrarMiniatura(el)).catch(() => {});     // uma de cada vez: não pesa
    }
  }, { rootMargin: "300px 0px" });
  $$("[data-mini]", raiz).forEach(el => observadorMini.observe(el));
}
async function mostrarMiniatura(el) {
  if (!el.isConnected) return;
  const id = el.dataset.mini;
  let m = await bdLer("miniaturas", id);
  if (!m) m = await gerarMiniatura(resumos.lista.get(id));
  if (!m || !el.isConnected) return;
  if (m.tipo === "img") {
    const img = new Image();
    img.alt = ""; img.decoding = "async";
    img.src = URL.createObjectURL(m.blob);
    el.replaceChildren(img);
  } else {
    // miniatura em HTML (Word e texto): uma "fotinha" da primeira página, reduzida
    const moldura = document.createElement("div");
    moldura.className = "mini-html";
    moldura.innerHTML = m.html;
    el.replaceChildren(moldura);
    const escala = el.clientWidth / (m.largura || 794);
    moldura.style.width = (m.largura || 794) + "px";
    moldura.style.transform = `scale(${escala})`;
  }
}
function tintaDaPrimeiraPagina(resumoId) {
  return itens("tinta", t => t.lei === "resumo:" + resumoId && t.art === "p1" && t.fonte === 0 && temConteudo(t))[0] || null;
}
function desenharTintaNoCanvas(ctx, t, k) {
  ctx.save(); ctx.scale(k, k);
  for (const tr of t.tracos || []) {
    if (!tr.pts || tr.pts.length < 2) continue;
    const marca = ehMarca(tr);
    ctx.strokeStyle = marca ? translucida(tr.cor, tr.cor === "#1F2A36" ? 0.22 : 0.35) : tr.cor;
    ctx.lineCap = marca ? "butt" : "round"; ctx.lineJoin = "round";
    for (const pt of partesDoTraco(tr)) { ctx.lineWidth = pt.esp; ctx.stroke(new Path2D(caminhoD(pt.pts))); }
  }
  ctx.globalAlpha = 0.62; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const c of t.carimbos || []) { ctx.font = `${c.tam}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.fillText(c.icone, c.x, c.y); }
  ctx.restore();
}
/* os estilos do Word usam o mesmo prefixo em todo documento; na grade, cada miniatura ganha o seu */
const prefixarClassesDocx = (html, prefixo) => html.replace(/\bdocx(?=[\s_"'.{:,>\-\[)]|$)/g, prefixo);
async function invalidarMiniatura(resumoId) { if (resumoId) await bdApagar("miniaturas", resumoId); }
async function gerarMiniatura(r) {
  if (!r) return null;
  let m = null;
  try {
    const tinta = tintaDaPrimeiraPagina(r.id);
    if (r.formato === "pdf") {
      const pdfjs = await abrirPdfJs();
      const blob = await lerArquivoOriginal(r); if (!blob) return null;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
      const pg = await doc.getPage(1);
      const base = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: 360 / base.width });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      if (tinta) {
        const k = c.width / LARGURA_PDF;
        for (const fg of tinta.figuras || []) { const reg = await bdLer("imagens", fg.img); if (reg) { const bmp = await createImageBitmap(reg.blob); ctx.drawImage(bmp, fg.x * k, fg.y * k, fg.w * k, fg.h * k); } }
        desenharTintaNoCanvas(ctx, tinta, k);      // os seus traços e ícones aparecem na miniatura
      }
      const img = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.72));
      c.width = 0; await doc.destroy();
      m = { id: r.id, tipo: "img", blob: img };
    } else if (r.formato === "docx") {
      const prefixo = "m" + r.id.replace(/[^a-z0-9]/gi, "").slice(0, 8);
      const tmp = document.createElement("div");
      tmp.style.cssText = "position:absolute;left:-99999px;top:0;width:900px";
      document.body.appendChild(tmp);
      const editado = (await bdLer("resumos_conteudo", r.id))?.html;
      if (editado) tmp.innerHTML = prefixarClassesDocx(editado, prefixo);      // a versão com as suas edições
      else {
        const docx = await abrirDocxPreview();
        const blob = await lerArquivoOriginal(r); if (!blob) { tmp.remove(); return null; }
        await docx.renderAsync(blob, tmp, tmp, { className: prefixo, inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true });
      }
      const secao = tmp.querySelector("section");
      const largura = secao ? secao.offsetWidth : 794;
      if (secao) {
        if (tinta) {
          secao.style.position = "relative"; desenharTracos(secao, tinta);
          for (const im of $$("image[data-figura]", secao)) { const fg = tinta.figuras.find(f => f.id === im.dataset.figura); const reg = fg && await bdLer("imagens", fg.img); if (reg) im.setAttribute("href", await blobParaDataUrl(reg.blob)); }
        }
        const artigo = secao.querySelector("article") || secao;
        let alt = 0;                                            // só o começo da primeira página
        for (const filho of [...artigo.children]) { if (filho.tagName === "svg") continue; if (alt > largura * 1.45) filho.remove(); else alt += filho.offsetHeight; }
        $$("section", tmp).forEach((sec, k) => { if (k > 0) sec.remove(); });
      }
      m = { id: r.id, tipo: "html", html: tmp.innerHTML, largura };
      tmp.remove();
    } else {
      const html = (await lerConteudo(r.id)).slice(0, 2500);
      m = { id: r.id, tipo: "html", html: `<div class="leitura-resumo mini-texto">${html}</div>`, largura: 600 };
    }
  } catch { return null; }
  await bdGravar("miniaturas", m);
  return m;
}

/* ---------- mover para outra pasta ---------- */
function painelMoverResumo(r, depois) { painelMover("resumos", r.id, r.titulo || r.origem || "Sem título", depois); }
/* (menu da pasta: ver js/arquivos.js) */

function menuResumo(id) {
  const r = resumos.lista.get(id);
  abrirPainel(`<h2>${esc(r.titulo || "Sem título")} ${botaoFechar}</h2><div class="acoes">
    <button data-href="#/resumo/${esc(id)}">👁️ Ler</button>
    ${r.formato === "pdf" || r.formato === "docx" ? "" : `<button data-href="#/resumo/${esc(id)}/editar">✏️ Editar</button>`}
    <button id="r-renomear">✏️ Renomear</button>
    <button id="r-duplicar">Duplicar resumo</button>
    <button id="r-copiar">📄 Copiar para outra pasta…</button>
    <button id="r-drive">☁️ Enviar ao Google Drive</button>
    <button id="r-materia">📁 Mover para pasta…</button>
    <button id="r-fixar">${r.fixado ? "📌 Desafixar do topo" : "📌 Fixar no topo"}</button>
    <button id="r-baixar">⬇️ Baixar…</button>
    ${botaoVisivelResumo(r)}
    <button id="r-arquivar">${r.arquivado ? "Tirar do arquivo" : "📦 Arquivar"}</button>
    <button id="r-excluir" style="color:var(--alt)">🗑 Mandar para a lixeira</button></div>`);
  $("#r-renomear").onclick = async () => { if (await renomearResumo(r)) { await invalidarMiniatura(r.id); fecharPainel(); rotear(); } };
  $("#r-copiar").onclick = () => escolherPasta("resumos", "Copiar para…", async d => { await duplicarResumo(r, d || "", ""); fecharPainel(); rotear(); mostrarAvisoRapido("📄 Copiado"); });
  $("#r-fixar").onclick = async () => { r.fixado = !r.fixado; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); fecharPainel(); rotear(); };
  $("#r-drive").onclick = () => painelExportarResumosDrive([r]);
  $("#r-duplicar").onclick = async () => {
    const novo = await duplicarResumo(r);
    fecharPainel(); location.hash = novo.formato === "pdf" || novo.formato === "docx" ? `#/resumo/${novo.id}` : `#/resumo/${novo.id}/editar`;
  };
  $("#r-materia").onclick = () => painelMoverResumo(r, () => rotear());
  $("#r-baixar").onclick = () => painelBaixar(r);
  $("#r-arquivar").onclick = async () => { r.arquivado = !r.arquivado; if (r.arquivado) await tirarDoArSeDono([r]); await salvarMeta(r); fecharPainel(); rotear(); };
  ligarVisivelResumo(r, () => rotear());
  $("#r-excluir").onclick = async () => {
    await resumoParaLixeira(r); fecharPainel(); rotear();
    mostrarAvisoRapido("🗑 Foi para a lixeira (dá para restaurar por 30 dias)");
  };
}

/* ---------- leitura ---------- */
const ajustesResumo = Object.assign({ fonte: 19, entrelinha: 1.75 }, lerLS("ajustes-resumo", {}));
let resumoAberto = null;
async function telaResumoLer(id) {
  await carregarResumos();
  const r = resumos.lista.get(id);
  if (!r || r.apagado) { $("#conteudo").innerHTML = `<p class="vazio">Resumo não encontrado.</p>`; return; }
  resumoAberto = id;
  definirTopo({ titulo: r.titulo || "Sem título", voltar: rotaPastaArea("resumos", pastaDoResumo(r)) });
  $("#abas").classList.add("oculto");
  r.abertoEm = agoraISO(); salvarMeta(r, false);
  if (r.formato === "pdf" || r.formato === "docx") return telaResumoOriginal(r);
  const html = await lerConteudo(id);
  const pos = lerLS("pos-resumo", {})[id] || 0;
  $("#conteudo").innerHTML = `<div class="barra-resumo">
      <button class="botao" data-href="#/resumo/${esc(id)}/editar">✏️ Editar</button>
      <button class="botao" id="res-aa">Aa</button>
      <button class="botao" id="res-baixar-txt">⬇️ Baixar</button>
      <button class="botao" id="res-foco">🎯 Modo foco</button>
      <button class="botao" id="res-ouvir-txt">🔊 Ouvir</button>
      <button class="botao" data-fav-resumo="${esc(id)}" aria-pressed="${!!r.favorito}">${r.favorito ? "★ Favorito" : "☆ Favoritar"}</button>
    </div>
    ${pos > 0.05 ? `<div class="aviso" id="aviso-continuar">Você parou em ${Math.round(pos * 100)}% deste resumo. <button class="link" id="continuar">Continuar de onde parou</button> · <button class="link" id="do-inicio">Começar do início</button></div>` : ""}
    <article class="leitura-resumo" id="leitura-resumo" style="--fonte-res:${ajustesResumo.fonte}px;--entre-res:${ajustesResumo.entrelinha}">
      <p class="meta-resumo">${esc(textoCaminho(r.pasta))}</p>
      ${html}
    </article>`;
  ativarImagensResumo($("#leitura-resumo"));
  $("#res-aa").onclick = painelAjustesResumo;
  $("#res-baixar-txt").onclick = () => painelBaixar(r);
  $("#res-foco").onclick = () => alternarFocoResumo();
  $("#res-ouvir-txt").onclick = () => ouvirResumo(r);
  if ($("#continuar")) {
    $("#continuar").onclick = () => { $("#aviso-continuar").remove(); rolarParaFracao(pos); };
    $("#do-inicio").onclick = () => $("#aviso-continuar").remove();
  }
  // guarda onde você está lendo (sem gravar a cada pixel)
  let t = null;
  window.onscroll = () => {
    if (resumoAberto !== id) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const el = $("#leitura-resumo"); if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      const f = total > 0 ? Math.min(1, Math.max(0, (window.scrollY - el.offsetTop) / total)) : 0;
      const m = lerLS("pos-resumo", {}); m[id] = +f.toFixed(3); gravarLS("pos-resumo", m);
    }, 500);
  };
}
function rolarParaFracao(f) {
  const el = $("#leitura-resumo");
  window.scrollTo({ top: el.offsetTop + f * (el.offsetHeight - window.innerHeight) });
}
function painelAjustesResumo() {
  const seg = (lista, atual, attr) => `<div class="segmentado">${lista.map(([v, n]) => `<button ${attr}="${v}" aria-pressed="${atual === v}">${n}</button>`).join("")}</div>`;
  abrirPainel(`<h2>Leitura do resumo ${botaoFechar}</h2>
    <div class="linha-ajuste"><span>Tamanho do texto</span><div class="segmentado"><button id="rf-menos">A−</button><button disabled>${ajustesResumo.fonte}</button><button id="rf-mais">A+</button></div></div>
    <div class="linha-ajuste" style="border:0"><span>Espaçamento</span>${seg([[1.5, "Justo"], [1.75, "Normal"], [2, "Amplo"]], ajustesResumo.entrelinha, "data-entre")}</div>`);
  const aplicar = () => {
    gravarLS("ajustes-resumo", ajustesResumo);
    const el = $("#leitura-resumo"); if (el) { el.style.setProperty("--fonte-res", ajustesResumo.fonte + "px"); el.style.setProperty("--entre-res", ajustesResumo.entrelinha); }
    painelAjustesResumo();
  };
  $("#rf-menos").onclick = () => { ajustesResumo.fonte = Math.max(14, ajustesResumo.fonte - 1); aplicar(); };
  $("#rf-mais").onclick = () => { ajustesResumo.fonte = Math.min(30, ajustesResumo.fonte + 1); aplicar(); };
  $$("[data-entre]").forEach(b => b.onclick = () => { ajustesResumo.entrelinha = Number(b.dataset.entre); aplicar(); });
}
function alternarFocoResumo(ligar = !document.body.classList.contains("foco-resumo")) {
  document.body.classList.toggle("foco-resumo", ligar);
  if (ligar && !$("#sair-foco")) {
    const b = document.createElement("button");
    b.id = "sair-foco"; b.className = "botao sair-foco"; b.textContent = "Sair do modo foco";
    b.onclick = () => alternarFocoResumo(false);
    document.body.appendChild(b);
  }
  if (!ligar) $("#sair-foco")?.remove();
}

/* ---------- editor ---------- */
const CORES_TEXTO = [["#1F2A36", "Preto"], ["#C62828", "Vermelho"], ["#1E5BD8", "Azul"], ["#15803D", "Verde"], ["#8A3B9E", "Roxo"], ["#B45309", "Laranja"]];
const CORES_MARCA_RES = [["#FFE58A", "Amarelo"], ["#BDEBC4", "Verde"], ["#BFDDF7", "Azul"], ["#F7C1C1", "Vermelho"], ["transparent", "Sem destaque"]];
const EMOJIS = ["⭐", "🔥", "🎯", "⚠️", "❗", "💡", "❓", "📌", "✅", "❌", "👉", "📖", "⚖️", "🚨", "🧠", "📝"];
async function telaResumoEditar(id) {
  await carregarResumos();
  const r = resumos.lista.get(id);
  if (!r || r.apagado) { $("#conteudo").innerHTML = `<p class="vazio">Resumo não encontrado.</p>`; return; }
  resumoAberto = id;
  definirTopo({ titulo: "Editar resumo", voltar: `#/resumo/${id}` });
  $("#abas").classList.add("oculto");
  const html = await lerConteudo(id);
  $("#conteudo").innerHTML = `<div class="editor-wrap">
    <input class="campo campo-titulo" id="ed-titulo" placeholder="Título do resumo" value="${esc(r.titulo)}">
    <div class="filtros"><button class="botao" id="ed-pasta">📁 ${esc(textoCaminho(r.pasta) || "Fora das pastas")} · mudar</button></div>
    <div class="barra-editor" id="barra-editor" role="toolbar" aria-label="Formatação">
      <button data-cmd="bold" title="Negrito (Ctrl+B)"><b>N</b></button>
      <button data-cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
      <button data-cmd="underline" title="Sublinhado (Ctrl+U)"><u>S</u></button>
      <span class="sep"></span>
      <button data-bloco="h2" title="Título (Ctrl+Alt+1)">T1</button>
      <button data-bloco="h3" title="Subtítulo (Ctrl+Alt+2)">T2</button>
      <button data-bloco="p" title="Texto normal (Ctrl+Alt+0)">¶</button>
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList" title="Lista com marcadores">•≡</button>
      <button data-cmd="insertOrderedList" title="Lista numerada">1≡</button>
      <button data-alinhar title="Alinhamento">⇔</button>
      <span class="sep"></span>
      <button data-painel="cor" title="Cor do texto"><span style="border-bottom:3px solid #C62828">A</span></button>
      <button data-painel="marca" title="Marca-texto">🖍️</button>
      <button data-painel="emoji" title="Emojis">😀</button>
      <span class="sep"></span>
      <button data-cmd="insertHorizontalRule" title="Separador">―</button>
      <button data-caixa="obs" title="Caixa de observação">📝</button>
      <button data-caixa="cit" title="Citação">❝</button>
      <button data-imagem title="Inserir imagem">🖼️</button>
      <span class="sep"></span>
      <button data-cmd="undo" title="Desfazer (Ctrl+Z)">↶</button>
      <button data-cmd="redo" title="Refazer (Ctrl+Shift+Z)">↷</button>
      <div class="painel-editor oculto" id="painel-editor"></div>
    </div>
    <div class="editor-resumo leitura-resumo" id="editor-resumo" contenteditable="true" spellcheck="true" style="--fonte-res:${ajustesResumo.fonte}px;--entre-res:${ajustesResumo.entrelinha}">${html}</div>
    <p class="status-salvo" id="status-salvo">Salvo</p>
    <div class="ferramentas-imagem oculto" id="ferramentas-imagem">
      <span class="contagem">Imagem:</span>
      ${[25, 50, 75, 100].map(p => `<button data-larg="${p}">${p}%</button>`).join("")}
      <button data-img-pos="centro">Centralizar</button><button data-img-pos="esq">À esquerda</button>
      <button data-img-apagar style="color:var(--alt)">Excluir</button>
    </div>
    <input type="file" id="entrada-img-resumo" accept="image/*" multiple hidden>
  </div>`;
  const ed = $("#editor-resumo");
  ativarImagensResumo(ed);
  document.execCommand("styleWithCSS", false, false);
  document.execCommand("defaultParagraphSeparator", false, "p");

  // ---- salvamento automático (um instante depois de parar de digitar) ----
  let tempo = null, salvoEm = Date.now(), pendente = false;
  const status = () => {
    const el = $("#status-salvo"); if (!el) return;
    if (pendente) { el.textContent = "Salvando…"; return; }
    const s = Math.round((Date.now() - salvoEm) / 1000);
    el.textContent = s < 5 ? "Salvo agora" : s < 60 ? `Salvo há ${s} segundos` : `Salvo há ${Math.round(s / 60)} min`;
  };
  const relogio = setInterval(() => { if (!document.getElementById("status-salvo")) clearInterval(relogio); else status(); }, 5000);
  const salvar = async () => {
    const clone = ed.cloneNode(true);
    $$("img[data-img]", clone).forEach(i => i.removeAttribute("src"));
    $$("img", clone).forEach(i => i.classList.remove("selecionada"));
    const conteudo = clone.innerHTML;
    const texto = await gravarConteudo(id, conteudo);
    Object.assign(r, { titulo: $("#ed-titulo").value.trim(), previa: texto.slice(0, 220), editadoEm: agoraISO() });
    await salvarMeta(r);
    pendente = false; salvoEm = Date.now(); status();
  };
  const agendar = () => { pendente = true; status(); clearTimeout(tempo); tempo = setTimeout(salvar, 900); };
  window.salvarResumoPendente = async () => { if (pendente) { clearTimeout(tempo); await salvar(); } };
  ed.addEventListener("input", agendar);
  $("#ed-titulo").addEventListener("input", agendar);
  $("#ed-pasta").onclick = () => painelMover("resumos", r.id, r.titulo || "Sem título", () => { $("#ed-pasta").textContent = "📁 " + (textoCaminho(r.pasta) || "Fora das pastas") + " · mudar"; });
  if (!r.titulo) $("#ed-titulo").focus();

  // ---- barra de formatação ----
  let selecaoSalva = null;
  const guardarSelecao = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) selecaoSalva = s.getRangeAt(0).cloneRange(); };
  const restaurarSelecao = () => { if (selecaoSalva) { const s = getSelection(); s.removeAllRanges(); s.addRange(selecaoSalva); } ed.focus(); };
  document.addEventListener("selectionchange", guardarSelecao);
  const barra = $("#barra-editor");
  barra.addEventListener("pointerdown", e => { if (e.target.closest("button")) e.preventDefault(); });   // não perde a seleção do texto
  const painel = $("#painel-editor");
  const blocoAtual = () => { let n = getSelection().anchorNode; while (n && n !== ed) { if (n.nodeType === 1 && /^(P|H[1-4]|LI|BLOCKQUOTE)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
  barra.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.closest("#painel-editor")) return;
    restaurarSelecao();
    if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
    else if (b.dataset.bloco) document.execCommand("formatBlock", false, b.dataset.bloco);
    else if (b.dataset.alinhar !== undefined) {
      const bl = blocoAtual(); if (!bl) return;
      const ordem = ["", "center", "right", "justify"];
      bl.style.textAlign = ordem[(ordem.indexOf(bl.style.textAlign || "") + 1) % ordem.length];
      agendar();
    }
    else if (b.dataset.caixa) {
      const bl = blocoAtual();
      const dentro = bl && bl.closest("blockquote");
      if (dentro && (dentro.className === (b.dataset.caixa === "obs" ? "obs" : ""))) document.execCommand("formatBlock", false, "p");   // tocar de novo tira a caixa
      else { document.execCommand("formatBlock", false, "blockquote"); const q = blocoAtual()?.closest("blockquote"); if (q) q.className = b.dataset.caixa === "obs" ? "obs" : ""; }
      agendar();
    }
    else if (b.dataset.imagem !== undefined) $("#entrada-img-resumo").click();
    else if (b.dataset.painel) {
      const tipo = b.dataset.painel;
      if (!painel.classList.contains("oculto") && painel.dataset.tipo === tipo) { painel.classList.add("oculto"); return; }
      painel.dataset.tipo = tipo;
      painel.innerHTML = tipo === "emoji" ? EMOJIS.map(x => `<button data-emoji="${x}">${x}</button>`).join("")
        : (tipo === "cor" ? CORES_TEXTO : CORES_MARCA_RES).map(([c, n]) => `<button data-cor-ed="${c}" title="${n}" aria-label="${n}"><span class="bolinha" style="background:${c === "transparent" ? "linear-gradient(135deg,#fff 45%,#c00 50%,#fff 55%)" : c}"></span></button>`).join("");
      painel.classList.remove("oculto");
    }
  });
  painel.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    restaurarSelecao();
    if (b.dataset.emoji) document.execCommand("insertText", false, b.dataset.emoji);
    else if (painel.dataset.tipo === "cor") { document.execCommand("styleWithCSS", false, true); document.execCommand("foreColor", false, b.dataset.corEd); document.execCommand("styleWithCSS", false, false); }
    else { document.execCommand("styleWithCSS", false, true); document.execCommand("hiliteColor", false, b.dataset.corEd); document.execCommand("styleWithCSS", false, false); }
    painel.classList.add("oculto");
    agendar();
  });
  // ---- atalhos de teclado ----
  ed.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.altKey && ["1", "2", "0"].includes(e.key)) { e.preventDefault(); document.execCommand("formatBlock", false, { 1: "h2", 2: "h3", 0: "p" }[e.key]); }
    if (mod && e.shiftKey && e.key === "7") { e.preventDefault(); document.execCommand("insertOrderedList"); }
    if (mod && e.shiftKey && e.key === "8") { e.preventDefault(); document.execCommand("insertUnorderedList"); }
  });
  // ---- colar: texto limpo; imagens comprimidas e guardadas ----
  const inserirImagens = async arquivos => {
    for (const f of arquivos) {
      if (!f.type.startsWith("image/")) continue;
      const imgId = await guardarImagem(f);
      restaurarSelecao();
      document.execCommand("insertHTML", false, `<img data-img="${imgId}" style="width:100%" alt="">`);
    }
    ativarImagensResumo(ed); agendar();
  };
  ed.addEventListener("paste", async e => {
    const dt = e.clipboardData; if (!dt) return;
    const imagens = [...dt.files].filter(f => f.type.startsWith("image/"));
    const htmlColado = dt.getData("text/html");
    e.preventDefault();
    if (imagens.length && !htmlColado) return inserirImagens(imagens);
    if (htmlColado) {
      const tmp = document.createElement("div");
      tmp.innerHTML = limparHtml(htmlColado);
      const perdidas = await internalizarImagens(tmp);
      document.execCommand("insertHTML", false, tmp.innerHTML);
      ativarImagensResumo(ed);
      if (perdidas) $("#status-salvo").textContent = `${perdidas} imagem(ns) não puderam ser copiadas; cole-as uma a uma.`;
    } else document.execCommand("insertText", false, dt.getData("text/plain"));
    agendar();
  });
  ed.addEventListener("dragover", e => { if ([...e.dataTransfer.items].some(i => i.kind === "file")) e.preventDefault(); });
  ed.addEventListener("drop", e => {
    const arqs = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    if (!arqs.length) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (pos) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); guardarSelecao(); }
    inserirImagens(arqs);
  });
  $("#entrada-img-resumo").onchange = e => { const a = [...e.target.files]; e.target.value = ""; inserirImagens(a); };
  // ---- imagem selecionada: tamanho, posição e excluir ----
  const ferr = $("#ferramentas-imagem");
  let imgSel = null;
  ed.addEventListener("click", e => {
    $$("img.selecionada", ed).forEach(i => i.classList.remove("selecionada"));
    imgSel = e.target.tagName === "IMG" ? e.target : null;
    if (imgSel) imgSel.classList.add("selecionada");
    ferr.classList.toggle("oculto", !imgSel);
  });
  ferr.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b || !imgSel) return;
    if (b.dataset.larg) imgSel.style.width = b.dataset.larg + "%";
    if (b.dataset.imgPos) imgSel.classList.toggle("img-esq", b.dataset.imgPos === "esq");
    if (b.dataset.imgApagar !== undefined) { const idImg = imgSel.dataset.img; imgSel.remove(); imgSel = null; ferr.classList.add("oculto"); if (idImg) await bdApagar("imagens", idImg); }
    agendar();
  });
}

/* ---------- importar Word, PDF, texto ---------- */
const scriptsCarregados = {};
function carregarScript(src) {
  return scriptsCarregados[src] || (scriptsCarregados[src] = new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete scriptsCarregados[src]; erro(new Error("Não foi possível carregar " + src + ". Verifique a internet.")); };
    document.head.appendChild(s);
  }));
}
/* opções de pasta para listas de escolha (todas as pastas, com recuo mostrando o nível) */
function opcoesPastas(area, atual) {
  const out = [];
  const descer = (pai, nivel) => { for (const p of pastasDe(area, pai)) { out.push(`<option value="${esc(p.id)}" ${p.id === atual ? "selected" : ""}>${"\u00a0\u00a0\u00a0".repeat(nivel)}${nivel ? "└ " : ""}📁 ${esc(p.nome)}</option>`); descer(p.id, nivel + 1); } };
  descer(null, 0);
  return out.join("");
}
function painelImportarResumos(pastaAtual = null, arquivosSoltos = null) {
  abrirPainel(`<h2>Importar resumos ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Word (.docx), PDF, texto (.txt) ou Markdown (.md). <strong>Dá para escolher vários de uma vez:</strong> no iPad, toque em <em>Selecionar</em> (no canto de cima da janela de arquivos) e marque quantos quiser. A janela também mostra o Google Drive, o iCloud Drive e outras nuvens instaladas. No computador, dá para arrastar vários arquivos para a tela.</p>
    <div class="linha-ajuste"><span>Pasta</span>
      <select class="campo" id="imp-pasta"><option value="">Fora das pastas (início)</option>${opcoesPastas("resumos", pastaAtual)}<option value="__nova">+ Nova pasta…</option></select></div>
    <div class="acoes" style="margin-top:10px"><button class="botao primario" id="imp-escolher">${arquivosSoltos ? `Importar ${arquivosSoltos.length} arquivo(s)` : "Escolher arquivos"}</button>
      ${arquivosSoltos ? "" : '<button class="botao" id="imp-drive">☁️ Escolher no Google Drive</button>'}</div>
    <input type="file" id="imp-arquivos" multiple accept=".docx,.pdf,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden>
    <div id="imp-progresso"></div>`);
  $("#imp-pasta").onchange = async e => {
    if (e.target.value !== "__nova") return;
    const anterior = pastaAtual;
    const p = await novaPasta("resumos", null);
    if (p) { pastaAtual = p.id; e.target.innerHTML = `<option value="">Fora das pastas (início)</option>${opcoesPastas("resumos", p.id)}<option value="__nova">+ Nova pasta…</option>`; }
    else e.target.value = anterior || "";
  };
  const importar = async arquivos => {
    if (!arquivos.length) return;
    const pasta = $("#imp-pasta").value === "__nova" ? "" : $("#imp-pasta").value;
    const prog = $("#imp-progresso");
    $("#imp-escolher").disabled = true;
    const feitos = [];
    for (const [k, arq] of arquivos.entries()) {
      prog.innerHTML = `<p class="contagem">Importando ${k + 1} de ${arquivos.length}: ${esc(arq.name)}…</p>`;
      try {
        const f = await importarArquivo(arq, pasta, (a, b) => { prog.innerHTML = `<p class="contagem">Importando ${k + 1} de ${arquivos.length}: ${esc(arq.name)} (página ${a} de ${b})…</p>`; });
        feitos.push({ ok: true, ...f });
      } catch (err) { feitos.push({ ok: false, nome: arq.name, erro: err.message }); }
    }
    const ok = feitos.filter(f => f.ok).length;
    prog.innerHTML = `<p class="contagem" style="margin-top:12px"><strong>${ok} de ${feitos.length} importado(s).</strong></p><ul class="lista-cartoes">${feitos.map(f => f.ok
      ? `<li class="cartao-nota"><button class="origem" data-href="#/resumo/${esc(f.id)}">✓ ${esc(f.titulo)}</button><div class="meta">${f.detalhes}</div></li>`
      : `<li class="cartao-nota"><strong>✗ ${esc(f.nome)}</strong><div class="alerta">${esc(f.erro)}</div></li>`).join("")}</ul>`;
    $("#imp-escolher").disabled = false;
    if (location.hash.startsWith("#/resumos") && window.renderListaResumos) window.renderListaResumos();   // atualiza a lista sem fechar o painel
  };
  $("#imp-escolher").onclick = () => arquivosSoltos ? (importar(arquivosSoltos), arquivosSoltos = null) : $("#imp-arquivos").click();
  if ($("#imp-drive")) $("#imp-drive").onclick = async () => {
    const prog = $("#imp-progresso");
    try { prog.innerHTML = '<p class="contagem">Abrindo o Google Drive…</p>'; const arqs = await arquivosDoDrive(MIME_RESUMO); prog.innerHTML = ""; if (arqs.length) importar(arqs); }
    catch (e) { prog.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; }
  };
  $("#imp-arquivos").onchange = e => { const a = [...e.target.files]; e.target.value = ""; importar(a); };
}
function tituloDoArquivo(nome) {
  return nome.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").replace(/^\d+\s+/, "").trim();
}
async function importarArquivo(arq, pasta, aoProgresso) {
  const ext = (arq.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || ext === "docx") return importarOriginal(arq, ext, pasta, aoProgresso);
  let html = "", detalhes = "";
  if (ext === "docx") {
    await carregarScript("libs/mammoth.browser.min.js");
    const buf = await arq.arrayBuffer();
    // estilos próprios do seu Word (ex.: "Título Geral", "Sub 1") viram títulos
    const previa = await mammoth.convertToHtml({ arrayBuffer: buf });
    const estilos = [...new Set(previa.messages.map(m => (m.message.match(/paragraph style: '([^']+)'/) || [])[1]).filter(Boolean))];
    const mapa = ["u => u", "strike => s"];
    for (const n of estilos) {
      if (/t[ií]tulo|title|heading|cabe[çc]alho/i.test(n) && !/sub/i.test(n)) mapa.push(`p[style-name='${n}'] => h2:fresh`);
      else if (/sub\s*1|subt[ií]tulo/i.test(n)) mapa.push(`p[style-name='${n}'] => h3:fresh`);
      else if (/sub\s*[2-9]/i.test(n)) mapa.push(`p[style-name='${n}'] => h4:fresh`);
    }
    let nImg = 0;
    const r = await mammoth.convertToHtml({ arrayBuffer: buf }, {
      styleMap: mapa,
      convertImage: mammoth.images.imgElement(async img => {
        const bytes = await img.read();
        const id = await guardarImagem(new Blob([bytes], { type: img.contentType }));
        nImg++;
        return { src: "", "data-img": id };
      }),
    });
    html = r.value.replace(/<img src=""/g, "<img");
    detalhes = `Word · ${nImg} imagem(ns) comprimida(s)`;
  } else if (ext === "pdf") {
    await carregarScript("libs/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";
    const r = await pdfParaHtml(window.pdfjsLib, new Uint8Array(await arq.arrayBuffer()), aoProgresso);
    html = r.html;
    detalhes = `PDF · ${r.repetidas ? r.repetidas + " página(s) repetida(s) ignorada(s) · " : ""}${r.removidas} linha(s) de cabeçalho/rodapé removida(s)`;
    if (!html) throw new Error("Este PDF não tem texto selecionável (parece ser uma imagem escaneada).");
  } else if (["txt", "md", "markdown"].includes(ext)) {
    html = markdownSimples(await arq.text());
    detalhes = ext === "txt" ? "Texto" : "Markdown";
  } else throw new Error("Formato não suportado. Use Word (.docx), PDF, .txt ou .md.");
  html = limparHtml(html);
  // o primeiro título curto do arquivo vira o título do resumo (senão, o nome do arquivo)
  const tpl = document.createElement("template"); tpl.innerHTML = html;
  const primeiro = tpl.content.querySelector("h1,h2,h3");
  const titulo = primeiro && primeiro.textContent.trim().length < 90 ? primeiro.textContent.trim() : tituloDoArquivo(arq.name);
  const r = { id: uid(), titulo, pasta: pasta || "", favorito: false, arquivado: false, origem: arq.name };
  const texto = await gravarConteudo(r.id, html);
  r.previa = texto.slice(0, 220);
  await salvarMeta(r);
  return { id: r.id, titulo, detalhes: `${detalhes} · ${Math.round(texto.length / 1000)} mil caracteres` };
}
function markdownSimples(t) {
  const esc2 = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  let html = "", lista = null;
  for (const linha of t.replace(/\r/g, "").split("\n")) {
    const l = linha.trim();
    const m = l.match(/^(#{1,4})\s+(.*)$/), li = l.match(/^[-*•]\s+(.*)$/), ln = l.match(/^\d+[.)]\s+(.*)$/);
    const tipo = li ? "ul" : ln ? "ol" : null;
    if (lista && lista !== tipo) { html += `</${lista}>`; lista = null; }
    if (m) html += `<h${Math.min(4, m[1].length + 1)}>${esc2(m[2])}</h${Math.min(4, m[1].length + 1)}>`;
    else if (tipo) { if (!lista) { html += `<${tipo}>`; lista = tipo; } html += `<li>${esc2((li || ln)[1])}</li>`; }
    else if (/^(-{3,}|_{3,})$/.test(l)) html += "<hr>";
    else if (/^>\s?/.test(l)) html += `<blockquote>${esc2(l.replace(/^>\s?/, ""))}</blockquote>`;
    else if (l) html += `<p>${esc2(l)}</p>`;
  }
  if (lista) html += `</${lista}>`;
  return html;
}

/* ---------- leitor de PDF (texto, títulos, listas, negrito/itálico) ---------- */
/* Converte um PDF em HTML de resumo: junta letras em palavras, linhas em parágrafos,
   reconhece títulos, listas, negrito/itálico e caixas recuadas; remove cabeçalhos e rodapés
   repetidos e páginas duplicadas. */
async function pdfParaHtml(pdfjsLib, dados, aoProgresso) {
  const doc = await pdfjsLib.getDocument({ data: dados, disableFontFace: true, isEvalSupported: false }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    await pg.getOperatorList();                 // carrega as fontes (para saber o que é negrito/itálico)
    const tc = await pg.getTextContent();
    const fonte = nome => { try { return pg.commonObjs.get(nome).name || ""; } catch { return ""; } };
    const itens = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const f = fonte(it.fontName);
      itens.push({ x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]), s: it.str,
                   b: /bold|black|heavy|semibold/i.test(f),
                   // itálico: fonte itálica ou letra "inclinada" (muitos PDFs gerados por navegador fazem assim)
                   i: /italic|oblique/i.test(f) || Math.abs(it.transform[2]) > Math.abs(it.transform[0]) * 0.08 });
    }
    paginas.push({ n, alt: vp.height, larg: vp.width, linhas: agruparLinhas(itens) });
    pg.cleanup();
    if (aoProgresso) aoProgresso(n, doc.numPages);
  }
  await doc.destroy();
  return montarHtml(paginas);
}
function agruparLinhas(itens) {
  itens.sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of itens) {
    let l = linhas.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
    if (!l) { l = { y: it.y, itens: [] }; linhas.push(l); }
    l.itens.push(it);
  }
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x - b.x);
    const runs = []; let fim = null; let texto = "";
    for (const it of l.itens) {
      let s = it.s;
      if (fim !== null && it.x - fim > it.h * 0.14 && !/\s$/.test(texto) && !/^\s/.test(s)) s = " " + s;
      const u = runs[runs.length - 1];
      if (u && u.b === it.b && u.i === it.i) u.s += s; else runs.push({ s, b: it.b, i: it.i });
      texto += s; fim = it.x + it.w;
    }
    l.runs = runs; l.texto = texto.replace(/\s+/g, " ").trim();
    l.x = l.itens[0].x; l.fim = fim; l.h = Math.max(...l.itens.map(i => i.h));
    l.negrito = l.itens.filter(i => i.s.trim()).every(i => i.b);
    l.italico = l.itens.filter(i => i.s.trim()).every(i => i.i);
  }
  return linhas.filter(l => l.texto).sort((a, b) => a.y - b.y);
}
function montarHtml(paginas) {
  // 1) páginas repetidas (mesmo texto) saem
  // (página quase igual a uma anterior, por exemplo a mesma página impressa de novo com um rabisco, também conta)
  const unicas = []; let repetidas = 0;
  for (const p of paginas) {
    const linhas = new Set(p.linhas.filter(l => l.texto.length > 3).map(l => l.texto));
    const igual = unicas.some(u => { let comum = 0; for (const t of linhas) if (u.conj.has(t)) comum++; return linhas.size && comum / Math.max(linhas.size, u.conj.size) > 0.9; });
    if (igual) { repetidas++; continue; }
    p.conj = linhas; unicas.push(p);
  }
  // 2) cabeçalhos e rodapés: linhas no topo/rodapé que se repetem em mais de uma página, contadores e endereços
  // números só são ignorados em linhas com cara de rodapé (endereço, data/hora, "3/10"); o resto compara o texto exato
  const chave = t => (/https?:|\d+\s*\/\s*\d+|\d{1,2}:\d{2}/.test(t) ? t.replace(/\d+/g, "#") : t).toLowerCase();
  const cont = new Map(), naBorda = new Set(), paginasDe = new Map();
  for (const p of unicas) for (const l of p.linhas) {
    const k = chave(l.texto);
    if (!paginasDe.has(k)) paginasDe.set(k, new Set());
    paginasDe.get(k).add(p.n);
    if (l.y < 120 || l.y > p.alt - 60) { cont.set(k, (cont.get(k) || 0) + 1); naBorda.add(k); }
  }
  let removidas = 0;
  for (const p of unicas) p.linhas = p.linhas.filter(l => {
    const k = chave(l.texto);
    const borda = l.y < 120 || l.y > p.alt - 60;
    // aviso que aparece no topo de uma página e no fim do documento (ex.: marca d'água do material) também sai
    const aviso = naBorda.has(k) && paginasDe.get(k).size > 1 && l.texto.length > 45;
    const tirar = aviso || (borda && (cont.get(k) > 1 || /^https?:\/\//.test(l.texto) || /^\d+\s*\/\s*\d+$/.test(l.texto)));
    if (tirar) removidas++;
    return !tirar;
  });
  const todas = unicas.flatMap(p => p.linhas.map(l => ({ ...l, pag: p })));
  if (!todas.length) return { html: "", repetidas, removidas };
  // medidas do texto comum
  const alturas = todas.map(l => Math.round(l.h * 2) / 2).sort((a, b) => a - b);
  const corpo = alturas[Math.floor(alturas.length / 2)];
  const esquerdas = todas.filter(l => Math.abs(l.h - corpo) < 1).map(l => Math.round(l.x)).sort((a, b) => a - b);
  const margemEsq = esquerdas[Math.floor(esquerdas.length * 0.1)] || 40;
  const margemDir = Math.max(...todas.map(l => l.fim));
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const runsHtml = runs => runs.map(r => { let s = esc(r.s); if (r.i) s = `<em>${s}</em>`; if (r.b) s = `<strong>${s}</strong>`; return s; }).join("").replace(/<\/strong><strong>/g, "").replace(/<\/em><em>/g, "");
  // blocos
  const blocos = [];
  let atual = null;
  const RE_LISTA_NUM = /^(\d{1,2})[.)]\s+/, RE_BOLINHA = /^[•◦▪●\-–]\s+/;
  todas.forEach((l, k) => {
    const ant = todas[k - 1];
    const titulo = l.h > corpo * 1.12 || (l.negrito && l.texto.length < 90 && Math.abs((l.x + l.fim) / 2 - l.pag.larg / 2) < 30 && l.x > margemEsq + 40);
    const recuo = l.x - margemEsq;
    const tipoLista = RE_LISTA_NUM.test(l.texto) ? "ol" : RE_BOLINHA.test(l.texto) ? "ul" : null;
    const continua = atual && ant && ant.pag === l.pag && !titulo && !tipoLista && atual.tipo !== "h"
      && l.y - ant.y < ant.h * 1.9 && ant.fim > margemDir * 0.82 && Math.abs(l.x - atual.x) < 14;
    const continuaItem = atual && atual.tipo === "li" && ant && !titulo && !tipoLista && l.y - ant.y < ant.h * 1.9 && l.x > atual.xLista + 4 && ant.fim > margemDir * 0.75;
    if (continua || continuaItem) { atual.runs.push({ s: " ", b: false, i: false }, ...l.runs); return; }
    if (titulo) { atual = { tipo: "h", nivel: l.h > corpo * 1.3 ? 2 : 3, runs: l.runs, x: l.x }; blocos.push(atual); return; }
    if (tipoLista) {
      const runs = l.runs.slice(); runs[0] = { ...runs[0], s: runs[0].s.replace(tipoLista === "ol" ? RE_LISTA_NUM : RE_BOLINHA, "") };
      atual = { tipo: "li", lista: tipoLista, runs, x: l.x, xLista: l.x }; blocos.push(atual); return;
    }
    atual = { tipo: recuo > 18 ? "caixa" : "p", runs: l.runs, x: l.x }; blocos.push(atual);
  });
  let html = "", listaAberta = null;
  for (const b of blocos) {
    if (b.tipo !== "li" && listaAberta) { html += `</${listaAberta}>`; listaAberta = null; }
    const conteudo = runsHtml(b.runs).trim();
    if (!conteudo) continue;
    if (b.tipo === "h") html += `<h${b.nivel}>${conteudo.replace(/<\/?strong>/g, "")}</h${b.nivel}>`;
    else if (b.tipo === "li") { if (listaAberta !== b.lista) { if (listaAberta) html += `</${listaAberta}>`; html += `<${b.lista}>`; listaAberta = b.lista; } html += `<li>${conteudo}</li>`; }
    else if (b.tipo === "caixa") html += `<blockquote>${conteudo}</blockquote>`;
    else html += `<p>${conteudo}</p>`;
  }
  if (listaAberta) html += `</${listaAberta}>`;
  html = html.replace(/<\/blockquote><blockquote>/g, "<br>").replace(/<\/em>(\s*)<em>/g, "$1").replace(/<\/strong>(\s*)<strong>/g, "$1");
  return { html, repetidas, removidas };
}

/* =====================================================================
   RESUMOS NO VISUAL ORIGINAL (PDF e Word)
   - PDF: páginas desenhadas iguais ao original; só as páginas perto da tela
     ficam desenhadas (as outras são liberadas da memória).
   - Word: mostrado com as cores, destaques, tabelas e imagens do arquivo;
     o texto pode ser editado e a edição fica salva no app.
   - Nos dois: caneta, marca-texto, ícones e borracha por cima de cada página.
   ===================================================================== */
const LARGURA_PDF = 760;                    // largura fixa da página: os desenhos ficam sempre no lugar certo
const visor = { doc: null, observador: null, desenhadas: new Map(), textos: new Map(), id: null };
const ehResumoAberto = () => typeof leiAberta === "string" && leiAberta.startsWith("resumo:");
function fonteAtual() { return ehResumoAberto() ? 0 : ajustes.fonte; }
async function lerArquivoOriginal(r) { return r.arquivo ? (await bdLer("arquivos", r.arquivo))?.blob || null : null; }
function fecharVisor() {
  if (visor.observador) visor.observador.disconnect();
  for (const c of visor.desenhadas.values()) { c.width = 0; c.height = 0; }
  visor.desenhadas.clear(); visor.textos.clear();
  if (visor.doc) { visor.doc.destroy(); visor.doc = null; }
  visor.id = null;
}

async function telaResumoOriginal(r) {
  fecharVisor();
  zerarZoom();
  visor.id = r.id;
  leiAberta = "resumo:" + r.id;             // a caneta usa o mesmo sistema da leitura das leis
  larguraCache = null;
  $("#conteudo").classList.add("modo-leitor");
  const pos = lerLS("pos-resumo", {})[r.id] || 0;
  const editado = r.formato === "docx" && (await bdLer("resumos_conteudo", r.id))?.html;
  removerDock();
  $("#conteudo").innerHTML = `
    ${pos > 0.05 ? `<div class="aviso" id="aviso-continuar">Você parou em ${Math.round(pos * 100)}% deste resumo. <button class="link" id="continuar">Continuar de onde parou</button> · <button class="link" id="do-inicio">Começar do início</button></div>` : ""}
    <div class="barra-editor barra-docx oculto" id="barra-docx">
      <button data-cmd="bold"><b>N</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="underline"><u>S</u></button>
      <span class="sep"></span>
      ${CORES_TEXTO.map(([c, n]) => `<button data-cor-docx="${c}" title="${n}"><span class="bolinha" style="background:${c}"></span></button>`).join("")}
      <span class="sep"></span>
      ${CORES_MARCA_RES.slice(0, 4).map(([c, n]) => `<button data-marca-docx="${c}" title="Marca-texto ${n}"><span class="bolinha" style="background:${c}"></span></button>`).join("")}
      <span class="sep"></span>
      <button id="docx-imagem" title="Inserir imagem">🖼️</button>
      <span class="sep"></span>
      <button data-cmd="undo">↶</button><button data-cmd="redo">↷</button>
      <button id="docx-concluir" class="botao primario" style="min-width:90px">Concluir</button>
      <span class="status-salvo" id="status-salvo" style="margin-left:auto"></span>
    </div>
    <div id="leitura-resumo" class="visor-original">
      <div class="zoom-rolagem"><div id="zoom-caixa"><div id="texto-lei" class="paginas-resumo" style="width:${r.formato === "pdf" ? LARGURA_PDF + "px" : "max-content"}"><p class="vazio">Abrindo o arquivo…</p></div></div></div>
    </div>`;
  montarDock(r);
  $("#res-caneta").onclick = () => alternarCaneta();
  $("#res-foco").onclick = () => alternarFocoResumo();
  $("#res-buscar").onclick = () => painelBuscarOriginal(r);
  $("#res-ouvir").onclick = () => ouvirResumo(r);
  $("#res-mais").onclick = () => menuResumoOriginal(r, !!editado);
  try {
    if (r.formato === "pdf") await montarPdf(r);
    else await montarDocx(r, editado);
    caberNaTela();
  } catch (e) {
    const nuvem = typeof cfgSync === "function" && cfgSync() && /não está neste aparelho/.test(e.message);
    $("#texto-lei").innerHTML = nuvem
      ? `<div class="vazio"><p>O arquivo original deste resumo ainda não chegou da nuvem a este aparelho.</p>
          <div class="acoes" style="justify-content:center"><button class="botao primario" id="buscar-nuvem">☁️ Buscar na nuvem agora</button></div>
          <p class="contagem" id="msg-nuvem"></p></div>`
      : `<p class="vazio">Não foi possível abrir o arquivo: ${esc(e.message)}</p>`;
    if (nuvem) $("#buscar-nuvem").onclick = async () => {
      $("#buscar-nuvem").disabled = true; $("#msg-nuvem").textContent = "Buscando… (arquivos grandes podem levar alguns segundos)";
      await sincronizar("arquivo faltando");
      if (await lerArquivoOriginal(r)) telaResumoLer(r.id);
      else $("#msg-nuvem").textContent = estSync().erro ? "⚠️ " + estSync().erro : "O arquivo ainda não está na nuvem. Abra o app no outro aparelho com internet para ele terminar de enviar, e tente de novo.";
    };
    return;
  }
  if ($("#continuar")) {
    $("#continuar").onclick = () => { $("#aviso-continuar").remove(); rolarParaFracao(pos); };
    $("#do-inicio").onclick = () => $("#aviso-continuar").remove();
  }
  if ($("#res-editar-docx")) $("#res-editar-docx").onclick = () => editarDocx(r);
  let t = null;
  window.onscroll = () => {
    if (visor.id !== r.id) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const el = $("#leitura-resumo"); if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      const f = total > 0 ? Math.min(1, Math.max(0, (window.scrollY - el.offsetTop) / total)) : 0;
      const m = lerLS("pos-resumo", {}); m[r.id] = +f.toFixed(3); gravarLS("pos-resumo", m);
    }, 500);
  };
}

/* ---------- PDF ---------- */
async function abrirPdfJs() {
  await carregarScript("libs/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";
  return window.pdfjsLib;
}
async function montarPdf(r) {
  const pdfjs = await abrirPdfJs();
  const blob = await lerArquivoOriginal(r);
  if (!blob) throw new Error("o arquivo original não está neste aparelho");
  visor.doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const cont = $("#texto-lei");
  let h = "";
  for (let n = 1; n <= visor.doc.numPages; n++) {
    const pg = await visor.doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const alt = Math.round(LARGURA_PDF * vp.height / vp.width);
    h += `<div class="artigo pagina-resumo" id="art-p${n}" data-art="p${n}" data-pagina="${n}" style="height:${alt}px"><span class="num-pagina">${n}</span></div>`;
  }
  cont.innerHTML = h;
  // desenha só as páginas perto da tela; as que ficam longe são liberadas
  visor.observador = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      const n = Number(e.target.dataset.pagina);
      if (e.isIntersecting) pedirPaginaPdf(n, e.target);
      else { filaPdf.pedidas.delete(n); liberarPaginaPdf(n, e.target); }
    }
  }, { rootMargin: "900px 600px" });
  $$(".pagina-resumo", cont).forEach(p => visor.observador.observe(p));
  $$(".pagina-resumo", cont).forEach(p => pintarTinta(leiAberta, p));
}
/* Fila de desenho das páginas do PDF: uma de cada vez, a mais perto do meio da tela primeiro, e só quando
   a rolagem dá uma pausa (desenhar no meio do movimento é o que travava a rolagem com zoom). */
const filaPdf = { pedidas: new Map(), rodando: false, ultimaRolagem: 0 };
document.addEventListener("scroll", () => { filaPdf.ultimaRolagem = performance.now(); }, { capture: true, passive: true });
function pedirPaginaPdf(n, div, nitida = false) {
  if (!nitida && visor.desenhadas.has(n)) return;
  filaPdf.pedidas.set(n, { div, nitida });
  rodarFilaPdf();
}
async function rodarFilaPdf() {
  if (filaPdf.rodando) return;
  filaPdf.rodando = true;
  try {
    while (filaPdf.pedidas.size && visor.doc) {
      const parado = performance.now() - filaPdf.ultimaRolagem;
      if (parado < 140) { await new Promise(ok => setTimeout(ok, 140 - parado)); continue; }
      const meio = window.innerHeight / 2;
      let melhor = null, dist = Infinity;
      for (const [n, p] of filaPdf.pedidas) {
        if (!p.div.isConnected) { filaPdf.pedidas.delete(n); continue; }
        const r = p.div.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - meio);
        if (d < dist) { dist = d; melhor = n; }
      }
      if (melhor === null) break;
      const { div, nitida } = filaPdf.pedidas.get(melhor);
      filaPdf.pedidas.delete(melhor);
      await desenharPaginaPdf(melhor, div, nitida);
      await new Promise(ok => setTimeout(ok, 0));                 // deixa a tela respirar entre uma página e outra
    }
  } finally { filaPdf.rodando = false; }
}
/* nitidez com limite: no máximo ~6 milhões de pontos por página (páginas gigantes travavam o iPad) */
const LIMITE_PONTOS_PAGINA = 6e6;
async function desenharPaginaPdf(n, div, trocar = false) {
  if ((!trocar && visor.desenhadas.has(n)) || !visor.doc) return;
  const antigo = visor.desenhadas.get(n);
  const c = document.createElement("canvas");
  if (!antigo) visor.desenhadas.set(n, c);
  const pg = await visor.doc.getPage(n);
  const base = pg.getViewport({ scale: 1 });
  const escala = LARGURA_PDF / base.width;
  let dpr = Math.min((window.devicePixelRatio || 1) * Math.max(1, zoomConteudo), 4);       // mais nítido com zoom
  const area = (base.width * escala * dpr) * (base.height * escala * dpr);
  if (area > LIMITE_PONTOS_PAGINA) dpr *= Math.sqrt(LIMITE_PONTOS_PAGINA / area);
  if (antigo && Math.abs(antigo.width - base.width * escala * dpr) < 4) return;          // já está nessa nitidez
  const vp = pg.getViewport({ scale: escala * dpr });
  c.width = vp.width; c.height = vp.height;
  c.className = "canvas-pagina";
  try {
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    if (!div.isConnected || (visor.desenhadas.get(n) !== c && visor.desenhadas.get(n) !== antigo)) { c.width = 0; c.height = 0; return; }
    if (antigo && antigo.isConnected) { antigo.replaceWith(c); antigo.width = 0; antigo.height = 0; }      // troca sem piscar
    else div.prepend(c);
    visor.desenhadas.set(n, c);
    if (div.querySelector(".textLayer")) return;
    // camada de texto invisível: permite selecionar e copiar
    const camada = document.createElement("div");
    camada.className = "textLayer";
    const vpTexto = pg.getViewport({ scale: escala });
    camada.style.setProperty("--scale-factor", escala);
    div.insertBefore(camada, c.nextSibling);
    const tc = await pg.getTextContent();
    if (!visor.textos.has(n)) visor.textos.set(n, textoDaPaginaPdf(tc, base));
    await window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: camada, viewport: vpTexto }).promise;
  } catch { /* página liberada durante o desenho */ }
}
function liberarPaginaPdf(n, div) {
  const c = visor.desenhadas.get(n);
  if (!c) return;
  c.width = 0; c.height = 0; c.remove();
  div.querySelector(".textLayer")?.remove();
  visor.desenhadas.delete(n);
}

function textoDaPaginaPdf(tc, vp) {
  const itens = tc.items.filter(i => i.str).map(i => ({ x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]), s: i.str, b: false, i: false }));
  return agruparLinhas(itens).map(l => l.texto).join(" ");
}

/* ---------- Word ---------- */
async function abrirDocxPreview() {
  await carregarScript("libs/jszip.min.js");
  await carregarScript("libs/docx-preview.min.js");
  return window.docx;
}
async function montarDocx(r, editado) {
  const cont = $("#texto-lei");
  if (editado) cont.innerHTML = editado;
  else {
    const docx = await abrirDocxPreview();
    const blob = await lerArquivoOriginal(r);
    if (!blob) throw new Error("o arquivo original não está neste aparelho");
    cont.innerHTML = "";
    await docx.renderAsync(blob, cont, cont, { inWrapper: false, ignoreLastRenderedPageBreak: true, breakPages: true, useBase64URL: true, experimental: true });
  }
  $$("section.docx", cont).forEach((s, k) => { s.classList.add("artigo", "pagina-resumo"); s.id = "art-p" + (k + 1); s.dataset.art = "p" + (k + 1); pintarTinta(leiAberta, s); });
}
function editarDocx(r) {
  if (caneta.ativa) alternarCaneta(false);
  const cont = $("#texto-lei");
  const barra = $("#barra-docx");
  barra.classList.remove("oculto");
  $$("section.docx", cont).forEach(s => s.setAttribute("contenteditable", "true"));
  $("#res-editar-docx").classList.add("oculto");
  let tempo = null;
  const salvar = async () => {
    await internalizarImagensDocx(cont);
    const clone = cont.cloneNode(true);
    $$("[contenteditable]", clone).forEach(s => s.removeAttribute("contenteditable"));
    $$("svg.tinta, .aviso-tinta", clone).forEach(e => e.remove());
    $$("section.docx", clone).forEach(s => { s.classList.remove("artigo", "pagina-resumo"); s.removeAttribute("id"); });
    const texto = await gravarConteudoOriginal(r.id, clone.innerHTML);
    r.previa = texto.slice(0, 220); r.editadoEm = agoraISO(); await salvarMeta(r);
    $("#status-salvo").textContent = "Salvo agora";
  };
  const agendar = () => { $("#status-salvo").textContent = "Salvando…"; clearTimeout(tempo); tempo = setTimeout(salvar, 900); };
  window.salvarResumoPendente = async () => { clearTimeout(tempo); await salvar(); };
  cont.addEventListener("input", agendar);
  cont.addEventListener("input", ajustarCaixaZoom);
  let selDocx = null;
  document.addEventListener("selectionchange", () => { const s = getSelection(); if (s.rangeCount && cont.contains(s.anchorNode)) selDocx = s.getRangeAt(0).cloneRange(); });
  const voltarSelecao = () => { if (selDocx) { const s = getSelection(); s.removeAllRanges(); s.addRange(selDocx); } };
  cont.onpaste = async e => {
    const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
    if (!imgs.length) { setTimeout(async () => { await internalizarImagensDocx(cont); agendar(); }, 50); return; }
    e.preventDefault(); await inserirImagensDocx(imgs); agendar();
  };
  cont.ondragover = e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === "file")) e.preventDefault(); };
  cont.ondrop = async e => {
    const imgs = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/")); if (!imgs.length) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
    if (pos) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); }
    await inserirImagensDocx(imgs); agendar();
  };
  cont.onclick = e => ferramentasImagemDocx(barra.classList.contains("oculto") ? null : (e.target.tagName === "IMG" ? e.target : null));
  $("#docx-imagem").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = async () => { voltarSelecao(); await inserirImagensDocx([...inp.files]); agendar(); };
    inp.click();
  };
  barra.onpointerdown = e => { if (e.target.closest("button")) e.preventDefault(); };
  barra.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "docx-imagem") return;
    if (b.id === "docx-concluir") { ferramentasImagemDocx(null); salvar(); barra.classList.add("oculto"); $$("section.docx", cont).forEach(s => s.removeAttribute("contenteditable")); $("#res-editar-docx").classList.remove("oculto"); cont.removeEventListener("input", agendar); return; }
    document.execCommand("styleWithCSS", false, true);
    if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
    else if (b.dataset.corDocx) document.execCommand("foreColor", false, b.dataset.corDocx);
    else if (b.dataset.marcaDocx) document.execCommand("hiliteColor", false, b.dataset.marcaDocx);
    agendar();
  };
}
async function gravarConteudoOriginal(id, html) {
  invalidarMiniatura(id);
  const texto = textoPlanoDe(html.replace(/<style[\s\S]*?<\/style>/g, ""));
  await bdGravar("resumos_conteudo", { id, html, texto });
  if (resumos.textos) resumos.textos.set(id, semAcento(texto));
  return texto;
}

/* ---------- busca, menu e ações ---------- */
async function painelBuscarOriginal(r) {
  abrirPainel(`<h2>Buscar neste resumo ${botaoFechar}</h2>
    <input class="campo" id="busca-orig" type="search" placeholder="Palavra ou trecho" autocomplete="off"><div id="res-orig"></div>`);
  const campo = $("#busca-orig"); campo.focus();
  // o texto de todas as páginas é lido uma vez, em segundo plano, enquanto você digita
  const carregarTextos = (async () => {
    if (r.formato !== "pdf" || !visor.doc) return;
    for (let n = 1; n <= visor.doc.numPages; n++) if (!visor.textos.has(n)) {
      const pg = await visor.doc.getPage(n);
      visor.textos.set(n, textoDaPaginaPdf(await pg.getTextContent(), pg.getViewport({ scale: 1 })));
    }
  })();
  campo.oninput = aoParar(async () => {
    await carregarTextos;
    if (!$("#busca-orig")) return;
    const termo = semAcento(campo.value.trim());
    if (termo.length < 2) { $("#res-orig").innerHTML = ""; return; }
    const achados = [];
    if (r.formato === "pdf") {
      for (const [n, t] of [...visor.textos.entries()].sort((a, b) => a[0] - b[0])) {
        const p = semAcento(t).indexOf(termo);
        if (p >= 0) achados.push({ alvo: "p" + n, rot: `Página ${n}`, trecho: t.slice(Math.max(0, p - 50), p + termo.length + 70) });
      }
    } else {
      $$("#texto-lei p, #texto-lei td, #texto-lei li").forEach((el, k) => {
        const t = el.textContent; const p = semAcento(t).indexOf(termo);
        if (p >= 0 && achados.length < 60) { el.dataset.busca = "b" + k; achados.push({ el: "b" + k, rot: "Trecho", trecho: t.slice(Math.max(0, p - 50), p + termo.length + 70) }); }
      });
    }
    $("#res-orig").innerHTML = `<p class="contagem">${achados.length ? achados.length + " resultado(s)" : "Nada encontrado."}</p><ul class="resultados">${achados.map(a =>
      `<li><button data-ir-orig="${a.alvo || ""}" data-ir-el="${a.el || ""}"><span class="res-titulo">${a.rot}</span><span class="res-trecho">…${esc(a.trecho)}…</span></button></li>`).join("")}</ul>`;
    $$("[data-ir-orig]").forEach(b => b.onclick = () => {
      fecharPainel();
      const alvo = b.dataset.irOrig ? document.getElementById("art-" + b.dataset.irOrig) : document.querySelector(`[data-busca="${b.dataset.irEl}"]`);
      if (alvo) { alvo.scrollIntoView({ block: "start" }); if (b.dataset.irEl) { alvo.classList.add("alvo-busca"); setTimeout(() => alvo.classList.remove("alvo-busca"), 2500); } }
    });
  }, 250);
}
function menuResumoOriginal(r, editado) {
  abrirPainel(`<h2>${esc(r.titulo)} ${botaoFechar}</h2><div class="acoes">
    <button id="o-baixar">⬇️ Baixar (original, com marcações ou com edições)…</button>
    <button id="o-mover">📁 Mover para pasta…</button>
    ${r.formato === "pdf" ? '<button id="o-texto">Criar uma versão em texto editável</button>' : ""}
    ${editado ? '<button id="o-restaurar">Desfazer minhas edições (voltar ao Word original)</button>' : ""}
    <button id="o-tinta">Apagar desenhos e ícones deste resumo</button>
    </div><p class="contagem">${r.formato === "pdf" ? "O texto de um PDF não pode ser editado; marque por cima com a caneta. Se precisar editar o texto, crie a versão em texto editável (o visual original não é mantido nela)." : "As edições ficam salvas no app; o arquivo original continua guardado."}</p>`);
  $("#o-baixar").onclick = () => painelBaixar(r);
  $("#o-mover").onclick = () => painelMoverResumo(r, () => fecharPainel());
  if ($("#o-texto")) $("#o-texto").onclick = async () => {
    $("#o-texto").textContent = "Convertendo…";
    const pdfjs = await abrirPdfJs();
    const blob = await lerArquivoOriginal(r);
    const res = await pdfParaHtml(pdfjs, new Uint8Array(await blob.arrayBuffer()));
    const novo = { id: uid(), titulo: r.titulo + " — texto editável", pasta: r.pasta || "", formato: "html", favorito: false, arquivado: false };
    const texto = await gravarConteudo(novo.id, limparHtml(res.html));
    novo.previa = texto.slice(0, 220);
    await salvarMeta(novo);
    fecharPainel(); location.hash = `#/resumo/${novo.id}/editar`;
  };
  if ($("#o-restaurar")) $("#o-restaurar").onclick = async () => {
    if (!confirm("Voltar ao Word original? As suas edições de texto serão apagadas (os desenhos continuam).")) return;
    await bdApagar("resumos_conteudo", r.id); await invalidarMiniatura(r.id); fecharPainel(); telaResumoLer(r.id);
  };
  $("#o-tinta").onclick = async () => {
    const lista = itens("tinta", t => t.lei === "resumo:" + r.id);
    if (!lista.length) { $("#o-tinta").textContent = "Não há desenhos neste resumo"; return; }
    if (!confirm(`Apagar os desenhos e ícones de ${lista.length} página(s)?`)) return;
    for (const t of lista) await apagarItem(t.id);
    fecharPainel(); repintarTintas();
  };
}

/* ---------- importação no formato original ---------- */
async function importarOriginal(arq, ext, pasta, aoProgresso) {
  const arquivoId = uid();
  await bdGravar("arquivos", { id: arquivoId, blob: arq, nome: arq.name, atualizadoEm: agoraISO() });
  let titulo = tituloDoArquivo(arq.name), texto = "", detalhes = "";
  if (ext === "pdf") {
    const pdfjs = await abrirPdfJs();
    const res = await pdfParaHtml(pdfjs, new Uint8Array(await arq.arrayBuffer()), aoProgresso);   // só para o título e a busca
    const tpl = document.createElement("template"); tpl.innerHTML = res.html;
    const h = tpl.content.querySelector("h1,h2,h3");
    if (h && h.textContent.trim().length < 90) titulo = h.textContent.trim();
    texto = tpl.content.textContent.replace(/\s+/g, " ").trim();
    detalhes = "PDF no visual original";
    if (!texto) detalhes += " (sem texto selecionável: a busca não vai funcionar neste arquivo)";
  } else {
    await carregarScript("libs/jszip.min.js");
    const zip = await window.JSZip.loadAsync(arq);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) throw new Error("Este arquivo não parece ser um Word (.docx) válido.");
    // texto dos parágrafos (para a busca e a prévia); o primeiro parágrafo curto vira o título
    const decod = t => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const paragrafos = xml.split(/<\/w:p>/).map(p => decod([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join("")).trim()).filter(Boolean);
    texto = paragrafos.join(" ").replace(/\s+/g, " ");
    if (paragrafos[0] && paragrafos[0].length < 90) titulo = paragrafos[0];
    detalhes = "Word no visual original";
  }
  const r = { id: uid(), titulo, pasta: pasta || "", formato: ext === "pdf" ? "pdf" : "docx", arquivo: arquivoId, origem: arq.name, favorito: false, arquivado: false, previa: texto.slice(0, 220) };
  await bdGravar("resumos_conteudo", { id: r.id, html: "", texto });
  if (resumos.textos) resumos.textos.set(r.id, semAcento(texto));
  await salvarMeta(r);
  return { id: r.id, titulo, detalhes: `${detalhes} · ${(arq.size / 1048576).toFixed(1).replace(".", ",")} MB` };
}

/* =====================================================================
   BAIXAR: original, PDF com as suas marcações, Word com as suas edições
   ===================================================================== */
async function createImageBitmapParaPng(blob) {
  const bmp = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0); return new Promise(ok => c.toBlob(ok, "image/png"));
}
/* No iPad/iPhone, salvar um arquivo é pelo "Compartilhar → Salvar em Arquivos".
   No computador e no Android, o arquivo é baixado direto (vai para a pasta Downloads). */
function ehAparelhoApple() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
async function entregarArquivo(blob, nome) {
  const arq = new File([blob], nome, { type: blob.type });
  try { if (ehAparelhoApple() && navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: nome }); return; } }
  catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(arq); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const nomeBase = r => (r.origem || r.titulo || "resumo").replace(/\.[^.]+$/, "");
function hexParaRgb(hex) {
  if (!hex || hex === "marca") hex = "#E0B000";
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/* PDF original + os seus traços e ícones desenhados por cima (o texto do PDF continua selecionável) */
async function exportarPdfComMarcacoes(r, aviso, soGerar = false) {
  await carregarScript("libs/pdf-lib.min.js");
  const { PDFDocument, rgb, LineCapStyle } = window.PDFLib;
  const orig = await lerArquivoOriginal(r);
  if (!orig) throw new Error("o arquivo original não está neste aparelho");
  const pdf = await PDFDocument.load(await orig.arrayBuffer(), { ignoreEncryption: true });
  const paginas = pdf.getPages();
  const tintas = itens("tinta", t => t.lei === "resumo:" + r.id && temConteudo(t));
  const cacheIcone = new Map();
  for (const t of tintas) {
    const pag = paginas[Number(String(t.art).slice(1)) - 1];
    if (!pag) continue;
    const { width, height } = pag.getSize();
    const k = width / LARGURA_PDF;
    for (const tr of t.tracos || []) {
      if (!tr.pts || tr.pts.length < 4) continue;
      const [cr, cg, cb] = hexParaRgb(tr.cor);
      const marca = ehMarca(tr);
      for (const pt of partesDoTraco(tr)) pag.drawSvgPath(caminhoD(pt.pts), {
        x: 0, y: height, scale: k, borderColor: rgb(cr, cg, cb), borderWidth: pt.esp * k,
        borderOpacity: marca ? (tr.cor === "#1F2A36" ? 0.22 : 0.35) : 1,
        borderLineCap: marca ? LineCapStyle.Butt : LineCapStyle.Round,
      });
    }
    for (const fg of t.figuras || []) {           // imagens que você colocou por cima da página
      const reg = await bdLer("imagens", fg.img); if (!reg) continue;
      const bytes = await reg.blob.arrayBuffer();
      const emb = /png/.test(reg.blob.type) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes).catch(async () => pdf.embedPng(await (await createImageBitmapParaPng(reg.blob)).arrayBuffer()));
      pag.drawImage(emb, { x: fg.x * k, y: height - (fg.y + fg.h) * k, width: fg.w * k, height: fg.h * k });
    }
    for (const c of t.carimbos || []) {           // ícone vira uma pequena imagem (o PDF não tem emojis coloridos)
      if (!cacheIcone.has(c.icone)) {
        const cv = document.createElement("canvas"); cv.width = cv.height = 128;
        const ctx = cv.getContext("2d"); ctx.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.icone, 64, 70);
        const png = await new Promise(ok => cv.toBlob(ok, "image/png"));
        cacheIcone.set(c.icone, await pdf.embedPng(await png.arrayBuffer()));
      }
      const s = c.tam * k;
      pag.drawImage(cacheIcone.get(c.icone), { x: c.x * k - s / 2, y: height - c.y * k - s / 2, width: s, height: s, opacity: 0.62 });
    }
  }
  if (aviso) aviso(`${tintas.length} página(s) com marcações`);
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  if (soGerar) return blob;
  await entregarArquivo(blob, nomeBase(r) + " (com marcações).pdf");
}
/* Word com as suas edições: arquivo .doc que o Word, o Pages e o Google Docs abrem.
   Os estilos do documento são copiados para cada trecho (cores, faixas, destaques), porque
   o Word respeita melhor a formatação escrita direto no texto. */
async function exportarWordEditado(r, soGerar = false) {
  const salvo = (await bdLer("resumos_conteudo", r.id))?.html;
  const tmp = document.createElement("div");
  tmp.style.cssText = "position:absolute;left:-99999px;top:0;width:900px";
  document.body.appendChild(tmp);
  try {
    if (salvo) tmp.innerHTML = salvo;
    else {
      const docx = await abrirDocxPreview();
      await docx.renderAsync(await lerArquivoOriginal(r), tmp, tmp, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true });
    }
    $$("svg.tinta, .aviso-tinta", tmp).forEach(e => e.remove());
    const props = ["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration-line", "text-align",
                   "margin-top", "margin-bottom", "margin-left", "line-height", "padding-left", "border-top", "border-bottom", "border-left", "border-right"];
    const els = [...tmp.querySelectorAll("section *")];
    const estilos = els.map(el => {
      const cs = getComputedStyle(el), bloco = /^(P|H\d|LI|TD|TH|DIV|TABLE|ARTICLE)$/.test(el.tagName);
      return props.filter(k => (bloco || !/^(margin|padding|line-height|text-align)/.test(k))).map(k => {
        let v = cs.getPropertyValue(k);
        if (k === "background-color" && (v === "rgba(0, 0, 0, 0)" || v === "transparent")) return "";
        if (k.startsWith("border") && /none|0px/.test(v)) return "";
        if (k === "text-decoration-line") return v !== "none" ? `text-decoration:${v}` : "";
        return v ? `${k}:${v}` : "";
      }).filter(Boolean).join(";");
    });
    els.forEach((el, k) => {
      if (el.tagName === "IMG") { const w = Math.round(el.getBoundingClientRect().width); el.setAttribute("width", w); el.removeAttribute("height"); estilos[k] = `width:${w}px;height:auto`; }
      el.setAttribute("style", estilos[k]); el.removeAttribute("class");
    });
    $$("style", tmp).forEach(e => e.remove());
    $$("section", tmp).forEach(sec => { sec.removeAttribute("class"); sec.removeAttribute("style"); });
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(r.titulo || "")}</title>
<style>@page { size: 21cm 29.7cm; margin: 2cm; } body { font-family: "Times New Roman", serif; }</style></head><body>${tmp.innerHTML}</body></html>`;
    const blob = new Blob(["\ufeff", doc], { type: "application/msword" });
    if (soGerar) return blob;
    await entregarArquivo(blob, nomeBase(r) + " (editado).doc");
  } finally { tmp.remove(); }
}
/* Word (com edições e desenhos) em PDF: usa a impressão do iPad/computador ("Salvar como PDF") */
function imprimirResumoAberto() {
  document.body.classList.add("imprimindo-resumo");
  const fim = () => { document.body.classList.remove("imprimindo-resumo"); window.removeEventListener("afterprint", fim); };
  window.addEventListener("afterprint", fim);
  setTimeout(() => window.print(), 50);
  setTimeout(fim, 60000);
}
function painelBaixar(r) {
  const pdf = r.formato === "pdf", word = r.formato === "docx";
  const opcoes = [];
  if (pdf || word) opcoes.push(["original", `⬇️ Versão original, como foi adicionada (sem alterações) — ${pdf ? "PDF" : "Word"}`]);
  if (pdf) opcoes.push(["pdf-marcado", "⬇️ Versão original com as minhas marcações — PDF"]);
  if (word) opcoes.push(["word-editado", "⬇️ Versão original com as minhas alterações — Word (.doc)"]);
  if (word || r.formato === "html") opcoes.push(["imprimir", "⬇️ Versão com as minhas alterações e marcações — PDF"]);
  const nota = pdf ? "Num PDF, a versão com marcações já sai em PDF: traços, marca-texto e ícones por cima do original, com o texto ainda selecionável."
    : word ? "No Word saem as alterações de texto, as cores e o marca-texto do editor. Os desenhos e ícones da caneta não existem no formato Word; para levá-los junto, use a versão em PDF (abre a janela de impressão: toque em Compartilhar → Salvar em Arquivos)."
    : "A versão em PDF abre a janela de impressão: toque em Compartilhar → Salvar em Arquivos.";
  abrirPainel(`<h2>Baixar ${botaoFechar}</h2><div class="acoes">${opcoes.map(([v, t]) => `<button data-baixar="${v}">${t}</button>`).join("")}</div>
    <p class="contagem" id="msg-baixar">${nota}</p>`);
  $$("#painel-caixa [data-baixar]").forEach(b => b.onclick = async () => {
    const msg = $("#msg-baixar");
    const txt = b.textContent; b.disabled = true; b.textContent = "Preparando…";
    try {
      if (b.dataset.baixar === "original") await entregarArquivo(await lerArquivoOriginal(r), r.origem || nomeBase(r) + (pdf ? ".pdf" : ".docx"));
      else if (b.dataset.baixar === "pdf-marcado") await exportarPdfComMarcacoes(r, t => { msg.textContent = t; });
      else if (b.dataset.baixar === "word-editado") await exportarWordEditado(r);
      else { fecharPainel(); if (!location.hash.startsWith("#/resumo/" + r.id)) location.hash = "#/resumo/" + r.id; setTimeout(imprimirResumoAberto, 600); return; }
    } catch (e) { msg.textContent = "Não foi possível preparar o arquivo: " + e.message; }
    b.disabled = false; b.textContent = txt;
  });
}

/* =====================================================================
   BARRA FLUTUANTE DO RESUMO (acompanha a rolagem, discreta, recolhível)
   ===================================================================== */
function montarDock(r) {
  const recolhido = lerLS("dock-recolhido", false);
  const lado = lerLS("dock-lado", "direita");
  const d = document.createElement("div");
  d.id = "dock-resumo";
  d.className = "dock" + (recolhido ? " recolhido" : "") + (lado === "esquerda" ? " esquerda" : "");
  const setaRecolher = (rec, esq) => (rec ? (esq ? "›" : "‹") : (esq ? "‹" : "›"));
  d.setAttribute("role", "toolbar");
  d.innerHTML = `
    <button class="dock-btn" id="res-caneta" aria-pressed="false" title="Caneta, marca-texto e ícones" aria-label="Caneta">✏️</button>
    <button class="dock-btn" id="res-buscar" title="Buscar no resumo" aria-label="Buscar">🔍</button>
    <button class="dock-btn" id="res-ouvir" title="Ouvir em voz alta (a partir de onde você está)" aria-label="Ouvir">🔊</button>
    ${r.formato === "docx" ? '<button class="dock-btn" id="res-editar-docx" title="Editar o texto" aria-label="Editar texto">📝</button>' : ""}
    <button class="dock-btn" id="res-foco" title="Modo foco" aria-label="Modo foco">🎯</button>
    <button class="dock-btn estrela-dock" data-fav-resumo="${esc(r.id)}" aria-pressed="${!!r.favorito}" title="Favoritar" aria-label="Favoritar">${r.favorito ? "★" : "☆"}</button>
    <button class="dock-btn" id="res-baixar" title="Baixar (original, com marcações ou com edições)" aria-label="Baixar">⬇️</button>
    <button class="dock-btn" id="res-mais" title="Mais opções" aria-label="Mais opções">⋯</button>
    <button class="dock-btn" id="dock-lado" title="Levar a barra para o outro lado" aria-label="Trocar de lado">⇄</button>
    <button class="dock-alca" id="dock-alca" title="${recolhido ? "Mostrar ferramentas" : "Recolher"}" aria-label="Recolher ou mostrar as ferramentas">${setaRecolher(recolhido, lado === "esquerda")}</button>`;
  ($("#camada-fixa") || document.body).appendChild(d);
  $("#dock-alca").onclick = () => {
    const rec = !d.classList.contains("recolhido");
    d.classList.toggle("recolhido", rec); gravarLS("dock-recolhido", rec);
    $("#dock-alca").textContent = setaRecolher(rec, d.classList.contains("esquerda"));
  };
  $("#dock-lado").onclick = () => {
    const esq = !d.classList.contains("esquerda");
    d.classList.toggle("esquerda", esq); gravarLS("dock-lado", esq ? "esquerda" : "direita");
    $("#dock-alca").textContent = setaRecolher(false, esq);
  };
  $("#res-baixar").onclick = () => painelBaixar(r);
}
function removerDock() { $("#dock-resumo")?.remove(); }
