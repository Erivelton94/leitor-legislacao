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
async function duplicarResumo(r, destino = undefined, sufixo = " — cópia") {
  const novo = { ...r, id: uid(), titulo: (r.titulo || "Sem título") + sufixo, favorito: false, fixado: false, criadoEm: null, abertoEm: null };
  if (destino !== undefined) novo.pasta = destino || "";           // sem destino: a cópia fica na mesma pasta
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
    <button data-sel="fixar" ${n ? "" : "disabled"}>📌 Fixar</button>
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
  if (acao === "mover") return escolherPasta("resumos", `Mover ${lista.length} arquivo(s) para…`, async d => { for (const r of lista) await moverParaPasta("resumos", r.id, d); terminar(); });
  if (acao === "copiar") return escolherPasta("resumos", `Copiar ${lista.length} arquivo(s) para…`, async d => { for (const r of lista) await duplicarResumo(r, d || "", ""); terminar(); });
  if (acao === "fixar") { const todos = lista.every(r => r.fixado); for (const r of lista) { r.fixado = !todos; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); } return terminar(); }
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
    <div class="linha-arm"><div><strong>Leis</strong><br><span class="contagem">${m.nLeis} lei(s) baixada(s) · ${mb(m.leis)} · textos, grifos, anotações, caneta, ícones e favoritos</span></div><button id="arm-leis">Apagar…</button></div>
    <div class="linha-arm"><div><strong>Questões</strong><br><span class="contagem">${m.nCadernos} caderno(s) importado(s) · ${mb(m.cadernos)} · respostas, estatísticas, comentários e favoritos</span></div><button id="arm-questoes">Apagar…</button></div>
    <div class="linha-arm"><div><strong>Resumos</strong><br><span class="contagem">${m.nResumos} resumo(s) · ${mb(m.resumos + m.imagens)} · arquivos, edições, caneta, marca-texto, ícones e imagens</span></div><button id="arm-resumos">Apagar…</button></div>
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
    abrirPainel(`<h2>Leis ${botaoFechar}</h2>
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
  $("#arm-questoes").onclick = () => {
    const respostas = [...itens("resposta"), ...itens("reset")];
    const extras = [...itens("notaq"), ...itens("favorito", i => i.alvo === "questao")];
    const locais = lerLS("cadernos-locais", []).filter(c => !c.apagado);
    abrirPainel(`<h2>Questões ${botaoFechar}</h2>
      <p class="contagem" style="margin-top:0">Escolha o que apagar${cfgSync() ? " (também na sua nuvem e nos seus outros aparelhos)" : ""}:</p>
      <div class="acoes">
        <button id="q-zerar" ${respostas.length ? "" : "disabled"}>Zerar respostas e estatísticas (${itens("resposta").length})<br><span class="contagem">Todas as questões voltam a ficar sem resposta e o histórico de acertos e erros recomeça do zero. Os cadernos continuam.</span></button>
        <button id="q-extras" ${extras.length ? "" : "disabled"}>Apagar comentários e questões favoritas (${extras.length})</button>
        <button id="q-cadernos" ${locais.length ? "" : "disabled"} style="color:var(--alt)">Apagar os cadernos que eu importei (${locais.length})<br><span class="contagem">Apaga de vez, sem passar pela lixeira. Os cadernos publicados no app continuam.</span></button>
        <button id="q-tudo" style="color:var(--alt)">Apagar tudo das questões</button>
      </div><p class="contagem" id="q-msg"></p>`);
    const apagarLista = async lista => { for (const i of lista) await apagarItem(i.id); versaoItens++; };
    const apagarCadernos = async () => {
      const cache = await caches.open(CACHE_DADOS);
      for (const c of locais) await cache.delete(c.url);
      gravarLS("cadernos-locais", lerLS("cadernos-locais", []).map(c => ({ ...c, apagado: true, lixeira: undefined, atualizadoEm: agoraISO() })));
    };
    const fim = async t => { await carregarQuestoes(); fecharPainel(); mostrarAvisoRapido(t); telaAjustes(); };
    $("#q-zerar").onclick = async () => { if (!confirm(`Zerar ${itens("resposta").length} resposta(s) e todas as estatísticas? Não dá para desfazer sem um backup.`)) return; await apagarLista(respostas); await fim("Respostas e estatísticas zeradas"); };
    $("#q-extras").onclick = async () => { if (!confirm(`Apagar ${extras.length} comentário(s) e favorito(s) das questões?`)) return; await apagarLista(extras); await fim("Comentários e favoritos apagados"); };
    $("#q-cadernos").onclick = async () => { if (!confirm(`Apagar DE VEZ os ${locais.length} caderno(s) que você importou? As suas respostas ficam no histórico.`)) return; await apagarCadernos(); await fim("Cadernos importados apagados"); };
    $("#q-tudo").onclick = async () => {
      if (!confirm("Apagar tudo das questões: respostas, estatísticas, comentários, favoritos e os cadernos que você importou? Não dá para desfazer sem um backup.")) return;
      await apagarLista([...respostas, ...extras]); await apagarCadernos(); await fim("Tudo das questões foi apagado");
    };
  };
  $("#arm-resumos").onclick = async () => {
    await carregarResumos();
    const lista = [...resumos.lista.values()].filter(r => !r.apagado);
    const marcas = itens("tinta", i => String(i.lei || "").startsWith("resumo:") && temConteudo(i));
    abrirPainel(`<h2>Resumos ${botaoFechar}</h2>
      <p class="contagem" style="margin-top:0">Escolha o que apagar${cfgSync() ? " (também na sua nuvem e nos seus outros aparelhos)" : ""}:</p>
      <div class="acoes">
        <button id="r-marcas" ${marcas.length ? "" : "disabled"}>Apagar as minhas marcações nos resumos (${marcas.length} página(s))<br><span class="contagem">Caneta, marca-texto, ícones e imagens colocadas por cima. Os arquivos e as edições de texto continuam.</span></button>
        <button id="r-todos" ${lista.length ? "" : "disabled"} style="color:var(--alt)">Apagar todos os resumos (${lista.length})<br><span class="contagem">Com os arquivos originais, edições, marcações, imagens e pastas. Apaga de vez, sem passar pela lixeira.</span></button>
      </div>`);
    $("#r-marcas").onclick = async () => {
      if (!confirm(`Apagar as marcações de ${marcas.length} página(s) de resumos? Não dá para desfazer sem um backup.`)) return;
      const tocados = new Set();
      for (const i of marcas) { for (const f of i.figuras || []) if (f.img) await bdApagar("imagens", f.img); tocados.add(i.lei.slice(7)); await apagarItem(i.id); }
      for (const id of tocados) await bdApagar("miniaturas", id).catch(() => {});
      versaoItens++; fecharPainel(); mostrarAvisoRapido("Marcações dos resumos apagadas"); telaAjustes();
    };
    $("#r-todos").onclick = async () => {
      if (!confirm(`Apagar DE VEZ os ${lista.length} resumo(s), com arquivos, edições, desenhos, imagens e pastas? Isto não passa pela lixeira.`)) return;
      for (const r of lista) await excluirResumo(r.id);
      for (const i of itens("materia").concat(itens("assunto"), itens("pasta", p => p.area === "resumos"))) await apagarItem(i.id);
      resumos.lista = null; await carregarResumos(); fecharPainel(); mostrarAvisoRapido("Resumos apagados"); telaAjustes();
    };
  };
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

