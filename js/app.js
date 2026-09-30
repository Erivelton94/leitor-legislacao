/* =====================================================================
   CLIQUES GERAIS E NAVEGAÇÃO
   ===================================================================== */
document.addEventListener("click", async e => {
  const t = e.target;
  const grifo = t.closest("mark.grifo[data-grifo]");
  const ft = t.closest("[data-fonte-tinta]");
  if (ft) { ajustes.fonte = Number(ft.dataset.fonteTinta); aplicarAjustes(); const art = ft.closest(".artigo")?.dataset.art; setTimeout(() => art && irParaArtigo(art, false), 50); return; }
  if (caneta.ativa && t.closest("#texto-lei")) return;          // com a caneta ligada, tocar no texto não abre menus
  if (grifo && !window.getSelection()?.toString()) { menuGrifo(grifo.dataset.grifo); return; }
  const menu = t.closest("[data-menu]");
  if (menu) { menuArtigo(menu.dataset.menu); return; }
  const notas = t.closest("[data-notas]");
  if (notas) { painelNotasArtigo(notas.dataset.notas); return; }
  const abrir = t.closest("[data-abrir]");
  if (abrir) { location.hash = "#/lei/" + abrir.dataset.abrir; return; }
  const mp = t.closest("[data-menu-pasta]");
  if (mp) { menuPasta(mp.dataset.menuPasta, () => rotear()); return; }
  const mc = t.closest("[data-menu-cad]");
  if (mc) { menuCaderno(mc.dataset.menuCad); return; }
  const iq = t.closest("[data-ir-q]");
  if (iq && sessao) { telaCaderno(sessao.tipo, sessao.chaveOrig, "questoes", iq.dataset.irQ); window.scrollTo(0, 0); return; }
  const menuL = t.closest("[data-menu-lei]");
  if (menuL) { menuLei(menuL.dataset.menuLei); return; }
  const href = t.closest("[data-href]");
  if (href) { fecharPainel(); location.hash = href.dataset.href; return; }
  const ed = t.closest("[data-editar-nota]");
  if (ed) { editorAnotacao(estado.itens.get(ed.dataset.editarNota)); return; }
  const ap = t.closest("[data-apagar-nota]");
  if (ap) {
    if (!confirm("Apagar esta anotação e as imagens dela?")) return;
    const n = estado.itens.get(ap.dataset.apagarNota);
    await apagarItem(n.id);
    if (leiAberta === n.lei && n.art) repintarArtigo(n.lei, n.art);
    if ($("#painel-caixa").contains(ap)) { if (leiAberta && n.art) painelNotasArtigo(n.art); else fecharPainel(); }
    if (!leiAberta) rotear();
    return;
  }
  const apg = t.closest("[data-apagar-grifo]");
  if (apg) { if (confirm("Apagar este grifo?")) { await apagarItem(apg.dataset.apagarGrifo); rotear(); } return; }
  const fr = t.closest("[data-fav-resumo]");
  if (fr) {
    await carregarResumos();
    const r = resumos.lista.get(fr.dataset.favResumo);
    if (r) { r.favorito = !r.favorito; await salvarMeta(r, false); await bdGravar("resumos", { ...r, atualizadoEm: agoraISO() }); r.atualizadoEm = agoraISO(); }
    fr.setAttribute("aria-pressed", !!r?.favorito);
    fr.textContent = fr.classList.contains("estrela") ? (r?.favorito ? "★" : "☆") : (r?.favorito ? "★ Favorito" : "☆ Favoritar");
    return;
  }
  const mpr = t.closest("[data-menu-pasta-res]");
  if (mpr) { const [tp, m, n] = mpr.dataset.menuPastaRes.split("|"); menuPastaResumo(tp, m, n); return; }
  const mr = t.closest("[data-menu-resumo]");
  if (mr) { await carregarResumos(); menuResumo(mr.dataset.menuResumo); return; }
  const apt = t.closest("[data-apagar-tinta]");
  if (apt) { if (confirm("Apagar os desenhos e ícones deste artigo?")) { await apagarItem(apt.dataset.apagarTinta); rotear(); } return; }
  const desf = t.closest("[data-desfavoritar]");
  if (desf) { await apagarItem(desf.dataset.desfavoritar); rotear(); return; }
  const vm = t.closest("[data-ver-mudanca]");
  if (vm) { painelMudanca(vm.dataset.verMudanca); return; }
  const aa = t.closest("[data-atualizar-ancora]");
  if (aa) { await ancorarNaVersaoAtual(aa.dataset.atualizarAncora); fecharPainel(); return; }
  const ir = t.closest("[data-ir]");
  if (ir) {
    const [id, art] = ir.dataset.ir.split("|");
    fecharPainel();
    if (leiAberta === id) irParaArtigo(art); else location.hash = `#/lei/${id}/${encodeURIComponent(art)}`;
    return;
  }
  const aba = t.closest("#abas button");
  if (aba) {
    raizNav = true;
    const alvo = "#/" + aba.dataset.rota;
    if (location.hash === alvo) rotear(); else location.hash = alvo;
  }
});

