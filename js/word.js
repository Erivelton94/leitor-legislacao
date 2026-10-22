/* =====================================================================
   MODO WORD: editar o arquivo do Word dentro do app, com a faixa de abas
   parecida com a do Microsoft Word (Página Inicial, Inserir, Tabela,
   Revisão e Arquivo). Funciona no iPad e no computador. Salva sozinho e
   o arquivo original continua guardado (dá para voltar a ele).
   Baixar em .docx: o próprio app monta o arquivo do Word (texto, fontes,
   cores, marca-texto, títulos, listas, tabelas, imagens, links e quebras
   de página) para abrir no Word, no Google Docs ou no Pages.
   ===================================================================== */
const FONTES_WORD = ["Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Garamond", "Courier New", "Segoe UI", "Helvetica"];
const TAMANHOS_WORD = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const ESTILOS_WORD = [["p", "Normal"], ["h1", "Título 1"], ["h2", "Título 2"], ["h3", "Título 3"], ["blockquote", "Citação"]];
const CORES_WORD = ["#000000", "#404040", "#7F7F7F", "#BFBFBF", "#FFFFFF", "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050",
  "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0", "#1F3864", "#2F5496", "#833C0B", "#C55A11", "#375623"];
const MARCAS_WORD = ["#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#0000FF", "#FF0000", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080", "#C0C0C0", "#FFE58A", "#BDEBC4", "#BFDDF7", "#F7C1C1"];
const SIMBOLOS_WORD = ["§", "º", "ª", "°", "→", "←", "↔", "⇒", "✓", "✗", "•", "–", "—", "…", "≠", "≤", "≥", "±", "×", "÷", "€", "©", "®", "★", "⚠️", "📌", "✅", "❌", "💡", "⚖️"];

function htmlFaixaWord() {
  const b = (id, rot, tit, extra = "") => `<button class="w-btn" id="${id}" title="${tit}" aria-label="${tit}" ${extra}>${rot}</button>`;
  const cmd = (c, rot, tit) => `<button class="w-btn" data-wcmd="${c}" title="${tit}" aria-label="${tit}">${rot}</button>`;
  const grupo = (nome, html) => `<div class="w-grupo"><div class="w-grupo-itens">${html}</div><div class="w-grupo-nome">${nome}</div></div>`;
  return `<div class="faixa-word barra-docx oculto" id="barra-docx" role="toolbar" aria-label="Edição do Word">
    <div class="w-abas" role="tablist">
      ${[["arquivo", "Arquivo"], ["inicio", "Página Inicial"], ["inserir", "Inserir"], ["tabela", "Tabela"], ["revisao", "Revisão"]].map(([v, n]) =>
        `<button class="w-aba${v === "tabela" ? " oculto" : ""}" data-waba="${v}" role="tab" aria-selected="${v === "inicio"}">${n}</button>`).join("")}
      <span class="w-espaco"></span>
      <span class="status-salvo" id="status-salvo"></span>
      <button id="docx-concluir" class="botao primario w-concluir">✓ Concluir</button>
    </div>
    <div class="w-corpo">
      <div class="w-painel" data-wpainel="arquivo">
        ${grupo("Arquivo", b("w-salvar", "💾 Salvar agora", "Salvar agora (Ctrl+S)") + b("w-baixar-docx", "⬇️ Baixar Word (.docx)", "Baixar em .docx para abrir no Word") + b("w-baixar-pdf", "⬇️ Baixar PDF", "Baixar em PDF (janela de impressão)"))}
        ${grupo("Versões", b("w-original", "↩ Voltar ao original", "Desfazer todas as edições e voltar ao arquivo original"))}
      </div>
      <div class="w-painel ativo" data-wpainel="inicio">
        ${grupo("Desfazer", cmd("undo", "↶", "Desfazer (Ctrl+Z)") + cmd("redo", "↷", "Refazer (Ctrl+Y)"))}
        ${grupo("Fonte", `<div class="w-linha">
            <select class="w-sel w-sel-fonte" id="w-fonte" aria-label="Fonte">${FONTES_WORD.map(f => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join("")}</select>
            <select class="w-sel" id="w-tam" aria-label="Tamanho da fonte">${TAMANHOS_WORD.map(t => `<option value="${t}">${String(t).replace(".", ",")}</option>`).join("")}</select>
            ${b("w-maior", "A<sup>+</sup>", "Aumentar a fonte")}${b("w-menor", "A<sup>−</sup>", "Diminuir a fonte")}</div>
          <div class="w-linha">${cmd("bold", "<b>N</b>", "Negrito (Ctrl+B)")}${cmd("italic", "<i>I</i>", "Itálico (Ctrl+I)")}${cmd("underline", "<u>S</u>", "Sublinhado (Ctrl+U)")}${cmd("strikeThrough", "<s>abc</s>", "Tachado")}
            ${cmd("superscript", "x²", "Sobrescrito")}${cmd("subscript", "x₂", "Subscrito")}
            <span class="w-duplo">${b("w-cor", '<span class="w-letra-cor">A<span class="w-tira" id="w-tira-cor" style="background:#C00000"></span></span>', "Cor da fonte")}${b("w-cor-mais", "▾", "Escolher a cor da fonte")}</span>
            <span class="w-duplo">${b("w-marca", '<span class="w-letra-cor">🖍<span class="w-tira" id="w-tira-marca" style="background:#FFFF00"></span></span>', "Marca-texto")}${b("w-marca-mais", "▾", "Escolher a cor do marca-texto")}</span>
            ${b("w-limpar", "A<sub>✕</sub>", "Limpar a formatação")}${b("w-pincel", "🖌", "Pincel: copiar a formatação para outro trecho", 'aria-pressed="false"')}</div>`)}
        ${grupo("Parágrafo", `<div class="w-linha">${b("w-marcadores", "•≡", "Marcadores")}${b("w-numeracao", "1≡", "Numeração")}${b("w-recuo-menos", "⇤", "Diminuir o recuo")}${b("w-recuo-mais", "⇥", "Aumentar o recuo")}
            <select class="w-sel" id="w-entrelinhas" aria-label="Espaçamento entre linhas" title="Espaçamento entre linhas"><option value="">↕ Espaço</option>${["1", "1.15", "1.5", "2", "2.5", "3"].map(v => `<option value="${v}">${v.replace(".", ",")}</option>`).join("")}</select></div>
          <div class="w-linha">${cmd("justifyLeft", "⯇≡", "Alinhar à esquerda")}${cmd("justifyCenter", "≡", "Centralizar")}${cmd("justifyRight", "≡⯈", "Alinhar à direita")}${cmd("justifyFull", "☰", "Justificar")}
            ${b("w-espaco-antes", "¶↑", "Espaço antes do parágrafo")}${b("w-espaco-depois", "¶↓", "Espaço depois do parágrafo")}</div>`)}
        ${grupo("Estilos", `<select class="w-sel w-sel-estilo" id="w-estilo" aria-label="Estilo do parágrafo">${ESTILOS_WORD.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>`)}
      </div>
      <div class="w-painel" data-wpainel="inserir">
        ${grupo("Tabelas", b("w-tabela", "▦ Tabela", "Inserir tabela"))}
        ${grupo("Ilustrações", b("docx-imagem", "🖼️ Imagem", "Inserir imagem"))}
        ${grupo("Links", b("w-link", "🔗 Link", "Inserir link (Ctrl+K)"))}
        ${grupo("Páginas", b("w-quebra", "⤓ Quebra de página", "Inserir quebra de página") + b("w-linha-h", "― Linha", "Inserir linha horizontal"))}
        ${grupo("Texto", b("w-caixa", "▭ Caixa de destaque", "Inserir caixa de destaque") + b("w-simbolo", "Ω Símbolo", "Inserir símbolo"))}
      </div>
      <div class="w-painel" data-wpainel="tabela">
        ${grupo("Linhas", b("w-lin-acima", "+ Linha acima", "Inserir linha acima") + b("w-lin-abaixo", "+ Linha abaixo", "Inserir linha abaixo") + b("w-lin-excluir", "− Excluir linha", "Excluir a linha"))}
        ${grupo("Colunas", b("w-col-esq", "+ Coluna à esquerda", "Inserir coluna à esquerda") + b("w-col-dir", "+ Coluna à direita", "Inserir coluna à direita") + b("w-col-excluir", "− Excluir coluna", "Excluir a coluna"))}
        ${grupo("Célula", `<span class="w-duplo">${b("w-sombra", "🎨 Sombreamento", "Cor de fundo da célula")}</span>` + b("w-tab-excluir", "🗑 Excluir tabela", "Excluir a tabela inteira"))}
      </div>
      <div class="w-painel" data-wpainel="revisao">
        ${grupo("Localizar", b("w-localizar", "🔍 Localizar e substituir", "Localizar e substituir (Ctrl+F)"))}
        ${grupo("Contagem", b("w-contagem", "🔢 Contagem de palavras", "Contagem de palavras"))}
      </div>
    </div>
    <div class="w-cores oculto" id="w-cores" role="dialog" aria-label="Cores"></div>
    <div class="w-busca oculto" id="w-busca">
      <input class="campo" id="w-busca-txt" placeholder="Localizar" autocomplete="off">
      <input class="campo" id="w-troca-txt" placeholder="Substituir por" autocomplete="off">
      <button class="w-btn" id="w-busca-ant" title="Anterior">◀</button><button class="w-btn" id="w-busca-prox" title="Próximo">▶</button>
      <button class="w-btn" id="w-troca-uma">Substituir</button><button class="w-btn" id="w-troca-todas">Substituir tudo</button>
      <span class="contagem" id="w-busca-n"></span><button class="w-btn" id="w-busca-fechar" title="Fechar">✕</button>
    </div>
  </div>`;
}

/* ---------- deixar o Word mais fiel na tela ----------
   1) marcadores de lista feitos com as fontes Symbol/Wingdings (o iPad não tem): troca pelo símbolo comum equivalente;
   2) o número ou marcador da lista e o texto novo usam a fonte padrão do documento (e não a do app). */
const MARCADORES_SIMBOLO = { "\uF0B7": "•", "\uF0A7": "▪", "\uF0D8": "➢", "\uF076": "❖", "\uF0FC": "✓", "\uF0A8": "□", "\uF06F": "□", "\uF0E0": "→", "\uF0E8": "➔", "\uF0D2": "✓", "\uF0B2": "◇" };
function ajustarVisualDocx(cont) {
  for (const st of cont.querySelectorAll("style")) {
    const t = st.textContent;
    if (!/[\uF000-\uF0FF]/.test(t)) continue;
    st.textContent = t.replace(/(:before\s*\{[^}]*?content:\s*")([^"]*)("[^}]*\})/g, (m, a, txt, b) => {
      if (!/[\uF000-\uF0FF]/.test(txt)) return m;
      return a + txt.replace(/[\uF000-\uF0FF]/g, c => MARCADORES_SIMBOLO[c] || "•") + b.replace(/font-family:\s*(Symbol|Wingdings[^;]*|Webdings);/i, "font-family: Arial;");
    });
  }
  for (const s of cont.querySelectorAll("section.docx")) {
    if (s.style.fontFamily) continue;
    const art = s.querySelector("article"); if (!art) continue;
    const ref = document.createElement("span"); ref.textContent = "x"; art.appendChild(ref);       // um trecho "neutro" recebe a fonte padrão do documento
    const c = getComputedStyle(ref); s.style.fontFamily = c.fontFamily; s.style.fontSize = c.fontSize; ref.remove();
  }
}

/* ---------- abrir a edição ---------- */
function editarDocx(r) {
  if (caneta.ativa) alternarCaneta(false);
  const cont = $("#texto-lei");
  const barra = $("#barra-docx");
  barra.classList.remove("oculto");
  document.body.classList.add("editando-word");
  $$("section.docx", cont).forEach(s => {
    s.setAttribute("contenteditable", "true");
  });
  ajustarVisualDocx(cont);              // o que você escrever fora dos trechos do Word original usa a fonte padrão do documento
  $("#res-editar-docx")?.classList.add("oculto");
  let tempo = null, ativo = true;
  const salvar = async () => {
    await internalizarImagensDocx(cont);
    const clone = cont.cloneNode(true);
    $$("[contenteditable]", clone).forEach(s => s.removeAttribute("contenteditable"));
    $$("svg.tinta, .aviso-tinta, .camada-links", clone).forEach(e => e.remove());
    $$(".w-achado", clone).forEach(e => e.replaceWith(...e.childNodes));
    $$("section.docx", clone).forEach(s => { s.classList.remove("artigo", "pagina-resumo"); s.removeAttribute("id"); });
    const texto = await gravarConteudoOriginal(r.id, clone.innerHTML);
    r.previa = texto.slice(0, 220); r.editadoEm = agoraISO(); await salvarMeta(r);
    const st = $("#status-salvo"); if (st) st.textContent = "✓ Salvo";
  };
  const agendar = () => { const st = $("#status-salvo"); if (st) st.textContent = "Salvando…"; clearTimeout(tempo); tempo = setTimeout(salvar, 900); };
  window.salvarResumoPendente = async () => { clearTimeout(tempo); await salvar(); };
  cont.addEventListener("input", agendar);
  cont.addEventListener("input", ajustarCaixaZoom);

  // a seleção é guardada para os menus e as listas (que tiram o foco do texto) agirem no trecho certo
  let selDocx = null;
  const guardarSel = () => { const s = getSelection(); if (s.rangeCount && cont.contains(s.anchorNode)) selDocx = s.getRangeAt(0).cloneRange(); };
  const voltarSelecao = () => {
    if (!selDocx) return;
    const no = selDocx.startContainer, sec = (no.nodeType === 1 ? no : no.parentElement)?.closest("section.docx");
    if (sec && document.activeElement !== sec) sec.focus({ preventScroll: true });        // o iPad só aplica a formatação com o texto em foco
    const s = getSelection(); s.removeAllRanges(); s.addRange(selDocx);
  };
  const aoMudarSel = () => { if (!ativo) return; guardarSel(); agendarEstado(); };
  document.addEventListener("selectionchange", aoMudarSel);

  const executar = (c, v = null) => { voltarSelecao(); document.execCommand("styleWithCSS", false, true); document.execCommand(c, false, v); guardarSel(); agendar(); agendarEstado(); };
  const blocoDe = n => { let e = n && (n.nodeType === 1 ? n : n.parentElement); while (e && e !== cont && !/^(P|H[1-6]|LI|BLOCKQUOTE|TD|TH|DIV|PRE)$/.test(e.tagName)) e = e.parentElement; return e && e !== cont && cont.contains(e) && !e.matches("section, article") ? e : null; };
  const blocosDaSelecao = () => {
    if (!selDocx) return [];
    const lista = [...cont.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote")].filter(el => selDocx.intersectsNode(el) && !el.querySelector("p, li, h1, h2, h3"));
    if (lista.length) return lista;
    const um = blocoDe(selDocx.startContainer); return um ? [um] : [];
  };
  const elDaSelecao = () => { const n = selDocx?.startContainer; return n ? (n.nodeType === 1 ? (n.childNodes[selDocx.startOffset] && n.childNodes[selDocx.startOffset].nodeType === 1 ? n.childNodes[selDocx.startOffset] : n) : n.parentElement) : null; };

  /* tamanho e fonte: o navegador só conhece 7 tamanhos; marca com o 7 e troca pelo tamanho em pt */
  const contido = el => { if (!selDocx || selDocx.collapsed) return false; const rg = document.createRange(); rg.selectNodeContents(el); return selDocx.compareBoundaryPoints(Range.START_TO_START, rg) <= 0 && selDocx.compareBoundaryPoints(Range.END_TO_END, rg) >= 0; };
  const aplicarTamanho = pt => {
    voltarSelecao(); const antes = selDocx && selDocx.cloneRange();
    document.execCommand("styleWithCSS", false, true); document.execCommand("fontSize", false, "7");
    for (const el of cont.querySelectorAll('span[style*="xxx-large"], font[size="7"]')) { el.style.fontSize = pt + "pt"; el.removeAttribute("size"); $$("span", el).forEach(f => { f.style.fontSize = ""; }); }
    guardarSel();
    if (antes) for (const el of cont.querySelectorAll("span[style]")) if (el.style.fontSize && el.style.fontSize !== pt + "pt" && contido(el)) el.style.fontSize = pt + "pt";
    agendar(); agendarEstado();
  };
  const aplicarFonte = f => {
    executar("fontName", f);
    for (const el of cont.querySelectorAll("span[style], font[face]")) if ((el.style.fontFamily || el.getAttribute("face")) && contido(el)) { el.style.fontFamily = `"${f}"`; el.removeAttribute("face"); }
    agendar();
  };
  const tamanhoAtual = () => { const el = elDaSelecao(); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 2) / 2 : 11; };
  const passoTamanho = dir => { const t = tamanhoAtual(); const lista = TAMANHOS_WORD; const prox = dir > 0 ? lista.find(x => x > t) || t + 2 : [...lista].reverse().find(x => x < t) || Math.max(1, t - 1); aplicarTamanho(prox); };

  /* recuo, entrelinhas e espaço do parágrafo */
  const ajustarBlocos = fn => { const bl = blocosDaSelecao(); bl.forEach(fn); agendar(); agendarEstado(); };
  const pxDe = v => parseFloat(v) || 0;
  const recuo = dir => {
    const bl = blocosDaSelecao();
    if (bl.some(b => b.tagName === "LI")) { executar(dir > 0 ? "indent" : "outdent"); return; }
    ajustarBlocos(b => { const atual = pxDe(b.style.marginLeft || getComputedStyle(b).marginLeft); b.style.marginLeft = Math.max(0, atual + dir * 48) + "px"; });
  };

  /* pincel: copia a formatação do trecho e aplica no próximo trecho selecionado */
  let pincel = null;
  const copiarFormato = () => {
    const el = elDaSelecao(); if (!el) return null;
    const cs = getComputedStyle(el);
    let fundo = ""; for (let e = el; e && e !== cont && !blocoDe(e)?.isSameNode(e); e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { fundo = bg; break; } }
    return { fonte: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), pt: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2, cor: cs.color, fundo,
      negrito: parseInt(cs.fontWeight, 10) >= 600, italico: cs.fontStyle === "italic", sub: /underline/.test(cs.textDecorationLine), risco: /line-through/.test(cs.textDecorationLine) };
  };
  const colarFormato = f => {
    voltarSelecao();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("removeFormat");
    for (const [c, quer] of [["bold", f.negrito], ["italic", f.italico], ["underline", f.sub], ["strikeThrough", f.risco]]) if (document.queryCommandState(c) !== quer) document.execCommand(c);
    document.execCommand("fontName", false, f.fonte);
    document.execCommand("foreColor", false, f.cor);
    if (f.fundo) document.execCommand("hiliteColor", false, f.fundo);
    guardarSel(); aplicarTamanho(f.pt);
  };
  const soltarPincel = () => { pincel = null; $("#w-pincel")?.setAttribute("aria-pressed", "false"); cont.classList.remove("cursor-pincel"); };
  const aoSoltar = () => { if (!pincel) return; setTimeout(() => { guardarSel(); if (selDocx && !selDocx.collapsed) { colarFormato(pincel); soltarPincel(); } }, 30); };
  cont.addEventListener("mouseup", aoSoltar); cont.addEventListener("touchend", aoSoltar);

  /* cores (fonte, marca-texto e fundo da célula) */
  let corFonte = lerLS("word-cor", "#C00000"), corMarca = lerLS("word-marca", "#FFFF00");
  $("#w-tira-cor").style.background = corFonte; $("#w-tira-marca").style.background = corMarca;
  const abrirCores = (botao, lista, extra, aoEscolher) => {
    const caixa = $("#w-cores");
    caixa.innerHTML = `<div class="w-cores-grade">${lista.map(c => `<button class="w-cor" data-wcor="${c}" style="background:${c}" title="${c}"></button>`).join("")}</div>
      ${extra ? `<button class="w-btn w-cor-extra" data-wcor="${extra[0]}">${extra[1]}</button>` : ""}`;
    const rb = botao.getBoundingClientRect(), rf = $("#barra-docx").getBoundingClientRect();
    caixa.style.left = Math.max(4, Math.min(rb.left - rf.left, rf.width - 230)) + "px"; caixa.style.top = (rb.bottom - rf.top + 4) + "px";
    caixa.classList.remove("oculto");
    caixa.onpointerdown = e => e.preventDefault();
    caixa.onclick = e => { const c = e.target.closest("[data-wcor]"); if (!c) return; caixa.classList.add("oculto"); aoEscolher(c.dataset.wcor); };
  };
  const fecharCores = () => $("#w-cores")?.classList.add("oculto");

  /* tabela, caixa e quebra de página entram depois da lista (e não dentro de um item dela) */
  const sairDaLista = () => {
    const li = elDaSelecao()?.closest("li"); if (!li) return;
    const lista = li.closest("ul, ol"); let topo = lista; while (topo.parentElement?.closest("ul, ol") && cont.contains(topo.parentElement)) topo = topo.parentElement.closest("ul, ol");
    const p = document.createElement("p"); p.innerHTML = "<br>"; topo.after(p);
    const rg = document.createRange(); rg.setStart(p, 0); rg.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); guardarSel();
  };
  /* tabelas */
  const celulaAtual = () => elDaSelecao()?.closest("td, th");
  const novaCelula = modelo => { const c = document.createElement(modelo?.tagName === "TH" ? "th" : "td"); c.setAttribute("style", modelo?.getAttribute("style") || "border:1px solid #000;padding:4px 6px;vertical-align:top"); c.innerHTML = "<p><br></p>"; return c; };
  const indiceCol = td => [...td.parentElement.children].indexOf(td);
  const opTabela = op => {
    const td = celulaAtual(); if (!td) { mostrarAvisoRapido("Toque dentro de uma tabela primeiro"); return; }
    const tr = td.parentElement, tabela = td.closest("table"), k = indiceCol(td);
    if (op === "lin-acima" || op === "lin-abaixo") { const nova = document.createElement("tr"); [...tr.children].forEach(c => nova.appendChild(novaCelula(c))); tr.parentElement.insertBefore(nova, op === "lin-acima" ? tr : tr.nextSibling); }
    else if (op === "lin-excluir") { if (tabela.rows.length === 1) tabela.remove(); else tr.remove(); }
    else if (op === "col-esq" || op === "col-dir") { for (const linha of tabela.rows) { const ref = linha.children[Math.min(k, linha.children.length - 1)]; if (ref) linha.insertBefore(novaCelula(ref), op === "col-esq" ? ref : ref.nextSibling); } tabela.querySelectorAll("colgroup").forEach(cg => cg.remove()); }
    else if (op === "col-excluir") { for (const linha of [...tabela.rows]) linha.children[Math.min(k, linha.children.length - 1)]?.remove(); if (!tabela.querySelector("td, th")) tabela.remove(); tabela.querySelectorAll("colgroup").forEach(cg => cg.remove()); }
    else if (op === "excluir" && confirm("Excluir a tabela inteira?")) tabela.remove();
    agendar(); agendarEstado();
  };
  const inserirTabela = (lin, col) => {
    const linha = `<tr>${'<td style="border:1px solid #000;padding:4px 6px;vertical-align:top"><p><br></p></td>'.repeat(col)}</tr>`;
    executar("insertHTML", `<table class="tabela-word" style="border-collapse:collapse;width:100%">${linha.repeat(lin)}</table><p><br></p>`);
  };
  const painelTabela = botao => {
    const caixa = $("#w-cores");
    caixa.innerHTML = `<div class="w-grade-tab">${Array.from({ length: 8 }, (_, l) => Array.from({ length: 8 }, (_, c) => `<button class="w-celula" data-l="${l + 1}" data-c="${c + 1}"></button>`).join("")).join("")}</div><p class="contagem" id="w-tab-tam">Toque para escolher o tamanho</p>`;
    const rb = botao.getBoundingClientRect(), rf = $("#barra-docx").getBoundingClientRect();
    caixa.style.left = Math.max(4, Math.min(rb.left - rf.left, rf.width - 230)) + "px"; caixa.style.top = (rb.bottom - rf.top + 4) + "px";
    caixa.classList.remove("oculto");
    caixa.onpointerdown = e => e.preventDefault();
    caixa.onpointerover = e => { const c = e.target.closest(".w-celula"); if (!c) return; $$(".w-celula", caixa).forEach(x => x.classList.toggle("marcada", +x.dataset.l <= +c.dataset.l && +x.dataset.c <= +c.dataset.c)); $("#w-tab-tam").textContent = `${c.dataset.l} × ${c.dataset.c}`; };
    caixa.onclick = e => { const c = e.target.closest(".w-celula"); if (!c) return; caixa.classList.add("oculto"); sairDaLista(); inserirTabela(+c.dataset.l, +c.dataset.c); };
  };

  /* localizar e substituir (dentro de cada pedaço de texto) */
  let achados = [], atual = -1;
  const destacar = () => {
    if (typeof Highlight === "function" && CSS.highlights) { CSS.highlights.set("w-busca", new Highlight(...achados)); if (achados[atual]) CSS.highlights.set("w-busca-atual", new Highlight(achados[atual])); else CSS.highlights.delete("w-busca-atual"); }
    $("#w-busca-n").textContent = $("#w-busca-txt").value ? (!achados.length ? "Nada encontrado" : atual < 0 ? `${achados.length} encontrado(s)` : `${atual + 1} de ${achados.length}`) : "";
  };
  const procurar = () => {
    achados = []; atual = -1;
    const termo = $("#w-busca-txt").value;
    if (termo) {
      const alvo = semAcento(termo.toLowerCase());
      const w = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest("section.docx") && !n.parentElement.closest("svg, style") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = semAcento(n.data.toLowerCase());
        for (let i = t.indexOf(alvo); i >= 0; i = t.indexOf(alvo, i + alvo.length)) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + termo.length); achados.push(rg); }
      }
    }
    destacar();
  };
  const irAchado = dir => {
    if (!achados.length) return;
    atual = (atual + dir + achados.length) % achados.length;
    const rg = achados[atual];
    const s = getSelection(); s.removeAllRanges(); s.addRange(rg.cloneRange()); guardarSel();
    rg.startContainer.parentElement.scrollIntoView({ block: "center" });
    destacar();
  };
  const trocar = rg => { rg.deleteContents(); rg.insertNode(document.createTextNode($("#w-troca-txt").value)); };
  const fecharBusca = () => { $("#w-busca").classList.add("oculto"); achados = []; if (CSS.highlights) { CSS.highlights.delete("w-busca"); CSS.highlights.delete("w-busca-atual"); } };
  const abrirBusca = () => { $("#w-busca").classList.remove("oculto"); const t = $("#w-busca-txt"); const sel = selDocx && !selDocx.collapsed ? selDocx.toString() : ""; if (sel && sel.length < 60) t.value = sel; t.focus(); t.select(); procurar(); };
  $("#w-busca-txt").oninput = aoParar(procurar, 200);
  $("#w-busca-txt").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); irAchado(e.shiftKey ? -1 : 1); } if (e.key === "Escape") fecharBusca(); };
  $("#w-busca-prox").onclick = () => irAchado(1);
  $("#w-busca-ant").onclick = () => irAchado(-1);
  $("#w-troca-uma").onclick = () => { if (atual < 0) { irAchado(1); return; } trocar(achados[atual]); agendar(); procurar(); if (achados.length) irAchado(0); };
  $("#w-troca-todas").onclick = () => { const n = achados.length; for (const rg of [...achados].reverse()) trocar(rg); agendar(); procurar(); mostrarAvisoRapido(`${n} substituição(ões) feita(s)`); };
  $("#w-busca-fechar").onclick = fecharBusca;

  /* contagem de palavras */
  const contagem = () => {
    const txt = $$("section.docx", cont).map(s => s.innerText).join("\n");
    const palavras = (txt.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []).length;
    abrirPainel(`<h2>Contagem de palavras ${botaoFechar}</h2><table class="tabela-contagem">
      <tr><td>Páginas</td><td>${$$("section.docx", cont).length}</td></tr><tr><td>Palavras</td><td>${palavras.toLocaleString("pt-BR")}</td></tr>
      <tr><td>Caracteres (sem espaços)</td><td>${txt.replace(/\s/g, "").length.toLocaleString("pt-BR")}</td></tr><tr><td>Caracteres (com espaços)</td><td>${txt.replace(/\n/g, "").length.toLocaleString("pt-BR")}</td></tr>
      <tr><td>Parágrafos</td><td>${txt.split(/\n+/).filter(l => l.trim()).length.toLocaleString("pt-BR")}</td></tr></table>`);
  };

  /* estado dos botões (negrito ligado, fonte, tamanho, estilo...) acompanhando o cursor */
  let quadro = null;
  const agendarEstado = () => { if (quadro) return; quadro = requestAnimationFrame(() => { quadro = null; atualizarEstado(); }); };
  const atualizarEstado = () => {
    if (!ativo || !selDocx) return;
    for (const b of $$("[data-wcmd]", barra)) { const c = b.dataset.wcmd; if (c === "undo" || c === "redo") continue; let on = false; try { on = document.queryCommandState(c); } catch {} b.classList.toggle("ligado", !!on); }
    const el = elDaSelecao(); if (!el) return;
    const cs = getComputedStyle(el);
    const fonte = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), sf = $("#w-fonte");
    if (fonte && document.activeElement !== sf) { if (![...sf.options].some(o => o.value === fonte)) sf.add(new Option(fonte, fonte)); sf.value = fonte; }
    const st = $("#w-tam"), pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    if (document.activeElement !== st) { if (![...st.options].some(o => +o.value === pt)) st.add(new Option(String(pt).replace(".", ","), pt)); st.value = String(pt); }
    const bl = blocoDe(el), tag = bl ? bl.tagName.toLowerCase() : "p", se = $("#w-estilo");
    if (document.activeElement !== se) se.value = ["h1", "h2", "h3", "blockquote"].includes(tag) ? tag : "p";
    $("#w-marcadores").classList.toggle("ligado", !!el.closest("ul") || /docx-num/.test(bl?.className || "") && !/counter\(/.test(getComputedStyle(bl, "::before").content));
    $("#w-numeracao").classList.toggle("ligado", !!el.closest("ol") || /docx-num/.test(bl?.className || "") && /counter\(/.test(getComputedStyle(bl, "::before").content));
    const naTabela = !!el.closest("td, th");
    const abaTab = $('[data-waba="tabela"]', barra);
    abaTab.classList.toggle("oculto", !naTabela);
    if (!naTabela && abaTab.getAttribute("aria-selected") === "true") trocarAba("inicio");
  };
  const trocarAba = aba => {
    $$("[data-waba]", barra).forEach(b => b.setAttribute("aria-selected", String(b.dataset.waba === aba)));
    $$("[data-wpainel]", barra).forEach(p => p.classList.toggle("ativo", p.dataset.wpainel === aba));
    fecharCores();
  };

  /* imagens (colar, arrastar, inserir) */
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
  cont.onclick = e => { if (ativo) ferramentasImagemDocx(e.target.tagName === "IMG" ? e.target : null); };

  /* atalhos do teclado (computador) */
  const teclas = e => {
    if (!ativo) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === "s") { e.preventDefault(); clearTimeout(tempo); salvar(); return; }
    if (mod && k === "f") { e.preventDefault(); trocarAba("revisao"); abrirBusca(); return; }
    if (mod && k === "h") { e.preventDefault(); trocarAba("revisao"); abrirBusca(); $("#w-troca-txt").focus(); return; }
    if (mod && k === "k") { e.preventDefault(); $("#w-link").click(); return; }
    if (mod && k === "y") { e.preventDefault(); executar("redo"); return; }
    if (e.key === "Tab" && cont.contains(e.target)) {
      const td = celulaAtual();
      e.preventDefault();
      if (td) {                                      // Tab na tabela: próxima célula (no fim, cria uma linha nova)
        const todas = [...td.closest("table").querySelectorAll("td, th")], i = todas.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (i >= todas.length) { opTabela("lin-abaixo"); }
        const alvo = [...td.closest("table").querySelectorAll("td, th")][Math.max(0, i)];
        if (alvo) { const rg = document.createRange(); rg.selectNodeContents(alvo); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); guardarSel(); }
      } else if (blocosDaSelecao().some(b => b.tagName === "LI")) executar(e.shiftKey ? "outdent" : "indent");
      else executar("insertText", "  ");
    }
  };
  document.addEventListener("keydown", teclas, true);

  /* cliques na faixa */
  barra.onpointerdown = e => { if (e.target.closest("button") && !e.target.closest("#w-busca")) e.preventDefault(); };
  barra.onclick = async e => {
    const b = e.target.closest("button"); if (!b || b.closest("#w-busca") || b.closest("#w-cores")) return;
    if (b.dataset.waba) { trocarAba(b.dataset.waba); return; }
    if (b.dataset.wcmd) { executar(b.dataset.wcmd); return; }
    fecharCores();
    switch (b.id) {
      case "docx-concluir": concluir(); return;
      case "w-salvar": clearTimeout(tempo); await salvar(); mostrarAvisoRapido("💾 Salvo"); return;
      case "w-baixar-docx": b.disabled = true; try { clearTimeout(tempo); await salvar(); await exportarDocxReal(r); } catch (er) { alert("Não foi possível gerar o .docx: " + er.message); } b.disabled = false; return;
      case "w-baixar-pdf": clearTimeout(tempo); await salvar(); concluir(); setTimeout(imprimirResumoAberto, 300); return;
      case "w-original":
        if (!confirm("Voltar ao arquivo original? Todas as suas edições de texto serão apagadas (os desenhos da caneta continuam).")) return;
        concluir(false); await bdApagar("resumos_conteudo", r.id); await invalidarMiniatura(r.id); delete r.editadoEm; await salvarMeta(r); telaResumoLer(r.id); return;
      case "w-maior": passoTamanho(1); return;
      case "w-menor": passoTamanho(-1); return;
      case "w-cor": executar("foreColor", corFonte); return;
      case "w-cor-mais": abrirCores(b, CORES_WORD, ["#000000", "Automático (preto)"], c => { corFonte = c; gravarLS("word-cor", c); $("#w-tira-cor").style.background = c; executar("foreColor", c); }); return;
      case "w-marca": executar("hiliteColor", corMarca); return;
      case "w-marca-mais": abrirCores(b, MARCAS_WORD, ["transparent", "Sem cor"], c => { if (c !== "transparent") { corMarca = c; gravarLS("word-marca", c); $("#w-tira-marca").style.background = c; } executar("hiliteColor", c); }); return;
      case "w-limpar": executar("removeFormat"); executar("hiliteColor", "transparent"); return;
      case "w-pincel": if (pincel) { soltarPincel(); return; } pincel = copiarFormato(); if (pincel) { b.setAttribute("aria-pressed", "true"); cont.classList.add("cursor-pincel"); mostrarAvisoRapido("🖌 Agora selecione o trecho que vai receber a formatação"); } return;
      case "w-marcadores": executar("insertUnorderedList"); return;
      case "w-numeracao": executar("insertOrderedList"); return;
      case "w-recuo-mais": recuo(1); return;
      case "w-recuo-menos": recuo(-1); return;
      case "w-espaco-antes": ajustarBlocos(bl => { bl.style.marginTop = (pxDe(getComputedStyle(bl).marginTop) >= 8 ? 0 : 12) + "pt"; }); return;
      case "w-espaco-depois": ajustarBlocos(bl => { bl.style.marginBottom = (pxDe(getComputedStyle(bl).marginBottom) >= 8 ? 0 : 12) + "pt"; }); return;
      case "w-tabela": painelTabela(b); return;
      case "w-link": {
        const atualA = elDaSelecao()?.closest("a");
        const url = prompt("Endereço do link (ex.: https://www.planalto.gov.br):", atualA?.getAttribute("href") || "https://");
        if (url === null) return;
        if (!url.trim() || url.trim() === "https://") { if (atualA) { voltarSelecao(); executar("unlink"); } return; }
        if (selDocx && selDocx.collapsed) executar("insertHTML", `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`);
        else executar("createLink", url.trim());
        return;
      }
      case "w-quebra": sairDaLista(); executar("insertHTML", '<div class="quebra-word" contenteditable="false" data-quebra="pagina"></div><p><br></p>'); return;
      case "w-linha-h": executar("insertHorizontalRule"); return;
      case "w-caixa": sairDaLista(); executar("insertHTML", `<div class="caixa-word" style="border:1.5px solid #2F5496;background:#EAF1FB;padding:8px 12px;margin:8px 0;border-radius:4px"><p>${esc(selDocx && !selDocx.collapsed ? selDocx.toString() : "Texto em destaque")}</p></div><p><br></p>`); return;
      case "w-simbolo": {
        const caixa = $("#w-cores");
        caixa.innerHTML = `<div class="w-simbolos">${SIMBOLOS_WORD.map(s => `<button class="w-btn" data-wsimb="${s}">${s}</button>`).join("")}</div>`;
        const rb = b.getBoundingClientRect(), rf = barra.getBoundingClientRect();
        caixa.style.left = Math.max(4, Math.min(rb.left - rf.left, rf.width - 260)) + "px"; caixa.style.top = (rb.bottom - rf.top + 4) + "px";
        caixa.classList.remove("oculto"); caixa.onpointerdown = ev => ev.preventDefault();
        caixa.onclick = ev => { const s = ev.target.closest("[data-wsimb]"); if (s) { caixa.classList.add("oculto"); executar("insertText", s.dataset.wsimb); } };
        return;
      }
      case "w-lin-acima": opTabela("lin-acima"); return;
      case "w-lin-abaixo": opTabela("lin-abaixo"); return;
      case "w-lin-excluir": opTabela("lin-excluir"); return;
      case "w-col-esq": opTabela("col-esq"); return;
      case "w-col-dir": opTabela("col-dir"); return;
      case "w-col-excluir": opTabela("col-excluir"); return;
      case "w-tab-excluir": opTabela("excluir"); return;
      case "w-sombra": abrirCores(b, [...CORES_WORD.slice(3), "#EAF1FB", "#FFF2CC", "#E2EFDA", "#FCE4D6"], ["", "Sem cor"], c => { const td = celulaAtual(); if (!td) return; const linha = td.closest("table"); const alvo = selDocx && !selDocx.collapsed ? [...linha.querySelectorAll("td, th")].filter(x => selDocx.intersectsNode(x)) : [td]; alvo.forEach(x => { x.style.backgroundColor = c; }); agendar(); }); return;
      case "w-localizar": abrirBusca(); return;
      case "w-contagem": contagem(); return;
    }
  };
  barra.onchange = e => {
    const s = e.target;
    if (s.id === "w-fonte") aplicarFonte(s.value);
    else if (s.id === "w-tam") aplicarTamanho(parseFloat(s.value));
    else if (s.id === "w-estilo") executar("formatBlock", s.value === "blockquote" ? "blockquote" : `<${s.value}>`);
    else if (s.id === "w-entrelinhas" && s.value) { const v = s.value; ajustarBlocos(bl => { bl.style.lineHeight = v; $$("span", bl).forEach(x => { if (x.style.lineHeight) x.style.lineHeight = ""; }); }); s.value = ""; }
    if (s.tagName === "SELECT") { voltarSelecao(); cont.focus({ preventScroll: true }); voltarSelecao(); }
  };
  const fecharCoresFora = e => { if (!e.target.closest("#w-cores") && !e.target.closest("#barra-docx button")) fecharCores(); };
  document.addEventListener("pointerdown", fecharCoresFora, true);

  const concluir = (gravar = true) => {
    if (!ativo) return;
    ativo = false;
    ferramentasImagemDocx(null); soltarPincel(); fecharBusca(); fecharCores();
    clearTimeout(tempo); if (gravar) salvar();
    barra.classList.add("oculto"); document.body.classList.remove("editando-word");
    $$("section.docx", cont).forEach(s => s.removeAttribute("contenteditable"));
    $("#res-editar-docx")?.classList.remove("oculto");
    cont.removeEventListener("input", agendar);
    document.removeEventListener("selectionchange", aoMudarSel);
    document.removeEventListener("keydown", teclas, true);
    document.removeEventListener("pointerdown", fecharCoresFora, true);
    cont.removeEventListener("mouseup", aoSoltar); cont.removeEventListener("touchend", aoSoltar);
  };
  window.concluirModoWord = concluir;
  $("#docx-imagem").onclick = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = async () => { voltarSelecao(); await inserirImagensDocx([...inp.files]); agendar(); };
    inp.click();
  };
  trocarAba("inicio");
  const primeiro = cont.querySelector("section.docx p, section.docx");
  if (primeiro && !selDocx) { const rg = document.createRange(); rg.selectNodeContents(primeiro); rg.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); guardarSel(); }
  agendarEstado();
}

