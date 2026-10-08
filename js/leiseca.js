/* =====================================================================
   QUESTÕES DE LEI SECA (Verdadeiro ou Falso)
   Leitura das listas em PDF: cada questão traz a referência legal entre
   colchetes, banca, ano, cargo e instituição, o enunciado, o gabarito e a
   resolução (o texto da lei). Rodapés, endereços de sites e números de
   página são descartados.
   As listas são guardadas como cadernos (plataforma "leiseca"): assim
   valem a mesma sincronização, lixeira, pastas e "visível para outros".
   ===================================================================== */
const PLATAFORMA_LS = "leiseca";
Object.assign(SIGLAS_LEI, { LCP: "contravencoes", "DL3688": "contravencoes", CE: "codigo-eleitoral", CPPM: "cppm", CPM: "cpm", "CF/1988": "cf-1988", ECA: "eca",
  LMP: "maria-da-penha", "LEIMARIADAPENHA": "maria-da-penha", "LEIDEDROGAS": "drogas", "ESTATUTODODESARMAMENTO": "desarmamento", LINDB: "lindb", LOMAN: null });
const ehListaLS = c => !!c && c.plataforma === PLATAFORMA_LS;

/* ---------- linhas do PDF (sem as cópias do negrito "falso") ---------- */
async function linhasDoPdfLS(pdfjsLib, dados, aoProgresso) {
  const doc = await pdfjsLib.getDocument({ data: dados, disableFontFace: true, isEvalSupported: false }).promise;
  const linhas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    aoProgresso && aoProgresso(n, doc.numPages);
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const vistos = [];
    const itens = [];
    for (const i of tc.items) {
      if (!i.str || !i.str.trim()) continue;
      const it = { x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]), s: i.str, b: false, i: false };
      // negrito imitado: o mesmo texto impresso de novo quase no mesmo lugar
      if (vistos.some(v => v.s === it.s && Math.abs(v.x - it.x) < 2.5 && Math.abs(v.y - it.y) < 2.5)) continue;
      vistos.push(it); itens.push(it);
    }
    let ant = null;
    for (const l of linhasDosItensLS(itens)) {
      linhas.push({ t: l.texto, x: l.x, h: l.h, pag: n, salto: ant ? (l.y - ant.y) > ant.h * 2.2 : true });
      ant = l;
    }
  }
  return linhas;
}
/* junta os pedaços de texto em linhas; espaço só onde há um vão de verdade (o espaçamento entre letras
   de algumas fontes separava palavras como "ar tigo" e "abor to") */
const VAO_PALAVRA_LS = 0.22;
function linhasDosItensLS(itens) {
  itens.sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of itens) {
    let l = linhas.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
    if (!l) { l = { y: it.y, itens: [] }; linhas.push(l); }
    l.itens.push(it);
  }
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x - b.x);
    let texto = "", fim = null;
    for (const it of l.itens) {
      let s = it.s;
      if (fim !== null && it.x - fim > it.h * VAO_PALAVRA_LS && !/\s$/.test(texto) && !/^\s/.test(s)) s = " " + s;
      texto += s; fim = it.x + it.w;
    }
    l.texto = texto.replace(/\s+/g, " ").trim(); l.x = l.itens[0].x; l.h = Math.max(...l.itens.map(i => i.h));
  }
  return linhas.filter(l => l.texto).sort((a, b) => a.y - b.y);
}
/* rodapés e qualquer indicação de onde a lista foi tirada */
const LINHA_DESCARTE = [/https?:\/\//i, /www\./i, /\.(app|com|br)\b/i, /decorando/i, /lei\s*seca\.app/i, /^P[áa]gina\s+\d+\s+de\s+\d+$/i,
  /^\d{2}\/\d{2}\/\d{4},?\s+\d{1,2}[:h ]\d{2}$/, /^[:·.\s]+$/];
const ehDescarte = t => LINHA_DESCARTE.some(r => r.test(t));

/* ---------- referência legal: "Art. 121, § 1º, CP" · "Art. 121, CP c/c Art. 305, CTB" · "Art. 7º, I, Lei 11.340/06" ---------- */
function leiDaSigla(sigla, catalogo) {
  const s = sigla.trim();
  const chave = semAcento(s).toUpperCase().replace(/[\s.º°]+/g, "");
  if (SIGLAS_LEI[chave] !== undefined && SIGLAS_LEI[chave]) return SIGLAS_LEI[chave];
  const n = s.match(/(\d{1,3}(?:\.\d{3})*|\d{3,6})\s*\/\s*(\d{2,4})/);
  if (n && catalogo) {
    const num = n[1].replace(/\./g, "");
    const achado = catalogo.find(l => String(l.n || "").replace(/\D/g, "").startsWith(num) && String(l.n || "").replace(/\D/g, "").length - num.length <= 4);
    if (achado) return achado.id;
  }
  if (catalogo) {                                             // "Código de Trânsito", "Estatuto da Criança"…
    const alvo = semAcento(s).toLowerCase();
    const achado = catalogo.find(l => alvo.length > 4 && semAcento(l.nome || "").toLowerCase().includes(alvo));
    if (achado) return achado.id;
  }
  return null;
}
function lerReferencia(txt, catalogo) {
  const refs = [];
  let ultimaLei = null;
  const partes = txt.split(/\s+c\/c\s+|\s*;\s*/i).map(x => x.trim()).filter(Boolean);
  for (const p of partes.reverse()) {                         // a lei costuma vir no fim: "Art. 121, CP c/c Art. 305, CTB"
    let corpo = p.replace(/^arts?\s*[.,]?\s*/i, "");
    const segs = corpo.split(/\s*,\s*/);
    let lei = segs.length > 1 ? leiDaSigla(segs[segs.length - 1], catalogo) : null;
    const sigla = lei ? segs.pop() : "";
    if (!lei) lei = ultimaLei;
    if (lei) ultimaLei = lei;
    corpo = segs.join(", ");
    // "18, II e 121, § 3º" → dois artigos; "121, § 2°, III, e § 3°" → um só (o "e" não vem seguido de número de artigo)
    const pedacos = corpo.split(/,?\s+e\s+(?=(?:arts?\.?\s*)?\d{1,4}(?:-[A-Z])?\s*[ºo°]?\s*(?:,|$))/i);
    const daParte = [];
    for (const ped of pedacos) {
      let resto = ped.replace(/^arts?\.?\s*/i, "").trim();
      const arts = [];
      let m;
      while ((m = resto.match(/^(\d{1,4}(?:-[A-Z])?)\s*[ºo°]?\s*(?:,\s*(?=\d{1,4}(?:-[A-Z])?\s*[ºo°]?\s*(?:,|$))|$)/i))) {
        // "129, 8º" (faltou o §): número menor que o artigo anterior é parágrafo, não outro artigo
        if (arts.length && parseInt(m[1]) < parseInt(arts[arts.length - 1])) { resto = "§ " + resto; break; }
        arts.push(m[1].toUpperCase()); resto = resto.slice(m[0].length).replace(/^,\s*/, "");
      }
      if (!arts.length) { const m2 = resto.match(/^(\d{1,4}(?:-[A-Z])?)\s*[ºo°]?\s*,?\s*/i); if (!m2) continue; arts.push(m2[1].toUpperCase()); resto = resto.slice(m2[0].length); }
      const disp = arts.length > 1 ? "" : resto.replace(/^e\s+/, "").trim();
      for (const art of arts) daParte.push({ lei, art, disp, sigla, texto: p });
    }
    refs.unshift(...daParte);
  }
  return refs;
}
/* "FGV 2026 - Delegado de Polícia (PC-PI)" · "CESPE/CEBRASPE 2025 - Técnico Judiciário - Agente da Polícia Judicial (STM)" */
function normalizarBanca(b) {
  let x = b.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim().toUpperCase();
  if (/^(CESPE|CEBRASPE|CESPE\/CEBRASPE|CEBRASPE\/CESPE)$/.test(x)) x = "CESPE/CEBRASPE";
  return x;
}
const tituloSeMaiusculas = t => (t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚ]{4}/.test(t)
  ? t.toLowerCase().replace(/(^|[\s\-–(/])(\p{L})/gu, (m, a, l) => a + l.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E|Em|Para)\b/g, w => w.toLowerCase())
  : t);
