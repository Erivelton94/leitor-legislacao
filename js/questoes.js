/* =====================================================================
   QUESTÕES
   Cadernos vêm de dados/questoes/ (só baixa quando o hash muda).
   Cada resposta sua é um item "resposta" (entra no backup).
   ===================================================================== */
estado.cadernos = {};
estado.q = new Map();

async function carregarQuestoes() {
  const cache = await caches.open(CACHE_DADOS);
  let indice = null;
  if (!estado.offline) {
    try {
      const r = await buscarComTempo("dados/questoes/indice.json");
      await cache.put("dados/questoes/indice.json", r.clone());
      indice = await r.json();
    } catch { /* ainda não há cadernos publicados */ }
  }
  if (!indice) { const c = await cache.match("dados/questoes/indice.json"); indice = c ? await c.json() : { cadernos: [] }; }
  estado.indiceQ = indice;
  const info = lerLS("info-cadernos", {});
  for (const cad of indice.cadernos) {
    const url = "dados/questoes/" + cad.arquivo;
    const guardado = await cache.match(url);
    if (guardado && info[cad.id] === cad.hash) { estado.cadernos[cad.id] = await guardado.json(); continue; }
    if (!estado.offline) {
      try {
        const r = await buscarComTempo(url, 30000);
        await cache.put(url, r.clone());
        estado.cadernos[cad.id] = await r.json();
        info[cad.id] = cad.hash;
        continue;
      } catch {}
    }
    if (guardado) estado.cadernos[cad.id] = await guardado.json();
  }
  gravarLS("info-cadernos", info);
  for (const loc of lerLS("cadernos-locais", [])) {             // cadernos importados de PDF no próprio app
    if (loc.apagado) { delete estado.cadernos[loc.id]; continue; }
    const g = await cache.match(loc.url);
    if (g) estado.cadernos[loc.id] = { ...(await g.json()), local: true };
  }
  estado.q = new Map();
  for (const c of Object.values(estado.cadernos)) for (const q of c.questoes) { q.caderno = c.id; estado.q.set(q.id, q); }
}

/* ---------- respostas, rodadas e situação ----------
   Cada resposta é guardada para sempre (estatísticas usam todas).
   "Redefinir" cria um marco: as questões voltam a ficar sem resposta na rodada atual. */
function mapaRespostas() {
  const m = new Map();   // qid -> [respostas em ordem]
  for (const r of itens("resposta")) { if (!m.has(r.q)) m.set(r.q, []); m.get(r.q).push(r); }
  for (const l of m.values()) l.sort((a, b) => a.em.localeCompare(b.em));
  m.resets = new Map();  // qid -> data do último "redefinir"
  for (const r of itens("reset")) for (const q of r.ids) if (!m.resets.has(q) || m.resets.get(q) < r.em) m.resets.set(q, r.em);
  return m;
}
function respostaAtual(mapa, qid) {
  const l = mapa.get(qid);
  if (!l || !l.length) return null;
  const ult = l[l.length - 1];
  const marco = mapa.resets.get(qid);
  return marco && ult.em <= marco ? null : ult;
}
function situacaoQ(mapa, qid) {
  const r = respostaAtual(mapa, qid);
  return !r ? "nao" : r.correta ? "certa" : "errada";
}
function jaErrou(mapa, qid) { return (mapa.get(qid) || []).some(r => !r.correta); }
async function redefinirQuestoes(ids) {
  if (ids.length) await salvarItem({ id: uid(), tipo: "reset", ids, em: agoraISO() });
}
const idFavQ = qid => `fav|q|${qid}`;
const idNotaQ = qid => `nq|${qid}`;
function provaQ(q) { return [q.banca, q.ano, [q.cargo, q.orgao, q.area].filter(Boolean).join(" · ")].join(" — "); }
function rotuloVinculo(v) { return v.de === v.ate ? `art. ${v.de}` : `arts. ${v.de} a ${v.ate}`; }
function questoesDoArtigo(leiId, art) {
  return [...estado.q.values()].filter(q => q.vinculo && q.vinculo.lei === leiId &&
    compararArtigos(q.vinculo.de, art) <= 0 && compararArtigos(art, q.vinculo.ate) <= 0);
}

/* ---------- sessões: um caderno ou as questões de um artigo ---------- */
function montarSessao(tipo, chave) {
  if (tipo === "caderno") {
    const c = estado.cadernos[chave];
    if (!c) return null;
    return { chave: "c:" + chave, titulo: c.titulo, materia: c.materia, base: [...c.questoes].sort((a, b) => a.ordem - b.ordem),
             assuntos: c.assuntos, voltar: paiDoCaderno(chave) };
  }
  const [lei, art] = chave.split("|");
  const base = questoesDoArtigo(lei, art);
  return { chave: "a:" + chave, titulo: `Questões — ${rotuloArt(art)} (${nomeLei(lei)})`, materia: "", base,
           assuntos: [...new Set(base.map(q => q.assunto))], voltar: `#/lei/${lei}/${encodeURIComponent(art)}` };
}
function filtrosDe(s) { return Object.assign({ assunto: "", situacao: "", banca: "" }, lerLS("filtros-q", {})[s.chave] || {}); }
function gravarFiltros(s, f) { const t = lerLS("filtros-q", {}); t[s.chave] = f; gravarLS("filtros-q", t); }
function listaFiltrada(s, mapa) {
  const f = filtrosDe(s);
  return s.base.filter(q => (!f.assunto || q.assunto === f.assunto) && (!f.banca || q.banca === f.banca) &&
    (!f.situacao || (f.situacao === "favoritas" ? ehFavorito(idFavQ(q.id))
      : f.situacao === "ja-errei" ? jaErrou(mapa, q.id) : situacaoQ(mapa, q.id) === f.situacao)));
}

