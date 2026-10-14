/* =====================================================================
   PLATAFORMAS DE QUESTÕES
   As duas plataformas (Lei Seca — Verdadeiro ou Falso, e Múltipla Escolha
   tradicional) usam o mesmo filtro profissional, os mesmos filtros salvos,
   as mesmas "Minhas listas de questões" e as mesmas estatísticas.
   O jeito de responder continua o de cada uma (V/F; alternativas com tesoura).
   ===================================================================== */

/* ---------- múltipla escolha: a base com pasta, caderno e assunto ---------- */
function caminhoDoCaderno(c) {
  const p = pastaDoItem("questoes", c.id);
  if (p) return caminhoPasta(p).map(x => x.nome);
  return Array.isArray(c.caminho) ? c.caminho : [];
}
const cadernoVisivelNaLista = c => !(c.soQuestoes && !c.local);           // "só as questões": o arquivo não aparece para quem recebe
function baseME() {
  const out = [];
  for (const c of cadernosTradicionais()) {
    if (cadernoArquivado(c.id)) continue;
    const cam = caminhoDoCaderno(c);
    for (const q of c.questoes) {
      q.caderno = c.id; q.pastaME = cam[0] || "Fora das pastas"; q.subpastaME = cam.slice(1).join(" › "); q.cadernoME = c.titulo;
      out.push(q);
    }
  }
  return out;
}
const CAMPOS_ME = [                                    // os mesmos campos da Lei Seca: Pasta › Subpasta › Arquivo, artigo e a prova
  ["pastas", "Lei/Disciplina", q => [q.pastaME], v => v],
  ["subpastas", "Assunto", q => (q.subpastaME ? [q.subpastaME] : []), v => v],
  ["cadernos", "SubAssunto", q => [q.cadernoME], v => v],
  ["artigos", "Artigo", q => artigosDaQuestao(q), v => { const [l, a] = v.split("|"); return `${rotuloArt(a)} — ${siglaOuNome(l)}`; }],
  ["anos", "Ano", q => (q.ano ? [String(q.ano)] : []), v => v],
  ["cargos", "Cargo", q => (q.cargo ? [q.cargo] : []), v => v],
  ["bancas", "Banca", q => (q.banca ? [q.banca] : []), v => v],
  ["instituicoes", "Instituição", q => (q.orgao || q.instituicao ? [q.orgao || q.instituicao] : []), v => v],
];
function ordenarME(lista) {
  const ordemCad = new Map(cadernosTradicionais().map((c, k) => [c.id, k]));
  return lista.slice().sort((a, b) => (ordemCad.get(a.caderno) ?? 0) - (ordemCad.get(b.caderno) ?? 0) || (a.ordem || 0) - (b.ordem || 0));
}

/* ---------- as duas plataformas ---------- */
const PLAT = {
  ls: { chave: "ls", rota: "#/leiseca", titulo: "Lei Seca — Verdadeiro ou Falso", tituloCurto: "Lei Seca", vf: true, area: "leiseca",
        base: () => baseLS(), get campos() { return CAMPOS_LS; }, cadernos: () => listasLS(), ordenar: l => ordenarLS(l),
        arquivos: "#/leiseca/listas", rotuloArquivos: "📁 Pastas e arquivos", resolver: "#/leiseca/resolver", tipoSalvo: "filtro-ls",
        iniciar: (l, t, p, col) => iniciarSessaoLS(l, t, p, col),
        vazio: `Ainda não há questões. Em <a href="#/leiseca/listas">📁 Pastas e arquivos</a>, crie as pastas (ex.: Código Penal), as subpastas (ex.: Crimes contra a Pessoa) e importe as listas em PDF.` },
  me: { chave: "me", rota: "#/multipla", titulo: "Múltipla Escolha Tradicional", tituloCurto: "Múltipla Escolha", vf: false, area: "questoes",
        base: () => baseME(), campos: CAMPOS_ME, cadernos: () => cadernosTradicionais(), ordenar: l => ordenarME(l),
        arquivos: "#/questoes/cadernos", rotuloArquivos: "📁 Pastas e arquivos", resolver: "#/multipla/resolver", tipoSalvo: "filtro-me",
        iniciar: (l, t, p, col) => iniciarSessaoME(l, t, p, col),
        vazio: `Ainda não há questões. Em <a href="#/questoes/cadernos">📁 Pastas e arquivos</a>, crie as pastas e importe os PDFs de questões.` },
};
const platDaQuestao = q => (String(q.id).startsWith("ls-") || ehListaLS(estado.cadernos[q.caderno]) ? PLAT.ls : PLAT.me);

/* ---------- filtro ---------- */
const filtroVazio = P => ({ ...Object.fromEntries(P.campos.map(c => [c[0], []])), comentarios: "todos", situacao: "todas", modo: "ordenado" });
const filtroQ = P => { const f = Object.assign(filtroVazio(P), lerLS("filtro-" + P.chave, {})); for (const c of P.campos) if (!Array.isArray(f[c[0]])) f[c[0]] = []; return f; };
const gravarFiltroQ = (P, f) => gravarLS("filtro-" + P.chave, f);
function passaFiltroQ(P, q, f, mapa, ignorar = null) {
  for (const c of P.campos) {
    if (c[0] === ignorar) continue;
    const sel = f[c[0]] || [];
    if (sel.length && !c[2](q).some(v => sel.includes(v))) return false;
  }
  if (f.situacao !== "todas") {
    // pelo histórico (a última resposta já dada), e não pela rodada: cada "Filtrar questões" começa uma rodada nova
    const hist = mapa.get(q.id) || [], ult = hist[hist.length - 1];
    const s = !ult ? "nao" : ult.correta ? "certa" : "errada";
    if (f.situacao === "acertei" && s !== "certa") return false;
    if (f.situacao === "errei" && s !== "errada") return false;
    if (f.situacao === "resolvidas" && s === "nao") return false;
    if (f.situacao === "nao" && s !== "nao") return false;
    if (f.situacao === "jaerrei" && !jaErrou(mapa, q.id)) return false;
    if (f.situacao === "favoritas" && !ehFavorito(idFavQ(q.id))) return false;
  }
  if (f.comentarios === "meus") { const n = estado.itens.get(idNotaQ(q.id)); if (!n || n.apagado) return false; }
  if (f.comentarios === "anotacoes" && !refsDe(q).some(r => temMarcasNoArtigo(r.lei, r.art))) return false;
  return true;
}
const passaFiltroLS = (q, f, mapa, ignorar) => passaFiltroQ(PLAT.ls, q, f, mapa, ignorar);