function lerProva(txt) {
  if (/^Quest[ãa]o in[ée]dita/i.test(txt)) return { banca: "Questão inédita", ano: "", cargo: "", instituicao: "", obs: "" };
  const m = txt.match(/^(.*?)\s+((?:19|20)\d{2})\s*(?:[-–—]\s*(.*))?$/);
  if (!m) return { banca: normalizarBanca(txt), ano: "", cargo: "", instituicao: "", obs: "" };
  let resto = (m[3] || "").trim(), instituicao = "", obs = "";
  const p = [...resto.matchAll(/\(([^()]+)\)/g)].pop();             // a instituição é o último parêntese
  if (p) {
    instituicao = p[1].replace(/\s*-\s*/g, "-").trim();
    obs = resto.slice(p.index + p[0].length).replace(/^\s*[-–—]\s*/, "").trim();      // ex.: "Prova Anulada"
    resto = resto.slice(0, p.index).trim();
  }
  const banca = normalizarBanca(m[1]);
  if (!instituicao) instituicao = /exame\s+d[ae]\s+ordem|\boab\b/i.test(resto) ? "OAB" : /^(MP[EFTU]?|MPT|PGR|TRF|TJ|TRT|TRE|DPE|DPU|PC|PM|PF|PRF|STM|STJ|STF)\b/.test(banca) ? banca : "";
  return { banca, ano: m[2], cargo: tituloSeMaiusculas(resto.replace(/\s*[-–—]\s*$/, "")), instituicao: instituicao.toUpperCase(), obs };
}

/* ---------- palavras partidas pelo PDF ("ar tigo", "abor to", "per turbando") ----------
   Só junta quando a palavra inteira aparece escrita certa em outro ponto da lista (ou é uma palavra jurídica
   comum): "por terceiro" continua separado. */
const PALAVRAS_RT = new Set(["artigo", "artigos", "aborto", "abortos", "abortivo", "morte", "morto", "furto", "furtos", "parte", "partes", "parto", "porte", "portador",
  "portaria", "certo", "certa", "certeza", "certidão", "forte", "sorte", "norte", "carta", "importa", "importante", "perturbação", "perturbar", "perturbando",
  "transportar", "transporte", "liberdade", "aberto", "aberta", "abertura", "coberto", "oferta", "alerta", "particular", "participação", "partícipe"]);
function consertarPalavras(txt, vocab) {
  return txt.replace(/\b([Aa])r t(s?)\b\.?/g, (m, a, s2) => a + "rt" + s2 + (m.endsWith(".") ? "." : "")).replace(/(\p{L}*r) (t\p{L}+)/gu, (tudo, a, b) => {
    const junta = (a + b).toLowerCase();
    return vocab.has(junta) || PALAVRAS_RT.has(junta) ? a + b : tudo;
  });
}

/* ---------- a lista inteira ---------- */
function lerListaLeiSeca(linhas, catalogo) {
  const vocab = new Set(linhas.flatMap(l => l.t.toLowerCase().match(/\p{L}{5,}/gu) || []));
  linhas = linhas.map(l => ({ ...l, t: consertarPalavras(l.t, vocab) }));
  const INICIO = /^(\d{1,4})\s*\[([^\]]{3,160})\]\s*(.*)$/;
  // questões feitas pela própria fonte trazem o nome dela no lugar da banca: viram "Questão inédita"
  const semOrigem = t => t.replace(/decorando\s+a\s+lei\s+seca/ig, "Questão inédita");
  const limpas = linhas.map(l => (INICIO.test(l.t) ? { ...l, t: semOrigem(l.t) } : l)).filter(l => INICIO.test(l.t) || !ehDescarte(l.t));
  const blocos = [];
  let atual = null;
  for (const l of limpas) {
    const m = l.t.match(INICIO);
    if (m) { atual = { num: Number(m[1]), ref: m[2], cab: [m[3]], linhas: [] }; blocos.push(atual); continue; }
    if (atual) atual.linhas.push(l);
  }
  const questoes = [], problemas = [];
  for (const b of blocos) {
    // o cabeçalho continua até fechar a instituição entre parênteses (no máximo 3 linhas)
    let k = 0;
    const abertos = () => { const t = b.cab.join(" "); return (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length; };
    while (k < b.linhas.length && k < 3 && !/\)\s*$/.test(b.cab.join(" ")) && (abertos() > 0 || !b.linhas[k].salto) && !/^\(\s*\)\s*(Verdadeiro|Falso)/i.test(b.linhas[k].t)) b.cab.push(b.linhas[k++].t);
    const enun = [], resol = [];
    let gabarito = null, fase = "enunciado", par = null;
    for (; k < b.linhas.length; k++) {
      const l = b.linhas[k], t = l.t;
      if (/^\(\s*\)\s*(Verdadeiro|Falso|Certo|Errado)\s*$/i.test(t)) { fase = "opcoes"; continue; }
      const g = t.match(/^Gabarito(?:\s+oficial)?(?:\s+d[ae]\s+banca)?\s*[:;.\-–]?\s*(Verdadeiro|Falso|Certo|Errado|V|F|C|E)\b/i);
      if (g) { gabarito = /^(v|c)/i.test(g[1]) ? "C" : "E"; fase = "resolucao"; par = null; continue; }
      if (fase === "enunciado") { if (par && !l.salto) par.push(t); else { par = [t]; enun.push(par); } }
      else if (fase === "resolucao") resol.push({ t, salto: l.salto });
    }
    const prova = lerProva(b.cab.join(" ").replace(/\s+/g, " ").trim());
    if (!gabarito || !enun.length) { problemas.push(b.num); continue; }
    const enunciado = enun.map(p => p.join(" ").replace(/\s+/g, " ").trim());
    // resolução: junta as linhas quebradas em parágrafos (novo parágrafo em "Art.", "§", incisos, alíneas, "[...]" ou espaço grande)
    const resolucao = [];
    for (const r of resol) {
      const novo = r.salto || /^(Art\.|§|Parágrafo único|Pena|[IVXLC]+\s*[-–—]|[a-z]\)|\[\.\.\.\]|Súmula|STF|STJ)/.test(r.t) || !resolucao.length;
      if (novo) resolucao.push(r.t); else resolucao[resolucao.length - 1] += " " + r.t;
    }
    const refs = lerReferencia(b.ref, catalogo);
    const id = "ls-" + hashCurto(b.ref + "|" + enunciado.join(" ") + "|" + prova.banca + prova.ano);
    questoes.push({ id, tipo: "CE", plataforma: PLATAFORMA_LS, numero: b.num, referencia: b.ref.trim(), refs, ...prova, enunciado, gabarito,
      alternativas: [{ letra: "C", texto: "Verdadeiro" }, { letra: "E", texto: "Falso" }], resolucao,
      vinculo: refs[0] && refs[0].lei ? { lei: refs[0].lei, de: refs[0].art, ate: refs[0].art } : null });
  }
  // a mesma questão repetida na lista entra uma vez só
  const vistas = new Set();
  const unicas = questoes.filter(q => (vistas.has(q.id) ? false : (vistas.add(q.id), true)));
  return { questoes: unicas, repetidas: questoes.length - unicas.length, problemas, total: blocos.length };
}

