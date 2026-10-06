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
const LIMITE_COMPARTILHAR_MB = 45;
const compartilhados = { indice: null };
async function carregarCompartilhados(forcar = false) {
  if (compartilhados.indice && !forcar) return compartilhados.indice;
  const cache = await caches.open(CACHE_DADOS);
  let idx = null;
  if (!estado.offline) {
    try { const r = await buscarComTempo(IDX_RES + "?v=" + Date.now()); if (r.ok) { idx = await r.clone().json(); await cache.put(IDX_RES, r); } } catch {}
  }
  if (!idx) { const c = await cache.match(IDX_RES); idx = c ? await c.json() : null; }
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
  await p.enviar(IDX_RES, paraBytes(idx), lista.get(IDX_RES));
  await gravarNoCache(IDX_RES, idx);
  compartilhados.indice = idx;
}
/* publica uma lista de resumos; "pastaDe" diz em que pasta compartilhada cada um aparece */
async function publicarResumos(lista, { comMarcacoes = false, pastas = [], pastaDe = () => null } = {}, aviso) {
  const p = provedorDono(); await p.preparar();
  const arqs = await p.listar();
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
  const arqs = await p.listar();
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
async function publicarPastaResumos(id, comMarcacoes, aviso) {
  const todas = [id, ...descendentes(id)];
  const ativas = new Set(todas);
  const pastas = todas.map(pid => { const q = estado.itens.get(pid); return { id: pid, nome: q.nome, pai: pid === id ? null : (ativas.has(paiDe(q)) ? paiDe(q) : id) }; });
  const lista = todas.flatMap(pid => itensDaPasta("resumos", pid)).map(rid => resumos.lista.get(rid)).filter(r => r && !r.arquivado);
  await publicarResumos(lista, { comMarcacoes, pastas, pastaDe: r => pastaDoResumo(r) }, aviso);
  for (const pid of todas) { const q = estado.itens.get(pid); if (!q.publicada) await salvarItem({ ...q, publicada: pid === id ? true : "dentro" }); }
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
      return painelLigarCompartilhar("Compartilhar com os outros usuários", `“${esc(r.origem || r.titulo)}” passa a aparecer para todos em <strong>📚 Compartilhados pelo app</strong>, em cerca de 1 minuto. Você pode desligar quando quiser.`,
        r.formato === "pdf", (marcado, msg) => publicarResumos([r], { comMarcacoes: marcado, pastaDe: () => null }, msg), volta, "👁 Resumo visível para todos");
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
  const abrir = (titulo, aviso) => painelLigarCompartilhar(titulo, `A pasta “${esc(p.nome)}”, as subpastas e os ${totalNaPasta("resumos", p.id)} arquivo(s) aparecem para todos em <strong>📚 Compartilhados pelo app</strong>, na mesma organização. Você pode desligar quando quiser.`,
    temPdf(), (marcado, msg) => publicarPastaResumos(p.id, marcado, msg), volta, aviso);
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
  const pastas = idx.pastas.filter(x => (x.pai || null) === (pastaId || null)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const lista = idx.resumos.filter(x => (x.pasta || null) === (pastaId || null)).sort((a, b) => (a.origem || a.titulo).localeCompare(b.origem || b.titulo, "pt-BR", { numeric: true }));
  const contar = id => { const ids = new Set([id]); let mudou = true; while (mudou) { mudou = false; for (const q of idx.pastas) if (q.pai && ids.has(q.pai) && !ids.has(q.id)) { ids.add(q.id); mudou = true; } } return idx.resumos.filter(x => ids.has(x.pasta)).length; };
  $("#conteudo").innerHTML = `<div class="secao">
    <p class="contagem" style="margin-top:0">Materiais que o dono do app compartilhou. Toque num arquivo para copiá-lo para os seus resumos: a cópia é sua (dá para marcar, escrever com a caneta e organizar) e fica em <strong>Meus Resumos › Compartilhados pelo app</strong>.</p>
    ${lista.length || pastas.length ? `<div class="acoes-linha"><button class="botao primario" id="copiar-tudo">⬇️ Copiar ${pasta ? "esta pasta inteira" : "tudo"} para os meus resumos</button></div>` : ""}
    <p class="contagem" id="msg-comp"></p>
    <ul class="acervo">
      ${pastas.map(q => `<li class="lei-item pasta-item"><span class="aba"></span><button class="abrir" data-href="#/resumos/compartilhados/${esc(q.id)}"><span class="lei-nome">${ICONE_PASTA}${esc(q.nome)}</span><span class="lei-num">${contar(q.id)} arquivo(s)</span></button><span></span></li>`).join("")}
      ${lista.map(x => { const c = copiaLocal(x.id); return `<li class="lei-item"><span class="aba"></span><button class="abrir" data-comp="${esc(x.id)}">
          <span class="lei-nome">📄 ${esc(x.origem || x.titulo)}</span>
          <span class="lei-num">${x.formato.toUpperCase()} · ${mb(x.tamanho || 0)}${c ? (c.versaoCompartilhada === x.hash ? " · ✓ já está nos seus resumos (tocar para abrir)" : " · 🆕 versão nova disponível (tocar para copiar de novo)") : " · tocar para copiar e abrir"}</span></button><span></span></li>`; }).join("")}
    </ul>
    ${!lista.length && !pastas.length ? '<p class="vazio">Nada compartilhado por aqui ainda.</p>' : ""}</div>`;
  const msg = t => { const m = $("#msg-comp"); if (m) m.textContent = t; };
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