function telaFiltroQ(P) {
  definirTopo({ titulo: P.titulo, voltar: "#/questoes" });
  marcarAba("questoes");
  const base = P.base();
  const mapa = mapaRespostas();
  const f = filtroQ(P);
  const salvos = itens(P.tipoSalvo);
  const nCol = colecoesDe(P).length;
  const qtd = base.filter(q => passaFiltroQ(P, q, f, mapa)).length;
  const e = estatisticas(base, mapa);
  const chip = (grupo, v, r) => `<button class="chip-ls" data-chip="${grupo}" data-v="${v}" aria-pressed="${f[grupo] === v}">${r}</button>`;
  const rotSel = campo => { const sel = f[campo[0]]; return !sel.length ? campo[1] : sel.length === 1 ? campo[3](sel[0]) : `${campo[1]}: ${sel.length} selecionados`; };
  $("#conteudo").innerHTML = `<div class="secao filtro-ls">
    <div class="cab-ls">
      <h2 class="titulo-ls">Filtro de questões</h2>
      <div class="acoes-linha"><a class="botao" href="${P.arquivos}" style="text-decoration:none">${P.rotuloArquivos}</a>
        <a class="botao" href="${P.rota}/minhas-listas" id="ir-colecoes" style="text-decoration:none">📋 Minhas listas${nCol ? ` (${nCol})` : ""}</a>
        <button class="botao" id="ls-salvos">⭐ Filtros salvos${salvos.length ? ` (${salvos.length})` : ""}</button>
        <a class="botao" href="${P.rota}/estatisticas" style="text-decoration:none">📊 Estatísticas</a>
        ${lerLS("sessao-" + P.chave, null) ? `<a class="botao" href="${P.resolver}" style="text-decoration:none">▶️ Continuar de onde parei</a>` : ""}</div>
    </div>
    ${!base.length ? `<div class="aviso">${P.vazio}</div>` : `<p class="contagem">${base.length} questões · ${e.respostas} respostas · ${e.respostas ? `<span class="txt-ok">${e.acertosTotal} acertos</span> e <span class="txt-erro">${e.errosTotal} erros</span> (${e.pctTotal}%)` : "nenhuma respondida ainda"}</p>`}
    <div class="grade-filtro">
      ${P.campos.map(c => `<button class="campo sel-ls ${f[c[0]].length ? "ativo" : ""}" data-campo="${c[0]}"><span>${esc(rotSel(c))}</span><span class="seta">▾</span></button>`).join("")}
    </div>
    <div class="linha-chips"><span>Comentários:</span>${chip("comentarios", "todos", "Todos")}${chip("comentarios", "meus", "Meus comentários")}${chip("comentarios", "anotacoes", "Minhas anotações na lei")}</div>
    <div class="linha-chips"><span>Questões:</span>${chip("situacao", "todas", "Todas")}${chip("situacao", "acertei", "Acertei")}${chip("situacao", "errei", "Errei")}${chip("situacao", "jaerrei", "Já errei alguma vez")}${chip("situacao", "resolvidas", "Resolvidas")}${chip("situacao", "nao", "Não resolvidas")}${chip("situacao", "favoritas", "★ Favoritas")}</div>
    <div class="linha-chips"><span>Modo:</span>${chip("modo", "aleatorio", "Aleatório")}${chip("modo", "ordenado", "Ordenado")}</div>
    <div class="rodape-filtro">
      <button class="link-acao" id="ls-salvar-filtro">💾 Salvar filtro</button>
      <button class="link-acao" id="ls-criar-lista" ${qtd ? "" : "disabled"}>📋 Criar lista com estas ${qtd} questões</button>
      <button class="link-acao perigo" id="ls-limpar">✕ Limpar filtro</button>
      <button class="botao primario btn-filtrar" id="ls-filtrar" ${qtd ? "" : "disabled"}>Filtrar questões (${qtd})</button>
    </div></div>`;
  $$("[data-campo]").forEach(b => b.onclick = () => painelCampoQ(P, b.dataset.campo));
  $$("[data-chip]").forEach(b => b.onclick = () => { const g = filtroQ(P); g[b.dataset.chip] = b.dataset.v; gravarFiltroQ(P, g); telaFiltroQ(P); });
  $("#ls-limpar").onclick = () => { gravarFiltroQ(P, { ...filtroVazio(P), modo: f.modo }); telaFiltroQ(P); };
  $("#ls-salvos").onclick = () => painelFiltrosSalvosQ(P);
  $("#ls-salvar-filtro").onclick = async () => {
    const nome = prompt(`Nome do filtro (ex.: ${P.vf ? "Homicídio — FGV e CESPE" : "Penal — só FGV, 2024 em diante"}):`); if (!nome || !nome.trim()) return;
    await salvarItem({ id: P.tipoSalvo + "|" + uid().slice(0, 8), tipo: P.tipoSalvo, nome: nome.trim(), filtro: filtroQ(P) });
    telaFiltroQ(P); mostrarAvisoRapido("💾 Filtro salvo");
  };
  $("#ls-criar-lista").onclick = () => painelCriarListaDoFiltro(P);
  $("#ls-filtrar").onclick = async () => {
    const g = filtroQ(P), m = mapaRespostas();
    let lista = P.ordenar(P.base().filter(q => passaFiltroQ(P, q, g, m)));
    if (g.modo === "aleatorio") for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
    // as questões filtradas aparecem sem resposta (nova rodada); o histórico e as estatísticas continuam
    await redefinirQuestoes(lista.filter(q => respostaAtual(m, q.id)).map(q => q.id));
    P.iniciar(lista, "Questões filtradas");
  };
}
function painelFiltrosSalvosQ(P) {
  const salvos = itens(P.tipoSalvo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const base = P.base(), mapa = mapaRespostas();
  abrirPainel(`<h2>⭐ Filtros salvos ${botaoFechar}</h2>
    ${salvos.length ? `<ul class="lista-salvos-ls">${salvos.map(sv => `<li><button class="aplicar-salvo" data-aplicar-filtro="${esc(sv.id)}"><strong>${esc(sv.nome)}</strong>
        <span class="contagem">${base.filter(q => passaFiltroQ(P, q, { ...filtroVazio(P), ...sv.filtro }, mapa)).length} questões</span></button>
        <button class="icone-btn" data-apagar-filtro="${esc(sv.id)}" aria-label="Apagar o filtro ${esc(sv.nome)}">🗑</button></li>`).join("")}</ul>`
      : '<p class="contagem">Nenhum filtro salvo ainda. Monte o filtro e toque em “💾 Salvar filtro”.</p>'}`);
  $$("[data-aplicar-filtro]").forEach(b => b.onclick = () => {
    const sv = estado.itens.get(b.dataset.aplicarFiltro);
    gravarFiltroQ(P, { ...filtroVazio(P), ...sv.filtro }); fecharPainel(); telaFiltroQ(P); mostrarAvisoRapido(`Filtro "${sv.nome}" aplicado`);
  });
  $$("[data-apagar-filtro]").forEach(b => b.onclick = async () => {
    if (!confirm("Apagar este filtro salvo?")) return;
    await apagarItem(b.dataset.apagarFiltro); painelFiltrosSalvosQ(P); telaFiltroQ(P);
  });
}
function painelCampoQ(P, nomeCampo) {
  const campo = P.campos.find(c => c[0] === nomeCampo);
  const f = filtroQ(P), mapa = mapaRespostas();
  const base = P.base().filter(q => passaFiltroQ(P, q, f, mapa, nomeCampo));
  const cont = new Map();
  for (const q of base) for (const v of new Set(campo[2](q))) cont.set(v, (cont.get(v) || 0) + 1);
  for (const v of f[nomeCampo]) if (!cont.has(v)) cont.set(v, 0);
  const valores = [...cont.keys()];
  if (nomeCampo === "artigos") valores.sort((a, b) => { const [la, aa] = a.split("|"), [lb, ab] = b.split("|"); return la.localeCompare(lb) || compararArtigos(aa, ab); });
  else if (nomeCampo === "anos") valores.sort((a, b) => String(b).localeCompare(String(a)));
  else valores.sort((a, b) => String(campo[3](a)).localeCompare(String(campo[3](b)), "pt-BR", { numeric: true }));
  const marcados = new Set(f[nomeCampo]);
  abrirPainel(`<h2>${esc(campo[1])} ${botaoFechar}</h2>
    <input class="campo" id="busca-campo-ls" type="search" placeholder="Buscar…" autocomplete="off">
    <div class="acoes-linha" style="margin:8px 0"><button class="botao" id="campo-todos">Marcar os visíveis</button><button class="botao" id="campo-nenhum">Desmarcar todos</button></div>
    <div class="lista-opcoes-ls">${valores.length ? valores.map(v => `<label class="opcao-ls" data-busca="${esc(semAcento(String(campo[3](v))).toLowerCase())}"><input type="checkbox" value="${esc(v)}" ${marcados.has(v) ? "checked" : ""}>
      <span>${esc(campo[3](v))}</span><span class="contagem">${cont.get(v)}</span></label>`).join("") : '<p class="contagem">Nenhuma opção com os outros filtros escolhidos.</p>'}</div>
    <div class="acoes" style="margin-top:12px"><button class="botao primario" id="campo-aplicar">Aplicar</button></div>`);
  $("#busca-campo-ls").oninput = e => { const t = semAcento(e.target.value).toLowerCase(); $$(".opcao-ls").forEach(l => { l.hidden = t && !l.dataset.busca.includes(t); }); };
  $("#campo-todos").onclick = () => $$(".opcao-ls:not([hidden]) input").forEach(i => { i.checked = true; });
  $("#campo-nenhum").onclick = () => $$(".opcao-ls input").forEach(i => { i.checked = false; });
  $("#campo-aplicar").onclick = () => {
    const g = filtroQ(P);
    g[nomeCampo] = $$(".opcao-ls input").filter(i => i.checked).map(i => i.value);
    gravarFiltroQ(P, g); fecharPainel(); telaFiltroQ(P);
  };
}

/* ---------- múltipla escolha: resolver as questões filtradas com a tela de sempre (tesoura, cronômetro…) ---------- */
function iniciarSessaoME(lista, titulo, pos = 0, colecao = null) {
  if (!lista.length) { alert("Nenhuma questão com esse filtro."); return; }
  gravarLS("sessao-me", { ids: lista.map(q => q.id), titulo, criada: agoraISO(), ...(colecao ? { colecao } : {}) });
  const p = lerLS("pos-q", {}); p["f:me"] = lista[Math.min(pos, lista.length - 1)].id; gravarLS("pos-q", p);
  const fs = lerLS("filtros-q", {}); delete fs["f:me"]; gravarLS("filtros-q", fs);
  if (location.hash === "#/multipla/resolver") rotear(); else location.hash = "#/multipla/resolver";
}

/* =====================================================================
   MINHAS LISTAS DE QUESTÕES: listas suas, montadas enquanto resolve
   ===================================================================== */
const colecoesDe = P => itens("colecao", c => c.plat === P.chave).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
async function novaColecao(P, nome, ids = []) {
  return salvarItem({ id: "col|" + uid(), tipo: "colecao", plat: P.chave, nome: nome.trim(), ids });
}
async function alternarNaColecao(colId, qid) {
  const c = { ...estado.itens.get(colId) };
  c.ids = (c.ids || []).includes(qid) ? c.ids.filter(x => x !== qid) : [...(c.ids || []), qid];
  await salvarItem(c);
  return c.ids.includes(qid);
}
const questoesDaColecao = c => (c.ids || []).map(id => estado.q.get(id)).filter(Boolean);
function telaColecoes(P) {
  definirTopo({ titulo: "📋 Minhas listas de questões", voltar: P.rota });
  marcarAba("questoes");
  if (P.chave === "ls") baseLS(); else baseME();
  const mapa = mapaRespostas();
  const cols = colecoesDe(P);
  $("#conteudo").innerHTML = `<div class="secao">
    <p class="contagem" style="margin-top:0">Listas suas, com as questões que você escolher. Enquanto resolve, toque em <strong>📋 Listas</strong> para pôr ou tirar a questão de qualquer lista.</p>
    <div class="acoes-linha"><button class="botao primario" id="col-nova">+ Nova lista</button></div></div>
    <ul class="acervo">${cols.map(c => {
      const qs = questoesDaColecao(c), e = estatisticas(qs, mapa);
      return `<li class="lei-item" style="--cor-aba:var(--oliva)"><span class="aba"></span>
        <button class="abrir" data-col-resolver="${esc(c.id)}"><span class="lei-nome">📋 ${esc(c.nome)}</span>
          <span class="lei-num">${qs.length} questões · ${e.resolvidas} resolvidas${e.respostas ? ` · ${e.pctTotal}% de acerto` : ""}</span></button>
        <button class="mais" data-col-menu="${esc(c.id)}" aria-label="Opções da lista">⋯</button></li>`;
    }).join("")}</ul>
    ${cols.length ? "" : '<p class="vazio">Nenhuma lista ainda. Crie uma aqui ou, enquanto resolve, toque em 📋 Listas.</p>'}`;
  $("#col-nova").onclick = async () => { const n = prompt("Nome da lista (ex.: Revisar homicídio):"); if (n && n.trim()) { await novaColecao(P, n); telaColecoes(P); } };
  $$("[data-col-resolver]").forEach(b => b.onclick = () => {
    const c = estado.itens.get(b.dataset.colResolver), qs = questoesDaColecao(c);
    if (!qs.length) { alert("Esta lista ainda está vazia. Enquanto resolve, toque em 📋 Listas para adicionar questões."); return; }
    P.iniciar(qs, "📋 " + c.nome, 0, c.id);
  });
  $$("[data-col-menu]").forEach(b => b.onclick = () => menuColecao(P, b.dataset.colMenu));
}
function menuColecao(P, id) {
  const c = estado.itens.get(id);
  const qs = questoesDaColecao(c), mapa = mapaRespostas();
  const erradas = qs.filter(q => situacaoQ(mapa, q.id) === "errada");
  abrirPainel(`<h2>📋 ${esc(c.nome)} ${botaoFechar}</h2><p class="contagem" style="margin-top:0">${qs.length} questões</p>
    <div class="acoes">
      <button id="col-resolver" ${qs.length ? "" : "disabled"}>▶️ Resolver a lista</button>
      <button id="col-aleatorio" ${qs.length > 1 ? "" : "disabled"}>🔀 Resolver em ordem aleatória</button>
      ${erradas.length ? `<button id="col-erradas">🔁 Refazer só as ${erradas.length} que errei</button>` : ""}
      <button id="col-redefinir" ${qs.length ? "" : "disabled"}>Redefinir a lista (todas voltam a ficar sem resposta)</button>
      <button id="col-renomear">✏️ Renomear</button>
      <button id="col-apagar" style="color:var(--alt)">🗑 Apagar a lista (as questões continuam no banco)</button>
    </div>`);
  $("#col-resolver").onclick = () => { fecharPainel(); P.iniciar(qs, "📋 " + c.nome, 0, c.id); };
  $("#col-aleatorio").onclick = () => { const l = qs.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } fecharPainel(); P.iniciar(l, "📋 " + c.nome, 0, c.id); };
  if ($("#col-erradas")) $("#col-erradas").onclick = async () => { await redefinirQuestoes(erradas.map(q => q.id)); fecharPainel(); P.iniciar(erradas, "📋 " + c.nome + " — refazendo as erradas", 0, c.id); };
  $("#col-redefinir").onclick = async () => { if (!confirm("As questões desta lista voltam a ficar sem resposta. As estatísticas continuam. Redefinir?")) return; await redefinirQuestoes(qs.map(q => q.id)); fecharPainel(); telaColecoes(P); };
  $("#col-renomear").onclick = async () => { const n = prompt("Novo nome da lista:", c.nome); if (n && n.trim()) { await salvarItem({ ...c, nome: n.trim() }); fecharPainel(); telaColecoes(P); } };
  $("#col-apagar").onclick = async () => { if (!confirm(`Apagar a lista "${c.nome}"? As questões continuam no banco, com as suas respostas.`)) return; await apagarItem(id); fecharPainel(); telaColecoes(P); };
}
/* enquanto resolve: pôr ou tirar a questão de qualquer lista */
function painelColecoesDaQuestao(q, aoMudar = () => {}) {
  const P = platDaQuestao(q);
  const desenhar = () => {
    const cols = colecoesDe(P);
    abrirPainel(`<h2>📋 Listas ${botaoFechar}</h2>
      <p class="contagem" style="margin-top:0">Marque as listas em que esta questão deve ficar.</p>
      <div class="lista-opcoes-ls">${cols.map(c => `<label class="opcao-ls"><input type="checkbox" data-col="${esc(c.id)}" ${(c.ids || []).includes(q.id) ? "checked" : ""}>
        <span>${esc(c.nome)}</span><span class="contagem">${(c.ids || []).length}</span></label>`).join("") || '<p class="contagem">Você ainda não tem listas.</p>'}</div>
      <div class="acoes-linha" style="margin-top:12px"><input class="campo" id="col-nome" placeholder="Nova lista (ex.: Revisar homicídio)" style="flex:1;min-width:180px">
        <button class="botao primario" id="col-criar">+ Criar e adicionar</button></div>`);
    $$("[data-col]").forEach(i => i.onchange = async () => { await alternarNaColecao(i.dataset.col, q.id); aoMudar(); desenhar(); });
    $("#col-criar").onclick = async () => {
      const n = $("#col-nome").value.trim(); if (!n) { $("#col-nome").focus(); return; }
      await novaColecao(P, n, [q.id]); aoMudar(); desenhar(); mostrarAvisoRapido(`📋 Adicionada a "${n}"`);
    };
  };
  desenhar();
}
const rotuloBotaoListas = q => { const n = colecoesDe(platDaQuestao(q)).filter(c => (c.ids || []).includes(q.id)).length; return n ? `📋 Em ${n} lista(s)` : "📋 Listas"; };