/* =====================================================================
   ENTRADA DE QUESTÕES: escolher entre Lei Seca (V/F) e os cadernos
   ===================================================================== */
const listasLS = () => Object.values(estado.cadernos).filter(ehListaLS);
const cadernosTradicionais = () => Object.values(estado.cadernos).filter(c => !ehListaLS(c));
function telaEntradaQuestoes() {
  definirTopo({ titulo: "Questões", voltar: null });
  marcarAba("questoes");
  const mapa = mapaRespostas();
  const qsLS = baseLS();
  const eLS = estatisticas(qsLS, mapa);
  const cads = cadernosTradicionais();
  const eC = estatisticas(cads.flatMap(c => c.questoes), mapa);
  $("#conteudo").innerHTML = `<div class="secao entrada-questoes">
    <button class="cartao-plataforma" data-href="#/leiseca">
      <span class="plat-icone">⚖️</span>
      <span class="plat-titulo">Lei Seca — Verdadeiro ou Falso</span>
      <span class="plat-texto">Questões de concursos baseadas no texto da lei, com filtro por lei, artigo, assunto, banca, ano, cargo e instituição. Cada resolução leva direto ao artigo.</span>
      <span class="plat-num">${qsLS.length} questões${eLS.respostas ? ` · ${eLS.pctTotal}% de acerto` : ""}</span>
    </button>
    <button class="cartao-plataforma" data-href="#/questoes/cadernos">
      <span class="plat-icone">📝</span>
      <span class="plat-titulo">Cadernos de questões</span>
      <span class="plat-texto">As listas de múltipla escolha e Certo/Errado importadas em PDF, organizadas em pastas, com índice, gabarito e estatísticas.</span>
      <span class="plat-num">${cads.length} caderno(s)${eC.respostas ? ` · ${eC.pctTotal}% de acerto` : ""}</span>
    </button>
  </div>`;
}

/* =====================================================================
   MINHAS LISTAS (Lei Seca): pastas = assunto, subpastas = subassunto
   ===================================================================== */
