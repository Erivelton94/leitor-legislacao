/* =====================================================================
   PAINÉIS
   ===================================================================== */
function abrirPainel(html) { $("#painel-caixa").innerHTML = html; $("#painel").classList.remove("oculto"); esconderBarra(); }
function fecharPainel() { $("#painel").classList.add("oculto"); }
$("#painel").addEventListener("click", e => { if (e.target.id === "painel" || e.target.closest("[data-fechar]")) fecharPainel(); });
const botaoFechar = `<button class="icone-btn" data-fechar>Fechar</button>`;

$("#btn-aa").onclick = () => { abrirPainel(`<h2>Leitura ${botaoFechar}</h2><div id="aa"></div>`); montarAjustesLeitura($("#aa")); };
$("#btn-sumario").onclick = () => {
  const prep = estado.leis[leiAberta] && prepararLei(estado.leis[leiAberta]);
  abrirPainel(`<h2>Sumário ${botaoFechar}</h2><nav class="sumario">${prep && prep.sumario.length
    ? prep.sumario.map(s => `<a class="n${s.nivel}" data-fechar href="#/lei/${esc(leiAberta)}/${encodeURIComponent(s.alvo)}">${esc(s.rotulo)}</a>`).join("")
    : '<p class="contagem">Esta lei não tem divisões.</p>'}</nav>`);
};
$("#btn-ir").onclick = () => {
  abrirPainel(`<h2>Ir para o artigo ${botaoFechar}</h2>
    <input class="campo" id="campo-ir" placeholder="Número do artigo — ex.: 112, 121-A ou ADCT 5" autocomplete="off">`);
  const c = $("#campo-ir");
  c.focus();
  c.onkeydown = e => {
    if (e.key !== "Enter") return;
    let v = c.value.trim().toUpperCase();
    const adct = /^ADCT\b/.test(v);
    v = v.replace(/^ADCT[,.]?\s*/, "").replace(/^ART\.?\s*/, "").replace(/[ºO°]/g, "").replace(/\s*-\s*/g, "-");
    fecharPainel();
    if (adct) {                                   // "ADCT 5" → artigo 5 do ADCT
      const lei = estado.leis[leiAberta];
      const k = Object.keys(lei.artigos).find(id => lei.artigos[id].secao === "ADCT" && id.replace(/#\d+$/, "") === v);
      if (k) { irParaArtigo(k); return; }
    }
    if (!irParaArtigo(v)) abrirPainel(`<h2>Ir para o artigo ${botaoFechar}</h2><p>O Art. ${esc(v)} não existe nesta lei.</p>`);
  };
};
$("#btn-buscar-lei").onclick = () => {
  abrirPainel(`<h2>Buscar nesta lei ${botaoFechar}</h2>
    <input class="campo" id="campo-busca-lei" type="search" placeholder="Palavra ou trecho" autocomplete="off"><div id="res-lei"></div>`);
  const c = $("#campo-busca-lei");
  c.focus();
  c.oninput = aoParar(() => {
    const res = buscarEm(estado.leis[leiAberta], leiAberta, c.value);
    $("#res-lei").innerHTML = c.value.trim().length < 2 ? "" :
      `<p class="contagem">${res.length ? res.length + " artigo(s)" : "Nada encontrado nesta lei."}</p>` + listaResultados(res, false);
  });
};
$("#btn-voltar").onclick = () => voltar();
$("#btn-caneta").onclick = () => alternarCaneta();
/* celular: as opções da leitura ficam reunidas no "⋯" */
$("#btn-mais-leitor").onclick = () => {
  const itens = [["btn-sumario", "📑 Sumário"], ["btn-ir", "🔢 Ir para o artigo"], ["btn-buscar-lei", "🔍 Buscar nesta lei"],
    ["btn-ouvir", ouvir.ativo ? "🔇 Parar de ouvir" : "🔊 Ouvir a lei"], ["btn-tela-cheia", document.body.classList.contains("tela-cheia") ? "⛶ Sair da tela cheia" : "⛶ Tela cheia"], ["btn-aa", "Aa  Tamanho da letra e tema"]];
  abrirPainel(`<h2>Leitura ${botaoFechar}</h2><div class="acoes">${itens.map(([id, r]) => `<button data-mais="${id}">${r}</button>`).join("")}</div>`);
  $$("#painel-caixa [data-mais]").forEach(b => b.onclick = () => { const alvo = b.dataset.mais; fecharPainel(); setTimeout(() => $("#" + alvo).click(), 60); });
};
$("#btn-ouvir").onclick = () => (ouvir.ativo ? pararOuvir() : ouvirAPartirDe(artigoNoTopo()));
$("#btn-tela-cheia").onclick = () => alternarTelaCheia();

/* ---------- seleção de trecho → barra de grifo ---------- */
let selecaoAtual = null;
function esconderBarra() { $("#barra-selecao").classList.add("oculto"); }
function lerSelecao() {
  const sel = window.getSelection();
  if (caneta.ativa || !leiAberta || ehResumoAberto() || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const noIni = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const noFim = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
  const div = noIni?.closest(".artigo");
  if (!div || div !== noFim?.closest(".artigo")) return { erro: "Selecione um trecho dentro de um único artigo." };
  let ini = posicaoNoArtigo(div, r.startContainer, r.startOffset);
  let fim = posicaoNoArtigo(div, r.endContainer, r.endOffset);
  const texto = textoDoArtigo(div);
  while (ini < fim && /\s/.test(texto[ini])) ini++;
  while (fim > ini && /\s/.test(texto[fim - 1])) fim--;
  if (fim <= ini) return null;
  return { lei: leiAberta, art: div.dataset.art, ini, fim, texto: texto.slice(ini, fim), textoArtigo: texto };
}
let tempoSel = null;
document.addEventListener("selectionchange", () => {
  clearTimeout(tempoSel);
  tempoSel = setTimeout(() => {
    const s = lerSelecao();
    if (s && !s.erro) { selecaoAtual = s; marcarCorGrifo(); $("#barra-selecao").classList.remove("oculto"); }
    else if (!window.getSelection()?.toString()) setTimeout(() => { if (!window.getSelection()?.toString()) esconderBarra(); }, 300);
  }, 180);
});
function novaAncora(s) {
  const lei = estado.leis[s.lei];
  return {
    lei: s.lei, art: s.art, versao: lei.versao, hashArt: lei.artigos[s.art].hash, textoOriginal: lei.artigos[s.art].texto,
    ini: s.ini, fim: s.fim, texto: s.texto,
    prefixo: s.textoArtigo.slice(Math.max(0, s.ini - 40), s.ini), sufixo: s.textoArtigo.slice(s.fim, s.fim + 40),
  };
}
/* o grifo lembra a última cor usada (fica destacada e é a cor do grifo criado junto com uma anotação) */
function marcarCorGrifo() { const c = lerLS("cor-grifo", "amarelo"); $$("#barra-selecao [data-cor]").forEach(b => b.setAttribute("aria-pressed", b.dataset.cor === c)); }
async function acaoSelecao(acao, cor) {
  const s = selecaoAtual;
  if (!s) return;
  window.getSelection()?.removeAllRanges();
  esconderBarra();
  if (acao === "grifar") {
    gravarLS("cor-grifo", cor);
    await salvarItem({ id: uid(), tipo: "grifo", cor, ...novaAncora(s) });
    repintarArtigo(s.lei, s.art);
  } else if (acao === "anotar") {
    editorAnotacao({ ...novaAncora(s), criarGrifo: true });   // o grifo só é criado se a anotação for salva
  } else if (acao === "favoritar") {
    await salvarItem({ id: uid(), tipo: "favorito", alvo: "trecho", ...novaAncora(s) });
    abrirPainel(`<h2>Trecho favoritado ${botaoFechar}</h2><p class="citacao" style="font-family:var(--serif)">“${esc(s.texto)}”</p><p class="contagem">Veja em Meus estudos → Favoritos.</p>`);
  } else if (acao === "copiar") {
    try { await navigator.clipboard.writeText(s.texto); } catch {}
  }
  selecaoAtual = null;
}
$("#barra-selecao").addEventListener("pointerdown", e => {
  const b = e.target.closest("button");
  if (!b) return;
  e.preventDefault();          // mantém a seleção enquanto o botão é tocado
  if (b.dataset.cor) acaoSelecao("grifar", b.dataset.cor);
  else acaoSelecao(b.dataset.acaoSel);
});

/* ---------- menus de grifo, artigo e lei ---------- */
function menuGrifo(id) {
  const g = estado.itens.get(id);
  if (!g) return;
  const nota = itens("anotacao", n => n.grifoId === id)[0];
  abrirPainel(`<h2>Grifo ${botaoFechar}</h2>
    <p style="font-family:var(--serif);line-height:1.5"><mark class="grifo g-${esc(g.cor)}">${esc(g.texto)}</mark></p>
    <div class="linha-ajuste"><span>Cor</span><div style="display:flex;gap:8px">${Object.keys(CORES).map(c =>
      `<button class="cor-btn g-${c}" data-mudar-cor="${c}" aria-pressed="${c === g.cor}" aria-label="${CORES[c]}"></button>`).join("")}</div></div>
    <div class="acoes" style="margin-top:12px">
      <button id="g-nota">${nota ? "Ver ou editar a anotação deste trecho" : "Anotar este trecho"}</button>
      <button id="g-apagar">Apagar grifo</button></div>
    ${artigoMudou(g) ? `<p class="alerta" style="color:var(--alt)">⚠️ O artigo mudou depois deste grifo (feito na versão de ${dataCurta(g.versao)}).</p>` : ""}`);
  $$("[data-mudar-cor]").forEach(b => b.onclick = async () => { g.cor = b.dataset.mudarCor; await salvarItem(g); repintarArtigo(g.lei, g.art); fecharPainel(); });
  $("#g-nota").onclick = () => nota ? editorAnotacao(nota) : editorAnotacao({ ...g, id: undefined, tipo: undefined, cor: undefined, grifoId: g.id });
  $("#g-apagar").onclick = async () => {
    if (nota && !confirm("Este grifo tem uma anotação. A anotação continuará guardada, ligada ao artigo. Apagar o grifo?")) return;
    if (nota) { nota.grifoId = null; await salvarItem(nota); }
    await apagarItem(id);
    repintarArtigo(g.lei, g.art);
    fecharPainel();
  };
}

function textoArtigo(id, art) { return estado.leis[id].artigos[art].texto + `\n\n${nomeLei(id)} — texto compilado do Planalto`; }
function menuArtigo(art) {
  const id = leiAberta;
  const fav = ehFavorito(idFavArt(id, art));
  const n = itens("anotacao", i => i.lei === id && i.art === art).length;
  const nq = questoesDoArtigo(id, art).length;
  const nls = questoesLSdoArtigo(id, art).length;
  abrirPainel(`<h2>${esc(rotuloArt(art))} ${botaoFechar}</h2><div class="acoes">
    ${nq ? `<button data-href="#/questoes-artigo/${esc(id)}/${encodeURIComponent(art)}">📝 Resolver as questões deste artigo (${nq})</button>` : ""}
    ${nls ? `<button id="m-ls">⚖️ Questões de lei seca deste artigo (${nls})</button>` : ""}
    <button id="m-ouvir">🔊 Ouvir a partir deste artigo</button>
    <button id="m-fav">${fav ? "★ Remover dos favoritos" : "☆ Favoritar o artigo"}</button>
    <button id="m-nota">Anotar o artigo</button>
    ${n ? `<button id="m-ver">Ver anotações deste artigo (${n})</button>` : ""}
    ${tintasDoArtigo(id, art).length ? '<button id="m-tinta">Apagar os desenhos e ícones deste artigo</button>' : ""}
    <button id="m-copiar">Copiar o artigo</button>
    ${navigator.share ? '<button id="m-compartilhar">Compartilhar o artigo</button>' : ""}
  </div>`);
  if ($("#m-ls")) $("#m-ls").onclick = () => { fecharPainel(); resolverLSdoArtigo(id, art); };
  $("#m-fav").onclick = async () => {
    const lei = estado.leis[id];
    await alternarFavorito(idFavArt(id, art), { alvo: "artigo", lei: id, art, versao: lei.versao, hashArt: lei.artigos[art].hash });
    document.getElementById("art-" + art)?.classList.toggle("favorito", !fav);
    fecharPainel();
  };
  $("#m-nota").onclick = () => {
    const lei = estado.leis[id];
    editorAnotacao({ lei: id, art, versao: lei.versao, hashArt: lei.artigos[art].hash, textoOriginal: lei.artigos[art].texto });
  };
  if ($("#m-ver")) $("#m-ver").onclick = () => painelNotasArtigo(art);
  $("#m-ouvir").onclick = () => { fecharPainel(); ouvirAPartirDe(art); };
  if ($("#m-tinta")) $("#m-tinta").onclick = async () => {
    const lista = tintasDoArtigo(id, art);
    const n = lista.reduce((s, x) => s + (x.tracos || []).length + (x.carimbos || []).length, 0);
    if (!confirm(`Apagar ${n} traço(s) e ícone(s) do ${rotuloArt(art)}? Isso inclui o que foi feito com outros tamanhos de letra.`)) return;
    for (const x of lista) await apagarItem(x.id);
    const div = document.getElementById("art-" + art);
    if (div) pintarTinta(id, div);
    fecharPainel();
  };
  $("#m-copiar").onclick = async () => {
    try { await navigator.clipboard.writeText(textoArtigo(id, art)); $("#m-copiar").textContent = "Artigo copiado"; } catch { $("#m-copiar").textContent = "Não foi possível copiar"; }
  };
  if ($("#m-compartilhar")) $("#m-compartilhar").onclick = () => navigator.share({ text: textoArtigo(id, art) }).catch(() => {});
}

function painelNotasArtigo(art) {
  const lista = itens("anotacao", i => i.lei === leiAberta && i.art === art);
  abrirPainel(`<h2>Anotações — ${esc(rotuloArt(art))} ${botaoFechar}</h2>${cartoesAnotacoes(lista)}
    <div class="acoes" style="margin-top:12px"><button id="nova-nota-art">Nova anotação neste artigo</button></div>`);
  ativarMiniaturas($("#painel-caixa"));
  $("#nova-nota-art").onclick = () => {
    const lei = estado.leis[leiAberta];
    editorAnotacao({ lei: leiAberta, art, versao: lei.versao, hashArt: lei.artigos[art].hash, textoOriginal: lei.artigos[art].texto });
  };
}

function menuLei(id) {
  const fav = ehFavorito(idFavLei(id));
  abrirPainel(`<h2>${esc(nomeLei(id))} ${botaoFechar}</h2>
    <div class="acoes">
      <button id="l-fixar">${ehFixada(id) ? "📌 Desafixar do topo" : "📌 Fixar no topo"}</button>
      <button id="l-pdf">📄 Baixar em PDF</button>
      <button id="l-renomear">✏️ Renomear</button>
      <button id="l-mover">📁 Mover para pasta…</button>
      <button id="l-arquivar">${leiArquivada(id) ? "📤 Desarquivar" : "📦 Arquivar (some da lista; fica em Arquivadas)"}</button>
      <button id="l-fav">${fav ? "★ Remover dos favoritos" : "☆ Favoritar a lei"}</button>
      <button id="l-nota">Anotar a lei (anotação geral)</button>
      <button id="l-alt">Histórico de alterações</button>
      <button data-href="#/revisao/${esc(id)}">⚡ Revisão rápida: só o que eu marquei</button>
      <button id="l-marcacoes">Apagar minhas marcações desta lei…</button>
      <button id="l-remover" style="color:var(--alt)">🗑 Remover do meu acervo (vai para a lixeira)</button>
    </div>`);
  $("#l-marcacoes").onclick = () => painelApagarMarcacoes(id);
  $("#l-fixar").onclick = async () => { await alternarFixada(id); fecharPainel(); rotear(); };
  $("#l-pdf").onclick = () => painelBaixarLeiPdf(id);
  $("#l-renomear").onclick = async () => { if (await renomear("lei", id, nomeLei(id), estado.status[id]?.nome || id)) { fecharPainel(); rotear(); } };
  $("#l-mover").onclick = () => painelMover("leis", id, nomeLei(id), () => rotear());
  $("#l-fav").onclick = async () => { await alternarFavorito(idFavLei(id), { alvo: "lei", lei: id }); fecharPainel(); rotear(); };
  $("#l-nota").onclick = () => editorAnotacao({ lei: id, art: null });
  $("#l-alt").onclick = () => { fecharPainel(); location.hash = "#/alteracoes/" + id; };
  $("#l-arquivar").onclick = async () => { const era = leiArquivada(id); await alternarArquivarLei(id); fecharPainel(); rotear(); mostrarAvisoRapido(era ? "📤 Lei desarquivada" : "📦 Lei arquivada"); };
  $("#l-remover").onclick = async () => {
    if (!confirm(`Remover "${nomeLei(id)}" do seu acervo? Ela vai para a lixeira (30 dias para restaurar). Suas anotações, grifos e desenhos desta lei continuam guardados.`)) return;
    await leiParaLixeira(id);
    fecharPainel(); rotear();
    mostrarAvisoRapido("🗑 A lei foi para a lixeira");
  };
}

/* ---------- editor de anotação (com imagens) ---------- */
let rascunhoImagens = [];
function editorAnotacao(base) {
  const existente = base.id && estado.itens.get(base.id)?.tipo === "anotacao" ? estado.itens.get(base.id) : null;
  const nota = existente ? { ...existente } : { ...base };
  rascunhoImagens = [...(nota.imagens || [])];
  const onde = nota.lei ? `${esc(nomeLei(nota.lei))}${nota.art ? " — " + esc(rotuloArt(nota.art, nota.lei)) : " (lei inteira)"}` : "";
  abrirPainel(`<h2>${existente ? "Editar anotação" : "Nova anotação"} ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${onde}</p>
    ${nota.texto ? `<div class="citacao" style="font-family:var(--serif);border-left:3px solid var(--fio);padding-left:10px;color:var(--tinta-2);margin-bottom:10px">“${esc(nota.texto)}”</div>` : ""}
    <textarea class="campo" id="texto-nota" placeholder="Sua anotação — ex.: muito cobrado em prova">${esc(nota.nota || "")}</textarea>
    <div class="miniaturas" id="mini-editor"></div>
    <div class="acoes" style="margin-top:10px">
      <button id="add-img">📷 Adicionar imagem (câmera, galeria ou arquivos)</button>
      <button id="salvar-nota" class="botao primario">Salvar anotação</button>
    </div>
    <p class="contagem" id="msg-img"></p>`);
  const mini = async () => {
    const el = $("#mini-editor");
    if (!el) return;
    el.innerHTML = "";
    for (const id of rascunhoImagens) {
      const img = await bdLer("imagens", id);
      if (!img) continue;
      const f = document.createElement("figure");
      f.innerHTML = `<img alt="Imagem da anotação"><button class="tirar" aria-label="Remover imagem" data-tirar="${esc(id)}">×</button>`;
      f.querySelector("img").src = URL.createObjectURL(img.blob);
      el.appendChild(f);
    }
    $$("[data-tirar]", el).forEach(b => b.onclick = () => { rascunhoImagens = rascunhoImagens.filter(x => x !== b.dataset.tirar); mini(); });
  };
  mini();
  $("#add-img").onclick = () => $("#entrada-imagens").click();
  $("#entrada-imagens").onchange = async e => {
    const arquivos = [...e.target.files];
    e.target.value = "";
    const total = (await bdTodos("imagens")).reduce((s, i) => s + (i.blob?.size || 0), 0);
    if (total > LIMITE_IMAGENS_MB * 1048576) {
      $("#msg-img").textContent = `As imagens já ocupam ${mb(total)}. Apague imagens antigas antes de adicionar novas.`;
      return;
    }
    $("#msg-img").textContent = "Comprimindo…";
    for (const arq of arquivos) {
      try {
        const blob = await comprimirImagem(arq);
        const id = uid();
        await bdGravar("imagens", { id, blob, tipoMime: blob.type, atualizadoEm: agoraISO() });
        rascunhoImagens.push(id);
      } catch { $("#msg-img").textContent = "Não foi possível ler uma das imagens."; }
    }
    if ($("#msg-img").textContent === "Comprimindo…") $("#msg-img").textContent = "";
    mini();
  };
  $("#salvar-nota").onclick = async () => {
    const texto = $("#texto-nota").value.trim();
    if (!texto && !rascunhoImagens.length) { $("#msg-img").textContent = "Escreva algo ou adicione uma imagem."; return; }
    const removidas = (existente?.imagens || []).filter(x => !rascunhoImagens.includes(x));
    for (const r of removidas) await bdApagar("imagens", r);
    const item = { ...nota, id: existente ? existente.id : uid(), tipo: "anotacao", nota: texto, imagens: rascunhoImagens };
    delete item.cor;
    if (!existente) { delete item.criadoEm; delete item.atualizadoEm; delete item.apagado; }
    if (item.criarGrifo) {
      const campos = ["lei", "art", "versao", "hashArt", "textoOriginal", "ini", "fim", "texto", "prefixo", "sufixo"];
      const g = { id: uid(), tipo: "grifo", cor: lerLS("cor-grifo", "amarelo") };
      campos.forEach(c => { g[c] = item[c]; });
      await salvarItem(g);
      item.grifoId = g.id;
      delete item.criarGrifo;
    }
    await salvarItem(item);
    fecharPainel();
    if (leiAberta === item.lei && item.art) repintarArtigo(item.lei, item.art);
    const r = location.hash;
    if (r.startsWith("#/estudos") || r.startsWith("#/pesquisar")) rotear();
  };
}

/* Redimensiona para no máximo 1600 px e salva em JPEG ~78% (fotos de 4 MB viram ~300 KB). */
async function comprimirImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lado = Math.max(img.naturalWidth, img.naturalHeight);
    const f = Math.min(1, 1600 / lado);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.78));
    if (!blob) throw new Error("falha");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

async function ativarMiniaturas(raiz) {
  for (const el of $$("[data-imagens]", raiz)) {
    for (const id of el.dataset.imagens.split(",").filter(Boolean)) {
      const img = await bdLer("imagens", id);
      if (!img) continue;
      const i = document.createElement("img");
      i.alt = "Imagem da anotação";
      i.src = URL.createObjectURL(img.blob);
      i.onclick = () => abrirPainel(`<h2>Imagem ${botaoFechar}</h2><img class="imagem-cheia" src="${i.src}" alt="Imagem da anotação">`);
      el.appendChild(i);
    }
  }
}

function painelMudanca(itemId) {
  const i = estado.itens.get(itemId);
  const atual = estado.leis[i.lei]?.artigos[i.art]?.texto || "";
  abrirPainel(`<h2>${esc(rotuloArt(i.art, i.lei))} — o que mudou ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Da versão de ${dataCurta(i.versao)} (quando você marcou) para a versão atual.</p>
    ${i.texto ? `<p style="font-size:14px">Trecho que você marcou: <strong>“${esc(i.texto)}”</strong></p>` : ""}
    <p class="legenda-diff"><span><del>removido</del></span><span><ins>adicionado</ins></span></p>
    <div class="diff">${i.textoOriginal ? diffHTML(i.textoOriginal, atual) : esc(atual)}</div>`);
}
async function ancorarNaVersaoAtual(itemId) {
  const i = estado.itens.get(itemId);
  const lei = estado.leis[i.lei];
  if (!lei?.artigos[i.art]) return;
  if (i.texto) {
    const div = document.createElement("div");
    const a = prepararLei(lei).arts.find(x => x.id === i.art);
    div.innerHTML = artigoHTML({ ...a, antes: [] }, null, i.lei);
    const texto = textoDoArtigo(div.firstElementChild);
    const loc = localizar(i, texto, lei.artigos[i.art].hash);
    if (loc.estado === "perdido" && !confirm("O trecho marcado não existe mais no artigo atual. Manter mesmo assim? (o texto original continua guardado)")) return;
    if (loc.ini !== undefined) {
      Object.assign(i, { ini: loc.ini, fim: loc.fim, prefixo: texto.slice(Math.max(0, loc.ini - 40), loc.ini), sufixo: texto.slice(loc.fim, loc.fim + 40) });
    }
  }
  Object.assign(i, { versao: lei.versao, hashArt: lei.artigos[i.art].hash, textoOriginal: lei.artigos[i.art].texto });
  await salvarItem(i);
  rotear();
}

/* =====================================================================
   BACKUP (exportar / importar com mesclagem pela data)
   ===================================================================== */
function blobParaBase64(blob) {
  return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
}
function base64ParaBlob(b64, tipo) {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo || "image/jpeg" });
}
/* Backup COMPLETO: um único arquivo com o app inteiro como está agora —
   leis do acervo (com o texto), pastas, grifos, anotações e imagens, desenhos,
   favoritos, cadernos de questões e respostas, resumos (arquivos originais,
   edições, marcações e imagens) e as suas preferências. */