/* =====================================================================
   ESTATÍSTICAS (as mesmas nas duas plataformas)
   ===================================================================== */
const PERIODOS_Q = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["tudo", "Tudo"]];
const dimensoesDe = P => [...P.campos.map(c => [c[0], c[1]]), ...(P.vf ? [["gabarito", "Gabarito"]] : [])];
const valoresDimQ = (P, q, dim) => dim === "gabarito" ? [q.gabarito === "C" ? "Verdadeiro" : "Falso"] : P.campos.find(c => c[0] === dim)[2](q);
const rotuloDimQ = (P, dim, v) => dim === "gabarito" ? v : P.campos.find(c => c[0] === dim)[3](v);
const diaLocal = iso => new Date(iso).toLocaleDateString("sv-SE");

function calcularEstatQ(qs, mapa, periodo) {
  const desde = periodo === "tudo" ? "" : new Date(Date.now() - (Number(periodo) - 1) * 864e5).toLocaleDateString("sv-SE");
  const e = { total: qs.length, resolvidas: 0, certas: 0, erradas: 0, respostas: 0, acertos: 0, erros: 0, tempo: 0, porDia: {}, dias: new Set(),
    marcouV: 0, gabV: { r: 0, a: 0 }, gabF: { r: 0, a: 0 }, porQ: [] };
  for (const q of qs) {
    const hq = mapa.get(q.id) || [], atual = hq[hq.length - 1] || null;   // a última resposta já dada (não depende da rodada)
    if (atual) { e.resolvidas++; atual.correta ? e.certas++ : e.erradas++; }
    const rs = (mapa.get(q.id) || []).filter(r => !desde || diaLocal(r.em) >= desde);
    let a = 0, x = 0;
    for (const r of rs) {
      const d = diaLocal(r.em); e.dias.add(d);
      const pd = e.porDia[d] = e.porDia[d] || { certas: 0, erradas: 0 };
      e.respostas++; e.tempo += r.tempo || 0;
      if (r.correta) { e.acertos++; a++; pd.certas++; } else { e.erros++; x++; pd.erradas++; }
      if (r.marcada === "C") e.marcouV++;
      const g = q.gabarito === "C" ? e.gabV : e.gabF; g.r++; if (r.correta) g.a++;
    }
    e.porQ.push({ q, a, x, atual });
  }
  e.pct = e.respostas ? Math.round(100 * e.acertos / e.respostas) : null;
  const todosDias = new Set();                       // dias seguidos estudando: sempre sobre o histórico inteiro
  for (const q of qs) for (const r of mapa.get(q.id) || []) todosDias.add(diaLocal(r.em));
  let seq = 0, d = new Date();
  if (!todosDias.has(d.toLocaleDateString("sv-SE"))) d = new Date(Date.now() - 864e5);
  while (todosDias.has(d.toLocaleDateString("sv-SE"))) { seq++; d = new Date(d.getTime() - 864e5); }
  e.sequencia = seq;
  return e;
}
function agruparQ(P, porQ, dim) {
  const g = new Map();
  for (const x of porQ) for (const v of new Set(valoresDimQ(P, x.q, dim))) {
    const o = g.get(v) || { v, total: 0, resolvidas: 0, respostas: 0, acertos: 0, erros: 0, ids: [] };
    o.total++; o.ids.push(x.q.id); o.respostas += x.a + x.x; o.acertos += x.a; o.erros += x.x; if (x.atual) o.resolvidas++;
    g.set(v, o);
  }
  return [...g.values()];
}
const pctDe = o => o.respostas ? Math.round(100 * o.acertos / o.respostas) : null;
function graficoEvolucaoQ(porDia, nDias) {
  const dias = [];
  for (let k = nDias - 1; k >= 0; k--) dias.push(new Date(Date.now() - k * 864e5).toLocaleDateString("sv-SE"));
  const max = Math.max(1, ...dias.map(d => (porDia[d]?.certas || 0) + (porDia[d]?.erradas || 0)));
  const L = 600, A = 140, w = L / nDias;
  let barras = "";
  const linha = [];
  dias.forEach((d, k) => {
    const c = porDia[d]?.certas || 0, x = porDia[d]?.erradas || 0;
    const hc = A * c / max, he = A * x / max;
    barras += `<rect x="${(k * w + w * 0.1).toFixed(1)}" y="${(A - hc).toFixed(1)}" width="${(w * 0.8).toFixed(1)}" height="${hc.toFixed(1)}" fill="var(--ok)"><title>${dataCurta(d)}: ${c} acertos</title></rect>`;
    barras += `<rect x="${(k * w + w * 0.1).toFixed(1)}" y="${(A - hc - he).toFixed(1)}" width="${(w * 0.8).toFixed(1)}" height="${he.toFixed(1)}" fill="var(--alt)"><title>${dataCurta(d)}: ${x} erros</title></rect>`;
    if (c + x) linha.push(`${(k * w + w / 2).toFixed(1)},${(A - A * c / (c + x)).toFixed(1)}`);
  });
  return `<svg class="grafico-dias" viewBox="0 0 ${L} ${A + 18}" role="img" aria-label="Respostas por dia">
    <line x1="0" y1="${A}" x2="${L}" y2="${A}" stroke="var(--fio)"/>${barras}
    ${linha.length > 1 ? `<polyline points="${linha.join(" ")}" fill="none" stroke="var(--oliva)" stroke-width="2" stroke-dasharray="4 3"><title>% de acerto no dia</title></polyline>` : ""}
    <text x="0" y="${A + 14}" font-size="11" fill="var(--tinta-2)">${dataCurta(dias[0])}</text>
    <text x="${L}" y="${A + 14}" font-size="11" fill="var(--tinta-2)" text-anchor="end">hoje</text></svg>`;
}
function telaEstatisticasQ(P) {
  definirTopo({ titulo: "📊 Estatísticas — " + P.tituloCurto, voltar: P.rota });
  marcarAba("questoes");
  const dims = dimensoesDe(P);
  const cfg = Object.assign({ periodo: "30", escopo: "tudo", dim: dims[0][0], ordem: "pior" }, lerLS("estat-" + P.chave, {}));
  if (!dims.some(d => d[0] === cfg.dim)) cfg.dim = dims[0][0];
  const mapa = mapaRespostas();
  const todas = P.base(), f = filtroQ(P);
  const qs = cfg.escopo === "filtro" ? todas.filter(q => passaFiltroQ(P, q, { ...f, situacao: "todas", comentarios: "todos" }, mapa)) : todas;
  const e = calcularEstatQ(qs, mapa, cfg.periodo);
  const nDias = cfg.periodo === "tudo" ? Math.min(90, Math.max(7, e.dias.size ? Math.ceil((Date.now() - new Date([...e.dias].sort()[0]).getTime()) / 864e5) + 1 : 30)) : Number(cfg.periodo);
  const chip = (k, v, r) => `<button class="chip-ls" data-estat="${k}" data-v="${v}" aria-pressed="${cfg[k] === v}">${r}</button>`;
  const pctRes = e.total ? Math.round(100 * e.resolvidas / e.total) : 0;
  const grupos = agruparQ(P, e.porQ, cfg.dim);
  const ord = { pior: (a, b) => (pctDe(a) ?? 101) - (pctDe(b) ?? 101) || b.respostas - a.respostas, mais: (a, b) => b.respostas - a.respostas,
    nome: (a, b) => String(rotuloDimQ(P, cfg.dim, a.v)).localeCompare(String(rotuloDimQ(P, cfg.dim, b.v)), "pt-BR", { numeric: true }) };
  if (cfg.dim === "artigos" && cfg.ordem === "nome") grupos.sort((a, b) => { const [la, aa] = a.v.split("|"), [lb, ab] = b.v.split("|"); return la.localeCompare(lb) || compararArtigos(aa, ab); });
  else grupos.sort(ord[cfg.ordem] || ord.pior);
  const temArtigos = P.campos.some(c => c[0] === "artigos");
  const fracos = temArtigos ? agruparQ(P, e.porQ, "artigos").filter(o => o.respostas >= 2 && pctDe(o) < 70).sort(ord.pior).slice(0, 8) : [];
  const maisErra = e.porQ.filter(x => x.x).sort((a, b) => b.x - a.x || (a.a - b.a)).slice(0, 10);
  const pV = e.gabV.r ? Math.round(100 * e.gabV.a / e.gabV.r) : null, pF = e.gabF.r ? Math.round(100 * e.gabF.a / e.gabF.r) : null;
  const vies = e.respostas ? Math.round(100 * e.marcouV / e.respostas) : null;
  const linhaGrupo = (o, k) => `<div class="linha-desemp"><span class="nome-desemp">${esc(rotuloDimQ(P, cfg.dim, o.v))} <span class="contagem">(${o.total} questões · ${o.resolvidas} resolvidas)</span></span>
      <span class="barra-desemp" aria-hidden="true"><span class="b-ok" style="width:${o.respostas ? 100 * o.acertos / o.respostas : 0}%"></span><span class="b-erro" style="width:${o.respostas ? 100 * o.erros / o.respostas : 0}%"></span></span>
      <span class="num-desemp">${o.respostas ? `${o.acertos} ✓ · ${o.erros} ✗ · <strong>${pctDe(o)}%</strong>` : "sem respostas"} <button class="link" data-treinar-grupo="${k}">treinar ›</button></span></div>`;
  const resumoRef = q => esc(refsDe(q).map(r => `${rotuloArt(r.art)} — ${siglaOuNome(r.lei)}`).join("; ") || q.referencia || [q.banca, q.ano].filter(Boolean).join(" "));
  $("#conteudo").innerHTML = `<div class="secao estat-ls">
    <div class="linha-chips"><span>Período:</span>${PERIODOS_Q.map(([v, r]) => chip("periodo", v, r)).join("")}</div>
    <div class="linha-chips"><span>Questões:</span>${chip("escopo", "tudo", "Todas")}${chip("escopo", "filtro", "Só as do filtro atual")}</div>
    ${!e.total ? '<p class="vazio">Nenhuma questão para analisar ainda.</p>' : `
    <div class="numeros-desemp">
      <div><strong>${e.respostas}</strong><span>respostas no período</span></div>
      <div><strong class="txt-ok">${e.acertos}</strong><span>acertos</span></div>
      <div><strong class="txt-erro">${e.erros}</strong><span>erros</span></div>
      <div><strong>${e.pct === null ? "—" : e.pct + "%"}</strong><span>de acerto</span></div>
      <div><strong>${formatarTempo(e.tempo)}</strong><span>resolvendo${e.respostas ? ` · ${Math.round(e.tempo / e.respostas)} s por questão` : ""}</span></div>
      <div><strong>${e.dias.size}</strong><span>dia(s) de estudo${e.dias.size ? ` · ${Math.round(e.respostas / e.dias.size)} por dia` : ""}</span></div>
      <div><strong>${e.sequencia}🔥</strong><span>dia(s) seguidos</span></div>
    </div>
    <h3 class="grupo-assunto">Banco de questões (última resposta de cada uma)</h3>
    <div class="cobertura-ls"><span class="b-ok" style="width:${e.total ? 100 * e.certas / e.total : 0}%"></span><span class="b-erro" style="width:${e.total ? 100 * e.erradas / e.total : 0}%"></span></div>
    <p class="contagem">${e.resolvidas} de ${e.total} questões resolvidas (${pctRes}%) · <span class="txt-ok">${e.certas} certas</span> · <span class="txt-erro">${e.erradas} erradas</span> · ${e.total - e.resolvidas} sem resposta.
      Ao filtrar, as questões voltam sem resposta para você resolver de novo, mas o histórico continua contando aqui.</p>
    <div class="acoes-linha">
      ${e.total - e.resolvidas ? `<button class="botao primario" data-treinar="nao">▶️ Resolver as ${e.total - e.resolvidas} não resolvidas</button>` : ""}
      ${e.erradas ? `<button class="botao" data-treinar="erradas">🔁 Refazer as ${e.erradas} que errei</button>` : ""}
    </div>
    <h3 class="grupo-assunto">Evolução ${cfg.periodo === "tudo" ? `(últimos ${nDias} dias)` : `(${nDias} dias)`}</h3>${graficoEvolucaoQ(e.porDia, nDias)}
    <p class="legenda-diff"><span style="color:var(--ok)">■ acertos</span><span style="color:var(--alt)">■ erros</span><span style="color:var(--oliva)">- - % de acerto do dia</span></p>
    ${P.vf ? `<h3 class="grupo-assunto">Verdadeiro ou Falso</h3>
    <p>${e.respostas ? `Quando o gabarito é <strong>Verdadeiro</strong>, você acerta <strong>${pV ?? "—"}${pV === null ? "" : "%"}</strong>; quando é <strong>Falso</strong>, <strong>${pF ?? "—"}${pF === null ? "" : "%"}</strong>.
      Você marca Verdadeiro em ${vies}% das respostas${pV !== null && pF !== null && Math.abs(pV - pF) >= 15 ? ` — <span class="txt-erro">atenção: você tende a errar mais as ${pV < pF ? "verdadeiras (desconfia demais)" : "falsas (deixa passar a pegadinha)"}</span>` : ""}.` : "Sem respostas no período."}</p>` : ""}
    <h3 class="grupo-assunto">Desempenho por</h3>
    <div class="linha-chips">${dims.map(([v, r]) => chip("dim", v, r)).join("")}</div>
    <div class="linha-chips"><span>Ordem:</span>${chip("ordem", "pior", "Menor acerto")}${chip("ordem", "mais", "Mais respondidas")}${chip("ordem", "nome", "Nome")}</div>
    ${grupos.length ? `<div class="tabela-desemp">${grupos.slice(0, 60).map(linhaGrupo).join("")}</div>${grupos.length > 60 ? `<p class="contagem">Mostrando 60 de ${grupos.length}.</p>` : ""}` : '<p class="contagem">Nada para mostrar.</p>'}
    ${temArtigos ? `<h3 class="grupo-assunto">Pontos fracos: artigos com menos de 70% de acerto</h3>
    ${fracos.length ? `<ul class="resultados">${fracos.map((o, k) => `<li><button data-treinar-fraco="${k}"><span class="res-titulo">${esc(rotuloDimQ(P, "artigos", o.v))} — ${pctDe(o)}% (${o.acertos} ✓ · ${o.erros} ✗)</span>
        <span class="res-trecho">${o.total} questão(ões) · toque para treinar</span></button></li>`).join("")}</ul>
      <div class="acoes-linha"><button class="botao primario" id="treinar-fracos">🎯 Treinar todos os pontos fracos</button></div>`
      : '<p class="contagem">Nenhum artigo abaixo de 70% (com pelo menos 2 respostas). 👏</p>'}` : ""}
    <h3 class="grupo-assunto">Questões que você mais erra</h3>
    ${maisErra.length ? `<ul class="resultados">${maisErra.map((x, k) => `<li><button data-mais-erra="${k}"><span class="res-titulo">${x.x} erro(s) em ${x.a + x.x} resposta(s) · ${resumoRef(x.q)}</span>
        <span class="res-trecho">${esc(x.q.enunciado.join(" ").slice(0, 150))}…</span></button></li>`).join("")}</ul>` : '<p class="contagem">Nenhum erro no período.</p>'}`}
  </div>`;
  $$("[data-estat]").forEach(b => b.onclick = () => { gravarLS("estat-" + P.chave, Object.assign({}, cfg, { [b.dataset.estat]: b.dataset.v })); telaEstatisticasQ(P); });
  const porId = new Map(qs.map(q => [q.id, q]));
  const treinar = (ids, titulo, pos = 0) => P.iniciar(P.ordenar(ids.map(id => porId.get(id)).filter(Boolean)), titulo, pos);
  const nomeDim = dims.find(d => d[0] === cfg.dim)[1];
  $$("[data-treinar-grupo]").forEach(b => b.onclick = () => { const o = grupos[Number(b.dataset.treinarGrupo)]; treinar(o.ids, `${nomeDim}: ${rotuloDimQ(P, cfg.dim, o.v)}`); });
  $$("[data-treinar-fraco]").forEach(b => b.onclick = () => { const o = fracos[Number(b.dataset.treinarFraco)]; treinar(o.ids, `Ponto fraco: ${rotuloDimQ(P, "artigos", o.v)}`); });
  if ($("#treinar-fracos")) $("#treinar-fracos").onclick = () => treinar([...new Set(fracos.flatMap(o => o.ids))], "Pontos fracos");
  $$("[data-treinar]").forEach(b => b.onclick = async () => {
    if (b.dataset.treinar === "nao") return treinar(e.porQ.filter(x => !x.atual).map(x => x.q.id), "Não resolvidas");
    const ids = e.porQ.filter(x => x.atual && !x.atual.correta).map(x => x.q.id);
    await redefinirQuestoes(ids); treinar(ids, "Refazendo as que errei");
  });
  $$("[data-mais-erra]").forEach(b => b.onclick = () => P.iniciar(maisErra.map(x => x.q), "Questões que mais erro", Number(b.dataset.maisErra)));
}