function caminhoDaLista(c) {
  const p = pastaDoItem(PLATAFORMA_LS, c.id);
  if (p) return caminhoPasta(p).map(x => x.nome);
  return Array.isArray(c.caminho) ? c.caminho : [];
}
function telaListasLS(pastaId = null) {
  const pasta = pastaId ? estado.itens.get(pastaId) : null;
  if (pastaId && !pastaViva(pasta)) { location.hash = "#/leiseca/listas"; return; }
  definirTopo({ titulo: pasta ? pasta.nome : "Minhas listas", voltar: pasta ? voltarDaPasta(PLATAFORMA_LS, pastaId) : "#/leiseca" });
  marcarAba("questoes");
  const pastas = pastasDe(PLATAFORMA_LS, pastaId || null).filter(p => !p.arquivada);
  const noLugar = new Set(itensDaPasta(PLATAFORMA_LS, pastaId || null));
  const listas = listasLS().filter(c => noLugar.has(c.id) && !cadernoArquivado(c.id)).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true }));
  const nArq = listasLS().filter(c => cadernoArquivado(c.id)).length + pastasDe(PLATAFORMA_LS).filter(p => p.arquivada).length;
  const mapa = mapaRespostas();
  let h = `<div class="secao" style="margin-bottom:0">${pasta ? trilhaPasta(PLATAFORMA_LS, pastaId) : `<p class="contagem" style="margin-top:0">No filtro de questões, a pasta principal vira o <strong>Código/Lei</strong>, a subpasta vira o <strong>Assunto</strong> e cada arquivo enviado vira o <strong>SubAssunto</strong>. Importe as listas em PDF dentro da subpasta certa.</p>`}
    <div class="acoes-linha">
      <button class="botao primario" id="importar-lista-ls">📥 Importar lista (PDF)</button>
      <button class="botao" id="nova-pasta-ls">+ Nova ${pasta ? "subpasta" : "pasta"}</button>
      ${botaoSelecionar(PLATAFORMA_LS)}
      ${pasta ? `<button class="botao" data-menu-pasta="${esc(pastaId)}">⋯ Opções da pasta</button>` : ""}
      ${!pasta && nArq ? `<a class="botao" href="#/leiseca/arquivadas" style="text-decoration:none">📦 Arquivadas (${nArq})</a>` : ""}
    </div></div><ul class="acervo">`;
  for (const p of pastas) h += linhaPasta(p, rotuloQtd(PLATAFORMA_LS, p.id), "", rotaPastaArea(PLATAFORMA_LS, p.id));
  for (const c of listas) h += linhaListaLS(c, mapa);
  h += "</ul>";
  if (!listas.length && !pastas.length) h += `<p class="vazio">${pasta ? "Pasta vazia. Importe uma lista para cá ou crie uma subpasta." : "Nenhuma lista ainda. Crie a pasta principal (Código/Lei), a subpasta (Assunto) e importe as listas em PDF."}</p>`;
  $("#conteudo").innerHTML = h;
  $("#importar-lista-ls").onclick = () => painelImportarListaLS(pastaId || null);
  $("#nova-pasta-ls").onclick = async () => { if (await novaPasta(PLATAFORMA_LS, pastaId || null)) telaListasLS(pastaId); };
  ligarBotaoSelecionar();
}
function linhaListaLS(c, mapa) {
  const e = estatisticas(c.questoes, mapa);
  return `<li class="lei-item" data-sel-id="${esc(c.id)}" style="--cor-aba:var(--oliva)"><span class="aba"></span>
    <button class="abrir" data-lista-ls="${esc(c.id)}">
      <span class="lei-nome">${cadernoFixado(c.id) ? '<span class="lei-pin">📌</span> ' : ""}${esc(c.titulo)}${cfgDono() ? (ehVisivelParaTodos(c.id) ? ' <span class="selo-vis" title="Visível para todos">👁</span>' : ' <span class="selo-vis" title="Só na sua conta">🙈</span>') : ""}${cadernoArquivado(c.id) ? " 📦" : ""}</span>
      <span class="lei-num">${c.questoes.length} questões · ${e.resolvidas} resolvidas${e.respostas ? ` · ${e.pctTotal}% de acerto` : ""}</span>
    </button>
    <button class="mais" data-menu-lista-ls="${esc(c.id)}" aria-label="Opções da lista">⋯</button></li>`;
}
function telaListasArquivadasLS() {
  definirTopo({ titulo: "📦 Listas arquivadas", voltar: "#/leiseca/listas" });
  marcarAba("questoes");
  const mapa = mapaRespostas();
  let h = `<div class="secao"><p class="contagem" style="margin-top:0">Listas e pastas arquivadas não entram no filtro de questões${cfgDono() ? " nem aparecem para os outros usuários" : ""}.</p></div><ul class="acervo">`;
  for (const p of pastasDe(PLATAFORMA_LS).filter(p => p.arquivada)) h += linhaPasta(p, rotuloQtd(PLATAFORMA_LS, p.id), "", rotaPastaArea(PLATAFORMA_LS, p.id));
  for (const c of listasLS().filter(c => cadernoArquivado(c.id))) h += linhaListaLS(c, mapa);
  $("#conteudo").innerHTML = h + "</ul>";
}
function menuListaLS(id) {
  const c = estado.cadernos[id];
  if (!c) return;
  const volta = () => rotear();
  abrirPainel(`<h2>${esc(c.titulo)} ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${c.questoes.length} questões${caminhoDaLista(c).length ? " · " + esc(caminhoDaLista(c).join(" › ")) : ""}</p>
    <div class="acoes">
      <button id="l-resolver">▶️ Resolver só esta lista</button>
      <button id="l-renomear">✏️ Renomear</button>
      <button id="l-mover">📁 Mover para pasta…</button>
      ${botoesCadernoExtras(id)}
      ${cfgDono() && ehVisivelParaTodos(id) ? '<button id="l-atualizar">🔄 Atualizar o que os outros veem (nome, pasta e questões)</button>' : ""}
    </div>`);
  $("#l-resolver").onclick = () => { fecharPainel(); iniciarSessaoLS(c.questoes.slice().sort((a, b) => (a.numero || 0) - (b.numero || 0)), c.titulo); };
  $("#l-renomear").onclick = async () => { if (await renomearCaderno(id)) { fecharPainel(); volta(); } };
  $("#l-mover").onclick = () => painelMover(PLATAFORMA_LS, id, c.titulo, volta);
  ligarCadernoExtras(id, volta);
  if ($("#l-atualizar")) $("#l-atualizar").onclick = async () => {
    const b = $("#l-atualizar"); b.disabled = true;
    try { await publicarCaderno(id, t => { b.textContent = t; }); fecharPainel(); mostrarAvisoRapido("🔄 Atualizado para os outros usuários"); }
    catch (e) { b.textContent = "⚠️ " + e.message; b.disabled = false; }
  };
}
function painelImportarListaLS(pastaId) {
  abrirPainel(`<h2>Importar lista de Lei Seca ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">PDF com as questões de Verdadeiro ou Falso: referência do artigo entre colchetes, banca, ano, cargo, enunciado, gabarito e resolução. Dá para escolher vários arquivos de uma vez.
      ${pastaId ? `Vai para a pasta <strong>${esc(textoCaminho(pastaId))}</strong>.` : "Vai para o início de Minhas listas (dá para mover depois)."}</p>
    <div class="acoes"><button class="botao primario" id="ls-escolher">Escolher PDF</button>
      <button class="botao" id="ls-drive">☁️ Escolher no Google Drive</button></div>
    <input type="file" id="ls-arq" accept="application/pdf,.pdf" multiple hidden>
    <div id="ls-res"></div>`);
  const res = $("#ls-res");
  const processar = async arquivos => {
    const pdfjs = await abrirPdfJs();
    const lidas = [];
    for (const arq of arquivos) {
      try {
        const linhas = await linhasDoPdfLS(pdfjs, new Uint8Array(await arq.arrayBuffer()), (a, b) => { res.innerHTML = `<p class="contagem">Lendo ${esc(arq.name)}: página ${a} de ${b}…</p>`; });
        const r = lerListaLeiSeca(linhas, catalogoParaVinculo());
        lidas.push({ arq, r, titulo: arq.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim() });
      } catch (e) { lidas.push({ arq, erro: e.message }); }
    }
    res.innerHTML = lidas.map((x, k) => x.erro ? `<p class="alerta">✗ ${esc(x.arq.name)}: ${esc(x.erro)}</p>` : `<div class="cartao" style="margin-top:12px">
        <label class="contagem">Nome da lista</label><input class="campo" data-titulo-ls="${k}" value="${esc(x.titulo)}">
        <p style="margin:8px 0 4px"><strong>${x.r.questoes.length} questões</strong> · ${x.r.questoes.filter(q => q.gabarito === "C").length} verdadeiras e ${x.r.questoes.filter(q => q.gabarito === "E").length} falsas</p>
        <p class="contagem">${x.r.questoes.filter(q => q.refs.some(r => r.lei)).length} ligadas a um artigo de lei · bancas: ${esc([...new Set(x.r.questoes.map(q => q.banca))].slice(0, 6).join(", "))}${x.r.problemas.length ? ` · ${x.r.problemas.length} questão(ões) sem gabarito ficaram de fora (nº ${x.r.problemas.join(", ")})` : ""}</p></div>`).join("") +
      (lidas.some(x => !x.erro && x.r.questoes.length) ? `<div class="acoes" style="margin-top:12px"><button class="botao primario" id="ls-salvar">Adicionar ${lidas.filter(x => !x.erro).length > 1 ? "as listas" : "a lista"}</button></div>` : "");
    if ($("#ls-salvar")) $("#ls-salvar").onclick = async () => {
      $("#ls-salvar").disabled = true;
      const feitas = [];
      for (const [k, x] of lidas.entries()) {
        if (x.erro || !x.r.questoes.length) continue;
        const titulo = $(`[data-titulo-ls="${k}"]`).value.trim() || x.titulo;
        feitas.push(await salvarListaLS(titulo, x.r.questoes, pastaId));
      }
      res.innerHTML = `<p class="txt-ok" style="margin-top:12px">✓ ${feitas.length} lista(s) adicionada(s) com ${feitas.reduce((s, c) => s + c.questoes.length, 0)} questões. Elas já aparecem no filtro.</p>`;
      if (location.hash.startsWith("#/leiseca")) rotear();
    };
  };
  $("#ls-escolher").onclick = () => $("#ls-arq").click();
  $("#ls-arq").onchange = e => { const a = [...e.target.files]; e.target.value = ""; if (a.length) processar(a); };
  $("#ls-drive").onclick = async () => {
    try { res.innerHTML = '<p class="contagem">Abrindo o Google Drive…</p>'; const a = await arquivosDoDrive(["application/pdf"]); res.innerHTML = ""; if (a.length) processar(a); }
    catch (e) { res.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; }
  };
}
async function salvarListaLS(titulo, questoes, pastaId) {
  const id = "ls-" + semAcento(titulo).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + hashCurto(questoes.map(q => q.id).join(""));
  const cad = { id, titulo, plataforma: PLATAFORMA_LS, materia: "Lei Seca", versao: new Date().toISOString().slice(0, 10), assuntos: [], observacao: "Lista de lei seca importada no app.",
    questoes: questoes.map((q, k) => ({ ...q, ordem: k + 1, assunto: "", materia: "Lei Seca" })) };
  const url = `dados/questoes/local/${id}.json`;
  const cache = await caches.open(CACHE_DADOS);
  await cache.put(new Request(url), new Response(JSON.stringify(cad), { headers: { "content-type": "application/json" } }));
  const locais = lerLS("cadernos-locais", []).filter(c => c.id !== id);
  locais.push({ id, titulo, materia: "Lei Seca", plataforma: PLATAFORMA_LS, url, qtd: questoes.length, atualizadoEm: agoraISO() });
  gravarLS("cadernos-locais", locais);
  await carregarQuestoes();
  if (pastaId) await moverParaPasta(PLATAFORMA_LS, id, pastaId);
  return estado.cadernos[id] || cad;
}

