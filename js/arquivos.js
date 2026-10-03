/* =====================================================================
   GOOGLE DRIVE (importar e exportar arquivos que VOCÊ escolhe)
   Usa só a permissão "drive.file": o app enxerga apenas os arquivos que
   você escolhe na janela do Google ou que ele mesmo cria.
   ===================================================================== */
const GOOGLE_API_KEY = "AIzaSyDNoiHUnTMU_Lb1ZUlGazLW6NJQ09UYggM";
const GOOGLE_APP_ID = "556131873310";
const baseGoogle = () => lerLS("sync-google-base", "https://www.googleapis.com");     // (os testes usam um Drive de mentira)
const MIME_RESUMO = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

async function tokenDrive() {                       // precisa vir de um toque (o Google pode abrir uma janelinha)
  const tk = lerLS("google-token-arquivos", null);
  if (tk && Date.now() < tk.expira - 60000) return tk.token;
  if (!idClienteGoogle()) throw new Error("O acesso ao Google ainda não foi configurado no app.");
  await carregarScript("https://accounts.google.com/gsi/client");
  return new Promise((ok, falha) => {
    google.accounts.oauth2.initTokenClient({
      client_id: idClienteGoogle(), scope: "https://www.googleapis.com/auth/drive.file",
      callback: r => {
        if (r.error) return falha(new Error("O Google não autorizou: " + r.error));
        gravarLS("google-token-arquivos", { token: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
        ok(r.access_token);
      },
      error_callback: e => falha(new Error("A janela do Google foi fechada ou bloqueada (" + (e.type || "erro") + ")."))
    }).requestAccessToken({ prompt: tk ? "" : "consent" });
  });
}
/* envio ao Drive: pequeno vai de uma vez; grande (acima de 4 MB) vai pelo envio em partes do Google */
async function enviarAoDrive(token, bytes, meta, idExistente) {
  const base = baseGoogle();
  const aut = { Authorization: "Bearer " + token };
  const tamanho = bytes.length || bytes.size || 0;
  let r;
  if (tamanho <= 4 * 1024 * 1024) {
    if (idExistente) r = await fetch(`${base}/upload/drive/v3/files/${idExistente}?uploadType=media&fields=id,md5Checksum`, { method: "PATCH", headers: aut, body: bytes });
    else {
      const fd = new FormData();
      fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      fd.append("file", new Blob([bytes], meta.mimeType ? { type: meta.mimeType } : {}));
      r = await fetch(`${base}/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", headers: aut, body: fd });
    }
  } else {
    const ini = await fetch(`${base}/upload/drive/v3/files${idExistente ? "/" + idExistente : ""}?uploadType=resumable&fields=id,md5Checksum`, {
      method: idExistente ? "PATCH" : "POST",
      headers: { ...aut, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(tamanho) },
      body: JSON.stringify(idExistente ? {} : meta),
    });
    if (ini.status === 401) { const e = new Error("Toque em ☁️ para reconectar ao Google."); e.reconectar = true; throw e; }
    const sessao = ini.headers.get("Location");
    if (!ini.ok || !sessao) throw new Error(`O Google não aceitou iniciar o envio (${ini.status}).`);
    r = await fetch(sessao, { method: "PUT", body: bytes });
  }
  if (r.status === 401) { const e = new Error("Toque em ☁️ para reconectar ao Google."); e.reconectar = true; throw e; }
  if (!r.ok) throw new Error(`O Google recusou o envio de ${meta?.name || "um arquivo"} (${r.status}).`);
  return r.json();
}
async function pastaNoDrive(token, nome, pai) {
  const base = baseGoogle();
  const q = encodeURIComponent(`name='${nome.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${pai ? ` and '${pai}' in parents` : ""}`);
  const r = await fetch(`${base}/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: "Bearer " + token } });
  const achada = r.ok ? (await r.json()).files?.[0] : null;
  if (achada) return achada.id;
  const c = await fetch(`${base}/drive/v3/files?fields=id`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", ...(pai ? { parents: [pai] } : {}) }),
  });
  if (!c.ok) throw new Error("Não foi possível criar a pasta no Google Drive (" + c.status + ").");
  return (await c.json()).id;
}
/* janela do Google Drive para escolher arquivos */
async function arquivosDoDrive(tipos) {
  const token = await tokenDrive();
  await carregarScript("https://apis.google.com/js/api.js");
  await new Promise(ok => gapi.load("picker", ok));
  const docs = await new Promise(ok => {
    const vista = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(tipos.join(",")).setIncludeFolders(true).setSelectFolderEnabled(false);
    new google.picker.PickerBuilder()
      .addView(vista).enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token).setDeveloperKey(GOOGLE_API_KEY).setAppId(GOOGLE_APP_ID).setLocale("pt-BR")
      .setTitle("Escolha os arquivos do Google Drive")
      .setCallback(d => { if (d.action === google.picker.Action.PICKED) ok(d.docs || []); else if (d.action === google.picker.Action.CANCEL) ok([]); })
      .build().setVisible(true);
  });
  const arquivos = [];
  for (const d of docs) {
    const r = await fetch(`${baseGoogle()}/drive/v3/files/${d.id}?alt=media`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error(`Não foi possível baixar "${d.name}" do Drive (${r.status}).`);
    arquivos.push(new File([await r.blob()], d.name, { type: d.mimeType || "" }));
  }
  return arquivos;
}
/* exportar resumos e cadernos para a pasta "Leitor de Legislação" do Drive */
async function exportarResumosParaDrive(lista, versao, aviso) {
  const token = await tokenDrive();
  const raiz = await pastaNoDrive(token, "Leitor de Legislação");
  const pasta = await pastaNoDrive(token, "Resumos", raiz);
  let n = 0;
  for (const r of lista) {
    aviso && aviso(`Enviando ${++n} de ${lista.length}: ${r.origem || r.titulo}…`);
    let blob, nome;
    if (versao === "marcada" && r.formato === "pdf") { blob = await exportarPdfComMarcacoes(r, null, true); nome = nomeBase(r) + " (com marcações).pdf"; }
    else if (versao === "marcada" && r.formato === "docx") { blob = await exportarWordEditado(r, true); nome = nomeBase(r) + " (editado).doc"; }
    else if (r.arquivo) { blob = await lerArquivoOriginal(r); nome = r.origem || nomeBase(r) + (r.formato === "pdf" ? ".pdf" : ".docx"); }
    else { blob = new Blob([await lerConteudo(r.id)], { type: "text/html" }); nome = nomeBase(r) + ".html"; }
    if (!blob) continue;
    await enviarAoDrive(token, new Uint8Array(await blob.arrayBuffer()), { name: nome, parents: [pasta], mimeType: blob.type || undefined });
  }
  return n;
}
function cadernoParaArquivo(c) {
  const { local, ...resto } = c;
  return new Blob([JSON.stringify({ formato: "leitor-caderno", ...resto, questoes: c.questoes.map(({ caderno, ...q }) => q) })], { type: "application/json" });
}
async function exportarCadernoParaDrive(id, aviso) {
  const c = estado.cadernos[id];
  const token = await tokenDrive();
  const raiz = await pastaNoDrive(token, "Leitor de Legislação");
  const pasta = await pastaNoDrive(token, "Cadernos de questões", raiz);
  aviso && aviso("Enviando…");
  const blob = cadernoParaArquivo(c);
  await enviarAoDrive(token, new Uint8Array(await blob.arrayBuffer()), { name: `${c.titulo}.caderno.json`, parents: [pasta], mimeType: "application/json" });
}
function painelExportarResumosDrive(lista) {
  const temOriginais = lista.some(r => r.arquivo);
  abrirPainel(`<h2>Enviar ao Google Drive ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${lista.length} resumo(s) vão para a pasta <strong>Leitor de Legislação › Resumos</strong> do seu Drive.</p>
    <div class="acoes">
      ${temOriginais ? '<button data-versao="original">Arquivos originais (como foram importados)</button>' : ""}
      <button data-versao="marcada">Versão com as minhas marcações e edições (PDF com marcações · Word editado)</button>
    </div><p class="contagem" id="msg-drive"></p>`);
  $$("#painel-caixa [data-versao]").forEach(b => b.onclick = async () => {
    $$("#painel-caixa [data-versao]").forEach(x => x.disabled = true);
    const msg = $("#msg-drive");
    try { const n = await exportarResumosParaDrive(lista, b.dataset.versao, t => { msg.textContent = t; }); msg.innerHTML = `<span class="txt-ok">✓ ${n} arquivo(s) enviados ao Google Drive.</span>`; }
    catch (e) { msg.textContent = "⚠️ " + e.message; $$("#painel-caixa [data-versao]").forEach(x => x.disabled = false); }
  });
}

/* =====================================================================
   RESUMOS: copiar, escolher pasta, mover e apagar pastas
   ===================================================================== */
async function duplicarResumo(r, destino = null, sufixo = " — cópia") {
  const novo = { ...r, id: uid(), titulo: (r.titulo || "Sem título") + sufixo, favorito: false, criadoEm: null, abertoEm: null };
  if (destino) { novo.materia = destino.materia; novo.assunto = destino.assunto; }
  if (r.arquivo) { const a = await bdLer("arquivos", r.arquivo); if (a) { novo.arquivo = uid(); await bdGravar("arquivos", { ...a, id: novo.arquivo }); } }
  const cont = await bdLer("resumos_conteudo", r.id);
  let html = cont?.html || "";
  for (const img of imagensDoHtml(html)) {
    const im = await bdLer("imagens", img);
    if (im) { const nid = uid(); await bdGravar("imagens", { ...im, id: nid }); html = html.split(`data-img="${img}"`).join(`data-img="${nid}"`); }
  }
  await salvarMeta(novo);
  await bdGravar("resumos_conteudo", { ...(cont || {}), id: novo.id, html, texto: cont?.texto || "" });
  for (const t of itens("tinta", t => t.lei === "resumo:" + r.id)) {      // os desenhos vão junto na cópia
    const nid = t.id.replace("resumo:" + r.id, "resumo:" + novo.id);
    await salvarItem({ ...t, id: nid, lei: "resumo:" + novo.id });
  }
  return novo;
}
function painelEscolherPasta(titulo, aoEscolher, { incluirRaiz = true, excluir = null } = {}) {
  const mats = materiasResumo();
  abrirPainel(`<h2>${esc(titulo)} ${botaoFechar}</h2>
    <div class="acoes arvore-pastas">
      ${incluirRaiz ? '<button data-pasta-dest="|">Fora das pastas (início)</button>' : ""}
      ${mats.filter(m => !(excluir && excluir.materia === m && !excluir.assunto)).map(m => `<button data-pasta-dest="${esc(m)}|">📁 ${esc(m)}</button>
        ${assuntosDe(m).filter(a => !(excluir && excluir.materia === m && excluir.assunto === a)).map(a => `<button class="sub" data-pasta-dest="${esc(m)}|${esc(a)}">└ 📁 ${esc(a)}</button>`).join("")}`).join("")}
      <button id="pasta-dest-nova">+ Nova pasta…</button>
    </div>`);
  $$("#painel-caixa [data-pasta-dest]").forEach(b => b.onclick = () => { const [m, a] = b.dataset.pastaDest.split("|"); aoEscolher({ materia: m, assunto: a }); });
  $("#pasta-dest-nova").onclick = async () => {
    const m = prompt("Nome da pasta (matéria):"); if (!m || !m.trim()) return;
    const a = prompt("Subpasta (assunto) dentro dela — opcional:") || "";
    if (!materiasResumo().includes(m.trim())) await salvarItem({ id: uid(), tipo: "materia", nome: m.trim() });
    if (a.trim() && !assuntosDe(m.trim()).includes(a.trim())) await salvarItem({ id: uid(), tipo: "assunto", materia: m.trim(), nome: a.trim() });
    aoEscolher({ materia: m.trim(), assunto: a.trim() });
  };
}
const irPara = h => { if (location.hash === h) rotear(); else location.hash = h; };
function menuPastaResumo(tipo, materia, nome) {
  const dentro = () => resumosAtivos().filter(r => tipo === "materia" ? r.materia === nome : r.materia === materia && r.assunto === nome);
  const n = dentro().length;
  abrirPainel(`<h2>📁 ${esc(nome)} ${botaoFechar}</h2><div class="acoes">
    <button id="pr-renomear">Renomear a pasta</button>
    <button id="pr-mover">Mover a pasta…</button>
    <button id="pr-apagar-pasta">Apagar só a pasta (os ${n} arquivo(s) voltam para ${tipo === "materia" ? "o início" : "a pasta " + esc(materia)})</button>
    <button id="pr-apagar-tudo" style="color:var(--alt)">🗑 Mandar a pasta e os ${n} arquivo(s) para a lixeira</button></div>`);
  const itensPasta = () => itens(tipo === "materia" ? "materia" : "assunto", i => i.nome === nome && (tipo === "materia" || i.materia === materia));
  $("#pr-renomear").onclick = async () => {
    const novo = prompt("Novo nome:", nome); if (!novo || !novo.trim() || novo.trim() === nome) return;
    for (const r of dentro()) { if (tipo === "materia") r.materia = novo.trim(); else r.assunto = novo.trim(); await salvarMeta(r); }
    for (const i of itensPasta()) { i.nome = novo.trim(); await salvarItem(i); }
    if (tipo === "materia") for (const i of itens("assunto", i => i.materia === nome)) { i.materia = novo.trim(); await salvarItem(i); }
    fecharPainel(); rotear();
  };
  $("#pr-apagar-pasta").onclick = async () => {
    if (!confirm(`Apagar a pasta "${nome}"? Os arquivos dela NÃO são apagados: voltam para ${tipo === "materia" ? "o início" : "a pasta " + materia}.`)) return;
    for (const r of dentro()) { if (tipo === "materia") { r.materia = ""; r.assunto = ""; } else r.assunto = ""; await salvarMeta(r); }
    for (const i of itensPasta()) await apagarItem(i.id);
    if (tipo === "materia") for (const i of itens("assunto", i => i.materia === nome)) await apagarItem(i.id);
    fecharPainel(); irPara(tipo === "materia" ? "#/resumos" : rotaPasta(materia));
  };
  $("#pr-apagar-tudo").onclick = async () => {
    await resumosParaLixeira(dentro(), { id: uid(), nome, tipo, materia });       // na lixeira, aparecem juntos como uma pasta
    for (const i of itensPasta()) await apagarItem(i.id);
    if (tipo === "materia") for (const i of itens("assunto", i => i.materia === nome)) await apagarItem(i.id);
    fecharPainel(); irPara(tipo === "materia" ? "#/resumos" : rotaPasta(materia));
    mostrarAvisoRapido(`🗑 Pasta "${nome}" foi para a lixeira (dá para restaurar por 30 dias)`);
  };
  $("#pr-mover").onclick = () => moverPastaResumo(tipo, materia, nome);
}
function moverPastaResumo(tipo, materia, nome) {
  const outras = materiasResumo().filter(m => m !== (tipo === "materia" ? nome : materia));
  const subs = tipo === "materia" ? assuntosDe(nome) : [];
  abrirPainel(`<h2>Mover “${esc(nome)}” ${botaoFechar}</h2>
    ${tipo === "materia" && subs.length ? `<p class="contagem" style="margin-top:0">Ela vira uma subpasta da pasta escolhida. As ${subs.length} subpasta(s) que ela tem (${subs.map(esc).join(", ")}) passam a ficar ao lado dela, também dentro da pasta escolhida.</p>` : ""}
    <div class="acoes arvore-pastas">
      ${tipo === "assunto" ? '<button data-mover-pasta="">⬆️ Transformar em pasta principal</button>' : ""}
      ${outras.map(m => `<button data-mover-pasta="${esc(m)}">📁 Para dentro de ${esc(m)}</button>`).join("")}
      ${!outras.length && tipo === "materia" ? '<p class="contagem">Crie outra pasta primeiro para poder mover esta para dentro dela.</p>' : ""}
    </div>`);
  $$("#painel-caixa [data-mover-pasta]").forEach(b => b.onclick = async () => {
    const destino = b.dataset.moverPasta;
    if (tipo === "assunto") {
      const lista = resumosAtivos().filter(r => r.materia === materia && r.assunto === nome);
      for (const i of itens("assunto", i => i.materia === materia && i.nome === nome)) await apagarItem(i.id);
      if (destino) {
        for (const r of lista) { r.materia = destino; await salvarMeta(r); }
        if (!assuntosDe(destino).includes(nome)) await salvarItem({ id: uid(), tipo: "assunto", materia: destino, nome });
      } else {
        for (const r of lista) { r.materia = nome; r.assunto = ""; await salvarMeta(r); }
        if (!materiasResumo().includes(nome)) await salvarItem({ id: uid(), tipo: "materia", nome });
      }
      fecharPainel(); location.hash = destino ? rotaPasta(destino, nome) : rotaPasta(nome);
    } else {
      for (const r of resumosAtivos().filter(r => r.materia === nome)) { r.assunto = r.assunto || nome; r.materia = destino; await salvarMeta(r); }
      for (const i of itens("assunto", i => i.materia === nome)) { i.materia = destino; await salvarItem(i); }
      for (const i of itens("materia", i => i.nome === nome)) await apagarItem(i.id);
      if (!assuntosDe(destino).includes(nome)) await salvarItem({ id: uid(), tipo: "assunto", materia: destino, nome });
      fecharPainel(); location.hash = rotaPasta(destino);
    }
  });
}

/* =====================================================================
   SELECIONAR VÁRIOS RESUMOS
   ===================================================================== */
const selecaoRes = { ativa: false, ids: new Set() };
function alternarSelecaoResumos(ligar = !selecaoRes.ativa) {
  selecaoRes.ativa = ligar; selecaoRes.ids.clear();
  $("#lista-res")?.classList.toggle("selecionando", ligar);
  $$(".tile-resumo").forEach(t => t.classList.remove("marcado"));
  const btn = $("#selecionar-res"); if (btn) btn.textContent = ligar ? "✕ Cancelar seleção" : "☑️ Selecionar";
  atualizarBarraSelecao();
}
function atualizarBarraSelecao() {
  let b = $("#barra-sel-res");
  if (!selecaoRes.ativa) { b?.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "barra-sel-res"; b.className = "barra-sel-res"; ($("#camada-fixa") || document.body).appendChild(b); }
  const n = selecaoRes.ids.size;
  b.innerHTML = `<span class="sel-n">${n} selecionado(s)</span>
    <button data-sel="todos">Todos</button>
    <button data-sel="mover" ${n ? "" : "disabled"}>📁 Mover</button>
    <button data-sel="copiar" ${n ? "" : "disabled"}>📄 Copiar para</button>
    <button data-sel="duplicar" ${n ? "" : "disabled"}>⧉ Duplicar</button>
    <button data-sel="favoritar" ${n ? "" : "disabled"}>★ Favoritar</button>
    <button data-sel="arquivar" ${n ? "" : "disabled"}>📦 Arquivar</button>
    <button data-sel="drive" ${n ? "" : "disabled"}>☁️ Drive</button>
    <button data-sel="apagar" ${n ? "" : "disabled"} style="color:var(--alt)">🗑 Apagar</button>
    <button data-sel="sair">✕</button>`;
  b.onclick = e => { const x = e.target.closest("[data-sel]"); if (x) acaoSelecaoResumos(x.dataset.sel); };
}
async function acaoSelecaoResumos(acao) {
  const lista = [...selecaoRes.ids].map(id => resumos.lista.get(id)).filter(Boolean);
  const terminar = () => { alternarSelecaoResumos(false); fecharPainel(); window.renderListaResumos ? window.renderListaResumos() : rotear(); };
  if (acao === "sair") return alternarSelecaoResumos(false);
  if (acao === "todos") {
    const todos = $$(".tile-resumo[data-id]");
    const marcar = selecaoRes.ids.size < todos.length;
    todos.forEach(t => { t.classList.toggle("marcado", marcar); marcar ? selecaoRes.ids.add(t.dataset.id) : selecaoRes.ids.delete(t.dataset.id); });
    return atualizarBarraSelecao();
  }
  if (acao === "mover") return painelEscolherPasta(`Mover ${lista.length} arquivo(s) para…`, async d => { for (const r of lista) { r.materia = d.materia; r.assunto = d.assunto; await salvarMeta(r); } terminar(); });
  if (acao === "copiar") return painelEscolherPasta(`Copiar ${lista.length} arquivo(s) para…`, async d => { for (const r of lista) await duplicarResumo(r, d, ""); terminar(); });
  if (acao === "duplicar") { for (const r of lista) await duplicarResumo(r); return terminar(); }
  if (acao === "favoritar") { const todosFav = lista.every(r => r.favorito); for (const r of lista) { r.favorito = !todosFav; await salvarMeta(r); } return terminar(); }
  if (acao === "arquivar") { const todosArq = lista.every(r => r.arquivado); for (const r of lista) { r.arquivado = !todosArq; await salvarMeta(r); } return terminar(); }
  if (acao === "drive") return painelExportarResumosDrive(lista);
  if (acao === "apagar") {
    await resumosParaLixeira(lista);
    mostrarAvisoRapido(`🗑 ${lista.length} arquivo(s) foram para a lixeira`);
    return terminar();
  }
}
// com a seleção ligada, tocar na miniatura marca/desmarca (em vez de abrir)
document.addEventListener("click", e => {
  if (!selecaoRes.ativa) return;
  const t = e.target.closest && e.target.closest(".tile-resumo[data-id]");
  if (!t || e.target.closest(".tile-mais")) return;
  e.preventDefault(); e.stopPropagation();
  const id = t.dataset.id;
  selecaoRes.ids.has(id) ? selecaoRes.ids.delete(id) : selecaoRes.ids.add(id);
  t.classList.toggle("marcado", selecaoRes.ids.has(id));
  atualizarBarraSelecao();
}, true);

/* =====================================================================
   CONFIGURAÇÕES → ARMAZENAMENTO (apagar por categoria ou tudo)
   ===================================================================== */
async function medirArmazenamento() {
  const cache = await caches.open(CACHE_DADOS);
  let leis = 0, nLeis = 0, cadernos = 0;
  for (const req of await cache.keys()) {
    const r = await cache.match(req); const t = r ? (await r.blob()).size : 0;
    if (req.url.includes("/dados/leis/")) { leis += t; nLeis++; }
    else if (req.url.includes("/dados/questoes/local/")) cadernos += t;
  }
  const arquivos = await bdTodos("arquivos"), conteudos = await bdTodos("resumos_conteudo"), imgs = await bdTodos("imagens");
  const resumosBytes = arquivos.reduce((s, a) => s + (a.blob?.size || 0), 0) + conteudos.reduce((s, c) => s + (c.html || "").length + (c.texto || "").length, 0);
  const imagensBytes = imgs.reduce((s, i) => s + (i.blob?.size || 0), 0);
  const marcacoes = JSON.stringify([...estado.itens.values()]).length;
  return { leis, nLeis, cadernos, nCadernos: lerLS("cadernos-locais", []).filter(c => !c.apagado).length, resumos: resumosBytes, nResumos: (await bdTodos("resumos")).filter(r => !r.apagado).length, imagens: imagensBytes, marcacoes };
}
function htmlArmazenamento(m) {
  const mb = b => (b / 1048576).toFixed(1).replace(".", ",") + " MB";
  const total = m.leis + m.cadernos + m.resumos + m.imagens + m.marcacoes;
  return `<div class="secao"><h2>Armazenamento</h2><div class="cartao">
    <p class="contagem" style="margin-top:0">Total ocupado neste aparelho: <strong>${mb(total)}</strong></p>
    <div class="linha-arm"><div><strong>Textos das leis</strong><br><span class="contagem">${m.nLeis} lei(s) · ${mb(m.leis)} · são baixados de novo quando você abrir a lei</span></div><button id="arm-leis">Apagar</button></div>
    <div class="linha-arm"><div><strong>Minhas marcações e anotações</strong><br><span class="contagem">grifos, anotações, caneta, marca-texto, ícones, favoritos e respostas das questões · ${mb(m.marcacoes + m.imagens)}</span></div><button id="arm-marcacoes">Apagar…</button></div>
    <div class="linha-arm"><div><strong>Cadernos de questões importados</strong><br><span class="contagem">${m.nCadernos} caderno(s) · ${mb(m.cadernos)} · o histórico de respostas continua</span></div><button id="arm-cadernos" ${m.nCadernos ? "" : "disabled"}>Apagar</button></div>
    <div class="linha-arm"><div><strong>Resumos</strong><br><span class="contagem">${m.nResumos} resumo(s) com arquivos e edições · ${mb(m.resumos)}</span></div><button id="arm-resumos" ${m.nResumos ? "" : "disabled"}>Apagar</button></div>
    <div class="linha-arm"><div><strong>🗑 Lixeira</strong><br><span class="contagem">${itensDaLixeira().total} item(ns) · somem sozinhos depois de 30 dias</span></div><a class="botao" href="#/lixeira" style="text-decoration:none">Abrir</a></div>
    <div class="acoes" style="margin:14px 0 6px"><button id="arm-tudo" style="color:var(--alt)">Apagar todos os meus dados…</button></div>
    <p class="contagem">${cfgSync() ? "Com a sincronização ligada, o que você apaga aqui também é apagado na sua nuvem e nos seus outros aparelhos. “Apagar todos os meus dados” esvazia a sua conta, mas você continua conectado." : "Faça um backup antes de apagar, se quiser poder recuperar."}</p>
  </div></div>`;
}
/* deixa o app vazio neste aparelho, mas mantém a conexão com a nuvem (GitHub/Google) */
async function apagarDadosDoAparelho() {
  for (const loja of ["itens", "imagens", "resumos", "resumos_conteudo", "arquivos", "miniaturas"]) await bdLimpar(loja);
  await caches.delete(CACHE_DADOS);
  const doApp = new Set([...CHAVES_APP, "boas-vindas-vista", "ultimo-backup", "lembrete-backup-dia", "preferencias-caneta", "ajustes-resumo",
    "pos-resumo", "dock-lado", "dock-recolhido", "tela-cheia", "ouvir-vel", "cadernos-locais"]);
  for (const k of doApp) localStorage.removeItem(k);
  localStorage.setItem("boas-vindas-vista", "true");
  estado.itens = new Map(); estado.leis = {}; estado.cadernos = {}; resumos.lista = null;
}
function ligarArmazenamento() {
  $("#arm-leis").onclick = () => {
    const deLei = i => !String(i.lei || "").startsWith("resumo:");
    const marcas = [...itens("grifo"), ...itens("anotacao"), ...itens("tinta", i => deLei(i) && temConteudo(i)), ...itens("favorito", i => i.alvo !== "questao")];
    abrirPainel(`<h2>Textos das leis ${botaoFechar}</h2>
      <p class="contagem" style="margin-top:0">Escolha o que apagar neste aparelho:</p>
      <div class="acoes">
        <button id="leis-so-texto">Apagar só os textos das leis<br><span class="contagem">Libera espaço. Os seus grifos, anotações e desenhos continuam, e o texto é baixado de novo quando você abrir a lei.</span></button>
        <button id="leis-marcacoes" ${marcas.length ? "" : "disabled"} style="color:var(--alt)">Apagar as minhas marcações nas leis (${marcas.length})<br><span class="contagem">Grifos, anotações, caneta, marca-texto, ícones e favoritos de todas as leis. As leis continuam no acervo.</span></button>
        <button id="leis-tudo" style="color:var(--alt)">Apagar os textos e as minhas marcações nas leis</button>
      </div><p class="contagem">As marcações apagadas não passam pela lixeira. Se quiser poder voltar atrás, faça antes um backup completo.</p>`);
    const apagarTextos = async () => {
      const cache = await caches.open(CACHE_DADOS);
      for (const req of await cache.keys()) if (req.url.includes("/dados/leis/")) await cache.delete(req);
      estado.leis = {};
    };
    const apagarMarcas = async () => {
      for (const i of marcas) await apagarItem(i.id);
      versaoItens++;
    };
    $("#leis-so-texto").onclick = async () => { await apagarTextos(); fecharPainel(); mostrarAvisoRapido("Textos das leis apagados (as marcações continuam)"); telaAjustes(); };
    $("#leis-marcacoes").onclick = async () => {
      if (!confirm(`Apagar ${marcas.length} marcação(ões) de todas as leis? Não dá para desfazer sem um backup.`)) return;
      await apagarMarcas(); fecharPainel(); mostrarAvisoRapido(`🗑 ${marcas.length} marcação(ões) das leis apagada(s)`); telaAjustes();
    };
    $("#leis-tudo").onclick = async () => {
      if (!confirm(`Apagar os textos das leis e as ${marcas.length} marcação(ões) que você fez nelas? Não dá para desfazer sem um backup.`)) return;
      await apagarMarcas(); await apagarTextos(); fecharPainel(); mostrarAvisoRapido("Textos e marcações das leis apagados"); telaAjustes();
    };
  };
  $("#arm-resumos").onclick = async () => {
    await carregarResumos();
    const lista = [...resumos.lista.values()].filter(r => !r.apagado);
    if (!confirm(`Apagar DE VEZ os ${lista.length} resumo(s) (inclusive os da lixeira), com os arquivos originais, edições, desenhos e imagens, e as pastas de resumos? Isto não passa pela lixeira.`)) return;
    for (const r of lista) await excluirResumo(r.id);
    for (const i of itens("materia").concat(itens("assunto"))) await apagarItem(i.id);
    resumos.lista = null; await carregarResumos(); telaAjustes();
  };
  $("#arm-cadernos").onclick = async () => {
    const locais = lerLS("cadernos-locais", []);
    if (!confirm(`Apagar DE VEZ os ${locais.filter(c => !c.apagado).length} caderno(s) importado(s), inclusive os da lixeira? As suas respostas ficam no histórico e voltam a valer se você importar o mesmo caderno de novo.`)) return;
    const cache = await caches.open(CACHE_DADOS);
    for (const c of locais) if (!c.apagado) await cache.delete(c.url);
    gravarLS("cadernos-locais", locais.map(c => ({ ...c, apagado: true, atualizadoEm: agoraISO() })));
    await carregarQuestoes(); telaAjustes();
  };
  $("#arm-marcacoes").onclick = () => painelApagarTodasMarcacoes();
  $("#arm-tudo").onclick = async () => {
    const nuvem = cfgSync();
    if (!confirm("Apagar TODOS os seus dados do app? Leis do acervo, marcações, anotações, desenhos, respostas, cadernos, resumos e preferências."
      + (nuvem ? `\n\nComo a sincronização está ligada, os dados também serão apagados da sua nuvem (${nuvem.provedor === "google" ? "Google Drive" : "GitHub"}) e dos seus outros aparelhos conectados. Você continua conectado à conta, mas ela fica vazia.` : "")
      + "\n\nNão dá para desfazer (a não ser que você tenha um backup completo guardado).")) return;
    const confirma = prompt("Para confirmar, digite APAGAR:");
    if ((confirma || "").trim().toUpperCase() !== "APAGAR") return;
    abrirPainel(`<h2>Apagando os seus dados…</h2><p class="contagem" id="msg-zerar">Começando…</p>`);
    const msg = t => { const m = $("#msg-zerar"); if (m) m.textContent = t; };
    if (nuvem) {
      if (!navigator.onLine) { msg("Sem internet: não foi possível apagar da nuvem. Nada foi apagado. Tente de novo com internet."); return; }
      try {
        const p = provedorAtual();
        await p.preparar();
        const lista = await p.listar();
        const DO_APP = /^(config\.json|itens\.json|resumos\.json|cripto\.json|reset\.json|resumos\/|arquivos\/|imagens\/|cadernos\/)/;
        const caminhos = [...lista.keys()].filter(c => DO_APP.test(c));
        let n = 0;
        for (const c of caminhos) { msg(`Apagando da nuvem: ${++n} de ${caminhos.length}…`); await p.apagar(c, lista.get(c)); }
        const em = agoraISO();
        await p.enviar("reset.json", paraBytes({ em, aviso: "Dados apagados pelo usuário" }), null);   // avisa os outros aparelhos
        gravarLS("sync-reset-visto", em);
      } catch (e) { msg("⚠️ Não foi possível apagar da nuvem: " + e.message + ". Nada foi apagado neste aparelho; tente de novo."); return; }
    }
    msg("Apagando deste aparelho…");
    await apagarDadosDoAparelho();
    if (nuvem) gravarLS("sync-estado", { hashes: {}, locais: {} });
    sessionStorage.setItem("aviso-zerado", "este");
    location.hash = "#/acervo"; location.reload();
  };
}

/* apagar marcações de TODAS as leis, dos resumos e das questões, escolhendo o tipo */
function painelApagarTodasMarcacoes() {
  const deResumo = i => String(i.lei || "").startsWith("resumo:");
  const grupos = [
    ["grifo", "Grifos das leis", () => itens("grifo")],
    ["anotacao", "Anotações das leis (e as imagens delas)", () => itens("anotacao")],
    ["tinta-lei", "Caneta, marca-texto e ícones nas leis", () => itens("tinta", i => !deResumo(i) && temConteudo(i))],
    ["fav-lei", "Favoritos (leis, artigos e trechos)", () => itens("favorito", i => i.alvo !== "questao")],
    ["tinta-res", "Caneta, marca-texto, ícones e imagens nos resumos", () => itens("tinta", i => deResumo(i) && temConteudo(i))],
    ["resposta", "Respostas das questões (histórico e estatísticas)", () => [...itens("resposta"), ...itens("reset")]],
    ["questao-extra", "Comentários e favoritos das questões", () => [...itens("notaq"), ...itens("favorito", i => i.alvo === "questao")]],
  ];
  abrirPainel(`<h2>Apagar marcações ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Vale para todas as leis, resumos e cadernos. As leis, os arquivos dos resumos e os cadernos continuam; só as marcações escolhidas são apagadas${cfgSync() ? ", também nos seus outros aparelhos sincronizados" : ""}.</p>
    ${grupos.map(([f, rot, lista]) => { const n = lista().length; return `<label class="linha-ajuste"><span>${rot} <span class="contagem">(${n})</span></span>
      <input type="checkbox" data-apagar-grupo="${f}" ${n ? "" : "disabled"} style="width:22px;height:22px"></label>`; }).join("")}
    <label class="linha-ajuste" style="border:0"><span><strong>Marcar todas</strong></span><input type="checkbox" id="apagar-todas" style="width:22px;height:22px"></label>
    <p class="contagem">Isto não passa pela lixeira. Se quiser poder voltar atrás, faça antes um backup completo (Configurações → Exportar backup completo).</p>
    <div class="acoes" style="margin-top:10px"><button class="botao" id="confirmar-apagar-todas" style="color:var(--alt);text-align:center" disabled>Apagar as marcações selecionadas</button></div>
    <p class="contagem" id="msg-apagar-todas"></p>`);
  const caixas = () => $$("#painel-caixa [data-apagar-grupo]:not(:disabled)");
  const marcados = () => caixas().filter(c => c.checked).map(c => c.dataset.apagarGrupo);
  const atualizar = () => { $("#confirmar-apagar-todas").disabled = !marcados().length; };
  caixas().forEach(c => c.onchange = atualizar);
  $("#apagar-todas").onchange = e => { caixas().forEach(c => { c.checked = e.target.checked; }); atualizar(); };
  $("#confirmar-apagar-todas").onclick = async () => {
    const escolhidos = grupos.filter(g => marcados().includes(g[0]));
    const lista = escolhidos.flatMap(g => g[2]());
    if (!lista.length || !confirm(`Apagar ${lista.length} marcação(ões)? Isso não pode ser desfeito sem um backup.`)) return;
    const b = $("#confirmar-apagar-todas"); b.disabled = true;
    const resumosTocados = new Set();
    let n = 0;
    for (const i of lista) {
      for (const f of i.figuras || []) if (f.img) await bdApagar("imagens", f.img);           // imagens colocadas por cima das páginas
      if (i.tipo === "tinta" && String(i.lei || "").startsWith("resumo:")) resumosTocados.add(i.lei.slice(7));
      await apagarItem(i.id);
      if (++n % 25 === 0) $("#msg-apagar-todas").textContent = `Apagando… ${n} de ${lista.length}`;
    }
    for (const a of itens("anotacao", x => x.grifoId && !estado.itens.get(x.grifoId)?.tipo)) await salvarItem({ ...a, grifoId: null });
    for (const id of resumosTocados) await bdApagar("miniaturas", id).catch(() => {});      // a miniatura é refeita sem os desenhos
    versaoItens++;
    if (escolhidos.some(g => g[0] === "resposta")) await carregarQuestoes();
    fecharPainel();
    mostrarAvisoRapido(`🗑 ${lista.length} marcação(ões) apagada(s)`);
    telaAjustes();
  };
}
