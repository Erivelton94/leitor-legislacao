/* =====================================================================
   RESUMOS COMPARTILHADOS PELO APP (modo dono)
   Igual aos cadernos de questões: no ⋯ de um resumo ou de uma pasta de
   resumos, o dono liga ou desliga "Visível para outros usuários".
   - ligar  → o arquivo vai para o repositório do app (dados/resumos/) e
     aparece para todos em "📚 Compartilhados pelo app";
   - desligar, arquivar ou mandar para a lixeira → sai do app dos outros
     (a sua cópia continua na sua conta).
   Quem recebe toca no resumo (ou copia a pasta inteira) e ele vai para os
   próprios resumos, no mesmo caminho de pastas do app do dono.
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
/* espelho: as pastas compartilhadas são as mesmas pastas do app do dono (mesmo id, nome e lugar) */
function pastasEspelhoRes(pastasDosArquivos, pastasCompartilhadas) {
  const ids = new Set();
  const comCaminho = pid => { for (const q of caminhoPasta(pid)) ids.add(q.id); };
  for (const pid of pastasDosArquivos) if (pid) comCaminho(pid);
  for (const pid of pastasCompartilhadas) { comCaminho(pid); for (const d of descendentes(pid)) if (!estado.itens.get(d)?.arquivada) comCaminho(d); }
  return [...ids].map(id => { const q = estado.itens.get(id); return { id, nome: q.nome, pai: paiDe(q) }; });
}
function espelharIndiceRes(idx) {
  for (const e of idx.resumos) {
    const r = resumos.lista?.get(e.id);
    if (r) e.pasta = pastaDoItem("resumos", r.id);
    else if (e.pasta && !pastaViva(estado.itens.get(e.pasta))) e.pasta = null;
  }
  const pubs = pastasDe("resumos").filter(p => p.publicada === true && !p.arquivada).map(p => p.id);
  idx.pastas = pastasEspelhoRes(idx.resumos.map(e => e.pasta), pubs);
}
/* publica uma lista de resumos (cada um aparece no mesmo caminho de pastas do app do dono) */
async function publicarResumos(lista, { comMarcacoes = false } = {}, aviso) {
  donoOcupado++;
  try {
    const p = provedorDono(); await p.preparar();
    const arqs = await p.listarPasta("dados/resumos");
    const idx = arqs.has(IDX_RES) ? deBytes(await p.baixar(IDX_RES)) : { resumos: [], pastas: [] };
    idx.resumos = idx.resumos || []; idx.pastas = idx.pastas || [];
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
        pasta: null, hash: hashCurto(String(bytes.length) + (r.atualizadoEm || "") + (comMarcacoes ? "m" : "")), em: agoraISO() });
    }
    for (const r of lista) { r.publicado = true; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); }
    espelharIndiceRes(idx);
    aviso && aviso("Atualizando a lista de compartilhados…");
    await gravarIndiceRes(p, arqs, idx);
  } finally { donoOcupado--; }
}
async function despublicarResumos(ids, pastaIds = [], aviso) {
  donoOcupado++;
  try {
    const p = provedorDono(); await p.preparar();
    const arqs = await p.listarPasta("dados/resumos");
    if (!arqs.has(IDX_RES)) return;
    const idx = deBytes(await p.baixar(IDX_RES));
    idx.resumos = idx.resumos || [];
    const sair = new Set(ids);
    aviso && aviso("Tirando do app dos outros usuários…");
    for (const e of idx.resumos.filter(x => sair.has(x.id))) { const c = "dados/resumos/" + e.arquivo; if (arqs.has(c)) await p.apagar(c, arqs.get(c)); }
    idx.resumos = idx.resumos.filter(x => !sair.has(x.id));
    for (const id of ids) { const r = resumos.lista.get(id); if (r && r.publicado) { r.publicado = false; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); } }
    espelharIndiceRes(idx);
    await gravarIndiceRes(p, arqs, idx);
  } finally { donoOcupado--; }
}
/* pasta: ela, as subpastas (mesmo vazias) e todos os arquivos aparecem para os outros, no mesmo caminho */
async function publicarPastaResumos(id, comMarcacoes, aviso) {
  const todas = [id, ...descendentes(id)];
  for (const pid of todas) { const q = estado.itens.get(pid); const quer = pid === id ? true : "dentro";
    if (q.publicada !== true && q.publicada !== quer) await salvarItem({ ...q, publicada: quer, ...(pid === id ? { compMarcado: !!comMarcacoes } : {}) });
    else if (pid === id) await salvarItem({ ...q, compMarcado: !!comMarcacoes }); }
  const lista = todas.filter(pid => !estado.itens.get(pid)?.arquivada).flatMap(pid => itensDaPasta("resumos", pid)).map(rid => resumos.lista.get(rid)).filter(r => r && !r.arquivado);
  await publicarResumos(lista, { comMarcacoes }, aviso);
}
async function despublicarPastaResumos(id, aviso) {
  const todas = [id, ...descendentes(id)];
  for (const pid of todas) { const q = estado.itens.get(pid); if (q && q.publicada) { const c = { ...q }; delete c.publicada; await salvarItem(c); } }
  const ids = todas.flatMap(pid => itensDaPasta("resumos", pid)).concat([...resumos.lista.values()].filter(r => r.publicado && todas.includes(r.pasta)).map(r => r.id));
  await despublicarResumos([...new Set(ids)], todas, aviso);
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
const textoOnde = (area, pastaId) => { const inicio = { questoes: "Pastas e arquivos", leiseca: "Pastas e arquivos", resumos: "📚 Compartilhados pelo app" }[area];
  return [inicio, ...(pastaId ? caminhoPasta(pastaId).map(x => x.nome) : [])].join(" › "); };
function ligarVisivelResumo(r, volta) {
  const b = $("#r-visivel"); if (!b) return;
  b.onclick = async () => {
    if (!r.publicado) {
      if (r.arquivado) { alert("Este resumo está arquivado. Desarquive primeiro para poder compartilhá-lo."); return; }
      return painelLigarCompartilhar("Compartilhar com os outros usuários",
        `“${esc(r.origem || r.titulo)}” passa a aparecer para todos em cerca de 1 minuto, no mesmo caminho de pastas do seu app:<br><strong>${esc(textoOnde("resumos", pastaDoItem("resumos", r.id)))}</strong>.<br>Se você mudar o arquivo ou as pastas de lugar, o app dos outros acompanha. Dá para desligar quando quiser.`,
        r.formato === "pdf", (marcado, msg) => publicarResumos([r], { comMarcacoes: marcado }, msg), volta, "👁 Resumo visível para todos");
    }
    if (!confirm(`Desligar? "${r.origem || r.titulo}" deixa de aparecer no app dos outros usuários. Quem já copiou continua com a cópia. A sua continua aqui.`)) return;
    b.disabled = true;
    try { await despublicarResumos([r.id], [], t => { b.textContent = t; }); fecharPainel(); volta(); mostrarAvisoRapido("🙈 Resumo oculto para os outros usuários"); }
    catch (e) { b.textContent = "⚠️ " + e.message; b.disabled = false; }
  };
}
function botoesVisivelPasta(p) {
  const area = p.area || "leis";
  if (!cfgDono() || area === "leis") return "";
  const dentro = p.publicada === "dentro" ? " (já está dentro de uma pasta compartilhada)" : "";
  return `<button id="pu-visivel">${p.publicada === true ? "👁 Visível para outros usuários: <strong>ligado</strong> (tocar para desligar)" : `🙈 Visível para outros usuários: <strong>desligado</strong>${dentro} (tocar para ligar a pasta inteira)`}</button>
    ${p.publicada === true ? `<button id="pu-atualizar">🔄 Atualizar o que os outros veem (envia ${area === "resumos" ? "os arquivos novos" : "as listas e cadernos novos"} desta pasta)</button>` : ""}`;
}
function ligarVisivelPasta(p, volta) {
  const b = $("#pu-visivel"); if (!b) return;
  const area = p.area || "leis";
  const nome = { resumos: "arquivo(s)", questoes: "caderno(s)", leiseca: "lista(s)" }[area];
  const texto = `A pasta “${esc(p.nome)}”, as ${descendentes(p.id).length} subpasta(s) e os ${totalNaPasta(area, p.id)} ${nome} de dentro passam a aparecer para todos, no mesmo caminho do seu app:<br><strong>${esc(textoOnde(area, p.id))}</strong>.<br>O que você colocar depois nesta pasta${area === "resumos" ? " vai para os outros quando você tocar em “Atualizar”" : " também passa a aparecer para eles"}, e se você renomear ou mudar as pastas de lugar, o app dos outros acompanha.`;
  const abrir = (titulo, aviso) => {
    if (area === "resumos") {
      const temPdf = [p.id, ...descendentes(p.id)].some(pid => itensDaPasta("resumos", pid).some(rid => resumos.lista.get(rid)?.formato === "pdf"));
      return painelLigarCompartilhar(titulo, texto, temPdf, (marcado, msg) => publicarPastaResumos(p.id, marcado, msg), volta, aviso);
    }
    painelPastaQ(p, titulo, texto, volta, aviso);
  };
  b.onclick = async () => {
    if (p.publicada !== true) {
      if (p.arquivada) { alert("Esta pasta está arquivada. Desarquive primeiro."); return; }
      return abrir("Compartilhar a pasta com os outros usuários", "👁 Pasta visível para todos");
    }
    if (!confirm(`Desligar? A pasta "${p.nome}" e tudo o que está dentro deixam de aparecer para os outros usuários. A sua continua aqui.`)) return;
    b.disabled = true;
    try { await (area === "resumos" ? despublicarPastaResumos(p.id, t => { b.textContent = t; }) : despublicarPastaQ(p.id, t => { b.textContent = t; }));
      fecharPainel(); volta(); mostrarAvisoRapido("🙈 Pasta oculta para os outros usuários"); }
    catch (e) { b.textContent = "⚠️ " + e.message; b.disabled = false; }
  };
  const at = $("#pu-atualizar");
  if (at) at.onclick = () => abrir("Atualizar o que os outros veem", "🔄 Compartilhados atualizados");
}
/* questões: pasta inteira (Lei Seca ou Múltipla Escolha) */
function painelPastaQ(p, titulo, texto, volta, aviso) {
  abrirPainel(`<h2>${esc(titulo)} ${botaoFechar}</h2><p class="contagem" style="margin-top:0">${texto}</p>
    <h3 class="grupo-assunto">Como aparece para eles</h3>
    <div class="lista-opcoes-ls">
      <label class="opcao-ls"><input type="radio" name="modo-pq" value="arquivo" ${!p.soQuestoes ? "checked" : ""}><span><strong>Questões + os arquivos nas pastas</strong><br><span class="contagem">As pastas, as subpastas e os arquivos aparecem iguais aos seus, e as questões entram no banco e no filtro.</span></span></label>
      <label class="opcao-ls"><input type="radio" name="modo-pq" value="questoes" ${p.soQuestoes ? "checked" : ""}><span><strong>Só as questões</strong><br><span class="contagem">As questões entram no banco e no filtro deles, sem os arquivos aparecerem nas pastas.</span></span></label>
    </div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" id="pq-ligar">👁 Ligar (visível para todos)</button></div>
    <p class="contagem" id="pq-msg"></p>`);
  $("#pq-ligar").onclick = async () => {
    $$("#painel-caixa button").forEach(x => { x.disabled = true; });
    const msg = t => { const m = $("#pq-msg"); if (m) m.textContent = t; };
    try { await publicarPastaQ(p.id, $("input[name=modo-pq]:checked").value === "questoes", msg); fecharPainel(); volta(); mostrarAvisoRapido(aviso); }
    catch (e) { msg("⚠️ " + e.message); $$("#painel-caixa button").forEach(x => { x.disabled = false; }); }
  };
}
const cadernosDaPastaQ = pid => { const area = estado.itens.get(pid).area;
  return [pid, ...descendentes(pid)].filter(x => !estado.itens.get(x)?.arquivada).flatMap(x => itensDaPasta(area, x)).filter(id => estado.cadernos[id] && !cadernoArquivado(id)); };
function estruturasDaPastaQ(pid) {
  const area = estado.itens.get(pid).area;
  return [pid, ...descendentes(pid)].filter(x => !caminhoPasta(x).some(q => q.arquivada)).map(x => ({ area, caminho: caminhoPasta(x).map(q => q.nome) }));
}
function estruturasPublicadasQ() {
  const out = [], vistos = new Set();
  for (const area of ["questoes", PLATAFORMA_LS]) for (const p of pastasDe(area)) if (p.publicada === true && !caminhoPasta(p.id).some(q => q.arquivada))
    for (const e of estruturasDaPastaQ(p.id)) { const k = e.area + "/" + e.caminho.join("/"); if (!vistos.has(k)) { vistos.add(k); out.push(e); } }
  return out.sort((a, b) => (a.area + a.caminho.join("/")).localeCompare(b.area + b.caminho.join("/")));
}
async function publicarPastaQ(pid, soQuestoes, aviso) {
  const todas = [pid, ...descendentes(pid)];
  for (const x of todas) { const q = estado.itens.get(x); const quer = x === pid ? true : "dentro";
    if (x === pid) await salvarItem({ ...q, publicada: true, soQuestoes: !!soQuestoes });
    else if (q.publicada !== true && q.publicada !== quer) await salvarItem({ ...q, publicada: quer }); }
  await publicarCadernos(cadernosDaPastaQ(pid), aviso, { soQuestoes, estruturas: estruturasPublicadasQ() });
}
async function despublicarPastaQ(pid, aviso) {
  const area = estado.itens.get(pid).area, todas = [pid, ...descendentes(pid)];
  for (const x of todas) { const q = estado.itens.get(x); if (q?.publicada) { const c = { ...q }; delete c.publicada; delete c.soQuestoes; await salvarItem(c); } }
  const ids = todas.flatMap(x => itensDaPasta(area, x)).filter(id => ehVisivelParaTodos(id));
  await despublicarCadernos(ids, aviso, { estruturas: estruturasPublicadasQ() });
}

/* ---------- lado de quem recebe: ver e copiar para os próprios resumos ---------- */
const ID_PASTA_RECEBIDOS = "pasta-c-raiz";                // versões antigas punham tudo nesta pasta
/* cria (ou acerta) no app de quem recebe o mesmo caminho de pastas do app do dono, a partir do início de Meus Resumos */
async function pastaLocalDosCompartilhados(pastaCompId) {
  if (!pastaCompId) return "";
  const idx = compartilhados.indice, cam = [];
  for (let id = pastaCompId, voltas = 0; id && voltas < 30; voltas++) { const pa = idx.pastas.find(x => x.id === id); if (!pa) break; cam.unshift(pa); id = pa.pai; }
  let pai = null;
  for (const pa of cam) {
    const id = "pasta-c-" + pa.id, q = estado.itens.get(id);
    if (!q || q.apagado) await salvarItem({ id, tipo: "pasta", area: "resumos", nome: pa.nome, pai, autoPai: pai, leis: [], cadernos: [], compartilhada: true });
    else {
      const naoMexeu = q.pai === ID_PASTA_RECEBIDOS || (q.pai || null) === (q.autoPai === undefined ? q.pai || null : q.autoPai);   // a pessoa não mudou a pasta de lugar
      const c = { ...q }; delete c.lixeira;
      if (naoMexeu) { c.pai = pai; c.autoPai = pai; c.nome = pa.nome; }
      if (q.lixeira || naoMexeu && (q.pai !== pai || q.nome !== pa.nome || q.autoPai !== pai)) await salvarItem(c);
    }
    pai = id;
  }
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
    <p class="contagem" style="margin-top:0">Materiais que o dono do app compartilhou, na mesma organização de pastas dele. Toque num arquivo (ou copie a pasta inteira) para trazê-lo para os seus resumos: a cópia é sua (dá para marcar, escrever com a caneta e organizar) e fica em <strong>Meus Resumos</strong>, no mesmo caminho de pastas.</p>
    ${dono ? `<p class="contagem">👑 Esta é exatamente a organização que os outros veem: as mesmas pastas e subpastas de Meus Resumos. Para mudar algo aqui, organize as suas pastas (renomear, mover) e o app dos outros acompanha.</p>` : ""}
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
  const volta = () => telaCompartilhados(pastaId);          // o índice novo já está na memória: não espera o site do app
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
   ESPELHO DAS PASTAS (modo dono)
   O que o dono compartilha aparece no app dos outros usuários no MESMO
   caminho de pastas e subpastas do app dele. Se o dono renomear, mover ou
   arquivar pastas, ou mudar um arquivo compartilhado de lugar, o app dos
   outros acompanha sozinho (alguns segundos depois, com internet).
   ===================================================================== */
const caminhoComp = (pastas, id) => { const out = []; for (let k = 0, p = pastas.find(x => x.id === id); p && k < 30; k++, p = pastas.find(x => x.id === p.pai)) out.unshift(p.nome); return out; };
const caminhoDoItemQ = c => (ehListaLS(c) ? caminhoDaLista(c) : caminhoDoCaderno(c));

/* ---------- questões: ligar um caderno ou uma lista ---------- */
function painelCompartilharCaderno(id, volta) {
  const c = estado.cadernos[id];
  const ls = ehListaLS(c), area = ls ? PLATAFORMA_LS : "questoes";
  const ligado = ehVisivelParaTodos(id);
  abrirPainel(`<h2>${ligado ? "👁 Compartilhado" : "Compartilhar"}: ${esc(c.titulo)} ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${ls ? "A lista" : "O caderno"} aparece no app dos outros usuários no mesmo caminho de pastas do seu app:<br><strong>${esc(textoOnde(area, pastaDoItem(area, id)))}</strong>.<br>Se você mudar ${ls ? "a lista" : "o caderno"} ou as pastas de lugar, o app dos outros acompanha.${ls ? " (No filtro, a pasta principal vira a Lei/Disciplina e a subpasta, o Assunto.)" : ""}</p>
    <h3 class="grupo-assunto">Como aparece para eles</h3>
    <div class="lista-opcoes-ls">
      <label class="opcao-ls"><input type="radio" name="modo-comp" value="arquivo" ${!c.soQuestoes ? "checked" : ""}><span><strong>Questões + ${ls ? "a lista" : "o caderno"} na pasta</strong><br><span class="contagem">Aparece na mesma pasta que no seu app e as questões entram no banco e no filtro.</span></span></label>
      <label class="opcao-ls"><input type="radio" name="modo-comp" value="questoes" ${c.soQuestoes ? "checked" : ""}><span><strong>Só as questões</strong><br><span class="contagem">As questões entram no banco e no filtro deles, sem o arquivo aparecer nas pastas.</span></span></label>
    </div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" id="comp-ligar">${ligado ? "🔄 Salvar e atualizar para os outros" : "👁 Ligar (visível para todos)"}</button>
      ${ligado ? '<button id="comp-desligar" style="color:var(--alt)">🙈 Desligar (deixa de aparecer para os outros)</button>' : ""}</div>
    <p class="contagem" id="comp-msg"></p>`);
  const msg = t => { const m = $("#comp-msg"); if (m) m.textContent = t; };
  $("#comp-ligar").onclick = async () => {
    if (cadernoArquivado(id)) { alert("Este item está arquivado. Desarquive primeiro."); return; }
    $$("#painel-caixa button").forEach(b => { b.disabled = true; });
    try {
      await publicarCaderno(id, msg, { soQuestoes: $("input[name=modo-comp]:checked").value === "questoes" });
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

/* ---------- quem recebe: as mesmas pastas do dono, com as listas e cadernos dentro ---------- */
const idPastaEspelhoQ = (area, caminho) => "pasta-cq-p" + hashCurto(area + "/" + caminho.join("/"));
async function garantirPastaLocalComp(id, nome, pai, area) {
  const q = estado.itens.get(id);
  if (q && (q.apagado || q.lixeira)) return null;                     // a pessoa apagou a pasta: respeita
  if (!q) await salvarItem({ id, tipo: "pasta", area, nome, pai: pai || null, leis: [], cadernos: [], compartilhada: true, auto: true });
  else if (q.nome !== nome && q.compartilhada) await salvarItem({ ...q, nome });
  return id;
}
async function garantirCaminhoQ(area, caminho) {
  let pai = null;
  for (let k = 0; k < caminho.length; k++) { pai = await garantirPastaLocalComp(idPastaEspelhoQ(area, caminho.slice(0, k + 1)), caminho[k], pai, area); if (!pai) return null; }
  return pai;
}
async function pastaLocalDaComp(c, area) {
  if (c.pastaComp) {                                                  // compartilhado no jeito antigo (pasta escolhida à parte)
    const pastasIdx = estado.indiceQ?.pastas || [];
    const cadeia = [];
    for (let k = 0, p = pastasIdx.find(x => x.id === c.pastaComp); p && k < 30; k++, p = pastasIdx.find(x => x.id === p.pai)) cadeia.unshift({ id: "pasta-cq-" + p.id, nome: p.nome });
    let pai = null;
    for (const p of cadeia) { pai = await garantirPastaLocalComp(p.id, p.nome, pai, area); if (!pai) return null; }
    return pai;
  }
  if (Array.isArray(c.caminho)) return c.caminho.length ? garantirCaminhoQ(area, c.caminho) : "";
  return undefined;
}
async function organizarCompartilhadosQ() {
  if (cfgDono()) { agendarEspelhoDono(); return; }        // o dono organiza o próprio app; os outros acompanham o dele
  const esperadas = new Set();
  for (const e of estado.indiceQ?.estruturas || []) {      // pastas compartilhadas inteiras (até as subpastas vazias)
    if (!Array.isArray(e.caminho) || !e.caminho.length) continue;
    const area = e.area === PLATAFORMA_LS ? PLATAFORMA_LS : "questoes";
    for (let k = 1; k <= e.caminho.length; k++) esperadas.add(idPastaEspelhoQ(area, e.caminho.slice(0, k)));
    await garantirCaminhoQ(area, e.caminho);
  }
  for (const cad of estado.indiceQ?.cadernos || []) {
    const c = estado.cadernos[cad.id];
    if (!c || c.local || c.soQuestoes) continue;
    const area = ehListaLS(c) ? PLATAFORMA_LS : "questoes";
    if (Array.isArray(c.caminho)) for (let k = 1; k <= c.caminho.length; k++) esperadas.add(idPastaEspelhoQ(area, c.caminho.slice(0, k)));
    if (c.pastaComp) for (const p of caminhoPastaIdx(c.pastaComp)) esperadas.add("pasta-cq-" + p.id);
    const alvo = await pastaLocalDaComp(c, area);
    if (alvo === undefined || alvo === null) continue;
    const marca = estado.itens.get("colocado|" + c.id);
    const atual = pastaDoItem(area, c.id);
    if (marca && !marca.apagado) {
      if ((marca.alvo || "") === (alvo || "")) continue;
      if ((atual || "") !== (marca.alvo || "")) { await salvarItem({ ...marca, alvo }); continue; }   // a pessoa mudou de lugar: fica onde ela pôs
    }
    await moverParaPasta(area, c.id, alvo || null);
    await salvarItem({ id: "colocado|" + c.id, tipo: "colocado", alvo, auto: true });
  }
  // pastas criadas pelo app que o dono não compartilha mais (ou renomeou/moveu): saem se ficaram vazias
  for (let volta = 0, mudou = true; mudou && volta < 10; volta++) {
    mudou = false;
    for (const p of [...estado.itens.values()].filter(x => x.tipo === "pasta" && !x.apagado && !x.lixeira && x.auto && x.compartilhada && areaDeCadernos(x.area))) {
      if (esperadas.has(p.id)) continue;
      if (pastasDe(p.area, p.id).length || (p.cadernos || []).some(id => estado.cadernos[id])) continue;
      await apagarItem(p.id); mudou = true;
    }
  }
}
const caminhoPastaIdx = id => { const pastas = estado.indiceQ?.pastas || [], out = []; for (let k = 0, p = pastas.find(x => x.id === id); p && k < 30; k++, p = pastas.find(x => x.id === p.pai)) out.unshift(p); return out; };

/* ---------- dono: o app dos outros acompanha a organização do seu ---------- */
let timerEspelho = null;
function agendarEspelhoDono() {
  if (typeof cfgDono !== "function" || !cfgDono()) return;
  clearTimeout(timerEspelho);
  timerEspelho = setTimeout(() => {
    if (donoOcupado) return agendarEspelhoDono();
    sincronizarEspelhoDono().catch(e => mostrarAvisoRapido("⚠️ Não deu para atualizar a organização no app dos outros agora: " + e.message));
  }, 4000);
}
async function sincronizarEspelhoDono() {
  if (!cfgDono() || estado.offline) return;
  // questões: o que mudou de pasta, o que entrou numa pasta compartilhada e as pastas compartilhadas inteiras
  const dentroDePublicada = id => { const area = ehListaLS(estado.cadernos[id]) ? PLATAFORMA_LS : "questoes"; const p = pastaDoItem(area, id); return !!p && caminhoPasta(p).some(q => q.publicada === true) && !caminhoPasta(p).some(q => q.arquivada); };
  const enviar = Object.values(estado.cadernos).filter(c => !cadernoArquivado(c.id) && (ehVisivelParaTodos(c.id)
    ? (c.pastaComp || JSON.stringify(caminhoDoItemQ(c)) !== JSON.stringify(Array.isArray(c.caminho) ? c.caminho : []))
    : dentroDePublicada(c.id))).map(c => c.id);
  const estr = estruturasPublicadasQ();
  if (enviar.length || JSON.stringify(estr) !== JSON.stringify(estado.indiceQ?.estruturas || [])) await publicarCadernos(enviar, null, { estruturas: estr });
  // resumos: as pastas compartilhadas acompanham as suas (nome e lugar)
  if (typeof carregarResumos === "function") await carregarResumos();
  const idx = await carregarCompartilhados();
  if (!idx.resumos.length && !idx.pastas.length && !pastasDe("resumos").some(p => p.publicada === true)) return;
  const teste = JSON.parse(JSON.stringify(idx)); espelharIndiceRes(teste);
  const chave = i => JSON.stringify([i.resumos.map(e => [e.id, e.pasta || null]), [...i.pastas].sort((a, b) => a.id.localeCompare(b.id))]);
  if (chave(teste) !== chave(idx)) await editarIndiceRes(espelharIndiceRes);
}
async function editarIndiceRes(mudar) {
  donoOcupado++;
  try {
    const p = provedorDono(); await p.preparar();
    const arqs = await p.listarPasta("dados/resumos");
    const idx = arqs.has(IDX_RES) ? deBytes(await p.baixar(IDX_RES)) : { resumos: [], pastas: [] };
    idx.resumos = idx.resumos || []; idx.pastas = idx.pastas || [];
    mudar(idx);
    await gravarIndiceRes(p, arqs, idx);
  } finally { donoOcupado--; }
}