/* =====================================================================
   FILTRO DE QUESTÕES
   ===================================================================== */
const FILTRO_LS_VAZIO = { leis: [], assuntos: [], subassuntos: [], artigos: [], anos: [], cargos: [], bancas: [], instituicoes: [], comentarios: "todos", situacao: "todas", modo: "ordenado" };
const filtroLS = () => Object.assign({}, FILTRO_LS_VAZIO, lerLS("filtro-ls", {}));
const gravarFiltroLS = f => gravarLS("filtro-ls", f);
/* todas as questões de lei seca disponíveis (listas fora do arquivo e da lixeira), com assunto e subassunto da pasta */
function baseLS() {
  const out = [];
  for (const c of listasLS()) {
    if (cadernoArquivado(c.id)) continue;
    // Código/Lei = pasta principal · Assunto = subpasta · SubAssunto = o arquivo (a lista) enviado
    const cam = caminhoDaLista(c);
    const pasta = cam[0] || "Fora das pastas", assunto = cam.slice(1).join(" › ");
    for (const q of c.questoes) { q.caderno = c.id; q.pastaLS = pasta; q.assuntoLS = assunto; q.subassuntoLS = c.titulo; out.push(q); }
  }
  return out;
}
const leisDaQuestao = q => [...new Set((q.refs || []).map(r => r.lei).filter(Boolean))];
const artigosDaQuestao = q => (q.refs || []).filter(r => r.lei).map(r => r.lei + "|" + r.art);
const CAMPOS_LS = [
  ["leis", "Código/Lei", q => [q.pastaLS], v => v],
  ["assuntos", "Assunto", q => (q.assuntoLS ? [q.assuntoLS] : []), v => v],
  ["subassuntos", "SubAssunto", q => (q.subassuntoLS ? [q.subassuntoLS] : []), v => v],
  ["artigos", "Artigo", q => artigosDaQuestao(q), v => { const [l, a] = v.split("|"); return `${rotuloArt(a)} — ${siglaOuNome(l)}`; }],
  ["anos", "Ano", q => (q.ano ? [q.ano] : []), v => v],
  ["cargos", "Cargo", q => (q.cargo ? [q.cargo] : []), v => v],
  ["bancas", "Banca", q => (q.banca ? [q.banca] : []), v => v],
  ["instituicoes", "Instituição", q => (q.instituicao ? [q.instituicao] : []), v => v],
];
const SIGLA_DE = Object.fromEntries(Object.entries(SIGLAS_LEI).filter(([, v]) => v).map(([k, v]) => [v, k]));
const siglaOuNome = l => SIGLA_DE[l] && SIGLA_DE[l].length <= 5 ? SIGLA_DE[l] : nomeLei(l);
function passaCampo(q, campo, f) {
  const sel = f[campo[0]];
  return !sel.length || campo[2](q).some(v => sel.includes(v));
}
function passaFiltroLS(q, f, mapa, ignorar = null) {
  for (const c of CAMPOS_LS) if (c[0] !== ignorar && !passaCampo(q, c, f)) return false;
  if (f.situacao !== "todas") {
    const s = situacaoQ(mapa, q.id);
    if (f.situacao === "acertei" && s !== "certa") return false;
    if (f.situacao === "errei" && s !== "errada") return false;
    if (f.situacao === "resolvidas" && s === "nao") return false;
    if (f.situacao === "nao" && s !== "nao") return false;
  }
  if (f.comentarios === "meus") { const n = estado.itens.get(idNotaQ(q.id)); if (!n || n.apagado) return false; }
  if (f.comentarios === "anotacoes" && !(q.refs || []).some(r => r.lei && temMarcasNoArtigo(r.lei, r.art))) return false;
  return true;
}
function temMarcasNoArtigo(lei, art) {
  const m = marcasDaLei(lei).get(art);
  return !!m && (m.grifos.length + m.notas.length + m.trechos.length + m.tintas.filter(temConteudo).length) > 0;
}
function ordenarLS(lista) {
  return lista.slice().sort((a, b) => {
    const ra = (a.refs || [])[0] || {}, rb = (b.refs || [])[0] || {};
    if ((ra.lei || "") !== (rb.lei || "")) return (ra.lei || "").localeCompare(rb.lei || "");
    const c = ra.art && rb.art ? compararArtigos(ra.art, rb.art) : 0;
    return c || (a.numero || 0) - (b.numero || 0);
  });
}
function telaFiltroLS() {
  definirTopo({ titulo: "Lei Seca — Verdadeiro ou Falso", voltar: "#/questoes" });
  marcarAba("questoes");
  const base = baseLS();
  const mapa = mapaRespostas();
  const f = filtroLS();
  const salvos = itens("filtro-ls").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const qtd = base.filter(q => passaFiltroLS(q, f, mapa)).length;
  const e = estatisticas(base, mapa);
  const chip = (grupo, v, r) => `<button class="chip-ls" data-chip="${grupo}" data-v="${v}" aria-pressed="${f[grupo] === v}">${r}</button>`;
  const rotSel = (campo) => { const sel = f[campo[0]]; return !sel.length ? campo[1] : sel.length === 1 ? campo[3](sel[0]) : `${campo[1]}: ${sel.length} selecionados`; };
  $("#conteudo").innerHTML = `<div class="secao filtro-ls">
    <div class="cab-ls">
      <h2 class="titulo-ls">Filtro de questões</h2>
      <div class="acoes-linha"><a class="botao" href="#/leiseca/listas" style="text-decoration:none">📁 Minhas listas</a>
        <button class="botao" id="ls-salvos">⭐ Filtros salvos${salvos.length ? ` (${salvos.length})` : ""}</button>
        ${lerLS("sessao-ls", null) ? '<a class="botao" href="#/leiseca/resolver" style="text-decoration:none">▶️ Continuar de onde parei</a>' : ""}</div>
    </div>
    ${!base.length ? `<div class="aviso">Ainda não há questões. Em <a href="#/leiseca/listas">📁 Minhas listas</a>, crie as pastas (ex.: Código Penal), as subpastas (ex.: Crimes contra a Pessoa) e importe as listas em PDF.</div>` : `<p class="contagem">${base.length} questões · ${e.respostas} respostas · ${e.respostas ? `<span class="txt-ok">${e.acertosTotal} acertos</span> e <span class="txt-erro">${e.errosTotal} erros</span> (${e.pctTotal}%)` : "nenhuma respondida ainda"}</p>`}
    <div class="grade-filtro">
      ${CAMPOS_LS.map(c => `<button class="campo sel-ls ${f[c[0]].length ? "ativo" : ""}" data-campo="${c[0]}"><span>${esc(rotSel(c))}</span><span class="seta">▾</span></button>`).join("")}
    </div>
    <div class="linha-chips"><span>Comentários:</span>${chip("comentarios", "todos", "Todos")}${chip("comentarios", "meus", "Meus comentários")}${chip("comentarios", "anotacoes", "Minhas anotações na lei")}</div>
    <div class="linha-chips"><span>Questões:</span>${chip("situacao", "todas", "Todas")}${chip("situacao", "acertei", "Acertei")}${chip("situacao", "errei", "Errei")}${chip("situacao", "resolvidas", "Resolvidas")}${chip("situacao", "nao", "Não resolvidas")}</div>
    <div class="linha-chips"><span>Modo:</span>${chip("modo", "aleatorio", "Aleatório")}${chip("modo", "ordenado", "Ordenado")}</div>
    <div class="rodape-filtro">
      <button class="link-acao" id="ls-salvar-filtro">💾 Salvar filtro</button>
      <button class="link-acao perigo" id="ls-limpar">✕ Limpar filtro</button>
      <button class="botao primario btn-filtrar" id="ls-filtrar" ${qtd ? "" : "disabled"}>Filtrar questões (${qtd})</button>
    </div></div>`;
  $$("[data-campo]").forEach(b => b.onclick = () => painelCampoLS(b.dataset.campo));
  $$("[data-chip]").forEach(b => b.onclick = () => { const g = filtroLS(); g[b.dataset.chip] = b.dataset.v; gravarFiltroLS(g); telaFiltroLS(); });
  $("#ls-limpar").onclick = () => { gravarFiltroLS({ ...FILTRO_LS_VAZIO, modo: f.modo }); telaFiltroLS(); };
  $("#ls-salvos").onclick = () => painelFiltrosSalvosLS();
  $("#ls-salvar-filtro").onclick = async () => {
    const nome = prompt("Nome do filtro (ex.: Homicídio — FGV e CESPE):"); if (!nome || !nome.trim()) return;
    await salvarItem({ id: "filtro-ls|" + uid().slice(0, 8), tipo: "filtro-ls", nome: nome.trim(), filtro: filtroLS() });
    telaFiltroLS(); mostrarAvisoRapido("💾 Filtro salvo");
  };
  $("#ls-filtrar").onclick = () => {
    const g = filtroLS(), m = mapaRespostas();
    let lista = ordenarLS(baseLS().filter(q => passaFiltroLS(q, g, m)));
    if (g.modo === "aleatorio") for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
    iniciarSessaoLS(lista, "Questões filtradas");
  };
}
/* filtros salvos: aplicar com um toque, ou apagar */
function painelFiltrosSalvosLS() {
  const salvos = itens("filtro-ls").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const base = baseLS(), mapa = mapaRespostas();
  abrirPainel(`<h2>⭐ Filtros salvos ${botaoFechar}</h2>
    ${salvos.length ? `<ul class="lista-salvos-ls">${salvos.map(sv => `<li><button class="aplicar-salvo" data-aplicar-filtro="${esc(sv.id)}"><strong>${esc(sv.nome)}</strong>
        <span class="contagem">${base.filter(q => passaFiltroLS(q, { ...FILTRO_LS_VAZIO, ...sv.filtro }, mapa)).length} questões</span></button>
        <button class="icone-btn" data-apagar-filtro="${esc(sv.id)}" aria-label="Apagar o filtro ${esc(sv.nome)}">🗑</button></li>`).join("")}</ul>`
      : '<p class="contagem">Nenhum filtro salvo ainda. Monte o filtro e toque em “💾 Salvar filtro”.</p>'}`);
  $$("[data-aplicar-filtro]").forEach(b => b.onclick = () => {
    const sv = estado.itens.get(b.dataset.aplicarFiltro);
    gravarFiltroLS({ ...FILTRO_LS_VAZIO, ...sv.filtro }); fecharPainel(); telaFiltroLS(); mostrarAvisoRapido(`Filtro "${sv.nome}" aplicado`);
  });
  $$("[data-apagar-filtro]").forEach(b => b.onclick = async () => {
    if (!confirm("Apagar este filtro salvo?")) return;
    await apagarItem(b.dataset.apagarFiltro); painelFiltrosSalvosLS(); telaFiltroLS();
  });
}
/* escolha de vários itens de um campo, com busca e a quantidade de questões de cada um */
function painelCampoLS(nomeCampo) {
  const campo = CAMPOS_LS.find(c => c[0] === nomeCampo);
  const f = filtroLS(), mapa = mapaRespostas();
  const base = baseLS().filter(q => passaFiltroLS(q, f, mapa, nomeCampo));
  const cont = new Map();
  for (const q of base) for (const v of new Set(campo[2](q))) cont.set(v, (cont.get(v) || 0) + 1);
  for (const v of f[nomeCampo]) if (!cont.has(v)) cont.set(v, 0);
  let valores = [...cont.keys()];
  if (nomeCampo === "artigos") valores.sort((a, b) => { const [la, aa] = a.split("|"), [lb, ab] = b.split("|"); return la.localeCompare(lb) || compararArtigos(aa, ab); });
  else if (nomeCampo === "anos") valores.sort((a, b) => b.localeCompare(a));
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
    const g = filtroLS();
    g[nomeCampo] = $$(".opcao-ls input").filter(i => i.checked).map(i => i.value);
    gravarFiltroLS(g); fecharPainel(); telaFiltroLS();
  };
}

