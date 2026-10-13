/* =====================================================================
   RESUMOS COMPARTILHADOS PELO APP (modo dono)
   Igual aos cadernos de questões: no ⋯ de um resumo ou de uma pasta de
   resumos, o dono liga ou desliga "Visível para outros usuários".
   - ligar  → o arquivo vai para o repositório do app (dados/resumos/) e
     aparece para todos em "📚 Compartilhados pelo app";
   - desligar, arquivar ou mandar para a lixeira → sai do app dos outros
     (a sua cópia continua na sua conta).
   Quem recebe toca no resumo e ele é copiado para os próprios resumos
   (com caneta, marcações e tudo), dentro da pasta "Compartilhados pelo app".
   ===================================================================== */
const IDX_RES = "dados/resumos/indice.json";
const maisNovo = (a, b) => (!a ? b : !b ? a : String(b.atualizadoEm || "") > String(a.atualizadoEm || "") ? b : a);   // o site do app leva ~1 min para publicar: vale a cópia mais nova
const LIMITE_COMPARTILHAR_MB = 45;
const compartilhados = { indice: null };
async function carregarCompartilhados(forcar = false) {
  if (compartilhados.indice && !forcar) return compartilhados.indice;
  const cache = await caches.open(CACHE_DADOS);
  let idx = null;
  const guardado = await cache.match(IDX_RES).then(c => c ? c.json() : null).catch(() => null);
  if (!estado.offline) {
    try { const r = await buscarComTempo(IDX_RES + "?v=" + Date.now()); if (r.ok) { const rede = await r.clone().json(); idx = maisNovo(guardado, rede); if (idx === rede) await cache.put(IDX_RES, r); } } catch {}
  }
  if (!idx) idx = guardado;
  compartilhados.indice = idx && Array.isArray(idx.resumos) ? { resumos: idx.resumos, pastas: idx.pastas || [] } : { resumos: [], pastas: [] };
  return compartilhados.indice;
}
const temCompartilhados = () => !!compartilhados.indice && compartilhados.indice.resumos.length > 0;

