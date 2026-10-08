/* =====================================================================
   MODO DONO DO APP
   Com a chave de dono (GitHub, só para o repositório do app), aparece no ⋯
   de cada caderno o botão "Visível para outros usuários":
   - ligar  → publica o caderno no repositório (todos passam a ver);
   - desligar → tira do repositório (a sua cópia continua na sua conta).
   Caderno arquivado ou excluído nunca fica visível para os outros.
   ===================================================================== */
const REPO_APP = "Erivelton94/leitor-legislacao";
const cfgDono = () => lerLS("dono-config", null);
const provedorDono = () => { const c = cfgDono(); return provedorGitHub({ repo: c.repo || REPO_APP, token: c.token, ramo: "main" }); };
const ehVisivelParaTodos = id => { const c = estado.cadernos[id]; return !!c && (!c.local || !!c.publicado); };

async function lerIndiceRemoto(p, lista) {
  if (!lista.has("dados/questoes/indice.json")) return { cadernos: [] };
  try { return deBytes(await p.baixar("dados/questoes/indice.json")); } catch { return { cadernos: [] }; }
}
async function gravarNoCache(caminho, obj) {
  const cache = await caches.open(CACHE_DADOS);
  if (obj === null) await cache.delete(new Request(caminho));
  else await cache.put(new Request(caminho), new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" } }));
}
function cadernoParaPublicar(c) {
  const { local, publicado, tituloOriginal, ...resto } = c;
  const extra = ehListaLS(c) ? { caminho: caminhoDaLista(c), titulo: c.titulo } : {};          // lei seca: assunto e subassunto vão junto
  return { ...resto, titulo: c.tituloOriginal || c.titulo, versao: new Date().toISOString().slice(0, 10), ...extra,
    questoes: c.questoes.map(({ caderno, assuntoLS, subassuntoLS, ...q }) => q) };
}
/* ligar: o caderno passa a aparecer para todos */
async function publicarCaderno(id, aviso) {
  const c = estado.cadernos[id];
  const p = provedorDono(); await p.preparar();
  const lista = await p.listar();
  const arquivo = `${id}.json`, caminho = `dados/questoes/${arquivo}`;
  const dados = cadernoParaPublicar(c);
  const texto = JSON.stringify(dados, null, 1);
  aviso && aviso("Enviando o caderno…");
  await p.enviar(caminho, new TextEncoder().encode(texto), lista.get(caminho));
  const indice = await lerIndiceRemoto(p, lista);
  indice.cadernos = (indice.cadernos || []).filter(x => x.id !== id);
  indice.cadernos.push({ id, titulo: dados.titulo, materia: dados.materia, arquivo, qtd: dados.questoes.length, hash: hashCurto(texto), ...(dados.plataforma ? { plataforma: dados.plataforma } : {}) });
  aviso && aviso("Atualizando a lista de cadernos…");
  await p.enviar("dados/questoes/indice.json", paraBytes(indice), lista.get("dados/questoes/indice.json"));
  await gravarNoCache(caminho, dados); await gravarNoCache("dados/questoes/indice.json", indice);
  // a cópia local fica marcada como publicada (o site do app leva ~1 min para atualizar)
  gravarLS("cadernos-locais", lerLS("cadernos-locais", []).map(x => x.id === id ? { ...x, publicado: true, atualizadoEm: agoraISO() } : x));
  await carregarQuestoes();
}
/* desligar: some do app dos outros; a sua cópia fica na sua conta */
async function despublicarCaderno(id, aviso) {
  const c = estado.cadernos[id];
  const url = `dados/questoes/local/${id}.json`;
  await gravarNoCache(url, cadernoParaPublicar(c));                 // primeiro garante a sua cópia
  const locais = lerLS("cadernos-locais", []).filter(x => x.id !== id);
  locais.push({ id, titulo: c.tituloOriginal || c.titulo, materia: c.materia, url, qtd: c.questoes.length, atualizadoEm: agoraISO(), ...(c.plataforma ? { plataforma: c.plataforma } : {}) });
  gravarLS("cadernos-locais", locais);
  const p = provedorDono(); await p.preparar();
  const lista = await p.listar();
  const caminho = `dados/questoes/${id}.json`;
  aviso && aviso("Tirando do app dos outros usuários…");
  const indice = await lerIndiceRemoto(p, lista);
  const entrada = (indice.cadernos || []).find(x => x.id === id);
  indice.cadernos = (indice.cadernos || []).filter(x => x.id !== id);
  await p.enviar("dados/questoes/indice.json", paraBytes(indice), lista.get("dados/questoes/indice.json"));
  const arq = entrada ? `dados/questoes/${entrada.arquivo}` : caminho;
  if (lista.has(arq)) await p.apagar(arq, lista.get(arq));
  await gravarNoCache("dados/questoes/indice.json", indice); await gravarNoCache(arq, null);
  await carregarQuestoes();
}

/* ---------- arquivar cadernos e pastas de questões ---------- */
const idArquivo = id => "arquivado|caderno|" + id;
const cadernoArquivado = id => { const i = estado.itens.get(idArquivo(id)); return !!i && !i.apagado; };
async function arquivarCaderno(id, arquivar = true) {
  if (arquivar) {
    if (cfgDono() && ehVisivelParaTodos(id)) await despublicarCaderno(id);     // arquivado nunca aparece para os outros
    await salvarItem({ id: idArquivo(id), tipo: "arquivado", area: "questoes", alvo: id, em: agoraISO() });
  } else if (cadernoArquivado(id)) await apagarItem(idArquivo(id));
}
async function arquivarPasta(pastaId, arquivar = true) {
  const p = estado.itens.get(pastaId);
  if (arquivar && cfgDono()) for (const pid of [pastaId, ...descendentes(pastaId)]) for (const id of estado.itens.get(pid)?.cadernos || []) if (ehVisivelParaTodos(id)) await despublicarCaderno(id);
  await salvarItem({ ...p, arquivada: arquivar, arquivadaEm: arquivar ? agoraISO() : null });
}

/* ---------- excluir ---------- */
async function excluirCaderno(id, grupo = null) {
  const c = estado.cadernos[id];
  if (!c) return;
  if (!c.local || c.publicado) {
    if (!cfgDono()) { await arquivarCaderno(id, true); return "arquivado"; }   // caderno do app: quem não é dono só pode ocultar
    await despublicarCaderno(id);
  }
  await cadernoParaLixeira(id, grupo);
  return "lixeira";
}

/* ---------- menu do caderno: opções novas ---------- */
function botoesCadernoExtras(id) {
  const c = estado.cadernos[id];
  const arq = cadernoArquivado(id);
  const dono = cfgDono();
  const doApp = !c.local;
  return `${dono ? `<button id="c-visivel">${ehVisivelParaTodos(id) ? "👁 Visível para outros usuários: <strong>ligado</strong> (tocar para desligar)" : "🙈 Visível para outros usuários: <strong>desligado</strong> (tocar para ligar)"}</button>` : ""}
    <button id="c-arquivar">${arq ? "📤 Desarquivar" : "📦 Arquivar"}</button>
    ${doApp && !dono ? "" : `<button id="c-excluir2" style="color:var(--alt)">🗑 Excluir o caderno</button>`}`;
}
function ligarCadernoExtras(id, volta) {
  const c = estado.cadernos[id];
  const msg = t => { const b = $("#c-visivel"); if (b) b.textContent = t; };
  if ($("#c-visivel")) $("#c-visivel").onclick = async () => {
    const ligado = ehVisivelParaTodos(id);
    if (!ligado && cadernoArquivado(id)) { alert("Este caderno está arquivado. Desarquive primeiro para poder deixá-lo visível para os outros."); return; }
    if (!confirm(ligado ? `Desligar? "${c.titulo}" deixa de aparecer no app dos outros usuários (as respostas deles ficam guardadas na conta de cada um). A sua cópia continua aqui.`
      : `Ligar? "${c.titulo}" passa a aparecer no app de todos os usuários em cerca de 1 minuto.`)) return;
    $("#c-visivel").disabled = true;
    try { if (ligado) await despublicarCaderno(id, msg); else await publicarCaderno(id, msg); fecharPainel(); volta(); mostrarAvisoRapido(ligado ? "🙈 Caderno oculto para os outros usuários" : "👁 Caderno visível para todos"); }
    catch (e) { msg("⚠️ " + e.message); $("#c-visivel").disabled = false; }
  };
  $("#c-arquivar").onclick = async () => {
    const arq = cadernoArquivado(id);
    if (!arq && cfgDono() && ehVisivelParaTodos(id) && !confirm("Ao arquivar, o caderno deixa de aparecer para os outros usuários. Continuar?")) return;
    try { await arquivarCaderno(id, !arq); fecharPainel(); volta(); mostrarAvisoRapido(arq ? "📤 Caderno desarquivado" : "📦 Caderno arquivado"); }
    catch (e) { alert("Não foi possível: " + e.message); }
  };
  if ($("#c-excluir2")) $("#c-excluir2").onclick = async () => {
    const doApp = !c.local || c.publicado;
    if (!confirm(doApp ? `Excluir "${c.titulo}"? Ele sai do app de todos os usuários e a sua cópia vai para a lixeira (30 dias para restaurar).`
      : `Excluir "${c.titulo}"? Ele vai para a lixeira (30 dias para restaurar).`)) return;
    try { await excluirCaderno(id); fecharPainel(); volta(); mostrarAvisoRapido("🗑 O caderno foi para a lixeira"); }
    catch (e) { alert("Não foi possível excluir: " + e.message); }
  };
}

/* ---------- Configurações → Dono do app ---------- */
/* A seção só aparece para quem tocar 15 vezes seguidas no título "Configurações"
   (ou para quem já conectou a chave de dono). Para os outros usuários, ela não existe. */
function htmlSecaoDono() {
  const c = cfgDono();
  if (!c && !lerLS("dono-revelado", false)) return "";
  return `<div class="secao" id="secao-dono"><h2>👑 Dono do app</h2><div class="cartao">
    ${c ? `<p>Chave de dono conectada (${esc(c.repo || REPO_APP)}). No ⋯ de cada caderno aparece “Visível para outros usuários”.</p>
      <div class="acoes" style="margin-bottom:12px"><button id="dono-sair" style="color:var(--alt)">Desconectar a chave de dono</button></div>`
    : `<p class="contagem" style="margin-top:0">Só para quem administra o app: permite publicar ou ocultar cadernos de questões para todos os usuários. Quem só usa o app não precisa disto.</p>
      <div class="acoes" style="margin-bottom:12px"><button id="dono-conectar">Conectar a chave de dono</button></div>`}
  </div></div>`;
}
function ligarSecaoDono() {
  if ($("#dono-sair")) $("#dono-sair").onclick = () => { if (!confirm("Desconectar a chave de dono deste aparelho?")) return; localStorage.removeItem("dono-config"); localStorage.removeItem("dono-revelado"); telaAjustes(); };
  if ($("#dono-conectar")) $("#dono-conectar").onclick = () => {
    abrirPainel(`<h2>Chave de dono do app ${botaoFechar}</h2>
      <ol class="passos-sync">
        <li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>
        <li>Dê um nome (ex.: “Dono do Leitor”), escolha a validade, em <em>Repository access</em> marque <em>Only select repositories</em> → <code>${REPO_APP}</code>.</li>
        <li>Em <em>Permissions → Repository permissions → Contents</em>, escolha <em>Read and write</em>. Clique em <em>Generate token</em> e copie a chave.</li>
      </ol>
      <label class="contagem">Chave (token)</label>
      <input class="campo" id="dono-token" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off">
      <div class="acoes"><button class="botao primario" id="dono-ok">Conectar</button></div><p class="contagem" id="dono-msg"></p>`);
    $("#dono-ok").onclick = async () => {
      const token = $("#dono-token").value.trim();
      if (!token) { $("#dono-msg").textContent = "Cole a chave."; return; }
      $("#dono-msg").textContent = "Conferindo…";
      try {
        const info = await provedorGitHub({ repo: REPO_APP, token }).preparar();
        if (info.permissions && info.permissions.push === false) throw new Error("a chave não tem permissão de escrita (Contents: Read and write)");
        gravarLS("dono-config", { repo: REPO_APP, token, conectadoEm: agoraISO() });
        fecharPainel(); telaAjustes(); mostrarAvisoRapido("👑 Modo dono ligado");
      } catch (e) { $("#dono-msg").textContent = "⚠️ " + e.message; }
    };
  };
}

/* ---------- tela de cadernos e pastas arquivados ---------- */
function telaQuestoesArquivadas() {
  definirTopo({ titulo: "📦 Arquivados", voltar: "#/questoes/cadernos" });
  marcarAba("questoes");
  const pastas = pastasDe("questoes").filter(p => p.arquivada);
  const cads = cadernosTradicionais().filter(c => cadernoArquivado(c.id));
  let h = `<div class="secao"><p class="contagem" style="margin-top:0">Cadernos e pastas arquivados não aparecem na tela de Questões${cfgDono() ? " nem para os outros usuários" : ""}. Use o ⋯ para desarquivar.</p></div><ul class="acervo">`;
  for (const p of pastas) h += linhaPasta(p, rotuloQtd("questoes", p.id), "", `#/questoes/pasta/${p.id}`);
  for (const c of cads) h += `<li class="lei-item"><span class="aba"></span><button class="abrir" data-href="#/caderno/${esc(c.id)}"><span class="lei-nome">${esc(c.titulo)}</span>
    <span class="lei-num">${esc(c.materia)} · ${c.questoes.length} questões</span></button><button class="mais" data-menu-cad="${esc(c.id)}" aria-label="Opções do caderno">⋯</button></li>`;
  h += "</ul>";
  if (!pastas.length && !cads.length) h += `<p class="vazio">Nada arquivado.</p>`;
  $("#conteudo").innerHTML = h;
}

/* toque secreto: 15 toques seguidos (até 1,5 s entre um e outro) no título "Configurações" */
const toqueSecreto = { n: 0, ultimo: 0 };
document.addEventListener("click", e => {
  if (!e.target.closest || !e.target.closest("#titulo") || !location.hash.startsWith("#/ajustes")) return;
  if (cfgDono() || lerLS("dono-revelado", false)) return;
  const agora = Date.now();
  toqueSecreto.n = agora - toqueSecreto.ultimo <= 1500 ? toqueSecreto.n + 1 : 1;
  toqueSecreto.ultimo = agora;
  if (toqueSecreto.n >= 15) {
    toqueSecreto.n = 0;
    gravarLS("dono-revelado", true);
    telaAjustes();
    mostrarAvisoRapido("👑 Opções de dono do app reveladas");
    setTimeout(() => $("#secao-dono")?.scrollIntoView({ block: "center" }), 400);
  }
});