/* =====================================================================
   RESOLVER: Verdadeiro ou Falso, com a resolução ligada ao texto da lei
   ===================================================================== */
function iniciarSessaoLS(lista, titulo) {
  if (!lista.length) { alert("Nenhuma questão com esse filtro."); return; }
  gravarLS("sessao-ls", { ids: lista.map(q => q.id), pos: 0, titulo, criada: agoraISO() });
  if (location.hash === "#/leiseca/resolver") rotear(); else location.hash = "#/leiseca/resolver";
}
function telaResolverLS() {
  const s = lerLS("sessao-ls", null);
  const lista = s ? s.ids.map(id => estado.q.get(id)).filter(Boolean) : [];
  definirTopo({ titulo: s ? s.titulo : "Questões", voltar: "#/leiseca" });
  $("#abas").classList.add("oculto");
  if (!lista.length) { $("#conteudo").innerHTML = `<p class="vazio">Nenhuma questão para resolver. <a href="#/leiseca">Voltar ao filtro</a></p>`; return; }
  baseLS();                                                    // completa assunto/subassunto
  mostrarQuestaoLS(lista, Math.min(s.pos || 0, lista.length - 1));
}
function textoResolucaoLS(linhas) {
  return linhas.map(l => {
    const t = esc(l);
    if (/^\[\.\.\.\]$/.test(l)) return `<p class="res-ls-corte">[…]</p>`;
    if (/^(Art\.|§|Parágrafo único)/.test(l)) return `<p class="res-ls-dispositivo">${t.replace(/^(Art\.\s*[\dA-Z\-ºo°]+\s*[.\-–]?|§\s*\d+[ºo°]?(-[A-Z])?|Parágrafo único\.?)/, "<strong>$1</strong>")}</p>`;
    if (/^([IVXLC]+\s*[-–—]|[a-z]\))/.test(l)) return `<p class="res-ls-inciso">${t}</p>`;
    if (/^Pena\b/.test(l)) return `<p class="res-ls-pena">${t}</p>`;
    if (l.length < 70 && !/[.;:]$/.test(l)) return `<p class="res-ls-rubrica">${t}</p>`;
    return `<p>${t}</p>`;
  }).join("");
}
function rotuloRef(r) { return `${rotuloArt(r.art)}${r.disp ? ", " + r.disp : ""} — ${siglaOuNome(r.lei)}`; }
function mostrarQuestaoLS(lista, i) {
  const q = lista[i];
  const s = lerLS("sessao-ls", {}); s.pos = i; gravarLS("sessao-ls", s);
  const mapa = mapaRespostas();
  const atual = respostaAtual(mapa, q.id);
  const todas = mapa.get(q.id) || [];
  const fav = ehFavorito(idFavQ(q.id));
  const nota = estado.itens.get(idNotaQ(q.id));
  const est = estatisticas(lista, mapa);
  const refsLink = (q.refs || []).filter(r => r.lei);
  inicioQuestao = Date.now();
  $("#conteudo").innerHTML = `<div class="secao resolver-ls">
    <div class="topo-ls">
      <div><strong>Questão ${i + 1} de ${lista.length}</strong> <span class="contagem">· <span class="txt-ok">${est.certas} acertos</span> · <span class="txt-erro">${est.erradas} erros</span> nesta seleção</span></div>
      <a class="botao" href="#/leiseca" style="text-decoration:none">⚙ Filtro</a>
    </div>
    <span class="barra-prog" aria-hidden="true"><span style="width:${Math.round(100 * (i + 1) / lista.length)}%"></span></span>
    <article class="questao-ls" data-q="${esc(q.id)}">
      <p class="ref-ls">${refsLink.length ? refsLink.map((r, k) => `<button class="link ref-lei" data-ref="${k}">📖 ${esc(rotuloRef(r))}</button>`).join(" ") : `<span>[${esc(q.referencia)}]</span>`}</p>
      <p class="prova-ls">${esc([q.banca, q.ano].filter(Boolean).join(" "))}${q.cargo ? " · " + esc(q.cargo) : ""}${q.instituicao && q.instituicao !== q.banca ? ` (${esc(q.instituicao)})` : ""}${q.obs ? ` · <em>${esc(q.obs)}</em>` : ""}</p>
      <p class="assunto-ls">${esc([q.pastaLS, q.assuntoLS, q.subassuntoLS].filter(Boolean).join(" › "))}</p>
      <div class="enunciado-ls">${q.enunciado.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <div class="vf-ls">
        <button class="vf-btn" data-vf="C">Verdadeiro</button>
        <button class="vf-btn" data-vf="E">Falso</button>
      </div>
      <div id="resultado-ls" aria-live="polite"></div>
      <p class="contagem" id="hist-ls">${todas.length ? `Você já respondeu esta questão ${todas.length} vez(es): ${todas.filter(r => r.correta).length} acerto(s).` : ""}</p>
    </article>
    <div class="barra-q">
      <button class="icone-btn" data-nav-ls="-1" ${i === 0 ? "disabled" : ""}>← Anterior</button>
      <button class="icone-btn" data-nav-ls="1" ${i === lista.length - 1 ? "disabled" : ""}>Próxima →</button>
      <button class="icone-btn" id="ls-aleatoria" aria-label="Questão aleatória">🔀 Aleatória</button>
      <button class="icone-btn" id="ls-fav" aria-pressed="${fav}">${fav ? "★ Favorita" : "☆ Favoritar"}</button>
      <button class="icone-btn" id="ls-nota">${nota && !nota.apagado ? "✎ Meu comentário" : "✎ Comentar"}</button>
    </div>
    ${i === lista.length - 1 ? `<div class="cartao fim-ls"><p><strong>Última questão da seleção.</strong> ${est.resolvidas} de ${lista.length} resolvidas · ${est.certas} acertos e ${est.erradas} erros.</p>
      <div class="acoes-linha">${est.erradas ? '<button class="botao primario" id="ls-refazer-erros">Refazer só as que errei</button>' : ""}<a class="botao" href="#/leiseca" style="text-decoration:none">Novo filtro</a></div></div>` : ""}
  </div>`;
  const mostrarResultado = r => {
    $$(".vf-btn").forEach(b => { b.disabled = true; b.classList.toggle("certa", b.dataset.vf === q.gabarito); b.classList.toggle("errada", b.dataset.vf === r.marcada && !r.correta); b.classList.toggle("marcada", b.dataset.vf === r.marcada); });
    $("#resultado-ls").innerHTML = `<p class="res-q ${r.correta ? "ok" : "erro"}">${r.correta ? "✓ Você acertou!" : `✗ Você errou. Gabarito: <strong>${q.gabarito === "C" ? "Verdadeiro" : "Falso"}</strong>.`}
        <button class="link" id="ls-de-novo">Responder de novo</button></p>
      <div class="resolucao-ls"><h3>Resolução</h3>${textoResolucaoLS(q.resolucao || [])}
        ${refsLink.length ? `<div class="acoes-linha">${refsLink.map((r, k) => `<button class="botao" data-ref="${k}">📖 Ver ${esc(rotuloArt(r.art))}${r.disp ? ", " + esc(r.disp) : ""} na lei</button>`).join("")}</div>` : ""}</div>`;
    $("#ls-de-novo").onclick = async () => { await redefinirQuestoes([q.id]); mostrarQuestaoLS(lista, i); };
    ligarRefs();
  };
  const ligarRefs = () => $$("[data-ref]").forEach(b => b.onclick = () => painelArtigoLS(refsLink[Number(b.dataset.ref)]));
  ligarRefs();
  if (atual) mostrarResultado(atual);
  $$(".vf-btn").forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    $$(".vf-btn").forEach(x => { x.disabled = true; });
    const marcada = b.dataset.vf;
    const tempo = Math.min(1800, Math.round((Date.now() - inicioQuestao) / 1000));
    const r = await salvarItem({ id: uid(), tipo: "resposta", q: q.id, caderno: q.caderno, marcada, correta: marcada === q.gabarito, em: agoraISO(), tempo });
    mostrarResultado(r);
    const t = mapaRespostas().get(q.id) || [];
    $("#hist-ls").textContent = `Você já respondeu esta questão ${t.length} vez(es): ${t.filter(x => x.correta).length} acerto(s).`;
  });
  $$("[data-nav-ls]").forEach(b => b.onclick = () => { mostrarQuestaoLS(lista, i + Number(b.dataset.navLs)); window.scrollTo(0, 0); });
  $("#ls-aleatoria").onclick = () => {                         // sorteia entre as que ainda não foram respondidas (se todas foram, entre todas)
    const m = mapaRespostas();
    const pendentes = lista.map((x, k) => k).filter(k => k !== i && situacaoQ(m, lista[k].id) === "nao");
    const pool = pendentes.length ? pendentes : lista.map((x, k) => k).filter(k => k !== i);
    if (pool.length) { mostrarQuestaoLS(lista, pool[Math.floor(Math.random() * pool.length)]); window.scrollTo(0, 0); }
  };
  $("#ls-fav").onclick = async () => {
    await alternarFavorito(idFavQ(q.id), { alvo: "questao", q: q.id, caderno: q.caderno });
    const fv = ehFavorito(idFavQ(q.id)); $("#ls-fav").textContent = fv ? "★ Favorita" : "☆ Favoritar"; $("#ls-fav").setAttribute("aria-pressed", fv);
  };
  $("#ls-nota").onclick = () => mostrarResolucao(q, true);
  if ($("#ls-refazer-erros")) $("#ls-refazer-erros").onclick = async () => {
    const m = mapaRespostas();
    const erradas = lista.filter(x => situacaoQ(m, x.id) === "errada");
    await redefinirQuestoes(erradas.map(x => x.id));
    iniciarSessaoLS(erradas, "Refazendo as que errei");
  };
  document.onkeydown = e => {
    if (!location.hash.startsWith("#/leiseca/resolver") || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || $("#painel:not(.oculto)")) return;
    if (/^[vV]$/.test(e.key)) $('[data-vf="C"]')?.click();
    else if (/^[fF]$/.test(e.key)) $('[data-vf="E"]')?.click();
    else if (e.key === "ArrowRight" && i < lista.length - 1) mostrarQuestaoLS(lista, i + 1);
    else if (e.key === "ArrowLeft" && i > 0) mostrarQuestaoLS(lista, i - 1);
  };
}
/* o artigo citado, com o parágrafo ou inciso destacado, sem sair da questão */
async function textoLeiParaPainel(leiId) {
  let lei = await leiDoCache(leiId);
  if (!lei) { try { const r = await buscarComTempo(urlLei(leiId), 30000); if (r.ok) lei = await r.json(); } catch {} }
  return lei;
}
function linhasDestacadas(texto, disp) {
  const linhas = texto.split("\n");
  if (!disp) return linhas.map(l => ({ l, d: false }));
  const alvo = semAcento(disp).toLowerCase();
  const par = alvo.match(/§\s*(\d+)\s*[ºo°]?(?:-([a-z]))?/), unico = /unico/.test(alvo);
  const inc = alvo.match(/(?:^|,|\s)([ivxlc]+)(?=\s*(?:,|$))/);
  let ini = -1, fim = linhas.length;
  const ehPar = l => /^(§\s*\d+|Parágrafo único)/i.test(l);
  if (par || unico) {
    const re = unico ? /^Parágrafo único/i : new RegExp(`^§\\s*${par[1]}\\s*[º°o]?${par[2] ? "-" + par[2].toUpperCase() : "(?!-)"}\\b`, "i");
    ini = linhas.findIndex(l => re.test(l.trim()));
    if (ini >= 0) { const prox = linhas.findIndex((l, k) => k > ini && ehPar(l.trim())); fim = prox >= 0 ? prox : linhas.length; }
  }
  if (inc) {
    const ri = new RegExp(`^${inc[1].toUpperCase()}\\s*[-–—]`);
    const de = ini >= 0 ? ini : 0;
    const k = linhas.findIndex((l, j) => j >= de && j < fim && ri.test(l.trim()));
    if (k >= 0) { ini = k; const prox = linhas.findIndex((l, j) => j > k && (/^[IVXLC]+\s*[-–—]/.test(l.trim()) || ehPar(l.trim()))); fim = prox >= 0 ? prox : fim; }
  }
  // o título do dispositivo seguinte ("Homicídio qualificado") não entra no destaque
  while (ini >= 0 && fim - 1 > ini && fim <= linhas.length && /^[^§IVXLC\d].{0,60}$/.test(linhas[fim - 1].trim()) && !/[.;:,]$/.test(linhas[fim - 1].trim())) fim--;
  return linhas.map((l, k) => ({ l, d: ini >= 0 && k >= ini && k < fim }));
}
async function painelArtigoLS(r) {
  abrirPainel(`<h2>${esc(rotuloArt(r.art))}${r.disp ? ", " + esc(r.disp) : ""} ${botaoFechar}</h2><p class="contagem">Carregando o texto da lei…</p>`);
  const lei = await textoLeiParaPainel(r.lei);
  const a = lei && lei.artigos && lei.artigos[r.art];
  const corpo = a ? linhasDestacadas(a.texto, r.disp).map(x => `<p class="${x.d ? "destaque-ls" : ""}">${esc(x.l)}</p>`).join("")
    : `<p class="vazio">Não encontrei o ${esc(rotuloArt(r.art))} no texto ${lei ? "desta lei" : "(sem internet e a lei não está no aparelho)"}.</p>`;
  abrirPainel(`<h2>${esc(rotuloArt(r.art))}${r.disp ? ", " + esc(r.disp) : ""} <span class="contagem">— ${esc(nomeLei(r.lei))}</span> ${botaoFechar}</h2>
    <div class="artigo-painel-ls">${corpo}</div>
    <div class="acoes" style="margin-top:12px"><button data-href="#/lei/${esc(r.lei)}/${encodeURIComponent(r.art)}">📚 Abrir a lei inteira neste artigo</button></div>`);
  $(".destaque-ls")?.scrollIntoView({ block: "center" });
}
/* no menu de um artigo da lei: as questões de lei seca daquele artigo */
function questoesLSdoArtigo(leiId, art) {
  return baseLS().filter(q => (q.refs || []).some(r => r.lei === leiId && r.art === art));
}
function resolverLSdoArtigo(leiId, art) {
  const lista = ordenarLS(questoesLSdoArtigo(leiId, art));
  gravarFiltroLS({ ...FILTRO_LS_VAZIO, artigos: [leiId + "|" + art] });
  iniciarSessaoLS(lista, `Lei seca — ${rotuloArt(art)} (${siglaOuNome(leiId)})`);
}