const CHAVES_APP = ["ajustes", "ajustes-resumo", "alteracoes-nao-vistas", "cadernos-locais", "dock-lado", "dock-recolhido", "filtros-q", "info-cadernos", "ouvir-vel",
  "info-leis", "pos-q", "pos-resumo", "posicao", "preferencias-caneta", "status-em", "tela-cheia", "ultima-mudanca"];
const LOJAS_BACKUP = ["itens", "imagens", "resumos", "resumos_conteudo", "arquivos", "miniaturas"];
const caminhoDados = url => { const k = url.indexOf("/dados/"); return k >= 0 ? url.slice(k + 1) : url; };
async function exportarBackup() {
  const btn = $("#btn-exportar");
  const passo = t => { if (btn) btn.textContent = t; };
  try {
    passo("Juntando anotações e grifos…");
    const itensTodos = [...estado.itens.values()];
    passo("Juntando imagens…");
    const imgs = await bdTodos("imagens");
    const imagens = await Promise.all(imgs.map(async i => ({ id: i.id, tipoMime: i.tipoMime || i.blob.type, atualizadoEm: i.atualizadoEm, dono: i.dono, dados: await blobParaBase64(i.blob) })));
    passo("Juntando resumos…");
    const resumosTodos = await bdTodos("resumos");
    const arquivos = await Promise.all((await bdTodos("arquivos")).map(async a => ({ id: a.id, nome: a.nome, tipo: a.blob.type, atualizadoEm: a.atualizadoEm, dados: await blobParaBase64(a.blob) })));
    passo("Juntando leis e questões…");
    const cache = await caches.open(CACHE_DADOS);
    const dados = [];
    for (const req of await cache.keys()) {
      const r = await cache.match(req); if (!r) continue;
      dados.push({ url: caminhoDados(req.url), tipo: r.headers.get("content-type") || "application/json", texto: await r.text() });
    }
    const armazenamento = {};
    for (const k of CHAVES_APP) { const v = localStorage.getItem(k); if (v !== null) armazenamento[k] = v; }
    const ativos = itensTodos.filter(i => !i.apagado);
    const conta = t => ativos.filter(i => i.tipo === t).length;
    const resumo = {
      leis: Object.keys(lerLS("info-leis", {})).length, grifos: conta("grifo"), anotacoes: conta("anotacao"), favoritos: conta("favorito"),
      desenhos: conta("tinta"), respostas: conta("resposta"), pastas: conta("pasta"), resumos: resumosTodos.filter(r => !r.apagado).length,
      imagens: imagens.length, cadernos: dados.filter(d => d.url.startsWith("dados/questoes/") && !d.url.endsWith("indice.json")).length,
    };
    const pacote = {
      app: "leitor-legislacao", formato: 2, completo: true, exportadoEm: agoraISO(), resumo,
      itens: itensTodos, resumos: resumosTodos, resumosConteudo: await bdTodos("resumos_conteudo"),
      arquivos, imagens, dados, armazenamento,
      ajustes, posicao: lerLS("posicao", {}),          // (compatível com a importação antiga)
    };
    passo("Gerando o arquivo…");
    const d = new Date();
    const p2 = n => String(n).padStart(2, "0");
    const nome = `backup-completo-estudos-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    const arquivo = new File([JSON.stringify(pacote)], nome, { type: "application/json" });
    let cancelado = false;
    try {
      if (ehAparelhoApple() && navigator.canShare && navigator.canShare({ files: [arquivo] })) await navigator.share({ files: [arquivo], title: nome });
      else throw new Error("sem compartilhar");
    } catch (e) {
      if (e.name === "AbortError") cancelado = true;
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(arquivo); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
    }
    if (cancelado) { passo("Exportar backup completo"); return; }
    gravarLS("ultimo-backup", pacote.exportadoEm);
    if (location.hash.startsWith("#/ajustes")) telaAjustes();
    abrirPainel(`<h2>Backup completo gerado ${botaoFechar}</h2>
      <p><strong>${esc(nome)}</strong> · ${(arquivo.size / 1048576).toFixed(1).replace(".", ",")} MB</p>
      <p class="contagem">Contém: ${resumo.leis} lei(s) com o texto · ${resumo.grifos} grifo(s) · ${resumo.anotacoes} anotação(ões) · ${resumo.favoritos} favorito(s) ·
        ${resumo.desenhos} página(s)/artigo(s) com desenhos · ${resumo.pastas} pasta(s) · ${resumo.cadernos} caderno(s) de questões · ${resumo.respostas} resposta(s) ·
        ${resumo.resumos} resumo(s) com os arquivos originais · ${resumo.imagens} imagem(ns) · e as suas preferências.</p>
      <p class="contagem">Guarde este arquivo no iCloud Drive ou no Google Drive. Para restaurar, use “Importar backup” em qualquer aparelho.</p>`);
  } catch (e) {
    passo("Exportar backup completo");
    alert("Não foi possível gerar o backup: " + e.message);
  }
}

$("#entrada-backup").onchange = async e => {
  const arq = e.target.files[0];
  e.target.value = "";
  if (!arq) return;
  let p;
  try { p = JSON.parse(await arq.text()); } catch { alert("Este arquivo não é um backup válido do app."); return; }
  if (p.app !== "leitor-legislacao" || !Array.isArray(p.itens)) { alert("Este arquivo não é um backup do Leitor de Legislação."); return; }
  if (p.completo) return escolherRestauracao(p);
  return mesclarBackup(p);
};
function escolherRestauracao(p) {
  const r = p.resumo || {};
  abrirPainel(`<h2>Importar backup completo ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Backup de ${esc(dataHora(p.exportadoEm))}: ${r.leis ?? "?"} lei(s), ${r.grifos ?? "?"} grifo(s), ${r.anotacoes ?? "?"} anotação(ões), ${r.resumos ?? "?"} resumo(s), ${r.respostas ?? "?"} resposta(s) de questões.</p>
    <div class="acoes">
      <button id="rest-exato"><strong>Restaurar exatamente como está no arquivo</strong><br><span class="contagem">O app fica idêntico ao do backup. O que existe hoje neste aparelho é substituído.</span></button>
      <button id="rest-juntar"><strong>Juntar com o que já existe neste aparelho</strong><br><span class="contagem">Nada é apagado: em cada item fica a versão mais recente, e as leis e cadernos que faltam são acrescentados.</span></button>
    </div>`);
  $("#rest-exato").onclick = async () => {
    if (!confirm("Restaurar exatamente como no backup? Tudo o que está neste aparelho hoje será substituído pelo conteúdo do arquivo.")) return;
    $("#rest-exato").disabled = true; $("#rest-exato").textContent = "Restaurando…";
    await restaurarTudo(p, true);
  };
  $("#rest-juntar").onclick = async () => {
    $("#rest-juntar").disabled = true; $("#rest-juntar").textContent = "Juntando…";
    await restaurarTudo(p, false);
  };
}
async function restaurarTudo(p, exato) {
  const cache = await caches.open(CACHE_DADOS);
  if (exato) {
    for (const loja of LOJAS_BACKUP) await bdLimpar(loja);
    for (const k of CHAVES_APP) localStorage.removeItem(k);
    for (const req of await cache.keys()) await cache.delete(req);
    for (const it of p.itens) await bdGravar("itens", it);
    for (const r of p.resumos || []) await bdGravar("resumos", r);
    for (const c of p.resumosConteudo || []) await bdGravar("resumos_conteudo", c);
    for (const a of p.arquivos || []) await bdGravar("arquivos", { id: a.id, nome: a.nome, atualizadoEm: a.atualizadoEm, blob: base64ParaBlob(a.dados, a.tipo) });
    for (const im of p.imagens || []) await bdGravar("imagens", { id: im.id, blob: base64ParaBlob(im.dados, im.tipoMime), tipoMime: im.tipoMime, atualizadoEm: im.atualizadoEm, dono: im.dono });
    for (const [k, v] of Object.entries(p.armazenamento || {})) localStorage.setItem(k, v);
    for (const d of p.dados || []) await cache.put(new Request(d.url), new Response(d.texto, { headers: { "content-type": d.tipo } }));
  } else {
    await mesclarBackup(p, true);
    for (const d of p.dados || []) if (!(await cache.match(d.url))) await cache.put(new Request(d.url), new Response(d.texto, { headers: { "content-type": d.tipo } }));
    // o acervo e os cadernos passam a ter também os do backup (as preferências deste aparelho continuam)
    const arm = p.armazenamento || {};
    for (const k of ["info-leis", "info-cadernos"]) {
      if (!arm[k]) continue;
      const deles = JSON.parse(arm[k]), meus = lerLS(k, {});
      for (const [id, v] of Object.entries(deles)) if (!meus[id]) meus[id] = v;
      gravarLS(k, meus);
    }
  }
  gravarLS("ultimo-backup", p.exportadoEm);
  sessionStorage.setItem("aviso-restaurado", exato ? "exato" : "juntado");
  location.hash = "#/acervo";
  location.reload();          // recomeça o app já com tudo no lugar
}
async function mesclarBackup(p, silencioso = false) {
  const maisRecenteLocal = [...estado.itens.values()].reduce((m, i) => (i.atualizadoEm > m ? i.atualizadoEm : m), "");
  if (!silencioso && maisRecenteLocal && p.exportadoEm < maisRecenteLocal &&
      !confirm(`Este backup é de ${dataHora(p.exportadoEm)}, e há alterações mais recentes neste aparelho (${dataHora(maisRecenteLocal)}).\n\nA importação não apaga nada: em cada item fica a versão mais recente. Continuar?`)) return;
  let novos = 0, atualizados = 0, mantidos = 0, imgsNovas = 0;
  for (const it of p.itens) {
    const loc = estado.itens.get(it.id);
    versaoItens++;
    if (!loc) { await bdGravar("itens", it); estado.itens.set(it.id, it); novos++; }
    else if (it.atualizadoEm > loc.atualizadoEm) { await bdGravar("itens", it); estado.itens.set(it.id, it); atualizados++; }
    else mantidos++;
  }
  // resumos: fica a versão mais recente de cada um (o conteúdo acompanha)
  const conteudos = new Map((p.resumosConteudo || []).map(c => [c.id, c]));
  for (const r of p.resumos || []) {
    const loc = await bdLer("resumos", r.id);
    if (loc && loc.atualizadoEm >= r.atualizadoEm) { mantidos++; continue; }
    await bdGravar("resumos", r);
    if (r.apagado) await bdApagar("resumos_conteudo", r.id);
    else if (conteudos.has(r.id)) await bdGravar("resumos_conteudo", conteudos.get(r.id));
    loc ? atualizados++ : novos++;
  }
  for (const a of p.arquivos || []) if (!(await bdLer("arquivos", a.id))) await bdGravar("arquivos", { id: a.id, nome: a.nome, atualizadoEm: a.atualizadoEm, blob: base64ParaBlob(a.dados, a.tipo) });
  resumos.lista = null; resumos.textos = null;
  const usadas = new Set(itens("anotacao").flatMap(n => n.imagens || []));
  for (const c of await bdTodos("resumos_conteudo")) for (const id of imagensDoHtml(c.html || "")) usadas.add(id);   // imagens dos resumos também ficam
  for (const t of itens("tinta")) for (const f of t.figuras || []) usadas.add(f.img);                                  // e as colocadas por cima das páginas
  for (const im of p.imagens || []) {
    if (!usadas.has(im.id) || await bdLer("imagens", im.id)) continue;
    await bdGravar("imagens", { id: im.id, blob: base64ParaBlob(im.dados, im.tipoMime), tipoMime: im.tipoMime, atualizadoEm: im.atualizadoEm });
    imgsNovas++;
  }
  // imagens que nenhuma anotação usa mais são removidas
  for (const im of await bdTodos("imagens")) if (!usadas.has(im.id)) await bdApagar("imagens", im.id);
  gravarLS("ultima-mudanca", agoraISO());
  if (silencioso) return;
  abrirPainel(`<h2>Backup importado ${botaoFechar}</h2>
    <p>Itens novos: ${novos}<br>Itens atualizados com a versão do backup: ${atualizados}<br>Itens mantidos (versão do aparelho era igual ou mais nova): ${mantidos}<br>Imagens adicionadas: ${imgsNovas}</p>
    <p class="contagem">Backup de ${dataHora(p.exportadoEm)}.</p>`);
  if (location.hash.startsWith("#/ajustes")) telaAjustes();
}

/* =====================================================================
   NAVEGAÇÃO: o botão Voltar leva para a tela de onde você veio
   (e não para um lugar fixo). Pular de artigo dentro da mesma lei não
   conta como "tela nova".
   ===================================================================== */
let pilhaNav = (() => { try { return JSON.parse(sessionStorage.getItem("pilha-nav")) || []; } catch { return []; } })();
let voltandoNav = false, raizNav = false, ultimaRolagem = 0;
const ROTAS_RAIZ = ["acervo", "questoes", "resumos", "pesquisar", "estudos", "ajustes"];
window.addEventListener("scroll", () => { ultimaRolagem = window.scrollY; }, { passive: true });
function baseRota(h) {
  const p = h.replace(/^#\/?/, "").split("/");
  if (p[0] === "lei" || p[0] === "caderno") return p[0] + "/" + p[1];
  return h.replace(/^#\/?/, "") || "acervo";
}
function registrarNavegacao() {
  const h = location.hash || "#/acervo";
  const b = baseRota(h);
  const topo = pilhaNav[pilhaNav.length - 1];
  voltandoNav = false;
  if (raizNav) { pilhaNav = [{ h, b, y: 0 }]; raizNav = false; }
  else if (topo && topo.b === b) topo.h = h;                                   // mesma tela (outro artigo da mesma lei)
  else if (pilhaNav.length > 1 && pilhaNav[pilhaNav.length - 2].b === b) {     // voltou para a tela anterior
    pilhaNav.pop(); pilhaNav[pilhaNav.length - 1].h = h; voltandoNav = true;
  } else {
    if (topo) topo.y = ultimaRolagem;
    pilhaNav.push({ h, b, y: 0 });
  }
  if (pilhaNav.length > 40) pilhaNav.splice(0, pilhaNav.length - 40);
  sessionStorage.setItem("pilha-nav", JSON.stringify(pilhaNav));
}
function voltar() {
  if (pilhaNav.length > 1) { location.hash = pilhaNav[pilhaNav.length - 2].h; return; }
  const destino = $("#btn-voltar").dataset.destino || "#/acervo";
  raizNav = ROTAS_RAIZ.includes(baseRota(destino));
  location.hash = destino;
}
function paiDaLei(id) { const p = pastasDe("leis").find(x => (x.leis || []).includes(id)); return p ? `#/acervo/pasta/${p.id}` : "#/acervo"; }
function paiDoCaderno(id) { const p = pastasDe("questoes").find(x => (x.cadernos || []).includes(id)); return p ? `#/questoes/pasta/${p.id}` : "#/questoes/cadernos"; }