/* =====================================================================
   GERAR O .DOCX (Office Open XML montado aqui mesmo, com o JSZip)
   Lê a página como ela aparece (estilos calculados pelo navegador):
   fonte, tamanho, cor, negrito, itálico, sublinhado, tachado, marca-texto,
   alinhamento, recuo, espaçamento, títulos, listas (as do Word original e
   as novas), tabelas (com células mescladas), imagens, links e quebras.
   ===================================================================== */
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function corHexDe(css) {
  const m = String(css || "").match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
  return [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const GENERICAS = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|ui-\w+|inherit|initial)$/i;
class EscritorDocx {
  constructor() { this.rels = []; this.midias = []; this.nums = new Map(); this.abstratos = []; this.idRel = 10; this.idImg = 1; this.idMarca = 1; }
  rel(tipo, alvo, externo = false) { const id = "rId" + (++this.idRel); this.rels.push({ id, tipo, alvo, externo }); return id; }
  /* listas: uma numeração por lista (as do Word original mantêm a numeração delas) */
  numeracao(chave, nivel, formato, texto) {
    if (!this.nums.has(chave)) { const n = this.nums.size + 1; this.nums.set(chave, { n, niveis: {} }); }
    const reg = this.nums.get(chave);
    if (!reg.niveis[nivel]) reg.niveis[nivel] = { formato, texto };
    return reg.n;
  }
  numberingXml() {
    let abs = "", nums = "";
    for (const [, reg] of this.nums) {
      let niveis = "";
      for (let l = 0; l < 9; l++) {
        const def = reg.niveis[l] || reg.niveis[0] || { formato: "bullet", texto: "•" };
        const fmt = def.formato, txt = fmt === "bullet" ? (def.texto || "•") : reg.niveis[l] ? def.texto : `%${l + 1}.`;
        niveis += `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${xmlEsc(txt)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + 360 * l}" w:hanging="360"/></w:pPr>${fmt === "bullet" ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>' : ""}</w:lvl>`;
      }
      abs += `<w:abstractNum w:abstractNumId="${reg.n}"><w:multiLevelType w:val="hybridMultilevel"/>${niveis}</w:abstractNum>`;
      nums += `<w:num w:numId="${reg.n}"><w:abstractNumId w:val="${reg.n}"/></w:num>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs}${nums}</w:numbering>`;
  }
}
async function exportarDocxReal(r, soGerar = false) {
  await carregarScript("libs/jszip.min.js");
  const salvo = (await bdLer("resumos_conteudo", r.id))?.html;
  const tmp = document.createElement("div");
  tmp.className = "paginas-resumo";
  tmp.style.cssText = "position:absolute;left:-99999px;top:0;width:max-content";
  document.body.appendChild(tmp);
  try {
    if (salvo) tmp.innerHTML = salvo;
    else {
      const docx = await abrirDocxPreview();
      await docx.renderAsync(await lerArquivoOriginal(r), tmp, tmp, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, experimental: true });
    }
    $$("svg.tinta, .aviso-tinta, .camada-links", tmp).forEach(e => e.remove());
    const blob = await docxDeHtml(tmp);
    if (soGerar) return blob;
    await entregarArquivo(blob, nomeBase(r) + (salvo ? " (editado)" : "") + ".docx");
  } finally { tmp.remove(); }
}
async function docxDeHtml(raiz) {
  const w = new EscritorDocx();
  const secoes = $$("section", raiz).length ? $$("section", raiz) : [raiz];
  const pt = v => parseFloat(v) || 0;
  // página: tamanho e margens da primeira página do documento
  const s0 = secoes[0], st0 = s0.style, cs0 = getComputedStyle(s0);
  const larguraPt = st0.width && st0.width.endsWith("pt") ? pt(st0.width) : 595.3, alturaPt = st0.minHeight && st0.minHeight.endsWith("pt") ? pt(st0.minHeight) : 841.9;
  const pxParaPt = v => pt(v) * 0.75;
  const margem = { t: pxParaPt(cs0.paddingTop) || 70.85, r: pxParaPt(cs0.paddingRight) || 85.05, b: pxParaPt(cs0.paddingBottom) || 70.85, l: pxParaPt(cs0.paddingLeft) || 85.05 };
  const larguraUtilPx = (larguraPt - margem.l - margem.r) / 0.75;
  const corpoXml = [];
  for (let k = 0; k < secoes.length; k++) {
    const sec = secoes[k];
    const conteudo = sec.querySelector(":scope > article") || sec;
    corpoXml.push(await blocosXml(w, conteudo, { recuo: 0, larguraUtilPx }));
    if (k < secoes.length - 1) corpoXml.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  const twip = v => Math.round(v * 20);
  const sect = `<w:sectPr><w:pgSz w:w="${twip(larguraPt)}" w:h="${twip(alturaPt)}"${larguraPt > alturaPt ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${twip(margem.t)}" w:right="${twip(margem.r)}" w:bottom="${twip(margem.b)}" w:left="${twip(margem.l)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpoXml.join("") || "<w:p/>"}${sect}</w:body></w:document>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3].map(n => `<w:style w:type="paragraph" w:styleId="Ttulo${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="${n - 1}"/></w:pPr></w:style>`).join("")}
<w:style w:type="paragraph" w:styleId="Citao"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="PargrafodaLista"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TabelaNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  const z = new JSZip();
  const tiposImg = [...new Set(w.midias.map(m => m.ext))];
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${tiposImg.map(e => `<Default Extension="${e}" ContentType="image/${e === "jpg" ? "jpeg" : e}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Leitor Inteligente de Legislação</dc:creator><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:modified></cp:coreProperties>`);
  z.file("word/document.xml", documento);
  z.file("word/styles.xml", estilos);
  z.file("word/numbering.xml", w.numberingXml());
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${w.rels.map(x => `<Relationship Id="${x.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${x.tipo}" Target="${xmlEsc(x.alvo)}"${x.externo ? ' TargetMode="External"' : ""}/>`).join("")}</Relationships>`);
  for (const m of w.midias) z.file("word/media/" + m.nome, m.bytes);
  return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}
const ehBlocoTag = t => /^(P|H[1-6]|DIV|UL|OL|LI|TABLE|BLOCKQUOTE|PRE|HR|ARTICLE|SECTION|HEADER|FOOTER|FIGURE|TBODY|THEAD|TR)$/.test(t);
async function blocosXml(w, container, ctx) {
  let out = "", inline = [];
  const fechar = async () => { if (inline.some(n => n.nodeType === 1 || n.data.trim())) out += await paragrafoXml(w, container, ctx, inline); inline = []; };
  for (const n of container.childNodes) {
    if (n.nodeType === 3) { inline.push(n); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (/^(STYLE|SCRIPT|svg|SVG|COLGROUP|HEADER|FOOTER)$/.test(tag) || n.classList.contains("aviso-tinta") || n.classList.contains("camada-links")) continue;
    if (!ehBlocoTag(tag) && !n.classList.contains("quebra-word")) { inline.push(n); continue; }
    await fechar();
    if (n.classList.contains("quebra-word") || (tag === "HR" && n.classList.contains("quebra-word"))) { out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; continue; }
    if (tag === "HR") { out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>'; continue; }
    if (tag === "TABLE") { out += await tabelaXml(w, n, ctx); continue; }
    if (tag === "UL" || tag === "OL") { out += await listaXml(w, n, ctx, 0); continue; }
    if (/^(P|H[1-6]|LI|PRE)$/.test(tag)) {
      if ([...n.children].some(c => ehBlocoTag(c.tagName) && c.tagName !== "BR")) out += await blocosXml(w, n, ctx);
      else out += await paragrafoXml(w, n, ctx, [...n.childNodes]);
      continue;
    }
    // DIV, BLOCKQUOTE, ARTICLE...: o que está dentro vira parágrafos (caixa de destaque com borda e fundo)
    const caixa = n.classList.contains("caixa-word") || tag === "BLOCKQUOTE";
    out += await blocosXml(w, n, { ...ctx, caixa: caixa ? n : ctx.caixa, citacao: ctx.citacao || tag === "BLOCKQUOTE" });
  }
  await fechar();
  return out;
}
async function listaXml(w, lista, ctx, nivel, chave = null) {
  chave = chave || "html-" + (w.idLista = (w.idLista || 0) + 1);
  const numerada = lista.tagName === "OL";
  const tipoCss = getComputedStyle(lista).listStyleType;
  const formato = !numerada ? "bullet" : /alpha|latin/.test(tipoCss) ? (/upper/.test(tipoCss) ? "upperLetter" : "lowerLetter") : /roman/.test(tipoCss) ? (/upper/.test(tipoCss) ? "upperRoman" : "lowerRoman") : "decimal";
  const num = w.numeracao(chave, nivel, formato, formato === "bullet" ? ["•", "◦", "▪"][nivel % 3] : `%${nivel + 1}.`);
  let out = "";
  for (const li of lista.children) {
    if (li.tagName !== "LI") { out += await blocosXml(w, li, ctx); continue; }
    const inline = [], depois = [];
    for (const c of li.childNodes) (c.nodeType === 1 && ehBlocoTag(c.tagName) ? depois : inline).push(c);
    if (inline.some(c => c.nodeType === 1 || c.data.trim()) || !depois.length) out += await paragrafoXml(w, li, { ...ctx, lista: { num, nivel } }, inline);
    for (const c of depois) out += c.tagName === "UL" || c.tagName === "OL" ? await listaXml(w, c, ctx, nivel + 1, chave) : await blocosXml(w, c, ctx);
  }
  return out;
}
async function tabelaXml(w, tabela, ctx) {
  const linhas = [...tabela.rows];
  if (!linhas.length) return "";
  // grade: cada célula ocupa colunas (colspan) e linhas (rowspan)
  const grade = [], ocupado = [];
  linhas.forEach((tr, i) => {
    let c = 0; grade[i] = [];
    for (const td of tr.cells) {
      while (ocupado[i]?.[c]) c++;
      const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1);
      grade[i].push({ td, c, cs, rs });
      for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) { (ocupado[i + a] = ocupado[i + a] || [])[c + b] = a === 0 ? "eu" : "cont"; }
      c += cs;
    }
  });
  const nCols = Math.max(...ocupado.map(l => (l || []).length));
  const larg = Array(nCols).fill(0);
  for (const linha of grade) for (const x of linha) if (x.cs === 1) larg[x.c] = Math.max(larg[x.c], x.td.getBoundingClientRect().width);
  const total = larg.reduce((a, b) => a + b, 0) || 1;
  const largUtil = Math.min(ctx.larguraUtilPx || 600, tabela.getBoundingClientRect().width || 600);
  const twCol = larg.map(v => Math.max(300, Math.round((v || total / nCols) / total * largUtil * 15)));
  const borda = (() => { const td = tabela.querySelector("td, th"); const cs = td && getComputedStyle(td); return cs && pt(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none"; })();
  function pt(v) { return parseFloat(v) || 0; }
  let out = `<w:tbl><w:tblPr><w:tblW w:w="${twCol.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borda ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>' : ""}<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${twCol.map(v => `<w:gridCol w:w="${v}"/>`).join("")}</w:tblGrid>`;
  for (let i = 0; i < linhas.length; i++) {
    out += "<w:tr>";
    let c = 0;
    const daLinha = grade[i];
    while (c < nCols) {
      const x = daLinha.find(y => y.c === c);
      if (x) {
        const fundo = corHexDe(getComputedStyle(x.td).backgroundColor);
        const largura = twCol.slice(c, c + x.cs).reduce((a, b) => a + b, 0);
        const conteudo = await blocosXml(w, x.td, ctx);
        out += `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>${x.cs > 1 ? `<w:gridSpan w:val="${x.cs}"/>` : ""}${x.rs > 1 ? '<w:vMerge w:val="restart"/>' : ""}${fundo && fundo !== "FFFFFF" ? `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>` : ""}</w:tcPr>${conteudo}${/<\/w:p>$|<w:p\/>$/.test(conteudo) ? "" : "<w:p/>"}</w:tc>`;
        c += x.cs;
      } else if (ocupado[i]?.[c] === "cont") {
        // continuação de uma célula mesclada de cima
        let dono = null; for (let a = i - 1; a >= 0 && !dono; a--) dono = grade[a].find(y => y.c === c && y.rs > i - a);
        const cs = dono ? dono.cs : 1;
        out += `<w:tc><w:tcPr><w:tcW w:w="${twCol.slice(c, c + cs).reduce((a, b) => a + b, 0)}" w:type="dxa"/>${cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : ""}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
        c += cs;
      } else { out += `<w:tc><w:tcPr><w:tcW w:w="${twCol[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; c++; }
    }
    out += "</w:tr>";
  }
  return out + "</w:tbl>";
}
/* um parágrafo: propriedades do bloco + os pedaços de texto com a formatação de cada um */
async function paragrafoXml(w, bloco, ctx, nos) {
  const cs = getComputedStyle(bloco);
  const px = v => parseFloat(v) || 0;
  let pPr = "";
  const tag = bloco.tagName;
  const nTit = /^H([1-6])$/.test(tag) ? +tag[1] : +(((bloco.className || "").match(/docx_heading(\d)/) || [])[1] || 0);
  const estilo = nTit ? "Ttulo" + Math.min(nTit, 3) : ctx.citacao ? "Citao" : "";
  if (estilo) pPr += `<w:pStyle w:val="${estilo}"/>`;
  // listas: as do Word original (classe docx-num-<lista>-<nível>) e as novas (ul/ol)
  let lista = ctx.lista;
  const mNum = (bloco.className || "").match(/docx-num-(\d+)-(\d+)/);
  if (!lista && mNum) {
    const nivel = +mNum[2], antes = getComputedStyle(bloco, "::before").content || "";
    let formato = "bullet", texto = "";
    for (const m of antes.matchAll(/"((?:[^"\\]|\\.)*)"|counter\(([^,)]+)(?:,\s*([\w-]+))?\)/g)) {
      if (m[1] !== undefined) texto += m[1].replace(/\\9\s?/g, "").replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, "$1");
      else {
        const lv = +((m[2].match(/-(\d+)$/) || [])[1] || 0);
        texto += `%${lv + 1}`;
        if (lv === nivel) { const t = m[3] || "decimal"; formato = /lower-(alpha|latin)/.test(t) ? "lowerLetter" : /upper-(alpha|latin)/.test(t) ? "upperLetter" : /lower-roman/.test(t) ? "lowerRoman" : /upper-roman/.test(t) ? "upperRoman" : "decimal"; }
      }
    }
    texto = texto.replace(/\t/g, "").trim();
    if (formato === "bullet" && (!texto || [...texto].some(c => c.codePointAt(0) >= 0xE000 && c.codePointAt(0) <= 0xF8FF))) texto = "•";
    if (formato !== "bullet" && !texto.includes("%")) texto = `%${nivel + 1}.`;
    lista = { num: w.numeracao("docx-" + mNum[1], nivel, formato, texto), nivel };
  }
  if (lista) pPr += `<w:numPr><w:ilvl w:val="${Math.min(lista.nivel, 8)}"/><w:numId w:val="${lista.num}"/></w:numPr>`;
  // borda e fundo de caixa de destaque
  if (ctx.caixa) {
    const cc = getComputedStyle(ctx.caixa), corB = corHexDe(cc.borderTopColor) || "2F5496", fundo = corHexDe(cc.backgroundColor);
    if (px(cc.borderTopWidth) > 0) pPr += `<w:pBdr>${["top", "left", "bottom", "right"].map(l => `<w:${l} w:val="single" w:sz="8" w:space="4" w:color="${corB}"/>`).join("")}</w:pBdr>`;
    if (fundo && fundo !== "FFFFFF") pPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>`;
  }
  const antesPx = px(cs.marginTop), depoisPx = px(cs.marginBottom);
  const fs = px(cs.fontSize) || 14.67;
  let linha = 240;
  if (cs.lineHeight && cs.lineHeight !== "normal") linha = Math.max(120, Math.round(px(cs.lineHeight) / fs * 240));
  pPr += `<w:spacing w:before="${Math.round(antesPx * 15)}" w:after="${Math.round(depoisPx * 15)}" w:line="${linha}" w:lineRule="auto"/>`;
  const esq = px(cs.marginLeft) + px(cs.paddingLeft), primeira = px(cs.textIndent);
  if (!lista && (esq > 1 || Math.abs(primeira) > 1)) pPr += `<w:ind w:left="${Math.round(esq * 15)}"${primeira > 1 ? ` w:firstLine="${Math.round(primeira * 15)}"` : primeira < -1 ? ` w:hanging="${Math.round(-primeira * 15)}"` : ""}/>`;
  const al = cs.textAlign;
  const jc = /center/.test(al) ? "center" : /right|end/.test(al) && cs.direction !== "rtl" ? "right" : /justify/.test(al) ? "both" : "";
  if (jc) pPr += `<w:jc w:val="${jc}"/>`;
  let runs = "";
  for (const n of nos) runs += await inlineXml(w, n, bloco, ctx);
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
}
function rPrDe(el, bloco) {
  const cs = getComputedStyle(el);
  let r = "";
  const fonte = cs.fontFamily.split(",").map(f => f.replace(/["']/g, "").trim()).find(f => f && !GENERICAS.test(f));
  if (fonte) r += `<w:rFonts w:ascii="${xmlEsc(fonte)}" w:hAnsi="${xmlEsc(fonte)}" w:cs="${xmlEsc(fonte)}"/>`;
  if (parseInt(cs.fontWeight, 10) >= 600) r += "<w:b/>";
  if (cs.fontStyle === "italic") r += "<w:i/>";
  if (/line-through/.test(cs.textDecorationLine) || el.closest("s, strike, del")) r += "<w:strike/>";
  const cor = corHexDe(cs.color);
  if (cor && cor !== "000000") r += `<w:color w:val="${cor}"/>`;
  const meio = Math.max(2, Math.round((parseFloat(cs.fontSize) || 14.67) * 0.75 * 2));
  r += `<w:sz w:val="${meio}"/><w:szCs w:val="${meio}"/>`;
  // sublinhado e fundo não são herdados no CSS: sobe pelos elementos até o parágrafo
  let sub = false, fundo = null, vert = "";
  for (let e = el; e && e !== bloco.parentElement; e = e.parentElement) {
    const c = e === el ? cs : getComputedStyle(e);
    if (/underline/.test(c.textDecorationLine) || e.tagName === "U") sub = true;
    if (!fundo && e !== bloco) fundo = corHexDe(c.backgroundColor);
    if (!vert && (e.tagName === "SUP" || c.verticalAlign === "super")) vert = "superscript";
    if (!vert && (e.tagName === "SUB" || c.verticalAlign === "sub")) vert = "subscript";
    if (e === bloco) break;
  }
  if (sub) r += '<w:u w:val="single"/>';
  if (fundo && fundo !== "FFFFFF") r += `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>`;
  if (vert) r += `<w:vertAlign w:val="${vert}"/>`;
  return r;
}
async function inlineXml(w, n, bloco, ctx) {
  if (n.nodeType === 3) {
    const pai = n.parentElement;
    const pre = /pre/.test(getComputedStyle(pai).whiteSpace);
    let t = pre ? n.data : n.data.replace(/[\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ");
    if (!t) return "";
    const rPr = rPrDe(pai, bloco);
    return t.split("\t").map((parte, k) => (k ? `<w:r><w:rPr>${rPr}</w:rPr><w:tab/></w:r>` : "") + (parte ? `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlEsc(parte)}</w:t></w:r>` : "")).join("");
  }
  if (n.nodeType !== 1) return "";
  const tag = n.tagName;
  if (/^(STYLE|SCRIPT|svg|SVG)$/.test(tag)) return "";
  if (tag === "BR") return '<w:r><w:br/></w:r>';
  if (tag === "IMG") return imagemXml(w, n);
  let filhos = "";
  for (const c of n.childNodes) filhos += await inlineXml(w, c, bloco, ctx);
  if (tag === "A" && n.getAttribute("href")) {
    const href = n.getAttribute("href");
    const comEstilo = filhos.replace(/<w:rPr>/g, '<w:rPr><w:rStyle w:val="Hyperlink"/>');
    if (href.startsWith("#")) return `<w:hyperlink w:anchor="${xmlEsc(decodeURIComponent(href.slice(1)))}" w:history="1">${comEstilo}</w:hyperlink>`;
    if (/^(https?:|mailto:)/i.test(href)) return `<w:hyperlink r:id="${w.rel("hyperlink", href, true)}" w:history="1">${comEstilo}</w:hyperlink>`;
  }
  if (n.id && /^_/.test(n.id)) { const id = w.idMarca++; return `<w:bookmarkStart w:id="${id}" w:name="${xmlEsc(n.id)}"/>${filhos}<w:bookmarkEnd w:id="${id}"/>`; }
  return filhos;
}
async function imagemXml(w, img) {
  const src = img.getAttribute("src") || "";
  if (!src) return "";
  let blob;
  try { blob = await (await fetch(src)).blob(); } catch { return ""; }
  let ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
  if (!/^(png|jpg|gif)$/.test(ext)) {                 // webp, svg...: vira PNG
    try {
      const bmp = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0); blob = await new Promise(ok => c.toBlob(ok, "image/png")); ext = "png";
    } catch { return ""; }
  }
  const nome = `imagem${w.idImg}.${ext}`;
  w.midias.push({ nome, ext, bytes: new Uint8Array(await blob.arrayBuffer()) });
  const rid = w.rel("image", "media/" + nome);
  const rc = img.getBoundingClientRect();
  let lw = rc.width || img.naturalWidth || 300, lh = rc.height || img.naturalHeight || 200;
  const max = 6.3 * 96; if (lw > max) { lh = lh * max / lw; lw = max; }
  const cx = Math.round(lw * 9525), cy = Math.round(lh * 9525), id = w.idImg++;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${nome}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
