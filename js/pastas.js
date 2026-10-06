/* =====================================================================
   PASTAS — iguais em Leis, Questões e Resumos
   - Pastas dentro de pastas, sem limite de níveis (campo "pai").
   - Renomear, mover (para o início ou para dentro de outra pasta),
     fixar no topo, arquivar, apagar só a pasta (o que tem dentro sobe
     um nível) ou mandar a pasta inteira para a lixeira.
   - Leis e cadernos: a pasta guarda a lista (leis[] / cadernos[]).
     Resumos: cada resumo guarda a sua pasta (r.pasta).
   ===================================================================== */
const NOMES_AREA = { leis: "Leis", questoes: "Questões", resumos: "Resumos" };
const campoPasta = area => (area === "questoes" ? "cadernos" : "leis");
const pastaViva = p => !!p && p.tipo === "pasta" && !p.apagado && !p.lixeira;
function paiDe(p) { const q = p.pai && estado.itens.get(p.pai); return pastaViva(q) ? p.pai : null; }
const ordemPastas = (a, b) => (b.fixada ? 1 : 0) - (a.fixada ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
/* todas as pastas da área (fora da lixeira); com "pai", só as que estão diretamente dentro dele (null = início) */
function pastasDe(area, pai) {
  return itens("pasta", p => (p.area || "leis") === area && !p.lixeira && (pai === undefined || paiDe(p) === (pai || null))).sort(ordemPastas);
}
function descendentes(id) {
  const out = [], vistos = new Set([id]);
  const area = estado.itens.get(id)?.area || "leis";
  const todas = itens("pasta", p => (p.area || "leis") === area && !p.lixeira);
  const visitar = pai => { for (const p of todas) if (p.pai === pai && !vistos.has(p.id)) { vistos.add(p.id); out.push(p.id); visitar(p.id); } };
  visitar(id);
  return out;
}
function caminhoPasta(id) {
  const out = [], vistos = new Set();
  let p = estado.itens.get(id);
  while (pastaViva(p) && !vistos.has(p.id)) { vistos.add(p.id); out.unshift(p); p = estado.itens.get(paiDe(p)); }
  return out;
}
const textoCaminho = id => caminhoPasta(id).map(p => p.nome).join(" › ");
function rotaPastaArea(area, id) {
  const base = { leis: "#/acervo", questoes: "#/questoes", resumos: "#/resumos" }[area];
  return id ? `${base}/pasta/${id}` : base;
}
function trilhaPasta(area, id) {
  const cam = caminhoPasta(id);
  if (!cam.length) return "";
  const inicio = { leis: "Meu Acervo", questoes: "Questões", resumos: "Meus Resumos" }[area];
  return `<p class="trilha"><a href="${rotaPastaArea(area)}">${inicio}</a>${cam.map((p, k) => ` › ${k === cam.length - 1 ? esc(p.nome) : `<a href="${rotaPastaArea(area, p.id)}">${esc(p.nome)}</a>`}`).join("")}</p>`;
}
const voltarDaPasta = (area, id) => { const p = estado.itens.get(id); return rotaPastaArea(area, p ? paiDe(p) : null); };

/* ---------- onde está cada item ---------- */
function pastaDoItem(area, itemId) {
  if (area === "resumos") { const r = resumos.lista?.get(itemId); return r && pastaViva(estado.itens.get(r.pasta)) ? r.pasta : null; }
  const campo = campoPasta(area);
  return pastasDe(area).find(p => (p[campo] || []).includes(itemId))?.id || null;
}
/* ids que estão em alguma pasta (as que ficam de fora aparecem no início) */
function idsEmPastas(area) {
  const campo = campoPasta(area);
  return new Set(pastasDe(area).flatMap(p => p[campo] || []));
}
function itensDaPasta(area, pastaId) {
  if (area === "resumos") return resumosAtivos().filter(r => (pastaViva(estado.itens.get(r.pasta)) ? r.pasta : null) === (pastaId || null)).map(r => r.id);
  if (!pastaId) { const em = idsEmPastas(area); return (area === "leis" ? idsAcervo() : Object.keys(estado.cadernos)).filter(id => !em.has(id)); }
  const p = estado.itens.get(pastaId);
  const existe = area === "leis" ? id => noAcervo(id) : id => !!estado.cadernos[id];
  return (p?.[campoPasta(area)] || []).filter(existe);
}
/* quantos itens há dentro (contando as subpastas) */
function totalNaPasta(area, id) {
  return [id, ...descendentes(id)].reduce((s, pid) => s + itensDaPasta(area, pid).length, 0);
}
function rotuloQtd(area, id) {
  const subs = pastasDe(area, id).filter(p => !p.arquivada).length;
  const n = totalNaPasta(area, id);
  const nome = { leis: "lei(s)", questoes: "caderno(s)", resumos: "arquivo(s)" }[area];
  return `${n} ${nome}${subs ? ` · ${subs} subpasta(s)` : ""}`;
}

/* ---------- criar, mover, apagar ---------- */
async function novaPasta(area, pai = null, nome = null) {
  if (nome === null) {
    const ex = { leis: "Direito Penal, Legislação Especial", questoes: "Polícia Civil – PE, Direito Penal", resumos: "Direito Penal, Homicídio" }[area];
    nome = prompt(`Nome da ${pai ? "subpasta" : "pasta"} (ex.: ${ex}):`);
  }
  if (!nome || !nome.trim()) return null;
  return salvarItem({ id: uid(), tipo: "pasta", area, nome: nome.trim(), pai: pai || null, leis: [], cadernos: [] });
}
async function moverParaPasta(area, itemId, pastaId) {
  if (area === "resumos") {
    const r = resumos.lista.get(itemId); if (!r) return;
    r.pasta = pastaId || ""; delete r.materia; delete r.assunto;
    await salvarMeta(r);
    return;
  }
  const campo = campoPasta(area);
  for (const p of itens("pasta", p => (p.area || "leis") === area)) {
    const tem = (p[campo] || []).includes(itemId);
    if (p.id === pastaId && !tem) { p[campo] = [...(p[campo] || []), itemId]; await salvarItem(p); }
    else if (p.id !== pastaId && tem) { p[campo] = p[campo].filter(x => x !== itemId); await salvarItem(p); }
  }
}
async function moverPasta(id, novoPai) {
  const p = estado.itens.get(id);
  if (!p || id === novoPai || descendentes(id).includes(novoPai)) return false;      // não entra dentro dela mesma
  p.pai = novoPai || null;
  await salvarItem(p);
  return true;
}
/* apagar só a pasta: o que está dentro (arquivos e subpastas) vai para a pasta de cima */
async function apagarSoPasta(id) {
  const p = estado.itens.get(id), area = p.area || "leis", pai = paiDe(p);
  for (const f of pastasDe(area, id)) { f.pai = pai; await salvarItem(f); }
  for (const item of itensDaPasta(area, id)) await moverParaPasta(area, item, pai);
  await apagarItem(id);
}
/* pasta inteira para a lixeira (com as subpastas e tudo o que está dentro); restaura junto */
async function pastaParaLixeira(id) {
  const p = estado.itens.get(id), area = p.area || "leis";
  const gid = uid().slice(0, 12), em = agoraISO();
  if (area === "resumos") await tirarDoArSeDono([], id);
  const todas = [id, ...descendentes(id)];
  for (const pid of todas) {
    const itensDentro = itensDaPasta(area, pid);
    if (area === "resumos") for (const rid of itensDentro) await resumoParaLixeira(resumos.lista.get(rid), gid);
    if (area === "leis") for (const lei of itensDentro) await leiParaLixeira(lei, gid);
    if (area === "questoes") for (const cid of itensDentro) await excluirCaderno(cid, gid);
  }
  for (const pid of todas) { const q = estado.itens.get(pid); await salvarItem({ ...q, lixeira: { em, grupo: gid, ...(pid === id ? { topo: true } : {}) } }); }
  if (area === "resumos") resumos.textos = null;
  return gid;
}

/* ---------- fixar e arquivar pastas ---------- */
async function alternarFixarPasta(id) { const p = estado.itens.get(id); p.fixada = !p.fixada; await salvarItem(p); }
async function alternarArquivarPasta(id) {
  const p = estado.itens.get(id);
  if ((p.area || "leis") === "questoes") return arquivarPasta(id, !p.arquivada);   // tira dos outros usuários, se for o dono
  if (p.area === "resumos" && !p.arquivada) await tirarDoArSeDono([], id);
  const q = estado.itens.get(id);                                      // (pode ter mudado ao sair do app dos outros)
  await salvarItem({ ...q, arquivada: !q.arquivada, arquivadaEm: q.arquivada ? null : agoraISO() });
}

/* ---------- escolher uma pasta (árvore com todos os níveis) ---------- */
function htmlArvorePastas(area, { excluir = [], atual = undefined, prefixo = "data-dest" } = {}) {
  const proibidas = new Set(excluir.flatMap(id => [id, ...descendentes(id)]));
  const linhas = [];
  const descer = (pai, nivel) => {
    for (const p of pastasDe(area, pai)) {
      if (proibidas.has(p.id)) continue;
      linhas.push(`<button class="no-arvore" ${prefixo}="${esc(p.id)}" style="--nivel:${nivel}">${atual === p.id ? "✓ " : ""}${nivel ? "└ " : ""}📁 ${esc(p.nome)}${p.arquivada ? " 📦" : ""}</button>`);
      descer(p.id, nivel + 1);
    }
  };
  descer(null, 0);
  return linhas.join("");
}
function escolherPasta(area, titulo, aoEscolher, { excluir = [], atual = undefined, incluirRaiz = true, textoRaiz = "Início (fora das pastas)" } = {}) {
  abrirPainel(`<h2>${esc(titulo)} ${botaoFechar}</h2>
    <div class="acoes arvore-pastas">
      ${incluirRaiz ? `<button class="no-arvore" data-dest="" style="--nivel:0">${atual === null ? "✓ " : ""}🏠 ${esc(textoRaiz)}</button>` : ""}
      ${htmlArvorePastas(area, { excluir, atual })}
      <button id="dest-nova">+ Criar pasta nova no início…</button>
    </div>`);
  $$("#painel-caixa [data-dest]").forEach(b => b.onclick = () => aoEscolher(b.dataset.dest || null));
  $("#dest-nova").onclick = async () => { const p = await novaPasta(area, null); if (p) await aoEscolher(p.id); };
}
function painelMover(area, itemId, nomeItem, depois) {
  escolherPasta(area, `Mover “${nomeItem}” para…`, async dest => { await moverParaPasta(area, itemId, dest); fecharPainel(); depois(); },
    { atual: pastaDoItem(area, itemId) });
}

/* ---------- menu da pasta (o mesmo nas três áreas) ---------- */
function menuPasta(id, depois = () => rotear()) {
  const p = estado.itens.get(id);
  if (!p) return;
  const area = p.area || "leis";
  const n = totalNaPasta(area, id), subs = descendentes(id).length;
  const doApp = area === "questoes" && !cfgDono() && [id, ...descendentes(id)].some(pid => itensDaPasta(area, pid).some(c => !estado.cadernos[c]?.local));
  abrirPainel(`<h2>📁 ${esc(p.nome)} ${botaoFechar}</h2>
    ${caminhoPasta(id).length > 1 ? `<p class="contagem" style="margin-top:0">Em: ${esc(caminhoPasta(id).slice(0, -1).map(x => x.nome).join(" › "))}</p>` : ""}
    <div class="acoes">
      <button id="pu-abrir" data-href="${rotaPastaArea(area, id)}">📂 Abrir</button>
      <button id="pu-sub">+ Nova subpasta dentro dela</button>
      <button id="pu-renomear">✏️ Renomear</button>
      <button id="pu-mover">📁 Mover a pasta…</button>
      <button id="pu-fixar">${p.fixada ? "📌 Desafixar do topo" : "📌 Fixar no topo"}</button>
      ${botoesVisivelPasta(p)}
      <button id="pu-arquivar">${p.arquivada ? "📤 Desarquivar" : "📦 Arquivar (some da lista; fica em Arquivados)"}</button>
      <button id="pu-apagar">Apagar só a pasta (${n} item(ns)${subs ? ` e ${subs} subpasta(s)` : ""} vão para ${paiDe(p) ? "a pasta de cima" : "o início"})</button>
      <button id="pu-lixeira" style="color:var(--alt)">🗑 Mandar a pasta e tudo o que está dentro para a lixeira</button>
    </div>
    <p class="contagem">${area === "leis" ? "Na lixeira, a pasta e as leis dela ficam 30 dias e voltam juntas ao restaurar (as leis são baixadas de novo). Suas marcações nunca são apagadas."
      : area === "questoes" ? (cfgDono() ? "Pasta arquivada ou excluída: os cadernos dela deixam de aparecer para os outros usuários." : doApp ? "Cadernos do app (publicados pelo dono) não vão para a lixeira: ficam arquivados para você." : "Na lixeira, tudo fica 30 dias e volta junto ao restaurar.")
      : "Na lixeira, a pasta e os arquivos ficam 30 dias e voltam juntos ao restaurar."}</p>`);
  $("#pu-sub").onclick = async () => { const s = await novaPasta(area, id); if (s) { fecharPainel(); location.hash = rotaPastaArea(area, id); rotear(); } };
  $("#pu-renomear").onclick = async () => {
    const nome = prompt("Novo nome da pasta:", p.nome);
    if (!nome || !nome.trim()) return;
    p.nome = nome.trim(); await salvarItem(p); fecharPainel(); depois();
  };
  $("#pu-mover").onclick = () => escolherPasta(area, `Mover a pasta “${p.nome}” para…`, async dest => {
    if (!(await moverPasta(id, dest))) { alert("Não dá para colocar a pasta dentro dela mesma."); return; }
    fecharPainel(); depois(); mostrarAvisoRapido(`📁 Pasta movida para ${dest ? textoCaminho(dest) : "o início"}`);
  }, { excluir: [id], atual: paiDe(p), textoRaiz: "Início (pasta principal)" });
  $("#pu-fixar").onclick = async () => { await alternarFixarPasta(id); fecharPainel(); depois(); };
  ligarVisivelPasta(p, depois);
  $("#pu-arquivar").onclick = async () => {
    const era = p.arquivada;
    try { await alternarArquivarPasta(id); fecharPainel(); if (!era && location.hash.includes(id)) location.hash = voltarDaPasta(area, id); else depois(); mostrarAvisoRapido(era ? "📤 Pasta desarquivada" : "📦 Pasta arquivada"); }
    catch (e) { alert("Não foi possível: " + e.message); }
  };
  $("#pu-apagar").onclick = async () => {
    if (!confirm(`Apagar a pasta "${p.nome}"? O que está dentro NÃO é apagado: vai para ${paiDe(p) ? "a pasta de cima" : "o início"}.`)) return;
    const volta = voltarDaPasta(area, id);
    await apagarSoPasta(id); fecharPainel(); irParaRota(volta);
  };
  $("#pu-lixeira").onclick = async () => {
    if (!confirm(`Mandar a pasta "${p.nome}" e tudo o que está dentro (${n} item(ns)${subs ? `, ${subs} subpasta(s)` : ""}) para a lixeira? Dá para restaurar por 30 dias.`)) return;
    const volta = voltarDaPasta(area, id);
    try { await pastaParaLixeira(id); } catch (e) { alert("Não foi possível: " + e.message); return; }
    fecharPainel(); irParaRota(volta);
    mostrarAvisoRapido(`🗑 Pasta "${p.nome}" foi para a lixeira`);
  };
}
const irParaRota = h => { if (location.hash === h) rotear(); else location.hash = h; };
const ICONE_PASTA = `<svg class="ico-pasta" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>`;
function linhaPasta(p, qtd, rotulo, destino) {
  const texto = rotulo === "" ? qtd : `${qtd} ${rotulo}`.trim();
  return `<li class="lei-item pasta-item"${p.id ? ` data-sel-pasta="${esc(p.id)}"` : ""}><span class="aba"></span>
    <button class="abrir" data-href="${esc(destino)}"><span class="lei-nome">${ICONE_PASTA}${p.fixada ? '<span class="lei-pin" title="Fixada no topo">📌</span> ' : ""}${esc(p.nome)}${p.arquivada ? " 📦" : ""}</span><span class="lei-num">${texto}</span></button>
    ${p.id ? `<button class="mais" data-menu-pasta="${esc(p.id)}" aria-label="Opções da pasta ${esc(p.nome)}">⋯</button>` : "<span></span>"}</li>`;
}

/* ---------- lixeira das leis ---------- */
const idLixoLei = id => "lixo|lei|" + id;
async function leiParaLixeira(id, grupo = null) {
  const pasta = pastaDoItem("leis", id);
  await salvarItem({ id: idLixoLei(id), tipo: "lixeira-lei", lei: id, nome: nomeLei(id), em: agoraISO(), pasta: pasta || "", ...(grupo ? { grupo } : {}) });
  await apagarItem(idAcervo(id));
  try { const cache = await caches.open(CACHE_DADOS); await cache.delete(urlLei(id)); } catch {}
  delete estado.leis[id]; delete estado.info[id]; gravarLS("info-leis", estado.info);
  delete estado.alteracoes[id]; gravarLS("alteracoes-nao-vistas", estado.alteracoes);
  if (!grupo) await moverParaPasta("leis", id, "");        // sozinha: sai da pasta (volta para ela ao restaurar)
}
async function restaurarLei(id) {
  const l = estado.itens.get(idLixoLei(id));
  await salvarItem({ id: idAcervo(id), tipo: "acervo", lei: id });
  if (l?.pasta && pastaViva(estado.itens.get(l.pasta)) && !l.grupo) await moverParaPasta("leis", id, l.pasta);
  if (l) await apagarItem(l.id);
  try { await sincronizarLei(id); await leiDoCache(id); } catch {}       // sem internet: baixa depois
}
const leisNaLixeira = () => itens("lixeira-lei");

/* ---------- arquivar leis (some do acervo; fica em Arquivadas) ---------- */
const idLeiArquivada = id => "arquivado|lei|" + id;
const leiArquivada = id => { const i = estado.itens.get(idLeiArquivada(id)); return !!i && !i.apagado; };
async function alternarArquivarLei(id, arquivar = !leiArquivada(id)) {
  if (arquivar) await salvarItem({ id: idLeiArquivada(id), tipo: "arquivado", area: "leis", alvo: id, em: agoraISO() });
  else if (leiArquivada(id)) await apagarItem(idLeiArquivada(id));
}

/* ---------- fixar cadernos no topo e ordem dos cadernos ---------- */
const idCadFixado = id => "fixado|caderno|" + id;
const cadernoFixado = id => { const i = estado.itens.get(idCadFixado(id)); return !!i && !i.apagado; };
async function alternarFixarCaderno(id, fixar = !cadernoFixado(id)) {
  if (fixar) await salvarItem({ id: idCadFixado(id), tipo: "fixado", area: "questoes", alvo: id, em: agoraISO() });
  else if (cadernoFixado(id)) await apagarItem(idCadFixado(id));
}
/* 1º os fixados · 2º os que você mexeu por último (respondeu questões) · depois os demais, na ordem de sempre */
function ordenarCadernos(lista) {
  const ultimo = new Map();
  for (const r of itens("resposta")) {
    const cad = estado.q.get(r.q)?.caderno || r.caderno;
    const t = r.em || r.atualizadoEm || "";
    if (cad && t > (ultimo.get(cad) || "")) ultimo.set(cad, t);
  }
  const base = lista.slice();
  return lista.slice().sort((a, b) => {
    const fa = cadernoFixado(a.id) ? 0 : 1, fb = cadernoFixado(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const ta = ultimo.get(a.id) || "", tb = ultimo.get(b.id) || "";
    if (ta !== tb) return ta && tb ? tb.localeCompare(ta) : ta ? -1 : 1;
    return base.indexOf(a) - base.indexOf(b);
  });
}

/* =====================================================================
   SELECIONAR VÁRIOS (Leis e Questões): mover, fixar, arquivar, remover
   ===================================================================== */
const selLista = { ativa: false, area: null, ids: new Set(), pastas: new Set() };
function botaoSelecionar(area) { return `<button class="botao" id="selecionar-lista" data-area-sel="${area}">${selLista.ativa && selLista.area === area ? "✕ Cancelar seleção" : "☑️ Selecionar"}</button>`; }
function ligarBotaoSelecionar() {
  const b = $("#selecionar-lista");
  if (b) b.onclick = () => alternarSelecaoLista(b.dataset.areaSel);
  if (selLista.ativa) { $("#conteudo .acervo")?.classList.add("selecionando"); marcarSelecionadosNaTela(); atualizarBarraLista(); }
}
function alternarSelecaoLista(area, ligar = !(selLista.ativa && selLista.area === area)) {
  selLista.ativa = ligar; selLista.area = area; selLista.ids.clear(); selLista.pastas.clear();
  $$("#conteudo .acervo").forEach(u => u.classList.toggle("selecionando", ligar));
  $$("#conteudo .lei-item.marcado").forEach(t => t.classList.remove("marcado"));
  const btn = $("#selecionar-lista"); if (btn) btn.textContent = ligar ? "✕ Cancelar seleção" : "☑️ Selecionar";
  atualizarBarraLista();
}
function marcarSelecionadosNaTela() {
  $$("#conteudo .lei-item").forEach(li => {
    const id = li.dataset.selId, pid = li.dataset.selPasta;
    li.classList.toggle("marcado", (id && selLista.ids.has(id)) || (pid && selLista.pastas.has(pid)));
  });
}
function atualizarBarraLista() {
  let b = $("#barra-sel-lista");
  if (!selLista.ativa) { b?.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "barra-sel-lista"; b.className = "barra-sel-res"; ($("#camada-fixa") || document.body).appendChild(b); }
  const n = selLista.ids.size + selLista.pastas.size, dis = n ? "" : "disabled";
  const area = selLista.area;
  b.innerHTML = `<span class="sel-n">${n} selecionado(s)</span>
    <button data-sel-l="todos">Todos</button>
    <button data-sel-l="mover" ${dis}>📁 Mover</button>
    <button data-sel-l="fixar" ${dis}>📌 Fixar</button>
    <button data-sel-l="arquivar" ${dis}>📦 Arquivar</button>
    <button data-sel-l="remover" ${dis} style="color:var(--alt)">🗑 ${area === "leis" ? "Remover" : "Excluir"}</button>
    <button data-sel-l="sair">✕</button>`;
  b.onclick = e => { const x = e.target.closest("[data-sel-l]"); if (x) acaoSelecaoLista(x.dataset.selL); };
}
async function acaoSelecaoLista(acao) {
  const area = selLista.area, ids = [...selLista.ids], pastas = [...selLista.pastas];
  const terminar = msg => { alternarSelecaoLista(area, false); fecharPainel(); rotear(); if (msg) mostrarAvisoRapido(msg); };
  if (acao === "sair") return alternarSelecaoLista(area, false);
  if (acao === "todos") {
    const linhas = $$("#conteudo .acervo .lei-item").filter(li => li.dataset.selId || li.dataset.selPasta);
    const marcar = selLista.ids.size + selLista.pastas.size < linhas.length;
    selLista.ids.clear(); selLista.pastas.clear();
    if (marcar) linhas.forEach(li => li.dataset.selId ? selLista.ids.add(li.dataset.selId) : selLista.pastas.add(li.dataset.selPasta));
    marcarSelecionadosNaTela(); return atualizarBarraLista();
  }
  if (acao === "mover") return escolherPasta(area, `Mover ${ids.length + pastas.length} item(ns) para…`, async dest => {
    for (const id of ids) await moverParaPasta(area, id, dest);
    let recusadas = 0;
    for (const pid of pastas) if (!(await moverPasta(pid, dest))) recusadas++;
    terminar(recusadas ? `Movido. ${recusadas} pasta(s) não podiam entrar nelas mesmas.` : "📁 Movido");
  }, { excluir: pastas });
  if (acao === "fixar") {
    const fixado = id => (area === "leis" ? ehFixada(id) : cadernoFixado(id));
    const todos = ids.every(fixado) && pastas.every(pid => estado.itens.get(pid)?.fixada);
    for (const id of ids) { if (area === "leis") { if (ehFixada(id) === todos) await alternarFixada(id); } else await alternarFixarCaderno(id, !todos); }
    for (const pid of pastas) { const p = estado.itens.get(pid); if (!!p.fixada === todos) await alternarFixarPasta(pid); }
    return terminar(todos ? "📌 Desafixado" : "📌 Fixado no topo");
  }
  if (acao === "arquivar") {
    try {
      for (const id of ids) { if (area === "leis") await alternarArquivarLei(id, true); else await arquivarCaderno(id, true); }
      for (const pid of pastas) if (!estado.itens.get(pid).arquivada) await alternarArquivarPasta(pid);
    } catch (e) { alert("Não foi possível arquivar tudo: " + e.message); }
    return terminar("📦 Arquivado");
  }
  if (acao === "remover") {
    const txt = area === "leis" ? `Remover ${ids.length} lei(s)${pastas.length ? ` e ${pastas.length} pasta(s) com tudo dentro` : ""} do acervo? Vão para a lixeira (30 dias para restaurar) e suas marcações continuam guardadas.`
      : `Excluir ${ids.length} caderno(s)${pastas.length ? ` e ${pastas.length} pasta(s) com tudo dentro` : ""}? Vão para a lixeira (30 dias para restaurar).${cfgDono() ? "" : " Cadernos do app ficam arquivados para você."}`;
    if (!confirm(txt)) return;
    try {
      for (const id of ids) { if (area === "leis") await leiParaLixeira(id); else await excluirCaderno(id); }
      for (const pid of pastas) if (pastaViva(estado.itens.get(pid))) await pastaParaLixeira(pid);
    } catch (e) { alert("Não foi possível: " + e.message); }
    return terminar("🗑 Foi para a lixeira");
  }
}
// com a seleção ligada, tocar numa linha marca/desmarca (em vez de abrir)
document.addEventListener("click", e => {
  if (!selLista.ativa || !e.target.closest) return;
  const li = e.target.closest("#conteudo .acervo .lei-item");
  if (!li || (!li.dataset.selId && !li.dataset.selPasta)) return;
  e.preventDefault(); e.stopPropagation();
  const id = li.dataset.selId, pid = li.dataset.selPasta;
  if (id) { if (selLista.ids.has(id)) selLista.ids.delete(id); else selLista.ids.add(id); }
  else if (selLista.pastas.has(pid)) selLista.pastas.delete(pid); else selLista.pastas.add(pid);
  marcarSelecionadosNaTela(); atualizarBarraLista();
}, true);
window.addEventListener("hashchange", () => { if (selLista.ativa) alternarSelecaoLista(selLista.area, false); });
