/* =====================================================================
   TELAS
   ===================================================================== */
function definirTopo({ titulo, leitor = false, voltar = null }) {
  $("#titulo").textContent = titulo;
  for (const id of ["btn-sumario", "btn-ir", "btn-buscar-lei", "btn-ouvir", "btn-caneta", "btn-tela-cheia", "btn-aa", "btn-mais-leitor"]) $("#" + id).classList.toggle("oculto", !leitor);
  $("#btn-voltar").classList.toggle("oculto", !voltar && pilhaNav.length < 2);
  $("#btn-voltar").dataset.destino = voltar || "";
  $("#abas").classList.toggle("oculto", leitor);
}
function mostrarAvisoOffline() {
  const el = $("#aviso-offline");
  if (estado.offline) {
    el.textContent = "Modo offline — exibindo a última versão sincronizada" + (estado.statusEm ? ` (consulta de ${dataHora(estado.statusEm)}).` : ".");
    el.classList.remove("oculto");
  } else el.classList.add("oculto");
}
function marcarAba(rota) {
  $$("#abas button").forEach(b => { if (b.dataset.rota === rota) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
}

/* ---------- Leis (acervo com pastas em lista) ---------- */
function telaAcervo(pastaId = null) {
  const favoritas = pastaId === "favoritas";
  const pasta = pastaId && !favoritas ? estado.itens.get(pastaId) : null;
  if (pastaId && !favoritas && (!pasta || pasta.apagado)) { location.hash = "#/acervo"; return; }
  definirTopo({ titulo: favoritas ? "★ Leis favoritas" : pasta ? pasta.nome : "Meu Acervo", voltar: pastaId ? "#/acervo" : null });
  marcarAba("acervo");
  const todos = idsAcervo();
  const pastas = pastasDe("leis");
  const emPasta = new Set(pastas.flatMap(p => p.leis || []));
  const ids = favoritas ? todos.filter(id => ehFavorito(idFavLei(id)))
    : pasta ? todos.filter(id => (pasta.leis || []).includes(id)) : todos.filter(id => !emPasta.has(id));
  let h = "";
  if (!pastaId) {
    h += `<div class="secao" style="margin-bottom:0"><div class="acoes-linha">
      <a class="botao primario" href="#/catalogo" style="text-decoration:none">+ Adicionar leis</a>
      <button class="botao" id="nova-pasta-leis">+ Nova pasta</button></div></div>`;
    if (!todos.length) h += `<p class="vazio">Seu acervo está vazio. Toque em “+ Adicionar leis” para escolher as leis que você quer estudar.<br>Só as leis escolhidas são baixadas para o aparelho.</p>`;
    const semBackup = temDadosSemBackup();
    if (semBackup) h += `<div class="aviso">Seus grifos e anotações ficam só neste aparelho. ${semBackup} <a href="#/ajustes">Fazer backup</a></div>`;
    for (const id of todos.filter(i => estado.alteracoes[i])) {
      const alt = estado.alteracoes[id];
      const lista = alt.artigos.slice(0, 8).map(a => `${rotuloArt(a.artigo)} (${a.tipo})`).join(", ");
      const comNotas = alt.artigos.filter(a => marcacoesDoArtigo(id, a.artigo).length).length;
      h += `<div class="aviso forte">⚠️ <strong>${esc(nomeLei(id))}</strong> mudou desde a sua última leitura` +
        (lista ? `: ${esc(lista)}${alt.artigos.length > 8 ? "…" : ""}.` : ".") +
        (comNotas ? ` Você tem marcações em ${comNotas} desses artigos.` : "") +
        ` <a href="#/alteracoes/${esc(id)}">Ver alterações</a></div>`;
    }
  }
  h += `<ul class="acervo">`;
  if (!pastaId) {
    for (const p of pastas) h += linhaPasta(p, (p.leis || []).filter(l => todos.includes(l)).length, "lei(s)", `#/acervo/pasta/${p.id}`);
    const nFav = todos.filter(id => ehFavorito(idFavLei(id))).length;
    if (nFav) h += linhaPasta({ nome: "★ Favoritas" }, nFav, "lei(s)", "#/acervo/favoritas");
  }
  for (const id of ordenarLeis(ids, todos)) {                // fixadas, depois as alteradas por último, depois as demais
    const i = todos.indexOf(id);
    const st = estado.status[id];
    const s = situacao(id);
    h += `<li class="lei-item" style="--cor-aba:${CORES_ABA[i % CORES_ABA.length]}">
      <span class="aba"></span>
      <button class="abrir" data-abrir="${esc(id)}">
        <span class="lei-nome">${ehFixada(id) ? '<span class="lei-pin" title="Fixada no topo">📌</span> ' : ""}${esc(nomeLei(id))}${ehFavorito(idFavLei(id)) ? ' <span class="lei-fav">★</span>' : ""}</span>
        <span class="lei-num">${esc(st.numero || "")}${st.n_artigos ? " · " + st.n_artigos + " artigos" : ""}</span>
        <span class="selo ${s.cls}">${esc(s.txt)}</span>
        <span class="lei-verif">${esc(s.sub)}</span>
      </button>
      <button class="mais" data-menu-lei="${esc(id)}" aria-label="Opções de ${esc(nomeLei(id))}">⋯</button>
    </li>`;
  }
  h += "</ul>";
  if (pastaId && !ids.length) h += `<p class="vazio">${favoritas ? "Nenhuma lei favoritada." : "Pasta vazia. Use o botão ⋯ de uma lei e escolha “Mover para pasta”."}</p>`;
  $("#conteudo").innerHTML = h;
  const bn = $("#nova-pasta-leis");
  if (bn) bn.onclick = async () => { if (await novaPasta("leis")) telaAcervo(); };
}

/* ---------- catálogo: buscar e adicionar leis ao acervo ---------- */
function textoBusca(st) {
  return semAcento([st.nome, nomeLei(st.id || ""), st.numero, st.apelidos, st.area].join(" ")) + " " + String(st.numero || "").replace(/\D/g, "");
}
function telaCatalogo() {
  definirTopo({ titulo: "Adicionar leis", voltar: "#/acervo" });
  marcarAba("acervo");
  const todos = Object.keys(estado.status);
  if (!todos.length) {
    $("#conteudo").innerHTML = `<p class="vazio">${estado.offline ? "Sem conexão. O catálogo aparece depois de aberto uma vez com internet." : "O catálogo ainda não foi carregado."}</p>`;
    return;
  }
  const areas = [...new Set(todos.map(id => estado.status[id].area || "Outras"))];
  $("#conteudo").innerHTML = `<div class="secao">
    <input class="campo" id="busca-cat" type="search" placeholder="Nome, número ou assunto — ex.: drogas, 11.343, abuso de autoridade" autocomplete="off">
    <div class="filtros" style="margin-top:8px"><select class="campo" id="area-cat"><option value="">Todas as áreas (${todos.length})</option>
      ${areas.map(a => `<option>${esc(a)}</option>`).join("")}</select></div>
    <div id="lista-cat"></div></div>`;
  const campo = $("#busca-cat");
  campo.value = sessionStorage.getItem("busca-cat") || "";
  $("#area-cat").value = sessionStorage.getItem("area-cat") || "";
  const render = () => {
    sessionStorage.setItem("busca-cat", campo.value);
    sessionStorage.setItem("area-cat", $("#area-cat").value);
    const termos = semAcento(campo.value.trim()).split(/\s+/).filter(Boolean).map(t => /\d/.test(t) ? t.replace(/\D/g, "") : t).filter(Boolean);
    const area = $("#area-cat").value;
    const ok = todos.filter(id => {
      const st = estado.status[id];
      if (area && (st.area || "Outras") !== area) return false;
      const alvo = textoBusca(st);
      return termos.every(t => alvo.includes(t));
    });
    const nAcv = idsAcervo().length;
    let h = `<p class="contagem">${ok.length} norma(s)${nAcv ? ` · ${nAcv} no seu acervo` : ""}</p>`;
    for (const a of areas) {
      const grupo = ok.filter(id => (estado.status[id].area || "Outras") === a);
      if (!grupo.length) continue;
      h += `<h3 class="grupo-assunto">${esc(a)}</h3><ul class="lista-cat">`;
      for (const id of grupo) {
        const st = estado.status[id];
        const pronta = !!st.hash;
        const tem = noAcervo(id);
        h += `<li class="item-cat"><div><strong>${esc(st.nome)}</strong><br><span class="contagem">${esc(st.numero || "")}${st.n_artigos ? ` · ${st.n_artigos} artigos` : ""}</span></div>
          ${tem ? `<button class="botao" data-abrir="${esc(id)}">✓ No acervo · abrir</button>`
            : pronta ? `<button class="botao primario" data-adicionar="${esc(id)}">Adicionar</button>`
            : `<span class="contagem" style="text-align:right">Sendo preparada<br>pelo robô</span>`}</li>`;
      }
      h += "</ul>";
    }
    if (!ok.length) h += `<p class="vazio">Nenhuma norma encontrada. O catálogo reúne a legislação federal mais cobrada em concursos.</p>`;
    $("#lista-cat").innerHTML = h;
    $$("[data-adicionar]").forEach(b => b.onclick = async () => {
      const id = b.dataset.adicionar;
      b.disabled = true; b.textContent = "Baixando…";
      await salvarItem({ id: idAcervo(id), tipo: "acervo", lei: id });
      await sincronizarLei(id);
      await leiDoCache(id);
      b.outerHTML = estado.leis[id]
        ? `<button class="botao" data-abrir="${esc(id)}">✓ Adicionada · abrir</button>`
        : `<span class="contagem" style="text-align:right">Adicionada. Será baixada<br>quando houver internet.</span>`;
    });
  };
  campo.oninput = aoParar(render);
  $("#area-cat").onchange = render;
  render();
  if (!campo.value) campo.focus();
}

function temDadosSemBackup() {
  const ultimaMudanca = lerLS("ultima-mudanca", null);
  if (!ultimaMudanca) return "";
  const ativos = [...estado.itens.values()].filter(i => !i.apagado && i.tipo !== "pasta").length;
  if (!ativos) return "";
  const ultimo = lerLS("ultimo-backup", null);
  if (!ultimo) return "Você ainda não fez nenhum backup.";
  const dias = (Date.now() - new Date(ultimo)) / 864e5;
  if (ultimaMudanca > ultimo && dias > 7) return `Último backup: ${dataCurta(ultimo)}.`;
  return "";
}

/* ---------- Leitor ---------- */
let leiAberta = null;
async function telaLei(id, alvo) {
  const st = estado.status[id];
  definirTopo({ titulo: st ? nomeLei(id) : "Lei", leitor: true, voltar: paiDaLei(id) });
  let lei = await leiDoCache(id);
  if (!lei) { await sincronizarLei(id); lei = await leiDoCache(id); }
  if (!lei) {
    $("#conteudo").innerHTML = `<p class="vazio">Esta lei ainda não foi baixada para o aparelho. Conecte-se à internet e abra de novo.</p>`;
    return;
  }
  leiAberta = id;
  larguraCache = null;
  zerarZoom();
  $("#conteudo").classList.add("modo-leitor");
  const prep = prepararLei(lei);
  const alt = estado.alteracoes[id];
  const alterados = alt ? new Set(alt.artigos.map(a => a.artigo)) : null;
  const s = situacao(id);

  let topoAviso = `<div class="aviso"><span class="selo ${s.cls}">${esc(s.txt)}</span><br>${esc(s.sub)} · Versão de ${dataCurta(lei.versao)}</div>`;
  if (alt) {
    const links = alt.artigos.map(a => `<a href="#/lei/${esc(id)}/${encodeURIComponent(a.artigo)}">${esc(rotuloArt(a.artigo))}</a> (${a.tipo})`).join(", ");
    topoAviso += `<div class="aviso forte">⚠️ Esta lei mudou desde a sua última leitura${links ? ": " + links : ""}. ` +
      `Os artigos alterados estão marcados com uma faixa vermelha à esquerda. ` +
      `<a href="#/alteracoes/${esc(id)}">Ver antes e depois</a> · <button class="link" id="btn-entendi">Marcar como lido</button></div>`;
  }
  const mudadas = itens("anotacao", i => i.lei === id && artigoMudou(i)).length + itens("grifo", i => i.lei === id && artigoMudou(i)).length;
  if (mudadas) topoAviso += `<div class="aviso forte">⚠️ ${mudadas} grifo(s) ou anotação(ões) sua(s) estão em artigos que mudaram depois que você os marcou. Eles foram preservados. <a href="#/estudos/alterados/${esc(id)}">Revisar</a></div>`;

  const sumarioHTML = prep.sumario.map(x => `<a class="n${x.nivel}" href="#/lei/${esc(id)}/${encodeURIComponent(x.alvo)}">${esc(x.rotulo)}</a>`).join("");
  let texto = preambuloHTML(prep.pre);
  for (const a of prep.arts) texto += artigoHTML(a, alterados, id);

  $("#conteudo").innerHTML = `${topoAviso}
    <div class="leitor-wrap">
      <nav class="sumario sumario-lateral" aria-label="Sumário">${sumarioHTML || '<p class="contagem">Esta lei não tem divisões.</p>'}</nav>
      <div class="zoom-rolagem"><div id="zoom-caixa">
      <article class="texto-lei" id="texto-lei" lang="pt-BR">
        ${texto}
        <div class="rodape-fonte">Fonte: texto compilado do Planalto —
          <a href="${esc(lei.url)}" target="_blank" rel="noopener">abrir a página oficial</a>.<br>
          O texto compilado não substitui o publicado no Diário Oficial da União.</div>
      </article>
      </div></div>
    </div>`;
  if (lerLS("tela-cheia", false)) alternarTelaCheia(true);
  $$("#texto-lei .artigo").forEach(div => aplicarMarcacoes(id, div));
  const btn = $("#btn-entendi");
  if (btn) btn.onclick = () => { delete estado.alteracoes[id]; gravarLS("alteracoes-nao-vistas", estado.alteracoes); telaLei(id); };

  const destino = alvo || lerLS("posicao", {})[id];
  if (destino) irParaArtigo(destino, !!alvo);
  observarPosicao(id);
}

function irParaArtigo(artId, destacar = true) {
  const el = document.getElementById("art-" + artId);
  if (!el) return false;
  el.scrollIntoView({ block: "start" });
  if (destacar) { el.classList.add("alvo"); setTimeout(() => el.classList.remove("alvo"), 2200); }
  return true;
}

let observador = null;
function observarPosicao(id) {
  if (observador) observador.disconnect();
  let tempo = null;
  observador = new IntersectionObserver(entradas => {
    const visivel = entradas.find(e => e.isIntersecting);
    if (!visivel) return;
    clearTimeout(tempo);
    tempo = setTimeout(() => { const pos = lerLS("posicao", {}); pos[id] = visivel.target.dataset.art; gravarLS("posicao", pos); }, 400);
  }, { rootMargin: "-80px 0px -70% 0px" });
  $$(".artigo").forEach(el => observador.observe(el));
}

/* ---------- Alterações (antes e depois) ---------- */
async function telaAlteracoes(id) {
  definirTopo({ titulo: "Alterações — " + nomeLei(id), voltar: "#/lei/" + id });
  marcarAba("");
  $("#abas").classList.add("oculto");
  $("#conteudo").innerHTML = `<p class="vazio">Carregando o histórico…</p>`;
  await leiDoCache(id);
  const hist = await carregarHistorico(id);
  if (!hist.length) {
    $("#conteudo").innerHTML = `<p class="vazio">Nenhuma alteração registrada para esta lei desde que ela entrou no acervo` +
      `${estado.leis[id] ? "" : ""}. Quando o robô detectar uma mudança no Planalto, o antes e o depois aparecerão aqui.</p>`;
    return;
  }
  const alt = estado.alteracoes[id];
  let h = `<div class="secao"><p class="legenda-diff"><span><del>texto removido</del></span><span><ins>texto adicionado</ins></span></p>`;
  for (const reg of [...hist].reverse()) {
    const novo = alt && reg.versao_nova > alt.desde;
    h += `<h2 style="margin-top:24px">${novo ? "🔴 " : ""}Versão de ${dataCurta(reg.versao_nova)} <span style="font-weight:400">(antes: versão de ${dataCurta(reg.versao_anterior)})</span></h2>`;
    h += `<p class="contagem">Detectada pelo robô em ${esc(dataHora(reg.detectado_em))} · Fonte: texto compilado do Planalto</p>`;
    const blocos = [
      ...reg.alterados.map(a => ({ art: a.artigo, tipo: "alterado", antes: a.antes, depois: a.depois })),
      ...reg.incluidos.map(a => ({ art: a.artigo, tipo: "incluído", antes: "", depois: a.texto })),
      ...reg.removidos.map(a => ({ art: a.artigo, tipo: "removido", antes: a.texto, depois: "" })),
    ].sort((x, y) => compararArtigos(x.art, y.art));
    for (const b of blocos) {
      const marc = marcacoesDoArtigo(id, b.art);
      const norma = normaAlteradora(b.antes, b.depois);
      h += `<div class="bloco-alteracao"><h3>${esc(rotuloArt(b.art))} — ${b.tipo}</h3>
        <div class="meta">${norma ? "Norma indicada no texto: " + esc(norma) + "<br>" : ""}` +
        `${marc.length ? `<strong style="color:var(--alt)">⚠️ Você possui ${marc.length} marcação(ões) neste artigo.</strong> ` : ""}` +
        `${b.tipo !== "removido" ? `<a href="#/lei/${esc(id)}/${encodeURIComponent(b.art)}">Abrir na lei</a>` : ""}</div>
        <div class="diff">${b.tipo === "alterado" ? diffHTML(b.antes, b.depois) : b.tipo === "incluído" ? `<ins>${esc(b.depois)}</ins>` : `<del>${esc(b.antes)}</del>`}</div></div>`;
    }
  }
  $("#conteudo").innerHTML = h + "</div>";
}

/* ---------- Pesquisar ---------- */
function buscarEm(lei, id, termo, limite = 200) {
  const alvo = semAcento(termo.trim());
  if (alvo.length < 2) return [];
  const res = [];
  for (const a of prepararLei(lei).arts) {
    const texto = a.linhas.map(l => l.t).join(" ");
    const pos = semAcento(texto).indexOf(alvo);
    if (pos < 0) continue;
    const ini = Math.max(0, pos - 60);
    const trecho = texto.slice(ini, pos + alvo.length + 90);
    const i2 = pos - ini;
    res.push({ id, art: a.id, trecho: (ini > 0 ? "…" : "") + esc(trecho.slice(0, i2)) + "<mark>" + esc(trecho.slice(i2, i2 + alvo.length)) + "</mark>" + esc(trecho.slice(i2 + alvo.length)) + "…" });
    if (res.length >= limite) break;
  }
  return res;
}
function listaResultados(res, mostrarLei) {
  if (!res.length) return "";
  return `<ul class="resultados">${res.map(r => `<li><button data-ir="${esc(r.id)}|${esc(r.art)}">
    <span class="res-titulo">${mostrarLei ? esc(nomeLei(r.id)) + " — " : ""}${esc(rotuloArt(r.art, r.lei))}</span>
    <span class="res-trecho">${r.trecho}</span></button></li>`).join("")}</ul>`;
}
function destacar(texto, termo) {
  const alvo = semAcento(termo.trim());
  const pos = semAcento(texto).indexOf(alvo);
  if (pos < 0 || !alvo) return esc(texto);
  return esc(texto.slice(0, pos)) + "<mark>" + esc(texto.slice(pos, pos + alvo.length)) + "</mark>" + esc(texto.slice(pos + alvo.length));
}

async function telaPesquisar() {
  definirTopo({ titulo: "Pesquisar" });
  marcarAba("pesquisar");
  $("#conteudo").innerHTML = `<div class="secao">
    <input class="campo" id="busca-global" type="search" placeholder="Palavra, trecho ou expressão — ex.: livramento condicional" autocomplete="off">
    <div id="res-global"></div></div>`;
  const ids = idsAcervo();
  const campo = $("#busca-global");
  campo.value = sessionStorage.getItem("busca-global") || "";
  const rodar = async () => {
    const termo = campo.value;
    sessionStorage.setItem("busca-global", termo);
    if (termo.trim().length < 2) { $("#res-global").innerHTML = ""; return; }
    const alvo = semAcento(termo.trim());
    const notas = itens("anotacao", n => semAcento((n.nota || "") + " " + (n.texto || "")).includes(alvo));
    let res = [];
    for (const id of ids) if (estado.leis[id]) res = res.concat(buscarEm(estado.leis[id], id, termo, 60));
    let h = "";
    if (notas.length) h += `<h2 style="font-size:15px;margin:16px 0 0">Minhas anotações relacionadas</h2>` + cartoesAnotacoes(notas, termo);
    await carregarResumos();
    if (!resumos.textos) { resumos.textos = new Map(); for (const c of await bdTodos("resumos_conteudo")) resumos.textos.set(c.id, semAcento(c.texto || "")); }
    const rs = resumosAtivos().filter(r => semAcento([r.titulo, r.materia, r.assunto].join(" ")).includes(alvo) || (resumos.textos.get(r.id) || "").includes(alvo)).slice(0, 30);
    if (rs.length) h += `<h2 style="font-size:15px;margin:16px 0 0">Meus resumos (${rs.length})</h2><ul class="lista-cartoes">${rs.map(cartaoResumo).join("")}</ul>`;
    const qs = [...estado.q.values()].filter(q => semAcento(q.enunciado.join(" ") + " " + q.alternativas.map(a => a.texto).join(" ")).includes(alvo)).slice(0, 40);
    if (qs.length) h += `<h2 style="font-size:15px;margin:16px 0 0">Questões (${qs.length})</h2><ul class="resultados">${qs.map(q => `<li><button data-href="#/caderno/${esc(q.caderno)}/questao/${esc(q.id)}">
      <span class="res-titulo">${esc(q.assunto)} — ${esc(q.banca)} ${q.ano}</span><span class="res-trecho">${destacar(q.enunciado.join(" ").slice(0, 220), termo)}…</span></button></li>`).join("")}</ul>`;
    h += `<h2 style="font-size:15px;margin:18px 0 0">Nas leis</h2><p class="contagem">${res.length ? res.length + " artigo(s) encontrado(s)" : "Nada encontrado nas leis do acervo."}</p>` + listaResultados(res, true);
    $("#res-global").innerHTML = h;
    ativarMiniaturas($("#res-global"));
  };
  campo.oninput = aoParar(rodar, 220);
  campo.focus();
  await Promise.all(ids.map(leiDoCache));
  if (campo.isConnected) rodar();
}

/* ---------- Meus estudos ---------- */
function origemHTML(i) {
  if (!i.lei) return "";
  const destino = i.art ? `#/lei/${i.lei}/${encodeURIComponent(i.art)}` : `#/lei/${i.lei}`;
  return `<button class="origem" data-href="${esc(destino)}">${esc(nomeLei(i.lei))}${i.art ? " — " + esc(rotuloArt(i.art, i.lei)) : " (lei inteira)"}</button>`;
}
function alertaMudanca(i) {
  if (!artigoMudou(i)) return "";
  const existe = estado.leis[i.lei]?.artigos[i.art];
  return `<div class="alerta">⚠️ ${existe ? "O artigo foi alterado depois desta marcação" : "Este artigo não existe mais na versão atual"} ` +
    `(marcação feita na versão de ${dataCurta(i.versao)}). O conteúdo foi preservado.</div>
    <div class="linha-acoes"><button data-ver-mudanca="${esc(i.id)}">Ver alteração</button>` +
    `${existe ? `<button data-atualizar-ancora="${esc(i.id)}">Manter na versão atual</button>` : ""}</div>`;
}
function cartoesAnotacoes(lista, termo = "") {
  lista = [...lista].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return `<ul class="lista-cartoes">${lista.map(n => `<li class="cartao-nota">
    ${origemHTML(n)}
    ${n.texto ? `<div class="citacao">“${termo ? destacar(n.texto, termo) : esc(n.texto)}”</div>` : ""}
    ${n.nota ? `<div class="corpo">${termo ? destacar(n.nota, termo) : esc(n.nota)}</div>` : ""}
    ${(n.imagens || []).length ? `<div class="miniaturas" data-imagens="${esc(n.imagens.join(","))}"></div>` : ""}
    ${alertaMudanca(n)}
    <div class="meta">Anotação de ${dataHora(n.criadoEm)}${n.atualizadoEm !== n.criadoEm ? " · editada em " + dataHora(n.atualizadoEm) : ""}</div>
    <div class="linha-acoes"><button data-editar-nota="${esc(n.id)}">Editar</button><button data-apagar-nota="${esc(n.id)}">Apagar</button></div>
  </li>`).join("")}</ul>`;
}
function origemQuestao(qid) {
  const q = estado.q.get(qid);
  if (!q) return `<span class="contagem">Questão de um caderno que não está neste aparelho.</span>`;
  return `<button class="origem" data-href="#/caderno/${esc(q.caderno)}/questao/${esc(q.id)}">★ Questão — ${esc(q.assunto)} · ${esc(q.banca)} ${q.ano}</button>
    <div class="citacao">${esc(q.enunciado.join(" ").slice(0, 180))}…</div>`;
}
function cartoesNotasQ(lista) {
  return `<ul class="lista-cartoes">${[...lista].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).map(n => `<li class="cartao-nota">
    ${origemQuestao(n.q).replace("★ ", "")}<div class="corpo">${esc(n.nota)}</div>
    <div class="meta">Comentário de ${dataHora(n.atualizadoEm)}</div></li>`).join("")}</ul>`;
}
function cartoesGrifos(lista) {
  lista = [...lista].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return `<ul class="lista-cartoes">${lista.map(g => `<li class="cartao-nota">
    ${origemHTML(g)}
    <div class="citacao"><mark class="grifo g-${esc(g.cor)}">${esc(g.texto)}</mark></div>
    ${alertaMudanca(g)}
    <div class="meta">${CORES[g.cor] || ""} · ${dataHora(g.criadoEm)}</div>
    <div class="linha-acoes"><button data-apagar-grifo="${esc(g.id)}">Apagar grifo</button></div></li>`).join("")}</ul>`;
}
function cartoesFavoritos(lista) {
  lista = [...lista].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return `<ul class="lista-cartoes">${lista.map(f => `<li class="cartao-nota">
    ${f.alvo === "questao" ? origemQuestao(f.q) : f.alvo === "lei" ? `<button class="origem" data-href="#/lei/${esc(f.lei)}">★ ${esc(nomeLei(f.lei))} (lei inteira)</button>` : "★ " + origemHTML(f)}
    ${f.texto ? `<div class="citacao">“${esc(f.texto)}”</div>` : ""}
    ${f.alvo === "trecho" ? alertaMudanca(f) : ""}
    <div class="meta">Favoritado em ${dataHora(f.criadoEm)}</div>
    <div class="linha-acoes"><button data-desfavoritar="${esc(f.id)}">Remover dos favoritos</button></div></li>`).join("")}</ul>`;
}

/* ---------- Meus estudos: uma pasta por lei ---------- */
function resumoMarcacoes() {
  const m = new Map();       // lei -> contagens
  const q = { comentarios: 0, favoritas: 0 };
  const de = lei => { if (!m.has(lei)) m.set(lei, { anotacoes: 0, grifos: 0, favoritos: 0, desenhos: 0 }); return m.get(lei); };
  for (const i of estado.itens.values()) {
    if (i.apagado) continue;
    if (i.tipo === "notaq") { q.comentarios++; continue; }
    if (i.tipo === "favorito" && i.alvo === "questao") { q.favoritas++; continue; }
    if (!i.lei || String(i.lei).startsWith("resumo:")) continue;
    if (i.tipo === "anotacao") de(i.lei).anotacoes++;
    else if (i.tipo === "grifo") de(i.lei).grifos++;
    else if (i.tipo === "favorito") de(i.lei).favoritos++;
    else if (i.tipo === "tinta" && temConteudo(i)) de(i.lei).desenhos++;
  }
  return { leis: m, q };
}
function textoContagem(c) {
  return [c.anotacoes && `${c.anotacoes} anotação(ões)`, c.grifos && `${c.grifos} grifo(s)`, c.favoritos && `${c.favoritos} favorito(s)`,
          c.desenhos && `${c.desenhos} artigo(s) com desenhos`].filter(Boolean).join(" · ");
}

async function telaEstudos(sub = "", leiId = "", aba = "anotacoes") {
  await Promise.all(idsAcervo().map(leiDoCache));
  if (sub === "lei" && leiId) return pastaEstudosLei(leiId, aba);
  if (sub === "questoes") return pastaEstudosQuestoes();
  definirTopo({ titulo: "Meus estudos" });
  marcarAba("estudos");
  const { leis, q } = resumoMarcacoes();
  const ordem = [...leis.keys()].sort((a, b) => nomeLei(a).localeCompare(nomeLei(b), "pt-BR"));
  let h = `<div class="secao"><input class="campo" id="busca-estudos" type="search" placeholder="Pesquisar em todas as suas anotações, grifos e favoritos" autocomplete="off"></div>
    <div id="lista-estudos"><ul class="acervo">`;
  for (const lei of ordem) h += linhaPasta({ nome: nomeLei(lei) }, "", textoContagem(leis.get(lei)), `#/estudos/lei/${lei}`);
  if (q.comentarios || q.favoritas) h += linhaPasta({ nome: "Questões" }, "", [q.comentarios && `${q.comentarios} comentário(s)`, q.favoritas && `${q.favoritas} favorita(s)`].filter(Boolean).join(" · "), "#/estudos/questoes");
  h += "</ul>";
  if (!ordem.length && !q.comentarios && !q.favoritas) h += `<p class="vazio">Ainda não há marcações. Na leitura, selecione um trecho para grifar ou anotar, ou toque no número de um artigo.</p>`;
  h += "</div>";
  $("#conteudo").innerHTML = h;
  const campo = $("#busca-estudos");
  const pastasHTML = $("#lista-estudos").innerHTML;
  campo.oninput = aoParar(() => {
    const termo = semAcento(campo.value.trim());
    if (termo.length < 2) { $("#lista-estudos").innerHTML = pastasHTML; return; }
    const ok = i => semAcento([i.nota, i.texto, nomeLei(i.lei), i.art ? rotuloArt(i.art, i.lei) : ""].join(" ")).includes(termo);
    const n = itens("anotacao", ok), g = itens("grifo", ok), f = itens("favorito", i => i.alvo !== "questao" && ok(i));
    $("#lista-estudos").innerHTML = `<div class="secao">
      ${n.length ? `<h3 class="grupo-assunto">Anotações (${n.length})</h3>${cartoesAnotacoes(n, campo.value)}` : ""}
      ${g.length ? `<h3 class="grupo-assunto">Grifos (${g.length})</h3>${cartoesGrifos(g)}` : ""}
      ${f.length ? `<h3 class="grupo-assunto">Favoritos (${f.length})</h3>${cartoesFavoritos(f)}` : ""}
      ${!n.length && !g.length && !f.length ? '<p class="vazio">Nada encontrado nas suas marcações.</p>' : ""}</div>`;
    ativarMiniaturas($("#lista-estudos"));
  });
}

function pastaEstudosLei(lei, aba) {
  definirTopo({ titulo: nomeLei(lei), voltar: "#/estudos" });
  marcarAba("estudos");
  const doLei = tipo => itens(tipo, i => i.lei === lei);
  const cont = {
    anotacoes: doLei("anotacao").length, grifos: doLei("grifo").length,
    favoritos: itens("favorito", i => i.lei === lei && i.alvo !== "questao").length,
    desenhos: itens("tinta", i => i.lei === lei && temConteudo(i)).length,
  };
  const abas = [["anotacoes", "Anotações"], ["grifos", "Grifos"], ["favoritos", "Favoritos"], ["desenhos", "Desenhos e ícones"]];
  $("#conteudo").innerHTML = `<div class="secao">
    <div class="filtros"><div class="segmentado" id="abas-estudos">
      ${abas.map(([v, r]) => `<button data-aba="${v}" aria-pressed="${aba === v}">${r} (${cont[v]})</button>`).join("")}</div></div>
    <div class="filtros">
      <input class="campo" id="busca-estudos" type="search" placeholder="Pesquisar nesta lei" autocomplete="off" style="flex:1;min-width:220px">
      <select class="campo" id="filtro-mudou"><option value="">Todas</option><option value="mudou">Só em artigos alterados</option></select>
    </div>
    <div id="lista-estudos"></div>
    <div class="acoes-linha" style="margin-top:22px">
      ${noAcervo(lei) ? `<a class="botao" href="#/lei/${esc(lei)}" style="text-decoration:none">Abrir a lei</a>
        <a class="botao" href="#/revisao/${esc(lei)}" style="text-decoration:none">⚡ Revisão rápida</a>` : ""}
      <button class="botao" id="apagar-marcacoes-lei" style="color:var(--alt)">Apagar marcações desta lei…</button>
    </div></div>`;
  if (sessionStorage.getItem("filtro-mudou-" + lei) === "1") $("#filtro-mudou").value = "mudou";
  let abaAtual = aba;
  const render = () => {
    const termo = semAcento($("#busca-estudos").value.trim());
    const soMudados = $("#filtro-mudou").value === "mudou";
    const ok = i => i.lei === lei && (!soMudados || artigoMudou(i)) &&
      (!termo || semAcento([i.nota, i.texto, i.art ? rotuloArt(i.art, i.lei) : ""].join(" ")).includes(termo));
    let h;
    if (abaAtual === "anotacoes") { const l = itens("anotacao", ok); h = l.length ? cartoesAnotacoes(l, $("#busca-estudos").value) : '<p class="vazio">Nenhuma anotação.</p>'; }
    else if (abaAtual === "grifos") { const l = itens("grifo", ok); h = l.length ? cartoesGrifos(l) : '<p class="vazio">Nenhum grifo.</p>'; }
    else if (abaAtual === "favoritos") { const l = itens("favorito", i => i.alvo !== "questao" && ok(i)); h = l.length ? cartoesFavoritos(l) : '<p class="vazio">Nenhum favorito.</p>'; }
    else {
      const l = itens("tinta", i => temConteudo(i) && ok(i)).sort((a, b) => compararArtigos(a.art, b.art));
      h = l.length ? `<ul class="lista-cartoes">${l.map(t => `<li class="cartao-nota">
          <button class="origem" data-href="#/lei/${esc(lei)}/${encodeURIComponent(t.art)}">${esc(rotuloArt(t.art, t.lei))}</button>
          <div class="corpo">${(t.tracos || []).length} traço(s)${(t.carimbos || []).length ? ` · ícones: ${t.carimbos.map(c => c.icone).join(" ")}` : ""}</div>
          ${alertaMudanca(t)}
          <div class="meta">Feito com letra tamanho ${t.fonte} · ${dataHora(t.atualizadoEm)}</div>
          <div class="linha-acoes"><button data-apagar-tinta="${esc(t.id)}">Apagar desenhos e ícones deste artigo</button></div></li>`).join("")}</ul>`
        : '<p class="vazio">Nenhum desenho ou ícone.</p>';
    }
    $("#lista-estudos").innerHTML = h;
    ativarMiniaturas($("#lista-estudos"));
  };
  $$("#abas-estudos button").forEach(b => b.onclick = () => {
    abaAtual = b.dataset.aba;
    $$("#abas-estudos button").forEach(x => x.setAttribute("aria-pressed", x === b));
    history.replaceState(null, "", `#/estudos/lei/${lei}/${abaAtual}`);
    render();
  });
  $("#filtro-mudou").onchange = () => { sessionStorage.setItem("filtro-mudou-" + lei, $("#filtro-mudou").value ? "1" : ""); render(); };
  $("#busca-estudos").oninput = aoParar(render);
  $("#apagar-marcacoes-lei").onclick = () => painelApagarMarcacoes(lei);
  render();
}

function pastaEstudosQuestoes() {
  definirTopo({ titulo: "Questões — comentários e favoritas", voltar: "#/estudos" });
  marcarAba("estudos");
  const nq = itens("notaq"), fq = itens("favorito", i => i.alvo === "questao");
  $("#conteudo").innerHTML = `<div class="secao">
    ${nq.length ? `<h3 class="grupo-assunto">Meus comentários (${nq.length})</h3>${cartoesNotasQ(nq)}` : ""}
    ${fq.length ? `<h3 class="grupo-assunto">Questões favoritas (${fq.length})</h3>${cartoesFavoritos(fq)}` : ""}
    ${!nq.length && !fq.length ? '<p class="vazio">Nenhum comentário ou questão favorita.</p>' : ""}</div>`;
}

/* ---------- apagar as marcações de uma lei (escolhendo o quê) ---------- */
function painelApagarMarcacoes(lei) {
  const grupos = [
    ["grifo", "Grifos", i => i.tipo === "grifo"],
    ["anotacao", "Anotações (e as imagens delas)", i => i.tipo === "anotacao"],
    ["favorito", "Favoritos (da lei, de artigos e de trechos)", i => i.tipo === "favorito" && i.alvo !== "questao"],
    ["tinta", "Desenhos, marca-texto e ícones da caneta", i => i.tipo === "tinta" && temConteudo(i)],
  ];
  const da = f => itens(f === "tinta" ? "tinta" : f, i => i.lei === lei && grupos.find(g => g[0] === f)[2](i));
  abrirPainel(`<h2>Apagar marcações ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${esc(nomeLei(lei))}. A lei continua no acervo; só as suas marcações escolhidas são apagadas.</p>
    ${grupos.map(([f, rot]) => { const n = da(f).length; return `<label class="linha-ajuste"><span>${rot} <span class="contagem">(${n})</span></span>
      <input type="checkbox" data-apagar-tipo="${f}" ${n ? "" : "disabled"} style="width:22px;height:22px"></label>`; }).join("")}
    <p class="contagem">Dica: faça um backup antes (Configurações → Exportar backup), caso queira recuperar depois.</p>
    <div class="acoes" style="margin-top:10px"><button class="botao" id="confirmar-apagar" style="color:var(--alt);text-align:center" disabled>Apagar as marcações selecionadas</button></div>`);
  const marcados = () => $$("#painel-caixa [data-apagar-tipo]:checked").map(c => c.dataset.apagarTipo);
  $$("#painel-caixa [data-apagar-tipo]").forEach(c => c.onchange = () => { $("#confirmar-apagar").disabled = !marcados().length; });
  $("#confirmar-apagar").onclick = async () => {
    const lista = marcados().flatMap(da);
    if (!lista.length || !confirm(`Apagar ${lista.length} marcação(ões) de "${nomeLei(lei)}"? Isso não pode ser desfeito sem um backup.`)) return;
    for (const i of lista) await apagarItem(i.id);
    for (const a of itens("anotacao", n => n.lei === lei && n.grifoId && !estado.itens.get(n.grifoId)?.tipo)) await salvarItem({ ...a, grifoId: null });
    fecharPainel();
    if (leiAberta === lei) telaLei(lei); else rotear();
  };
}