/* =====================================================================
   APAGAR OS DADOS DE UMA PLATAFORMA (Configurações → Armazenamento)
   ===================================================================== */
function dadosDaPlataforma(P) {
  const ehLS = P.chave === "ls";
  const daPlat = (qid, cad) => (String(qid).startsWith("ls-") || ehListaLS(estado.cadernos[cad])) === ehLS;
  const respostas = itens("resposta", r => daPlat(r.q, r.caderno));
  const resets = itens("reset", r => (r.ids || []).length && r.ids.every(id => daPlat(id, estado.q.get(id)?.caderno)));
  const extras = [...itens("notaq", n => daPlat(n.q, n.caderno)), ...itens("favorito", f => f.alvo === "questao" && daPlat(f.q, f.caderno)),
    ...itens("colecao", c => c.plat === P.chave), ...itens(P.tipoSalvo)];
  const locais = lerLS("cadernos-locais", []).filter(c => !c.apagado && (c.plataforma === PLATAFORMA_LS) === ehLS);
  const pastas = itens("pasta", p => (p.area || "leis") === P.area);
  return { respostas, resets, extras, locais, pastas };
}
async function apagarDadosPlataforma(P, tudo) {
  const d = dadosDaPlataforma(P);
  for (const i of [...d.respostas, ...d.resets, ...d.extras]) await apagarItem(i.id);
  for (const k of ["filtro-", "sessao-", "estat-"]) localStorage.removeItem(k + P.chave);
  if (tudo) {
    const cache = await caches.open(CACHE_DADOS);
    const ids = new Set(d.locais.map(c => c.id));
    for (const c of d.locais) await cache.delete(c.url);
    gravarLS("cadernos-locais", lerLS("cadernos-locais", []).map(c => ids.has(c.id) ? { ...c, apagado: true, lixeira: undefined, atualizadoEm: agoraISO() } : c));
    for (const id of ids) for (const pre of ["arquivado|caderno|", "fixado|caderno|", "nome-caderno|"]) if (estado.itens.get(pre + id) && !estado.itens.get(pre + id).apagado) await apagarItem(pre + id);
    for (const p of d.pastas) await apagarItem(p.id);
  }
  versaoItens++;
  await carregarQuestoes();
}
function painelApagarPlataforma(P) {
  const d = dadosDaPlataforma(P);
  abrirPainel(`<h2>${esc(P.titulo)} ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Apaga só desta plataforma${cfgSync() ? " (também na sua nuvem e nos seus outros aparelhos)" : ""}. A outra plataforma de questões não é tocada.</p>
    <div class="acoes">
      <button id="plat-zerar">Zerar respostas e estatísticas<br><span class="contagem">${d.respostas.length} resposta(s), além dos comentários, favoritas, minhas listas e filtros salvos desta plataforma (${d.extras.length}). ${P.chave === "ls" ? "As listas importadas" : "Os cadernos"} e as pastas continuam.</span></button>
      <button id="plat-tudo" style="color:var(--alt)">Apagar tudo desta plataforma<br><span class="contagem">Respostas, estatísticas, comentários, favoritas, minhas listas, filtros salvos, ${d.locais.length} ${P.chave === "ls" ? "lista(s) importada(s)" : "caderno(s) importado(s)"} e ${d.pastas.length} pasta(s). Os que vêm do app (publicados pelo dono) continuam.</span></button>
    </div><p class="contagem">Não passa pela lixeira. Se quiser poder voltar atrás, faça antes um backup completo.</p>`);
  const rodar = async (tudo, msg) => {
    if (!confirm(`${msg}? Não dá para desfazer sem um backup.`)) return;
    $$("#painel-caixa button").forEach(b => { b.disabled = true; });
    await apagarDadosPlataforma(P, tudo); fecharPainel(); mostrarAvisoRapido("🗑 " + msg.replace(/^Apagar/, "Apagado:").replace(/^Zerar/, "Zerado:")); telaAjustes();
  };
  $("#plat-zerar").onclick = () => rodar(false, `Zerar as respostas e estatísticas de ${P.tituloCurto}`);
  $("#plat-tudo").onclick = () => rodar(true, `Apagar tudo de ${P.tituloCurto}`);
}