/* ---------- pastas (Leis e Questões têm pastas próprias) ---------- */
const campoPasta = area => (area === "questoes" ? "cadernos" : "leis");
function pastasDe(area) {
  return itens("pasta", p => (p.area || "leis") === area).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
async function novaPasta(area) {
  const nome = prompt(area === "questoes" ? "Nome da pasta (ex.: Polícia Civil – PE, Direito Penal):" : "Nome da pasta (ex.: Direito Penal, Legislação Especial):");
  if (!nome || !nome.trim()) return null;
  return salvarItem({ id: uid(), tipo: "pasta", area, nome: nome.trim(), leis: [], cadernos: [] });
}
async function moverParaPasta(area, itemId, pastaId) {
  const campo = campoPasta(area);
  for (const p of pastasDe(area)) {
    const tem = (p[campo] || []).includes(itemId);
    if (p.id === pastaId && !tem) { p[campo] = [...(p[campo] || []), itemId]; await salvarItem(p); }
    else if (p.id !== pastaId && tem) { p[campo] = p[campo].filter(x => x !== itemId); await salvarItem(p); }
  }
}
function painelMover(area, itemId, nomeItem, depois) {
  const campo = campoPasta(area);
  const pastas = pastasDe(area);
  const atual = pastas.find(p => (p[campo] || []).includes(itemId));
  abrirPainel(`<h2>Mover “${esc(nomeItem)}” ${botaoFechar}</h2>
    <div class="acoes">
      <button data-mover-para="" aria-pressed="${!atual}">${!atual ? "✓ " : ""}Fora das pastas</button>
      ${pastas.map(p => `<button data-mover-para="${esc(p.id)}">${atual && atual.id === p.id ? "✓ " : ""}📁 ${esc(p.nome)}</button>`).join("")}
      <button id="mover-nova">+ Criar pasta nova e mover para ela</button>
    </div>`);
  $$("#painel-caixa [data-mover-para]").forEach(b => b.onclick = async () => { await moverParaPasta(area, itemId, b.dataset.moverPara); fecharPainel(); depois(); });
  $("#mover-nova").onclick = async () => { const p = await novaPasta(area); if (p) { await moverParaPasta(area, itemId, p.id); fecharPainel(); depois(); } };
}
function menuPasta(id, depois) {
  const p = estado.itens.get(id);
  abrirPainel(`<h2>📁 ${esc(p.nome)} ${botaoFechar}</h2><div class="acoes">
    <button id="p-renomear">Renomear a pasta</button>
    <button id="p-apagar" style="color:var(--alt)">Apagar a pasta</button></div>
    <p class="contagem">Apagar a pasta não apaga o que está dentro: os itens voltam para fora das pastas.</p>`);
  $("#p-renomear").onclick = async () => {
    const nome = prompt("Novo nome da pasta:", p.nome);
    if (!nome || !nome.trim()) return;
    p.nome = nome.trim(); await salvarItem(p); fecharPainel(); depois();
  };
  $("#p-apagar").onclick = async () => {
    if (!confirm(`Apagar a pasta "${p.nome}"?`)) return;
    await apagarItem(id); fecharPainel(); location.hash = (p.area || "leis") === "questoes" ? "#/questoes" : "#/acervo";
  };
}
const ICONE_PASTA = `<svg class="ico-pasta" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>`;
function linhaPasta(p, qtd, rotulo, destino) {
  return `<li class="lei-item pasta-item"><span class="aba"></span>
    <button class="abrir" data-href="${esc(destino)}"><span class="lei-nome">${ICONE_PASTA}${esc(p.nome)}</span><span class="lei-num">${qtd} ${rotulo}</span></button>
    ${p.id ? `<button class="mais" data-menu-pasta="${esc(p.id)}" aria-label="Opções da pasta ${esc(p.nome)}">⋯</button>` : "<span></span>"}</li>`;
}

/* ---------- tela inicial de Questões (pastas em lista) ---------- */
function telaQuestoes(pastaId = null) {
  const pasta = pastaId ? estado.itens.get(pastaId) : null;
  if (pastaId && (!pasta || pasta.apagado)) { location.hash = "#/questoes"; return; }
  definirTopo({ titulo: pasta ? pasta.nome : "Questões", voltar: pasta ? "#/questoes" : null });
  marcarAba("questoes");
  const cads = Object.values(estado.cadernos);
  if (!cads.length) {
    $("#conteudo").innerHTML = `<div class="vazio">
      <p style="font-family:var(--serif);font-size:22px;color:var(--tinta);margin-bottom:8px">Nenhum caderno de questões ainda</p>
      <p>Importe o PDF de uma lista de questões e o caderno é montado na hora.</p>
      <div class="acoes" style="justify-content:center"><button class="botao primario" id="importar-caderno">📥 Importar caderno (PDF)</button></div></div>`;
    $("#importar-caderno").onclick = painelImportarCaderno;
    return;
  }
  const mapa = mapaRespostas();
  const pastas = pastasDe("questoes");
  const emPasta = new Set(pastas.flatMap(p => p.cadernos || []));
  const visiveis = pasta ? cads.filter(c => (pasta.cadernos || []).includes(c.id)) : cads.filter(c => !emPasta.has(c.id));
  let h = "";
  if (!pasta) {
    const g = estatisticas([...estado.q.values()], mapa);
    h += `<div class="secao"><div class="cartao">
      <p><strong>Seu desempenho:</strong> ${g.respostas} respostas registradas · <span class="txt-ok">${g.acertosTotal} acertos</span> · <span class="txt-erro">${g.errosTotal} erros</span>${g.respostas ? ` · <strong>${g.pctTotal}% de acerto</strong>` : ""}</p>
      <div class="acoes" style="margin-bottom:12px"><a class="botao" href="#/estatisticas" style="color:inherit;text-decoration:none">Ver estatísticas completas</a>
        <button id="nova-pasta-q">+ Nova pasta</button>
        <button id="importar-caderno" class="botao primario">📥 Importar caderno (PDF)</button></div>
    </div></div>`;
  }
  h += `<ul class="acervo">`;
  if (!pasta) for (const p of pastas) h += linhaPasta(p, (p.cadernos || []).filter(id => estado.cadernos[id]).length, "caderno(s)", `#/questoes/pasta/${p.id}`);
  visiveis.forEach((c, i) => {
    const e = estatisticas(c.questoes, mapa);
    h += `<li class="lei-item" style="--cor-aba:${CORES_ABA[(i + 1) % CORES_ABA.length]}"><span class="aba"></span>
      <button class="abrir" data-href="#/caderno/${esc(c.id)}">
        <span class="lei-nome">${esc(c.titulo)}</span>
        <span class="lei-num">${esc(c.materia)} · ${c.questoes.length} questões · ${c.assuntos.length} assuntos</span>
        <span class="barra-prog" aria-hidden="true"><span style="width:${e.total ? Math.round(100 * e.resolvidas / e.total) : 0}%"></span></span>
        <span class="lei-verif">Rodada atual: ${e.resolvidas} de ${e.total} resolvidas · Histórico: ${e.acertosTotal} acertos e ${e.errosTotal} erros${e.respostas ? ` (${e.pctTotal}%)` : ""}</span>
      </button>
      <button class="mais" data-menu-cad="${esc(c.id)}" aria-label="Opções do caderno">⋯</button></li>`;
  });
  h += "</ul>";
  if (pasta && !visiveis.length) h += `<p class="vazio">Pasta vazia. Use o botão ⋯ de um caderno e escolha “Mover para pasta”.</p>`;
  $("#conteudo").innerHTML = h;
  const bn = $("#nova-pasta-q");
  if (bn) bn.onclick = async () => { if (await novaPasta("questoes")) telaQuestoes(); };
  if ($("#importar-caderno")) $("#importar-caderno").onclick = painelImportarCaderno;
}

function menuCaderno(id) {
  const c = estado.cadernos[id];
  const volta = () => rotear();
  abrirPainel(`<h2>${esc(c.titulo)} ${botaoFechar}</h2>
    <div class="acoes">
      <button id="c-mover">📁 Mover para pasta…</button>
      <button id="c-drive">☁️ Enviar ao Google Drive</button>
      <button id="c-baixar">⬇️ Baixar o caderno (arquivo para passar a outra pessoa)</button>
      ${c.local ? '<button id="c-publicar">📤 Publicar este caderno para todos (dono do app)</button><button id="c-excluir" style="color:var(--alt)">Excluir este caderno importado</button>' : ""}
      <button id="c-redefinir">Redefinir o caderno inteiro (todas voltam a ficar sem resposta)</button>
    </div>
    <p class="contagem">Redefinir não apaga nada das estatísticas: todos os acertos e erros continuam registrados.</p>`);
  $("#c-mover").onclick = () => painelMover("questoes", id, c.titulo, volta);
  $("#c-baixar").onclick = () => entregarArquivo(cadernoParaArquivo(c), `${c.titulo}.caderno.json`);
  $("#c-drive").onclick = async () => {
    const b = $("#c-drive"); b.disabled = true; b.textContent = "Enviando ao Google Drive…";
    try { await exportarCadernoParaDrive(id); b.textContent = "✓ Enviado para Leitor de Legislação › Cadernos de questões"; }
    catch (e) { b.disabled = false; b.textContent = "⚠️ " + e.message; }
  };
  if ($("#c-publicar")) $("#c-publicar").onclick = () => prepararPublicacaoCaderno(id);
  if ($("#c-excluir")) $("#c-excluir").onclick = async () => {
    if (!confirm(`Excluir o caderno "${c.titulo}"? As suas respostas ficam guardadas no histórico e voltam se você importar o mesmo PDF de novo.`)) return;
    const locais = lerLS("cadernos-locais", []);
    const loc = locais.find(x => x.id === id);
    if (loc) await (await caches.open(CACHE_DADOS)).delete(loc.url);
    gravarLS("cadernos-locais", locais.map(x => x.id === id ? { ...x, apagado: true, atualizadoEm: agoraISO() } : x));
    delete estado.cadernos[id];
    await carregarQuestoes(); fecharPainel(); volta();
  };
  $("#c-redefinir").onclick = async () => {
    if (!confirm(`As ${c.questoes.length} questões de "${c.titulo}" voltam a ficar sem resposta. Suas estatísticas continuam com todos os acertos e erros. Redefinir?`)) return;
    await redefinirQuestoes(c.questoes.map(q => q.id));
    fecharPainel(); volta();
  };
}

/* ---------- caderno: abas Questões / Índice / Gabarito / Estatísticas ---------- */
let sessao = null, cronometro = null;
function telaCaderno(tipo, chave, aba = "questoes", qAlvo = null) {
  sessao = montarSessao(tipo, chave);
  if (!sessao) { $("#conteudo").innerHTML = `<p class="vazio">Caderno não encontrado neste aparelho.</p>`; return; }
  definirTopo({ titulo: sessao.titulo, voltar: sessao.voltar });
  $("#abas").classList.add("oculto");
  const mapa = mapaRespostas();
  const f = filtrosDe(sessao);
  const bancas = [...new Set(sessao.base.map(q => q.banca))].sort();
  const lista = listaFiltrada(sessao, mapa);
  $("#conteudo").innerHTML = `<div class="secao">
    <div class="filtros">
      <div class="segmentado" id="abas-caderno">
        ${[["questoes", "Questões"], ["indice", "Índice"], ["gabarito", "Gabarito"], ["estatisticas", "Estatísticas"]].map(([v, r]) =>
          `<button data-aba-cad="${v}" aria-pressed="${aba === v}">${r}</button>`).join("")}
      </div>
    </div>
    <div class="filtros">
      <select class="campo" id="f-assunto"><option value="">Todos os assuntos (${sessao.base.length})</option>
        ${sessao.assuntos.map(a => `<option value="${esc(a)}" ${f.assunto === a ? "selected" : ""}>${esc(a)} (${sessao.base.filter(q => q.assunto === a).length})</option>`).join("")}</select>
      <select class="campo" id="f-situacao">
        ${[["", "Todas"], ["nao", "Não resolvidas"], ["errada", "Que errei (rodada atual)"], ["certa", "Que acertei (rodada atual)"], ["ja-errei", "Que já errei alguma vez"], ["favoritas", "★ Favoritas"]].map(([v, r]) =>
          `<option value="${v}" ${f.situacao === v ? "selected" : ""}>${r}</option>`).join("")}</select>
      ${bancas.length > 1 ? `<select class="campo" id="f-banca"><option value="">Todas as bancas</option>${bancas.map(b => `<option ${f.banca === b ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>` : ""}
      ${lista.length ? `<button class="botao" id="redefinir-lista">Redefinir esta lista (${lista.length})</button>` : ""}
    </div>
    <div id="area-caderno"></div></div>`;
  const aplicar = () => {
    gravarFiltros(sessao, { assunto: $("#f-assunto").value, situacao: $("#f-situacao").value, banca: $("#f-banca")?.value || "" });
    telaCaderno(tipo, chave, aba);
  };
  $("#f-assunto").onchange = aplicar; $("#f-situacao").onchange = aplicar;
  if ($("#f-banca")) $("#f-banca").onchange = aplicar;
  $$("[data-aba-cad]").forEach(b => b.onclick = () => telaCaderno(tipo, chave, b.dataset.abaCad));
  const br = $("#redefinir-lista");
  if (br) br.onclick = async () => {
    if (!confirm(`As ${lista.length} questões desta lista voltam a ficar sem resposta, para você resolver de novo.\n\nSuas estatísticas continuam com todos os acertos e erros já registrados. Redefinir?`)) return;
    await redefinirQuestoes(lista.map(q => q.id));
    const f2 = filtrosDe(sessao);
    if (["errada", "certa"].includes(f2.situacao)) { f2.situacao = ""; gravarFiltros(sessao, f2); }
    const pos = lerLS("pos-q", {}); delete pos[sessao.chave]; gravarLS("pos-q", pos);
    telaCaderno(tipo, chave, "questoes", lista[0].id);
  };
  sessao.tipo = tipo; sessao.chaveOrig = chave; sessao.lista = lista;
  if (aba === "indice") return abaIndice(mapa);
  if (aba === "gabarito") return abaGabarito(mapa);
  if (aba === "estatisticas") return abaEstatisticas(lista, mapa, true);
  abaQuestao(mapa, qAlvo);
}

function abaIndice(mapa) {
  const l = sessao.lista;
  if (!l.length) { $("#area-caderno").innerHTML = `<p class="vazio">Nenhuma questão com esses filtros.</p>`; return; }
  const icone = { nao: "•", certa: "✓", errada: "✗" };
  let h = "";
  for (const a of sessao.assuntos) {
    const qs = l.filter(q => q.assunto === a);
    if (!qs.length) continue;
    h += `<h3 class="grupo-assunto">${esc(a)} <span class="contagem">(${qs.length})</span></h3><ul class="resultados">`;
    for (const q of qs) {
      const s = situacaoQ(mapa, q.id);
      h += `<li><button data-ir-q="${esc(q.id)}"><span class="res-titulo"><span class="sit sit-${s}">${icone[s]}</span> Questão ${l.indexOf(q) + 1}${ehFavorito(idFavQ(q.id)) ? " ★" : ""} — ${esc(q.banca)} · ${q.ano}</span>
        <span class="res-trecho">${esc(q.enunciado.join(" ").slice(0, 150))}…</span></button></li>`;
    }
    h += "</ul>";
  }
  $("#area-caderno").innerHTML = h;
}

function abaGabarito(mapa) {
  const l = sessao.lista;
  const mostrar = sessionStorage.getItem("mostrar-gabarito") === "1";
  let h = `<div class="acoes" style="margin:4px 0 12px"><button id="alt-gab">${mostrar ? "Esconder o gabarito" : "Mostrar o gabarito"}</button></div>`;
  if (!mostrar) h += `<p class="contagem">O gabarito fica escondido para não atrapalhar quem ainda vai resolver. Suas respostas da rodada atual aparecem em verde (acerto) ou vermelho (erro).</p>`;
  for (const a of sessao.assuntos) {
    const qs = l.filter(q => q.assunto === a);
    if (!qs.length) continue;
    h += `<h3 class="grupo-assunto">${esc(a)}</h3><div class="grade-gabarito">`;
    for (const q of qs) {
      const r = respostaAtual(mapa, q.id);
      const cls = r ? (r.correta ? "certa" : "errada") : "";
      h += `<button class="cel-gab ${cls}" data-ir-q="${esc(q.id)}"><span>${l.indexOf(q) + 1}</span><strong>${mostrar ? esc(q.gabarito) : r ? esc(r.marcada) : "–"}</strong></button>`;
    }
    h += "</div>";
  }
  $("#area-caderno").innerHTML = h;
  $("#alt-gab").onclick = () => { sessionStorage.setItem("mostrar-gabarito", mostrar ? "0" : "1"); abaGabarito(mapa); };
}

/* ---------- resolução de uma questão ---------- */
let riscadas = {};
let inicioQuestao = 0;
function abaQuestao(mapa, qAlvo) {
  const l = sessao.lista;
  if (!l.length) { $("#area-caderno").innerHTML = `<p class="vazio">Nenhuma questão com esses filtros. Mude o assunto ou a situação acima.</p>`; return; }
  const pos = lerLS("pos-q", {});
  let i = qAlvo ? l.findIndex(q => q.id === qAlvo) : l.findIndex(q => q.id === pos[sessao.chave]);
  if (i < 0) i = 0;
  mostrarQuestao(i, mapa);
}
function cabecalhoRodada(l, mapa) {
  const e = estatisticas(l, mapa);
  return `(${e.resolvidas} resolvidas, <span class="txt-ok">${e.certas} acertos</span> e <span class="txt-erro">${e.erradas} erros</span>)`;
}
function letraExibida(q, letra) { return q.tipo === "CE" ? (letra === "C" ? "Certo" : "Errado") : letra; }

function mostrarQuestao(i, mapa = mapaRespostas()) {
  const l = sessao.lista;
  const q = l[i];
  const pos = lerLS("pos-q", {}); pos[sessao.chave] = q.id; gravarLS("pos-q", pos);
  const todas = mapa.get(q.id) || [];
  const atual = respostaAtual(mapa, q.id);
  const temLei = q.vinculo && noAcervo(q.vinculo.lei);
  const fav = ehFavorito(idFavQ(q.id));
  const nota = estado.itens.get(idNotaQ(q.id));
  riscadas[q.id] = riscadas[q.id] || [];
  inicioQuestao = Date.now();
  const historico = todas.length ? `Histórico desta questão: ${todas.filter(r => r.correta).length} acerto(s) e ${todas.filter(r => !r.correta).length} erro(s) em ${todas.length} resposta(s).` : "";
  $("#area-caderno").innerHTML = `<article class="questao" data-q="${esc(q.id)}">
    <div class="q-cab">
      <div><strong>Questão ${i + 1} de ${l.length}</strong> <span class="contagem" id="q-rodada">${cabecalhoRodada(l, mapa)}</span></div>
      <div class="cronometro" title="Tempo de estudo nesta sessão">⏱ <span id="crono-t">00:00</span> <button class="link" id="crono-p">pausar</button></div>
    </div>
    <p class="q-meta">Matéria: ${esc(q.materia)} · Assunto: ${esc(q.assunto)}${q.vinculo ? (temLei
      ? ` · <a href="#/lei/${esc(q.vinculo.lei)}/${encodeURIComponent(q.vinculo.de)}">Ler ${esc(rotuloVinculo(q.vinculo))} no ${esc(nomeLei(q.vinculo.lei))}</a>`
      : ` · <a href="#/catalogo">${esc(rotuloVinculo(q.vinculo))} — adicionar ${esc(nomeLei(q.vinculo.lei))} ao acervo</a>`) : ""}</p>
    <p class="q-prova">${esc(provaQ(q))}</p>
    <div class="q-enunciado">${q.enunciado.map(p => `<p>${esc(p)}</p>`).join("")}</div>
    <ul class="alternativas ${q.tipo === "CE" ? "ce" : ""}" role="radiogroup" aria-label="Alternativas">
      ${q.alternativas.map(a => `<li><button class="alt ${riscadas[q.id].includes(a.letra) ? "riscada" : ""}" role="radio" aria-checked="false" data-letra="${esc(a.letra)}">
        <span class="letra">${esc(a.letra)}</span><span class="alt-texto">${esc(a.texto)}</span></button>
        ${q.tipo === "CE" ? "" : `<button class="riscar" data-riscar="${esc(a.letra)}" aria-label="Riscar a alternativa ${esc(a.letra)}" title="Riscar alternativa">✂</button>`}</li>`).join("")}
    </ul>
    <div class="acoes-q"><button class="botao primario" id="btn-responder" disabled>Responder</button></div>
    <div id="resultado-q" aria-live="polite"></div>
    <p class="contagem" id="q-historico">${historico}</p>
    <div class="barra-q">
      <button class="icone-btn" data-nav="-1" aria-label="Questão anterior" ${i === 0 ? "disabled" : ""}>← Anterior</button>
      <button class="icone-btn" data-nav="1" aria-label="Próxima questão" ${i === l.length - 1 ? "disabled" : ""}>Próxima →</button>
      <button class="icone-btn" id="q-aleatoria" aria-label="Questão aleatória">Aleatória</button>
      <button class="icone-btn" id="q-fav" aria-pressed="${fav}">${fav ? "★ Favorita" : "☆ Favoritar"}</button>
      <button class="icone-btn" id="q-nota">${nota && !nota.apagado ? "✎ Meu comentário" : "✎ Comentar"}</button>
    </div>
  </article>`;
  iniciarCronometro();

  // Questão já respondida nesta rodada: fica travada com a sua resposta até você redefinir a lista.
  const exibirResultado = r => {
    $$(".alt").forEach(x => {
      x.disabled = true;
      if (x.dataset.letra === q.gabarito) x.classList.add("certa");
      else if (x.dataset.letra === r.marcada) x.classList.add("errada");
      if (x.dataset.letra === r.marcada) { x.classList.add("marcada"); x.setAttribute("aria-checked", "true"); }
    });
    $$(".riscar").forEach(x => { x.disabled = true; });
    $(".acoes-q").classList.add("oculto");
    $("#resultado-q").innerHTML = (r.correta
      ? `<p class="res-q ok">✓ Você acertou!`
      : `<p class="res-q erro">✗ Você errou. Resposta: <strong>${esc(letraExibida(q, q.gabarito))}</strong>.`) +
      ` <button class="link" id="ver-resolucao">Ver resolução</button></p>
      <p class="contagem">Respondida em ${dataHora(r.em)}. Para resolver de novo, use “Redefinir esta lista”.</p>`;
    $("#ver-resolucao").onclick = () => mostrarResolucao(q);
  };
  if (atual) exibirResultado(atual);

  let marcada = null;
  $$(".alt").forEach(b => b.onclick = () => {
    if (b.disabled) return;
    marcada = b.dataset.letra;
    $$(".alt").forEach(x => { x.classList.toggle("marcada", x === b); x.setAttribute("aria-checked", x === b); });
    $("#btn-responder").disabled = false;
  });
  $$("[data-riscar]").forEach(b => b.onclick = () => {
    const letra = b.dataset.riscar;
    const r = riscadas[q.id];
    riscadas[q.id] = r.includes(letra) ? r.filter(x => x !== letra) : [...r, letra];
    b.previousElementSibling.classList.toggle("riscada");
  });
  $("#btn-responder").onclick = async () => {
    if (!marcada) return;
    $("#btn-responder").disabled = true;
    const tempo = Math.min(1800, Math.round((Date.now() - inicioQuestao) / 1000));
    const r = await salvarItem({ id: uid(), tipo: "resposta", q: q.id, caderno: q.caderno, marcada, correta: marcada === q.gabarito, em: agoraISO(), tempo });
    exibirResultado(r);
    const m2 = mapaRespostas();
    $("#q-rodada").innerHTML = cabecalhoRodada(l, m2);
    const t = m2.get(q.id) || [];
    $("#q-historico").textContent = `Histórico desta questão: ${t.filter(x => x.correta).length} acerto(s) e ${t.filter(x => !x.correta).length} erro(s) em ${t.length} resposta(s).`;
  };
  $$("[data-nav]").forEach(b => b.onclick = () => { mostrarQuestao(i + Number(b.dataset.nav)); window.scrollTo(0, 0); });
  $("#q-aleatoria").onclick = () => {
    const m = mapaRespostas();
    const pendentes = l.map((x, k) => k).filter(k => k !== i && situacaoQ(m, l[k].id) === "nao");
    const pool = pendentes.length ? pendentes : l.map((x, k) => k).filter(k => k !== i);
    if (pool.length) { mostrarQuestao(pool[Math.floor(Math.random() * pool.length)]); window.scrollTo(0, 0); }
  };
  $("#q-fav").onclick = async () => {
    await alternarFavorito(idFavQ(q.id), { alvo: "questao", q: q.id, caderno: q.caderno });
    const f = ehFavorito(idFavQ(q.id));
    $("#q-fav").textContent = f ? "★ Favorita" : "☆ Favoritar";
    $("#q-fav").setAttribute("aria-pressed", f);
  };
  $("#q-nota").onclick = () => mostrarResolucao(q, true);
}

function mostrarResolucao(q, focarNota = false) {
  const nota = estado.itens.get(idNotaQ(q.id));
  const respondida = respostaAtual(mapaRespostas(), q.id);
  abrirPainel(`<h2>${respondida ? "Resolução" : "Meu comentário"} ${botaoFechar}</h2>
    ${respondida ? `<p><strong>Gabarito: ${esc(letraExibida(q, q.gabarito))}</strong></p>` : '<p class="contagem">O gabarito aparece aqui depois que você responder a questão.</p>'}
    ${q.vinculo && noAcervo(q.vinculo.lei) ? `<div class="acoes" style="margin-bottom:12px"><button data-href="#/lei/${esc(q.vinculo.lei)}/${encodeURIComponent(q.vinculo.de)}">Ler ${esc(rotuloVinculo(q.vinculo))} no ${esc(nomeLei(q.vinculo.lei))}</button></div>` : ""}
    <p class="contagem">Seu comentário sobre esta questão (fundamento, pegadinha, artigo cobrado). Fica guardado e entra no backup.</p>
    <textarea class="campo" id="nota-q" placeholder="Ex.: a qualificadora alcança parente consanguíneo só até o 3º grau (art. 121, § 2º, VII).">${esc(nota && !nota.apagado ? nota.nota : "")}</textarea>
    <div class="acoes" style="margin-top:10px"><button class="botao primario" id="salvar-nota-q">Salvar comentário</button></div>`);
  if (focarNota) $("#nota-q").focus();
  $("#salvar-nota-q").onclick = async () => {
    const texto = $("#nota-q").value.trim();
    if (texto) await salvarItem({ id: idNotaQ(q.id), tipo: "notaq", q: q.id, caderno: q.caderno, nota: texto });
    else if (nota && !nota.apagado) await apagarItem(idNotaQ(q.id));
    fecharPainel();
    const btn = $("#q-nota");
    if (btn) btn.textContent = texto ? "✎ Meu comentário" : "✎ Comentar";
  };
}

/* cronômetro da sessão de estudo (pausável) */
function iniciarCronometro() {
  if (!cronometro || cronometro.sessao !== sessao.chave) cronometro = { sessao: sessao.chave, acumulado: 0, desde: Date.now(), pausado: false };
  const pintar = () => {
    const el = $("#crono-t");
    if (!el) return;
    const s = Math.floor((cronometro.acumulado + (cronometro.pausado ? 0 : Date.now() - cronometro.desde)) / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
    el.textContent = (hh ? String(hh).padStart(2, "0") + ":" : "") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    $("#crono-p").textContent = cronometro.pausado ? "continuar" : "pausar";
  };
  clearInterval(cronometro.intervalo);
  cronometro.intervalo = setInterval(pintar, 1000);
  pintar();
  $("#crono-p").onclick = () => {
    if (cronometro.pausado) { cronometro.desde = Date.now(); cronometro.pausado = false; }
    else { cronometro.acumulado += Date.now() - cronometro.desde; cronometro.pausado = true; }
    pintar();
  };
}

/* ---------- estatísticas ----------
   Rodada atual: situação de cada questão desde o último "redefinir".
   Histórico: TODAS as respostas já dadas (nada é apagado ao redefinir). */
function estatisticas(lista, mapa) {
  let resolvidas = 0, certas = 0, erradas = 0, respostas = 0, acertosTotal = 0, errosTotal = 0, tempo = 0;
  const porAssunto = {}, porBanca = {}, porDia = {}, erros = [];
  for (const q of lista) {
    const rs = mapa.get(q.id) || [];
    const pa = porAssunto[q.assunto] = porAssunto[q.assunto] || { total: 0, respostas: 0, acertos: 0, erros: 0 };
    const pb = porBanca[q.banca] = porBanca[q.banca] || { total: 0, respostas: 0, acertos: 0, erros: 0 };
    pa.total++; pb.total++;
    const atual = respostaAtual(mapa, q.id);
    if (atual) { resolvidas++; if (atual.correta) certas++; else erradas++; }
    let nErros = 0;
    for (const r of rs) {
      respostas++; pa.respostas++; pb.respostas++; tempo += r.tempo || 0;
      if (r.correta) { acertosTotal++; pa.acertos++; pb.acertos++; } else { errosTotal++; pa.erros++; pb.erros++; nErros++; }
      const d = new Date(r.em).toLocaleDateString("sv-SE");   // dia no fuso do aparelho
      const pd = porDia[d] = porDia[d] || { certas: 0, erradas: 0 };
      if (r.correta) pd.certas++; else pd.erradas++;
    }
    if (nErros) erros.push({ q, nErros, tentativas: rs.length });
  }
  erros.sort((a, b) => b.nErros - a.nErros || b.tentativas - a.tentativas);
  return { total: lista.length, resolvidas, certas, erradas, respostas, acertosTotal, errosTotal, tempo, porAssunto, porBanca, porDia, erros,
           pctTotal: respostas ? Math.round(100 * acertosTotal / respostas) : 0 };
}
function tabelaDesempenho(obj, ordem) {
  const chaves = ordem ? ordem.filter(k => obj[k]) : Object.keys(obj).sort();
  return `<div class="tabela-desemp">${chaves.map(k => {
    const v = obj[k];
    const pct = v.respostas ? Math.round(100 * v.acertos / v.respostas) : null;
    return `<div class="linha-desemp"><span class="nome-desemp">${esc(k)} <span class="contagem">(${v.total} questões)</span></span>
      <span class="barra-desemp" aria-hidden="true"><span class="b-ok" style="width:${v.respostas ? 100 * v.acertos / v.respostas : 0}%"></span><span class="b-erro" style="width:${v.respostas ? 100 * v.erros / v.respostas : 0}%"></span></span>
      <span class="num-desemp">${v.respostas ? `${v.acertos} ✓ · ${v.erros} ✗ · ${pct}%` : "sem respostas"}</span></div>`;
  }).join("")}</div>`;
}
function graficoDias(porDia) {
  const dias = [];
  for (let k = 29; k >= 0; k--) dias.push(new Date(Date.now() - k * 864e5).toLocaleDateString("sv-SE"));
  const max = Math.max(1, ...dias.map(d => (porDia[d]?.certas || 0) + (porDia[d]?.erradas || 0)));
  const L = 600, A = 140, w = L / 30;
  let barras = "";
  dias.forEach((d, k) => {
    const c = porDia[d]?.certas || 0, e = porDia[d]?.erradas || 0;
    const hc = A * c / max, he = A * e / max;
    barras += `<rect x="${k * w + 2}" y="${A - hc}" width="${w - 4}" height="${hc}" fill="var(--ok)"><title>${dataCurta(d)}: ${c} acertos</title></rect>`;
    barras += `<rect x="${k * w + 2}" y="${A - hc - he}" width="${w - 4}" height="${he}" fill="var(--alt)"><title>${dataCurta(d)}: ${e} erros</title></rect>`;
  });
  return `<svg class="grafico-dias" viewBox="0 0 ${L} ${A + 18}" role="img" aria-label="Respostas por dia nos últimos 30 dias">
    <line x1="0" y1="${A}" x2="${L}" y2="${A}" stroke="var(--fio)"/>${barras}
    <text x="0" y="${A + 14}" font-size="11" fill="var(--tinta-2)">${dataCurta(dias[0])}</text>
    <text x="${L}" y="${A + 14}" font-size="11" fill="var(--tinta-2)" text-anchor="end">hoje</text></svg>`;
}
function formatarTempo(s) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }

function abaEstatisticas(lista, mapa, noCaderno) {
  const e = estatisticas(lista, mapa);
  const alvo = noCaderno ? $("#area-caderno") : $("#conteudo");
  if (!e.total) { alvo.innerHTML = `<p class="vazio">Nenhuma questão com esses filtros.</p>`; return; }
  const ordemAssuntos = noCaderno ? sessao.assuntos : [...new Set([...estado.q.values()].map(q => q.assunto))];
  alvo.innerHTML = `${noCaderno ? "" : '<div class="secao">'}
    <h3 class="grupo-assunto" style="margin-top:6px">Histórico (todas as respostas já dadas)</h3>
    <div class="numeros-desemp">
      <div><strong>${e.respostas}</strong><span>respostas registradas</span></div>
      <div><strong class="txt-ok">${e.acertosTotal}</strong><span>acertos</span></div>
      <div><strong class="txt-erro">${e.errosTotal}</strong><span>erros</span></div>
      <div><strong>${e.respostas ? e.pctTotal + "%" : "—"}</strong><span>de acerto</span></div>
      <div><strong>${formatarTempo(e.tempo)}</strong><span>resolvendo</span></div>
    </div>
    <p class="contagem">Rodada atual: ${e.resolvidas} de ${e.total} questões resolvidas (${e.certas} certas e ${e.erradas} erradas). Redefinir uma lista começa uma nova rodada, mas não apaga nada do histórico.</p>
    <h3 class="grupo-assunto">Por assunto</h3>${tabelaDesempenho(e.porAssunto, ordemAssuntos)}
    <h3 class="grupo-assunto">Por banca</h3>${tabelaDesempenho(e.porBanca)}
    <h3 class="grupo-assunto">Evolução nos últimos 30 dias</h3>${graficoDias(e.porDia)}
    <p class="legenda-diff"><span style="color:var(--ok)">■ acertos</span><span style="color:var(--alt)">■ erros</span></p>
    <h3 class="grupo-assunto">Questões que você mais erra</h3>
    ${e.erros.length ? `<ul class="resultados">${e.erros.slice(0, 10).map(x => `<li><button data-href="#/caderno/${esc(x.q.caderno)}/questao/${esc(x.q.id)}">
      <span class="res-titulo">${x.nErros} erro(s) em ${x.tentativas} resposta(s) — ${esc(x.q.assunto)}</span>
      <span class="res-trecho">${esc(x.q.enunciado.join(" ").slice(0, 140))}…</span></button></li>`).join("")}</ul>
      ${noCaderno ? '<div class="acoes" style="margin-top:12px"><button id="refazer-erradas" class="botao primario">Refazer as que já errei</button></div>' : ""}`
      : '<p class="contagem">Nenhum erro registrado até agora.</p>'}
    ${noCaderno ? "" : "</div>"}`;
  const btn = $("#refazer-erradas");
  if (btn) btn.onclick = async () => {
    const ids = e.erros.map(x => x.q.id);
    if (!confirm(`As ${ids.length} questões que você já errou voltam a ficar sem resposta, para resolver de novo. O histórico continua registrado. Continuar?`)) return;
    await redefinirQuestoes(ids);
    const f = filtrosDe(sessao); f.situacao = "ja-errei"; gravarFiltros(sessao, f);
    telaCaderno(sessao.tipo, sessao.chaveOrig, "questoes", ids[0]);
  };
}

function telaEstatisticasGerais() {
  definirTopo({ titulo: "Estatísticas de questões", voltar: "#/questoes" });
  $("#abas").classList.add("oculto");
  abaEstatisticas([...estado.q.values()], mapaRespostas(), false);
}

/* ---------- Configurações ---------- */
async function tamanhoCache(filtro) {
  const cache = await caches.open(CACHE_DADOS);
  let bytes = 0, qtd = 0;
  for (const req of await cache.keys()) {
    if (!filtro(req.url)) continue;
    const r = await cache.match(req);
    bytes += (await r.clone().blob()).size; qtd++;
  }
  return { bytes, qtd };
}
const mb = b => (b / 1048576).toFixed(1).replace(".", ",") + " MB";

async function telaAjustes() {
  definirTopo({ titulo: "Configurações" });
  marcarAba("ajustes");
  const leis = await tamanhoCache(u => u.includes("/dados/leis/"));
  const imgs = await bdTodos("imagens");
  const bytesImg = imgs.reduce((s, i) => s + (i.blob?.size || 0), 0);
  const ativos = [...estado.itens.values()].filter(i => !i.apagado);
  const bytesNotas = new Blob([JSON.stringify(ativos)]).size;
  const ultimo = lerLS("ultimo-backup", null);
  $("#conteudo").innerHTML = htmlSecaoSync() + `
  <div class="secao"><h2>Backup dos seus estudos</h2><div class="cartao">
    <p>Tudo fica guardado neste aparelho. O <strong>backup completo</strong> gera um único arquivo com o app inteiro como está agora: as leis do acervo com o texto, pastas, grifos, anotações, imagens, desenhos, favoritos, cadernos de questões e respostas, resumos (arquivos originais, edições e marcações) e as suas preferências.</p>
    <p class="contagem">Ao importar, você escolhe: restaurar exatamente como está no arquivo ou juntar com o que já existe no aparelho.</p>
    <p>Último backup: ${ultimo ? esc(dataHora(ultimo)) : "nenhum ainda"}.</p>
    <div class="acoes" style="margin-bottom:14px">
      <button id="btn-exportar" class="botao primario">Exportar backup completo</button>
      <button id="btn-importar">Importar backup</button>
    </div></div></div>
  <div class="secao"><h2>Atualizações</h2><div class="cartao">
    <p>O robô confere as leis no Planalto todos os dias às 6h. Ao abrir, o app só baixa uma lei quando a versão oficial dela mudou.</p>
    <p>Última consulta do app: ${esc(dataHora(estado.statusEm))}${estado.offline ? " (sem conexão agora)" : ""}.</p>
    <div class="acoes" style="margin-bottom:14px">
      <button id="btn-atualizar">Buscar atualizações agora</button>
      <a class="botao" href="${REPO_ACTIONS}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">Pedir uma nova verificação no Planalto (abre o GitHub)</a>
    </div></div></div>
  <div id="secao-armazenamento"><div class="secao"><h2>Armazenamento</h2><div class="cartao"><p class="contagem">Calculando…</p></div></div></div>
  <div class="secao"><h2>Leitura</h2><div class="cartao"><div id="ajustes-leitura"></div></div></div>
  <div class="secao"><h2>Ajuda</h2><div class="cartao"><div class="acoes" style="margin-bottom:12px"><button id="btn-apresentacao">Rever a apresentação do app</button></div></div></div>`;
  montarAjustesLeitura($("#ajustes-leitura"));
  ligarSecaoSync();
  $("#btn-apresentacao").onclick = () => mostrarBoasVindas(0);
  $("#btn-exportar").onclick = exportarBackup;
  $("#btn-importar").onclick = () => $("#entrada-backup").click();
  $("#btn-atualizar").onclick = async e => { e.target.textContent = "Buscando…"; await atualizarTudo(); telaAjustes(); };
  medirArmazenamento().then(m => { const el = $("#secao-armazenamento"); if (el) { el.innerHTML = htmlArmazenamento(m); ligarArmazenamento(); } });
}

function montarAjustesLeitura(alvo) {
  const seg = (nome, opcoes, atual) => `<div class="segmentado" data-ajuste="${nome}">${opcoes.map(([v, r]) =>
    `<button data-v="${v}" aria-pressed="${String(v) === String(atual)}">${r}</button>`).join("")}</div>`;
  alvo.innerHTML = `
    <div class="linha-ajuste"><span>Tamanho do texto</span>
      <div class="segmentado"><button id="fonte-menos" aria-label="Diminuir fonte">A−</button>
      <button disabled>${ajustes.fonte}</button><button id="fonte-mais" aria-label="Aumentar fonte">A+</button></div></div>
    <div class="linha-ajuste"><span>Espaçamento</span>${seg("entrelinha", [[1.5, "Justo"], [1.7, "Normal"], [1.95, "Amplo"]], ajustes.entrelinha)}</div>
    <div class="linha-ajuste" style="border:0"><span>Tema</span>${seg("tema", [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]], ajustes.tema)}</div>`;
  $("#fonte-menos", alvo).onclick = () => { ajustes.fonte = Math.max(14, ajustes.fonte - 1); aplicarAjustes(); montarAjustesLeitura(alvo); };
  $("#fonte-mais", alvo).onclick = () => { ajustes.fonte = Math.min(30, ajustes.fonte + 1); aplicarAjustes(); montarAjustesLeitura(alvo); };
  $$("[data-ajuste] button", alvo).forEach(b => b.onclick = () => {
    const nome = b.parentElement.dataset.ajuste;
    ajustes[nome] = nome === "entrelinha" ? Number(b.dataset.v) : b.dataset.v;
    aplicarAjustes(); montarAjustesLeitura(alvo);
  });
}