/* ---------- lado do dono: publicar e tirar do ar ---------- */
const extensaoDe = r => (r.formato === "pdf" ? "pdf" : r.formato === "docx" ? "docx" : "html");
async function arquivoParaPublicar(r, comMarcacoes) {
  if (r.formato === "pdf" && comMarcacoes) return exportarPdfComMarcacoes(r, null, true);
  if (r.arquivo) return lerArquivoOriginal(r);
  return new Blob([await lerConteudo(r.id)], { type: "text/html" });
}
async function gravarIndiceRes(p, lista, idx) {
  idx.atualizadoEm = agoraISO();
  await p.enviar(IDX_RES, paraBytes(idx), lista.get(IDX_RES));
  await gravarNoCache(IDX_RES, idx);
  compartilhados.indice = idx;
}
/* publica uma lista de resumos; "pastaDe" diz em que pasta compartilhada cada um aparece */
async function publicarResumos(lista, { comMarcacoes = false, pastas = [], pastaDe = () => null } = {}, aviso) {
  const p = provedorDono(); await p.preparar();
  const arqs = await p.listarPasta("dados/resumos");
  const idx = arqs.has(IDX_RES) ? deBytes(await p.baixar(IDX_RES)) : { resumos: [], pastas: [] };
  idx.resumos = idx.resumos || []; idx.pastas = idx.pastas || [];
  for (const pa of pastas) { idx.pastas = idx.pastas.filter(x => x.id !== pa.id); idx.pastas.push(pa); }
  let n = 0;
  for (const r of lista) {
    aviso && aviso(`Enviando ${++n} de ${lista.length}: ${r.origem || r.titulo}…`);
    const blob = await arquivoParaPublicar(r, comMarcacoes);
    if (!blob) throw new Error(`O arquivo de "${r.origem || r.titulo}" não está neste aparelho.`);
    if (blob.size > LIMITE_COMPARTILHAR_MB * 1048576) throw new Error(`"${r.origem || r.titulo}" tem ${mb(blob.size)}: o limite para compartilhar é ${LIMITE_COMPARTILHAR_MB} MB.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const arquivo = `${r.id}.${extensaoDe(r)}`, caminho = "dados/resumos/" + arquivo;
    await p.enviar(caminho, bytes, arqs.get(caminho));
    idx.resumos = idx.resumos.filter(x => x.id !== r.id);
    idx.resumos.push({ id: r.id, titulo: r.titulo || "", origem: r.origem || "", formato: r.formato || "html", arquivo, tamanho: bytes.length,
      pasta: pastaDe(r) || null, hash: hashCurto(String(bytes.length) + (r.atualizadoEm || "") + (comMarcacoes ? "m" : "")), em: agoraISO() });
  }
  aviso && aviso("Atualizando a lista de compartilhados…");
  await gravarIndiceRes(p, arqs, idx);
  for (const r of lista) { r.publicado = true; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); }
}
async function despublicarResumos(ids, pastaIds = [], aviso) {
  const p = provedorDono(); await p.preparar();
  const arqs = await p.listarPasta("dados/resumos");
  if (!arqs.has(IDX_RES)) return;
  const idx = deBytes(await p.baixar(IDX_RES));
  const sair = new Set(ids);
  aviso && aviso("Tirando do app dos outros usuários…");
  for (const e of (idx.resumos || []).filter(x => sair.has(x.id))) { const c = "dados/resumos/" + e.arquivo; if (arqs.has(c)) await p.apagar(c, arqs.get(c)); }
  idx.resumos = (idx.resumos || []).filter(x => !sair.has(x.id));
  const pastasSair = new Set(pastaIds);
  idx.pastas = (idx.pastas || []).filter(x => !pastasSair.has(x.id));
  await gravarIndiceRes(p, arqs, idx);
  for (const id of ids) { const r = resumos.lista.get(id); if (r && r.publicado) { r.publicado = false; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); } }
}
/* pasta: tudo o que está dentro (com as subpastas) aparece para os outros, na mesma organização */
async function publicarPastaResumos(id, comMarcacoes, aviso, paiComp = undefined, novas = []) {
  const todas = [id, ...descendentes(id)];
  const ativas = new Set(todas);
  const raizPai = paiComp === undefined ? (estado.itens.get(id).pastaCompPai || null) : paiComp;
  const pastas = [...novas, ...todas.map(pid => { const q = estado.itens.get(pid); return { id: pid, nome: q.nome, pai: pid === id ? raizPai : (ativas.has(paiDe(q)) ? paiDe(q) : id) }; })];
  const lista = todas.flatMap(pid => itensDaPasta("resumos", pid)).map(rid => resumos.lista.get(rid)).filter(r => r && !r.arquivado);
  await publicarResumos(lista, { comMarcacoes, pastas, pastaDe: r => pastaDoResumo(r) }, aviso);
  for (const pid of todas) { const q = estado.itens.get(pid); if (!q.publicada || (pid === id && (q.pastaCompPai || null) !== raizPai)) await salvarItem({ ...q, publicada: pid === id ? true : "dentro", ...(pid === id ? { pastaCompPai: raizPai } : {}) }); }
}
async function despublicarPastaResumos(id, aviso) {
  const todas = [id, ...descendentes(id)];
  const ids = todas.flatMap(pid => itensDaPasta("resumos", pid)).concat([...resumos.lista.values()].filter(r => r.publicado && todas.includes(r.pasta)).map(r => r.id));
  await despublicarResumos([...new Set(ids)], todas, aviso);
  for (const pid of todas) { const q = estado.itens.get(pid); if (q && q.publicada) { const c = { ...q }; delete c.publicada; await salvarItem(c); } }
}
/* arquivar ou mandar para a lixeira: sai do app dos outros (sem travar se estiver sem internet) */
async function tirarDoArSeDono(resumosLista = [], pastaId = null) {
  if (!cfgDono()) return;
  try {
    if (pastaId && estado.itens.get(pastaId)?.publicada) await despublicarPastaResumos(pastaId);
    const ids = resumosLista.filter(r => r && r.publicado).map(r => r.id);
    if (ids.length) await despublicarResumos(ids);
  } catch (e) { mostrarAvisoRapido("⚠️ Não deu para tirar do app dos outros agora: " + e.message); }
}

/* ---------- botões nos menus (só para o dono) ---------- */
function botaoVisivelResumo(r) {
  if (!cfgDono()) return "";
  return `<button id="r-visivel">${r.publicado ? "👁 Visível para outros usuários: <strong>ligado</strong> (tocar para desligar)" : "🙈 Visível para outros usuários: <strong>desligado</strong> (tocar para ligar)"}</button>`;
}
/* painel para ligar: escolhe se os PDFs vão com as suas marcações ou como o arquivo original */
function painelLigarCompartilhar(titulo, texto, temPdf, aoLigar, volta, aviso) {
  abrirPainel(`<h2>${esc(titulo)} ${botaoFechar}</h2><p class="contagem" style="margin-top:0">${texto}</p>
    <div class="acoes">${temPdf ? `<button data-comp-modo="marcado">✏️ Compartilhar com as minhas marcações (caneta e ícones)</button>
      <button data-comp-modo="original">📄 Compartilhar o arquivo original (sem marcações)</button>` : '<button data-comp-modo="original">👁 Ligar</button>'}</div>
    <p class="contagem" id="msg-ligar"></p>`);
  $$("#painel-caixa [data-comp-modo]").forEach(b => b.onclick = async () => {
    $$("#painel-caixa [data-comp-modo]").forEach(x => x.disabled = true);
    const msg = t => { const m = $("#msg-ligar"); if (m) m.textContent = t; };
    try { await aoLigar(b.dataset.compModo === "marcado", msg); fecharPainel(); volta(); mostrarAvisoRapido(aviso); }
    catch (e) { msg("⚠️ " + e.message); $$("#painel-caixa [data-comp-modo]").forEach(x => x.disabled = false); }
  });
}
function ligarVisivelResumo(r, volta) {
  const b = $("#r-visivel"); if (!b) return;
  b.onclick = async () => {
    if (!r.publicado) {
      if (r.arquivado) { alert("Este resumo está arquivado. Desarquive primeiro para poder compartilhá-lo."); return; }
      return painelCompartilharResumos({ titulo: "Compartilhar com os outros usuários",
        texto: `“${esc(r.origem || r.titulo)}” passa a aparecer para todos em <strong>📚 Compartilhados pelo app</strong>, na pasta que você escolher, em cerca de 1 minuto. Você pode desligar quando quiser.`,
        temPdf: r.formato === "pdf", caminhoSugerido: r.pasta ? caminhoPasta(r.pasta).map(x => x.nome) : [],
        aoLigar: (marcado, destino, novas, msg) => publicarResumos([r], { comMarcacoes: marcado, pastas: novas, pastaDe: () => destino }, msg), volta, aviso: "👁 Resumo visível para todos" });
    }
    if (!confirm(`Desligar? "${r.origem || r.titulo}" deixa de aparecer no app dos outros usuários. Quem já copiou continua com a cópia. A sua continua aqui.`)) return;
    b.disabled = true;
    try { await despublicarResumos([r.id], [], t => { b.textContent = t; }); fecharPainel(); volta(); mostrarAvisoRapido("🙈 Resumo oculto para os outros usuários"); }
    catch (e) { b.textContent = "⚠️ " + e.message; b.disabled = false; }
  };
}
function botoesVisivelPasta(p) {
  if (!cfgDono() || (p.area || "leis") !== "resumos") return "";
  return `<button id="pu-visivel">${p.publicada === true ? "👁 Visível para outros usuários: <strong>ligado</strong> (tocar para desligar)" : "🙈 Visível para outros usuários: <strong>desligado</strong> (tocar para ligar)"}</button>
    ${p.publicada === true ? '<button id="pu-atualizar">🔄 Atualizar o que os outros veem (envia os arquivos novos desta pasta)</button>' : ""}`;
}
function ligarVisivelPasta(p, volta) {
  const b = $("#pu-visivel"); if (!b) return;
  const temPdf = () => [p.id, ...descendentes(p.id)].some(pid => itensDaPasta("resumos", pid).some(rid => resumos.lista.get(rid)?.formato === "pdf"));
  const abrir = (titulo, aviso) => painelCompartilharResumos({ titulo,
    texto: `A pasta “${esc(p.nome)}”, as subpastas e os ${totalNaPasta("resumos", p.id)} arquivo(s) aparecem para todos em <strong>📚 Compartilhados pelo app</strong>, na mesma organização, dentro da pasta compartilhada que você escolher (ou no início). Você pode desligar quando quiser.`,
    temPdf: temPdf(), pastaPropria: p.pastaCompPai || null,
    aoLigar: (marcado, destino, novas, msg) => publicarPastaResumos(p.id, marcado, msg, destino, novas), volta, aviso });
  b.onclick = async () => {
    if (p.publicada !== true) {
      if (p.arquivada) { alert("Esta pasta está arquivada. Desarquive primeiro."); return; }
      return abrir("Compartilhar a pasta com os outros usuários", "👁 Pasta visível para todos");
    }
    if (!confirm(`Desligar? A pasta "${p.nome}" e os arquivos dela deixam de aparecer para os outros usuários.`)) return;
    b.disabled = true;
    try { await despublicarPastaResumos(p.id, t => { b.textContent = t; }); fecharPainel(); volta(); mostrarAvisoRapido("🙈 Pasta oculta para os outros usuários"); }
    catch (e) { b.textContent = "⚠️ " + e.message; b.disabled = false; }
  };
  const at = $("#pu-atualizar");
  if (at) at.onclick = () => abrir("Atualizar o que os outros veem", "🔄 Compartilhados atualizados");
}

/* ---------- lado de quem recebe: ver e copiar para os próprios resumos ---------- */
const ID_PASTA_RECEBIDOS = "pasta-c-raiz";
async function pastaLocalDosCompartilhados(pastaCompId) {
  const garantir = async (id, nome, pai) => {
    const q = estado.itens.get(id);
    if (!q || q.apagado) await salvarItem({ id, tipo: "pasta", area: "resumos", nome, pai, leis: [], cadernos: [] });
    else if (q.lixeira) { const c = { ...q }; delete c.lixeira; await salvarItem(c); }
    return id;
  };
  await garantir(ID_PASTA_RECEBIDOS, "Compartilhados pelo app", null);
  if (!pastaCompId) return ID_PASTA_RECEBIDOS;
  const idx = compartilhados.indice, cam = [];
  for (let id = pastaCompId, voltas = 0; id && voltas < 30; voltas++) { const pa = idx.pastas.find(x => x.id === id); if (!pa) break; cam.unshift(pa); id = pa.pai; }
  let pai = ID_PASTA_RECEBIDOS;
  for (const pa of cam) pai = await garantir("pasta-c-" + pa.id, pa.nome, pai);
  return pai;
}
const copiaLocal = idComp => [...resumos.lista.values()].find(r => !r.apagado && !r.lixeira && r.deCompartilhado === idComp);
async function copiarCompartilhado(e, aviso) {
  const ja = copiaLocal(e.id);
  if (ja && ja.versaoCompartilhada === e.hash) return ja;
  aviso && aviso(`Baixando ${e.origem || e.titulo}…`);
  const r = await buscarComTempo("dados/resumos/" + e.arquivo, 120000);
  if (!r.ok) throw new Error("Não foi possível baixar (" + r.status + "). Confira a internet.");
  const blob = await r.blob();
  const nome = e.origem || `${e.titulo}.${e.formato === "html" ? "html" : e.formato}`;
  const destino = await pastaLocalDosCompartilhados(e.pasta);
  let id;
  if (e.formato === "html") {
    id = uid();
    const html = limparHtml(await blob.text());
    const texto = await gravarConteudo(id, html);
    await salvarMeta({ id, titulo: e.titulo || nome, pasta: destino, formato: "html", favorito: false, arquivado: false, origem: nome, previa: texto.slice(0, 220) });
  } else id = (await importarArquivo(new File([blob], nome, { type: blob.type }), destino)).id;
  const novo = resumos.lista.get(id);
  novo.deCompartilhado = e.id; novo.versaoCompartilhada = e.hash;
  await salvarMeta(novo);
  return novo;
}
async function telaCompartilhados(pastaId = null) {
  await carregarResumos();
  const idx = await carregarCompartilhados();
  const pasta = pastaId ? idx.pastas.find(x => x.id === pastaId) : null;
  definirTopo({ titulo: pasta ? pasta.nome : "📚 Compartilhados pelo app", voltar: pasta ? (pasta.pai ? "#/resumos/compartilhados/" + pasta.pai : "#/resumos/compartilhados") : "#/resumos" });
  marcarAba("resumos");
  const dono = !!cfgDono();
  const contarTudo = id => { const ids = new Set([id]); let mudou = true; while (mudou) { mudou = false; for (const q of idx.pastas) if (q.pai && ids.has(q.pai) && !ids.has(q.id)) { ids.add(q.id); mudou = true; } } return idx.resumos.filter(x => ids.has(x.pasta)).length; };
  const pastas = idx.pastas.filter(x => (x.pai || null) === (pastaId || null) && (dono || contarTudo(x.id) > 0)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const lista = idx.resumos.filter(x => (x.pasta || null) === (pastaId || null)).sort((a, b) => (a.origem || a.titulo).localeCompare(b.origem || b.titulo, "pt-BR", { numeric: true }));
  const contar = id => { const ids = new Set([id]); let mudou = true; while (mudou) { mudou = false; for (const q of idx.pastas) if (q.pai && ids.has(q.pai) && !ids.has(q.id)) { ids.add(q.id); mudou = true; } } return idx.resumos.filter(x => ids.has(x.pasta)).length; };
  $("#conteudo").innerHTML = `<div class="secao">
    <p class="contagem" style="margin-top:0">Materiais que o dono do app compartilhou. Toque num arquivo para copiá-lo para os seus resumos: a cópia é sua (dá para marcar, escrever com a caneta e organizar) e fica em <strong>Meus Resumos › Compartilhados pelo app</strong>.</p>
    ${dono ? `<div class="acoes-linha"><button class="botao" id="nova-pasta-comp">+ Nova pasta compartilhada${pasta ? " aqui" : ""}</button></div>
      <p class="contagem">👑 Você vê também as pastas vazias. Use o ⋯ para mudar um arquivo ou uma pasta de lugar, renomear ou apagar pasta vazia.</p>` : ""}
    ${lista.length || pastas.length ? `<div class="acoes-linha"><button class="botao primario" id="copiar-tudo">⬇️ Copiar ${pasta ? "esta pasta inteira" : "tudo"} para os meus resumos</button></div>` : ""}
    <p class="contagem" id="msg-comp"></p>
    <ul class="acervo">
      ${pastas.map(q => `<li class="lei-item pasta-item"><span class="aba"></span><button class="abrir" data-href="#/resumos/compartilhados/${esc(q.id)}"><span class="lei-nome">${ICONE_PASTA}${esc(q.nome)}</span><span class="lei-num">${contar(q.id)} arquivo(s)</span></button>${dono ? `<button class="mais" data-menu-pcomp="${esc(q.id)}" aria-label="Opções da pasta compartilhada">⋯</button>` : "<span></span>"}</li>`).join("")}
      ${lista.map(x => { const c = copiaLocal(x.id); return `<li class="lei-item"><span class="aba"></span><button class="abrir" data-comp="${esc(x.id)}">
          <span class="lei-nome">📄 ${esc(x.origem || x.titulo)}</span>
          <span class="lei-num">${x.formato.toUpperCase()} · ${mb(x.tamanho || 0)}${c ? (c.versaoCompartilhada === x.hash ? " · ✓ já está nos seus resumos (tocar para abrir)" : " · 🆕 versão nova disponível (tocar para copiar de novo)") : " · tocar para copiar e abrir"}</span></button>${dono ? `<button class="mais" data-menu-rcomp="${esc(x.id)}" aria-label="Mudar de pasta">⋯</button>` : "<span></span>"}</li>`; }).join("")}
    </ul>
    ${!lista.length && !pastas.length ? '<p class="vazio">Nada compartilhado por aqui ainda.</p>' : ""}</div>`;
  const msg = t => { const m = $("#msg-comp"); if (m) m.textContent = t; };
  const volta = () => telaCompartilhados(pastaId);          // o índice novo já está na memória: não espera o site do app
  if ($("#nova-pasta-comp")) $("#nova-pasta-comp").onclick = async () => {
    const nome = prompt("Nome da pasta compartilhada:"); if (!nome || !nome.trim()) return;
    try { await editarIndiceRes(i => { i.pastas.push({ id: idPastaComp(), nome: nome.trim(), pai: pastaId || null }); }); volta(); }
    catch (e) { msg("⚠️ " + e.message); }
  };
  $$("[data-menu-rcomp]").forEach(b => b.onclick = () => painelMoverCompartilhado("resumo", b.dataset.menuRcomp, volta));
  $$("[data-menu-pcomp]").forEach(b => b.onclick = () => {
    const pc = idx.pastas.find(x => x.id === b.dataset.menuPcomp);
    const vazia = contarTudo(pc.id) === 0;
    abrirPainel(`<h2>📁 ${esc(pc.nome)} ${botaoFechar}</h2><div class="acoes">
      <button id="pc-renomear">✏️ Renomear</button><button id="pc-mover">📁 Mover para outra pasta compartilhada</button>
      <button id="pc-apagar" ${vazia ? "" : "disabled"} style="color:var(--alt)">🗑 Apagar a pasta${vazia ? "" : " (só dá quando estiver vazia)"}</button></div><p class="contagem" id="pc-msg"></p>`);
    const feito = async mudar => { try { await editarIndiceRes(mudar); fecharPainel(); volta(); } catch (e) { $("#pc-msg").textContent = "⚠️ " + e.message; } };
    $("#pc-renomear").onclick = () => { const n = prompt("Novo nome:", pc.nome); if (n && n.trim()) feito(i => { const e = i.pastas.find(x => x.id === pc.id); if (e) e.nome = n.trim(); }); };
    $("#pc-mover").onclick = () => painelMoverCompartilhado("pasta", pc.id, volta);
    $("#pc-apagar").onclick = () => { if (confirm(`Apagar a pasta compartilhada "${pc.nome}"?`)) feito(i => { const ids = new Set([pc.id]); let m = true; while (m) { m = false; for (const q of i.pastas) if (q.pai && ids.has(q.pai) && !ids.has(q.id)) { ids.add(q.id); m = true; } } i.pastas = i.pastas.filter(x => !ids.has(x.id)); }); };
  });
  $$("[data-comp]").forEach(b => b.onclick = async () => {
    const e = idx.resumos.find(x => x.id === b.dataset.comp);
    b.disabled = true;
    try { const r = await copiarCompartilhado(e, msg); location.hash = "#/resumo/" + r.id; }
    catch (err) { msg("⚠️ " + err.message); b.disabled = false; }
  });
  const ct = $("#copiar-tudo");
  if (ct) ct.onclick = async () => {
    const ids = new Set([pastaId || null]); let mudou = true;
    while (mudou) { mudou = false; for (const q of idx.pastas) if (ids.has(q.pai || null) && !ids.has(q.id)) { ids.add(q.id); mudou = true; } }
    const todos = idx.resumos.filter(x => ids.has(x.pasta || null));
    ct.disabled = true;
    try { let n = 0; for (const e of todos) { msg(`Copiando ${++n} de ${todos.length}…`); await copiarCompartilhado(e); } msg(`✓ ${todos.length} arquivo(s) nos seus resumos.`); telaCompartilhados(pastaId); }
    catch (err) { msg("⚠️ " + err.message); ct.disabled = false; }
  };
}

/* =====================================================================
   PASTAS COMPARTILHADAS (modo dono)
   O dono escolhe em que pasta cada resumo, lista ou caderno aparece no app dos
   outros usuários, sem depender de como ele organiza o próprio app.
   As pastas compartilhadas ficam no índice publicado ({id, nome, pai}).
   ===================================================================== */
const idPastaComp = () => "pc-" + uid().slice(0, 10);
/* seletor de pasta compartilhada: árvore com "nenhuma" (início), criar pasta e subpasta, e atalho "mesmo caminho do meu app" */
function seletorPastaComp(alvo, pastasExistentes, selecionada = null, caminhoSugerido = []) {
  const novas = [];
  let sel = selecionada || null;
  const todas = () => [...pastasExistentes, ...novas];
  const filhos = pai => todas().filter(p => (p.pai || null) === (pai || null)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const criar = (nome, pai) => {
    const ja = filhos(pai).find(p => normNome(p.nome) === normNome(nome));
    if (ja) return ja.id;
    const p = { id: idPastaComp(), nome: nome.trim(), pai: pai || null };
    novas.push(p); return p.id;
  };
  const ramo = (pai, nivel) => filhos(pai).map(p => `<div class="no-comp" style="padding-left:${nivel * 18}px">
      <label class="opcao-ls"><input type="radio" name="dest-comp" value="${esc(p.id)}" ${sel === p.id ? "checked" : ""}><span>${ICONE_PASTA} ${esc(p.nome)}${novas.includes(p) ? ' <span class="contagem">(nova)</span>' : ""}</span>
      <button class="link" data-sub-comp="${esc(p.id)}" type="button">+ subpasta</button></label></div>${ramo(p.id, nivel + 1)}`).join("");
  const desenhar = () => {
    alvo.innerHTML = `<div class="arvore-comp lista-opcoes-ls">
        <label class="opcao-ls"><input type="radio" name="dest-comp" value="" ${!sel ? "checked" : ""}><span>Início (fora das pastas)</span>
          <button class="link" data-sub-comp="" type="button">+ nova pasta</button></label>
        ${ramo(null, 1)}</div>
      ${caminhoSugerido.length ? `<button class="link" id="comp-sugestao" type="button">↳ Usar o mesmo caminho do meu app: ${esc(caminhoSugerido.join(" › "))}</button>` : ""}`;
    $$("input[name=dest-comp]", alvo).forEach(i => i.onchange = () => { sel = i.value || null; });
    $$("[data-sub-comp]", alvo).forEach(b => b.onclick = () => {
      const nome = prompt(b.dataset.subComp ? "Nome da subpasta compartilhada:" : "Nome da pasta compartilhada (ex.: Código Penal):");
      if (!nome || !nome.trim()) return;
      sel = criar(nome, b.dataset.subComp || null); desenhar();
    });
    const sg = $("#comp-sugestao", alvo);
    if (sg) sg.onclick = () => { let pai = null; for (const n of caminhoSugerido) pai = criar(n, pai); sel = pai; desenhar(); };
  };
  desenhar();
  return { valor: () => sel, novas: () => novas.slice(), todas };
}
const caminhoComp = (pastas, id) => { const out = []; for (let k = 0, p = pastas.find(x => x.id === id); p && k < 30; k++, p = pastas.find(x => x.id === p.pai)) out.unshift(p.nome); return out; };

/* ---------- questões: o dono escolhe a pasta compartilhada e o modo ---------- */
function painelCompartilharCaderno(id, volta) {
  const c = estado.cadernos[id];
  const ls = ehListaLS(c), area = ls ? "leiseca" : "questoes";
  const ligado = ehVisivelParaTodos(id);
  const pastas = (estado.indiceQ?.pastas || []).filter(p => (p.area || "questoes") === area);
  const meuCaminho = ls ? caminhoDaLista(c) : caminhoDoCaderno(c);
  abrirPainel(`<h2>${ligado ? "👁 Compartilhado" : "Compartilhar"}: ${esc(c.titulo)} ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Escolha em que pasta ${ls ? "a lista" : "o caderno"} aparece no app dos outros usuários${ls ? " (no filtro, a pasta principal vira a Lei/Disciplina e a subpasta, o Assunto)" : ""}.</p>
    <div id="sel-comp"></div>
    <h3 class="grupo-assunto">Como aparece para eles</h3>
    <div class="lista-opcoes-ls">
      <label class="opcao-ls"><input type="radio" name="modo-comp" value="arquivo" ${!c.soQuestoes ? "checked" : ""}><span><strong>Questões + ${ls ? "a lista" : "o caderno"} na pasta</strong><br><span class="contagem">Como hoje: aparece na pasta escolhida e as questões entram no banco e no filtro.</span></span></label>
      <label class="opcao-ls"><input type="radio" name="modo-comp" value="questoes" ${c.soQuestoes ? "checked" : ""}><span><strong>Só as questões</strong><br><span class="contagem">As questões entram no banco e no filtro deles, sem o arquivo aparecer nas pastas.</span></span></label>
    </div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" id="comp-ligar">${ligado ? "🔄 Salvar e atualizar para os outros" : "👁 Ligar (visível para todos)"}</button>
      ${ligado ? '<button id="comp-desligar" style="color:var(--alt)">🙈 Desligar (deixa de aparecer para os outros)</button>' : ""}</div>
    <p class="contagem" id="comp-msg"></p>`);
  const seletor = seletorPastaComp($("#sel-comp"), pastas, c.pastaComp || null, meuCaminho);
  const msg = t => { const m = $("#comp-msg"); if (m) m.textContent = t; };
  $("#comp-ligar").onclick = async () => {
    if (cadernoArquivado(id)) { alert("Este item está arquivado. Desarquive primeiro."); return; }
    $$("#painel-caixa button").forEach(b => { b.disabled = true; });
    try {
      await publicarCaderno(id, msg, { pastaComp: seletor.valor(), soQuestoes: $("input[name=modo-comp]:checked").value === "questoes",
        novasPastas: seletor.novas().map(p => ({ ...p, area })) });
      fecharPainel(); volta(); mostrarAvisoRapido(ligado ? "🔄 Atualizado para os outros usuários" : "👁 Visível para todos");
    } catch (e) { msg("⚠️ " + e.message); $$("#painel-caixa button").forEach(b => { b.disabled = false; }); }
  };
  if ($("#comp-desligar")) $("#comp-desligar").onclick = async () => {
    if (!confirm(`Desligar? "${c.titulo}" deixa de aparecer no app dos outros usuários. A sua cópia continua aqui.`)) return;
    $$("#painel-caixa button").forEach(b => { b.disabled = true; });
    try { await despublicarCaderno(id, msg); fecharPainel(); volta(); mostrarAvisoRapido("🙈 Oculto para os outros usuários"); }
    catch (e) { msg("⚠️ " + e.message); $$("#painel-caixa button").forEach(b => { b.disabled = false; }); }
  };
}

/* ---------- quem recebe: listas e cadernos do app ficam nas pastas compartilhadas certinhas ---------- */
async function garantirPastaLocalComp(id, nome, pai, area) {
  const q = estado.itens.get(id);
  if (q && (q.apagado || q.lixeira)) return null;                     // a pessoa apagou a pasta: respeita
  if (!q) await salvarItem({ id, tipo: "pasta", area, nome, pai: pai || null, leis: [], cadernos: [], compartilhada: true, auto: true });
  else if (q.nome !== nome && q.compartilhada) await salvarItem({ ...q, nome });
  return id;
}
async function pastaLocalDaComp(c, area) {
  const pastasIdx = (estado.indiceQ?.pastas || []);
  let cadeia;
  if (c.pastaComp) {
    cadeia = [];
    for (let k = 0, p = pastasIdx.find(x => x.id === c.pastaComp); p && k < 30; k++, p = pastasIdx.find(x => x.id === p.pai)) cadeia.unshift({ id: "pasta-cq-" + p.id, nome: p.nome });
  } else if (Array.isArray(c.caminho) && c.caminho.length) {
    cadeia = c.caminho.map((n, k) => ({ id: "pasta-cq-p" + hashCurto(area + "/" + c.caminho.slice(0, k + 1).join("/")), nome: n }));
  } else return undefined;
  let pai = null;
  for (const p of cadeia) { pai = await garantirPastaLocalComp(p.id, p.nome, pai, area); if (!pai) return null; }
  return pai;
}
async function organizarCompartilhadosQ() {
  if (cfgDono()) return;                                   // o dono organiza o próprio app do jeito dele
  for (const cad of estado.indiceQ?.cadernos || []) {
    const c = estado.cadernos[cad.id];
    if (!c || c.local || c.soQuestoes) continue;
    const area = ehListaLS(c) ? "leiseca" : "questoes";
    const alvo = await pastaLocalDaComp(c, area);
    if (alvo === undefined || alvo === null) continue;
    const marca = estado.itens.get("colocado|" + c.id);
    const atual = pastaDoItem(area, c.id);
    if (marca && !marca.apagado) {
      if (marca.alvo === alvo) continue;
      if (atual !== marca.alvo) { await salvarItem({ ...marca, alvo }); continue; }   // a pessoa mudou de lugar: fica onde ela pôs
    }
    await moverParaPasta(area, c.id, alvo);
    await salvarItem({ id: "colocado|" + c.id, tipo: "colocado", alvo, auto: true });
  }
}

/* ---------- resumos: o dono escolhe a pasta compartilhada ---------- */
function painelCompartilharResumos({ titulo, texto, temPdf, pastaPropria = null, caminhoSugerido = [], aoLigar, volta, aviso }) {
  carregarCompartilhados().then(idx => {
    abrirPainel(`<h2>${esc(titulo)} ${botaoFechar}</h2><p class="contagem" style="margin-top:0">${texto}</p>
      <h3 class="grupo-assunto">Pasta compartilhada onde aparece</h3><div id="sel-comp"></div>
      <div class="acoes" style="margin-top:12px">${temPdf ? `<button data-comp-modo="marcado">✏️ Compartilhar com as minhas marcações (caneta e ícones)</button>
        <button data-comp-modo="original">📄 Compartilhar o arquivo original (sem marcações)</button>` : '<button data-comp-modo="original" class="botao primario">👁 Ligar</button>'}</div>
      <p class="contagem" id="msg-ligar"></p>`);
    const seletor = seletorPastaComp($("#sel-comp"), idx.pastas || [], pastaPropria, caminhoSugerido);
    $$("#painel-caixa [data-comp-modo]").forEach(b => b.onclick = async () => {
      $$("#painel-caixa button").forEach(x => x.disabled = true);
      const msg = t => { const m = $("#msg-ligar"); if (m) m.textContent = t; };
      try { await aoLigar(b.dataset.compModo === "marcado", seletor.valor(), seletor.novas(), msg); fecharPainel(); volta(); mostrarAvisoRapido(aviso); }
      catch (e) { msg("⚠️ " + e.message); $$("#painel-caixa button").forEach(x => x.disabled = false); }
    });
  });
}
/* dono: mudar um resumo (ou uma pasta compartilhada) de lugar, renomear e apagar pasta vazia, sem reenviar arquivos */
async function editarIndiceRes(mudar) {
  const p = provedorDono(); await p.preparar();
  const arqs = await p.listarPasta("dados/resumos");
  const idx = arqs.has(IDX_RES) ? deBytes(await p.baixar(IDX_RES)) : { resumos: [], pastas: [] };
  idx.resumos = idx.resumos || []; idx.pastas = idx.pastas || [];
  mudar(idx);
  await gravarIndiceRes(p, arqs, idx);
}
function painelMoverCompartilhado(tipo, id, volta) {
  const idx = compartilhados.indice;
  const item = tipo === "resumo" ? idx.resumos.find(x => x.id === id) : idx.pastas.find(x => x.id === id);
  if (!item) return;
  const proibidas = new Set();
  if (tipo === "pasta") { proibidas.add(id); let mudou = true; while (mudou) { mudou = false; for (const q of idx.pastas) if (q.pai && proibidas.has(q.pai) && !proibidas.has(q.id)) { proibidas.add(q.id); mudou = true; } } }
  abrirPainel(`<h2>📁 Mover “${esc(item.origem || item.titulo || item.nome)}” ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Muda o lugar onde aparece para os outros usuários (sem reenviar o arquivo).</p>
    <div id="sel-comp"></div><div class="acoes" style="margin-top:12px"><button class="botao primario" id="mover-comp">Mover</button></div><p class="contagem" id="msg-mover"></p>`);
  const seletor = seletorPastaComp($("#sel-comp"), idx.pastas.filter(p => !proibidas.has(p.id)), tipo === "resumo" ? item.pasta || null : item.pai || null);
  $("#mover-comp").onclick = async () => {
    $("#mover-comp").disabled = true; $("#msg-mover").textContent = "Salvando…";
    try {
      await editarIndiceRes(i => {
        i.pastas.push(...seletor.novas());
        if (tipo === "resumo") { const e = i.resumos.find(x => x.id === id); if (e) e.pasta = seletor.valor(); }
        else { const e = i.pastas.find(x => x.id === id); if (e) e.pai = seletor.valor(); }
      });
      fecharPainel(); volta(); mostrarAvisoRapido("📁 Movido nos compartilhados");
    } catch (e) { $("#msg-mover").textContent = "⚠️ " + e.message; $("#mover-comp").disabled = false; }
  };
}