async function rotear() {
  if (window.salvarResumoPendente) { await window.salvarResumoPendente(); window.salvarResumoPendente = null; }   // nada se perde ao sair do editor
  if (!location.hash.startsWith("#/resumo/")) { window.onscroll = null; resumoAberto = null; alternarFocoResumo(false); removerDock(); }
  if (ouvir.ativo) pararOuvir();
  zerarZoom();
  fecharVisor();
  registrarNavegacao();
  const voltou = voltandoNav, y = pilhaNav[pilhaNav.length - 1]?.y || 0;
  const destino = location.hash.replace(/^#\/?/, "").split("/");
  if (caneta.ativa && !(destino[0] === "lei" && destino[1] === leiAberta)) alternarCaneta(false);
  if (destino[0] !== "lei") document.body.classList.remove("tela-cheia");
  await rotearTela();
  if (voltou && y && destino[0] !== "lei") requestAnimationFrame(() => window.scrollTo(0, y));   // volta à mesma altura da lista
}
async function rotearTela() {
  fecharPainel();
  if (cronometro) clearInterval(cronometro.intervalo);
  esconderBarra();
  mostrarAvisoOffline();
  const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (partes[0] === "lei" && partes[1]) {
    if (leiAberta === partes[1] && partes[2] && document.getElementById("texto-lei") && !document.querySelector(".revisao")) { irParaArtigo(partes[2]); return; }
    window.scrollTo(0, 0);
    return telaLei(partes[1], partes[2]);
  }
  window.scrollTo(0, 0);
  leiAberta = null;
  $("#conteudo").classList.remove("modo-leitor");
  if (partes[0] === "alteracoes" && partes[1]) return telaAlteracoes(partes[1]);
  if (partes[0] === "pesquisar") return telaPesquisar();
  if (partes[0] === "questoes") return telaQuestoes(partes[1] === "pasta" ? partes[2] : null);
  if (partes[0] === "estatisticas") return telaEstatisticasGerais();
  if (partes[0] === "caderno" && partes[1]) return telaCaderno("caderno", partes[1], partes[2] === "questao" ? "questoes" : (partes[2] || "questoes"), partes[2] === "questao" ? partes[3] : null);
  if (partes[0] === "questoes-artigo" && partes[2]) return telaCaderno("artigo", partes[1] + "|" + partes[2], "questoes");
  if (partes[0] === "estudos") {
    if (partes[1] === "alterados" && partes[2]) { sessionStorage.setItem("filtro-mudou-" + partes[2], "1"); return telaEstudos("lei", partes[2], "anotacoes"); }
    return telaEstudos(partes[1] || "", partes[2] || "", partes[3] || "anotacoes");
  }
  if (partes[0] === "ajustes") return telaAjustes();
  if (partes[0] === "catalogo") return telaCatalogo();
  if (partes[0] === "revisao" && partes[1]) return telaRevisao(partes[1]);
  if (partes[0] === "resumos") return partes[1] === "materia" ? telaResumos("todas", partes[2] || "", partes[3] || "") : telaResumos(partes[1] || "todas");
  if (partes[0] === "resumo" && partes[1]) return partes[2] === "editar" ? telaResumoEditar(partes[1]) : telaResumoLer(partes[1]);
  if (partes[0] === "acervo" && partes[1] === "pasta") return telaAcervo(partes[2]);
  if (partes[0] === "acervo" && partes[1] === "favoritas") return telaAcervo("favoritas");
  return telaAcervo();
}
window.addEventListener("hashchange", rotear);

async function atualizarTudo() {
  await carregarStatus();
  mostrarAvisoOffline();
  await migrarAcervo();
  const ids = idsAcervo();                   // só as leis do seu acervo são baixadas
  const pendentes = ids.filter(id => estado.status[id].hash && (!estado.info[id] || estado.info[id].hash !== estado.status[id].hash));
  if (pendentes.length && !leiAberta && (!location.hash || location.hash === "#/acervo")) telaAcervo();
  for (const id of pendentes) await sincronizarLei(id);
  await carregarQuestoes();
  // as leis do acervo são carregadas na memória aos poucos, depois que a tela já apareceu
  setTimeout(async () => { for (const id of ids) { await leiDoCache(id); await new Promise(r => setTimeout(r, 30)); } }, 600);
}

/* Lembrete de backup: tudo fica só neste aparelho. Uma vez por dia, se o último backup
   tiver mais de 7 dias (ou nunca tiver sido feito), o app lembra na abertura. */
async function lembrarBackup() {
  const ult = lerLS("ultimo-backup", null);
  const TIPOS_ESTUDO = ["grifo", "anotacao", "tinta", "resposta", "favorito", "notaq"];
  const temDados = [...estado.itens.values()].some(i => !i.apagado && TIPOS_ESTUDO.includes(i.tipo)) || (await bdTodos("resumos")).some(r => !r.apagado);
  const dias = ult ? Math.floor((Date.now() - Date.parse(ult)) / 864e5) : Infinity;
  const hoje = new Date().toISOString().slice(0, 10);
  if (!temDados || dias < 7 || lerLS("lembrete-backup-dia", "") === hoje) return;
  gravarLS("lembrete-backup-dia", hoje);
  abrirPainel(`<h2>💾 Hora do backup ${botaoFechar}</h2>
    <p>${ult ? `Seu último backup foi há <strong>${dias} dias</strong> (${esc(dataHora(ult))}).` : "Você ainda <strong>não fez nenhum backup</strong>."}
    Suas leis, marcações, questões e resumos ficam só neste aparelho; o backup completo guarda tudo num único arquivo.</p>
    <div class="acoes"><button class="botao primario" id="lemb-fazer">Fazer o backup completo agora</button>
      <button id="lemb-depois" data-fechar>Lembrar amanhã</button></div>
    <p class="contagem">Dica: salve o arquivo no iCloud Drive ou no Google Drive.</p>`);
  $("#lemb-fazer").onclick = () => { fecharPainel(); exportarBackup(); };
}
async function iniciar() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { await abrirBD(); await carregarItens(); }
  catch { alert("Não foi possível abrir o armazenamento de anotações neste navegador. Grifos e anotações não serão salvos."); }
  await atualizarTudo();
  rotear();
  const restaurado = sessionStorage.getItem("aviso-restaurado");
  if (!restaurado) lembrarBackup();
  if (restaurado) {
    sessionStorage.removeItem("aviso-restaurado");
    abrirPainel(`<h2>Backup importado ${botaoFechar}</h2><p>${restaurado === "exato"
      ? "O app foi restaurado exatamente como estava no backup: leis, anotações, grifos, desenhos, questões, resumos e preferências."
      : "O backup foi juntado ao que já existia: em cada item ficou a versão mais recente, e as leis e cadernos que faltavam foram acrescentados."}</p>`);
  }
}
/* Zoom com os dedos: as barras ficam paradas no mesmo lugar da tela e no mesmo tamanho.
   A camada acompanha a parte visível (visualViewport) e desfaz a ampliação só nela. */
function ajustarCamadaAoZoom() {
  const c = $("#camada-fixa"), vv = window.visualViewport;
  if (!c) return;
  c.style.width = window.innerWidth + "px";
  c.style.height = window.innerHeight + "px";
  c.style.transform = vv && Math.abs(vv.scale - 1) > 0.01
    ? `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / vv.scale})`
    : "translate(0px, 0px)";
}
if (window.visualViewport) { visualViewport.addEventListener("resize", ajustarCamadaAoZoom); visualViewport.addEventListener("scroll", ajustarCamadaAoZoom); }
window.addEventListener("resize", ajustarCamadaAoZoom);
setTimeout(ajustarCamadaAoZoom, 0);
let ultimaAtualizacao = Date.now();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && window.salvarResumoPendente) window.salvarResumoPendente(); });
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || Date.now() - ultimaAtualizacao < 180000) return;
  ultimaAtualizacao = Date.now();
  const antes = JSON.stringify(estado.info);
  await atualizarTudo();
  if (JSON.stringify(estado.info) !== antes) rotear();
});
iniciar();