/* do filtro: guardar as questões filtradas numa lista (nova ou que já existe) */
function painelCriarListaDoFiltro(P) {
  const f = filtroQ(P), m = mapaRespostas();
  const qs = P.ordenar(P.base().filter(q => passaFiltroQ(P, q, f, m)));
  const cols = colecoesDe(P);
  abrirPainel(`<h2>📋 Lista com as ${qs.length} questões do filtro ${botaoFechar}</h2>
    <label class="contagem">Nome da lista nova</label>
    <div class="acoes-linha"><input class="campo" id="lf-nome" placeholder="Ex.: Homicídio — FGV" style="flex:1;min-width:180px"><button class="botao primario" id="lf-criar">Criar lista</button></div>
    ${cols.length ? `<p class="contagem" style="margin-top:14px">Ou junte a uma lista que já existe:</p><ul class="lista-salvos-ls">${cols.map(c => `<li><button class="aplicar-salvo" data-lf-juntar="${esc(c.id)}"><strong>${esc(c.nome)}</strong><span class="contagem">${(c.ids || []).length} questões</span></button></li>`).join("")}</ul>` : ""}
    <p class="contagem" id="lf-msg"></p>`);
  const pronto = (c, n) => {
    $("#painel-caixa").innerHTML = `<h2>📋 ${esc(c.nome)} ${botaoFechar}</h2><p class="txt-ok">✓ ${n} questão(ões) na lista (agora com ${(c.ids || []).length}).</p>
      <div class="acoes"><button class="botao primario" id="lf-resolver">▶️ Resolver a lista agora</button><a class="botao" href="${P.rota}/minhas-listas" data-fechar style="text-decoration:none">📋 Ver minhas listas</a></div>`;
    $("#lf-resolver").onclick = () => { fecharPainel(); P.iniciar(questoesDaColecao(c), "📋 " + c.nome, 0, c.id); };
    const b = $("#ir-colecoes"); if (b) b.textContent = `📋 Minhas listas (${colecoesDe(P).length})`;
  };
  $("#lf-criar").onclick = async () => {
    const n = $("#lf-nome").value.trim(); if (!n) { $("#lf-nome").focus(); return; }
    pronto(await novaColecao(P, n, qs.map(q => q.id)), qs.length);
  };
  $$("[data-lf-juntar]").forEach(b => b.onclick = async () => {
    const c = { ...estado.itens.get(b.dataset.lfJuntar) };
    const antes = new Set(c.ids || []);
    c.ids = [...(c.ids || []), ...qs.map(q => q.id).filter(id => !antes.has(id))];
    await salvarItem(c); pronto(c, c.ids.length - antes.size);
  });
}
/* resolvendo uma lista minha: tirar a questão dela */
function sessaoDaColecao(P) { const s = lerLS("sessao-" + P.chave, null); const c = s?.colecao && estado.itens.get(s.colecao); return c && !c.apagado ? c : null; }
async function tirarDaColecaoAtual(P, qid) {
  const c = sessaoDaColecao(P); if (!c) return null;
  await salvarItem({ ...c, ids: (c.ids || []).filter(x => x !== qid) });
  const s = lerLS("sessao-" + P.chave, {});
  s.ids = (s.ids || []).filter(x => x !== qid); gravarLS("sessao-" + P.chave, s);
  mostrarAvisoRapido(`➖ Tirada da lista "${c.nome}"`);
  return s;
}
