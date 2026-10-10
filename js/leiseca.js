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
      <button class="botao" id="importar-pasta-ls">📂 Importar pasta inteira</button>
      ${pasta?.origemDrive ? '<button class="botao" id="atualizar-drive-ls">🔄 Atualizar do Drive</button>' : ""}
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
  $("#importar-pasta-ls").onclick = () => painelImportarPastaLS(pastaId || null);
  if ($("#atualizar-drive-ls")) $("#atualizar-drive-ls").onclick = () => {
    abrirPainel(`<h2>🔄 Atualizar do Google Drive ${botaoFechar}</h2><p class="contagem" style="margin-top:0">Pasta de origem: <strong>${esc(pasta.origemDrive.nome)}</strong></p><div id="atu-res"><p class="contagem">Conectando…</p></div>`);
    atualizarPastaDoDriveLS(pastaId, $("#atu-res")).then(redesenharListasLS);
  };
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
async function salvarListaLS(titulo, questoes, pastaId, { id: idFixo = null, origem = null, recarregar = true } = {}) {
  const id = idFixo || "ls-" + semAcento(titulo).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + hashCurto(questoes.map(q => q.id).join(""));
  const cad = { id, titulo, plataforma: PLATAFORMA_LS, materia: "Lei Seca", versao: new Date().toISOString().slice(0, 10), assuntos: [], observacao: "Lista de lei seca importada no app.",
    questoes: questoes.map((q, k) => ({ ...q, ordem: k + 1, assunto: "", materia: "Lei Seca" })) };
  const url = `dados/questoes/local/${id}.json`;
  const cache = await caches.open(CACHE_DADOS);
  await cache.put(new Request(url), new Response(JSON.stringify(cad), { headers: { "content-type": "application/json" } }));
  const todos = lerLS("cadernos-locais", []);
  const antigo = todos.find(c => c.id === id);
  const locais = todos.filter(c => c.id !== id);
  locais.push({ id, titulo, materia: "Lei Seca", plataforma: PLATAFORMA_LS, url, qtd: questoes.length, atualizadoEm: agoraISO(),
    ...(antigo?.publicado ? { publicado: antigo.publicado } : {}), ...(origem || antigo?.origem ? { origem: origem || antigo.origem } : {}) });
  gravarLS("cadernos-locais", locais);
  if (recarregar) await carregarQuestoes();
  else { estado.cadernos[id] = { ...cad, local: true, publicado: !!antigo?.publicado }; for (const q of estado.cadernos[id].questoes) { q.caderno = id; estado.q.set(q.id, q); } }
  if (pastaId) await moverParaPasta(PLATAFORMA_LS, id, pastaId);
  return estado.cadernos[id] || cad;
}

/* =====================================================================
   IMPORTAR UMA PASTA INTEIRA (Google Drive, pasta do computador ou .zip)
   A pasta escolhida vira a pasta principal (Código/Lei), as subpastas viram os assuntos
   e cada PDF vira uma lista. Importar de novo ATUALIZA: listas iguais são puladas,
   listas alteradas são trocadas (mantendo as suas respostas) e as novas entram.
   ===================================================================== */
const MIME_PASTA_DRIVE = "application/vnd.google-apps.folder";
const normNome = t => semAcento(String(t || "")).toLowerCase().replace(/\s+/g, " ").trim();
const origemDaLista = id => lerLS("cadernos-locais", []).find(c => c.id === id)?.origem || null;
async function tokenDriveLeitura() {             // só leitura do Drive, para enxergar as pastas e os PDFs dentro delas
  const tk = lerLS("google-token-leitura", null);
  if (tk && Date.now() < tk.expira - 60000) return tk.token;
  if (!idClienteGoogle()) throw new Error("O acesso ao Google ainda não foi configurado no app.");
  await carregarScript("https://accounts.google.com/gsi/client");
  return new Promise((ok, falha) => {
    google.accounts.oauth2.initTokenClient({
      client_id: idClienteGoogle(), scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: r => {
        if (r.error) return falha(new Error("O Google não autorizou: " + r.error));
        gravarLS("google-token-leitura", { token: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
        ok(r.access_token);
      },
      error_callback: e => falha(new Error("A janela do Google foi fechada ou bloqueada (" + (e.type || "erro") + ")."))
    }).requestAccessToken({ prompt: tk ? "" : "consent" });
  });
}
async function listarDrive(token, q) {
  const out = [];
  let pagina = "";
  do {
    const u = `${baseGoogle()}/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime)")}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true${pagina ? "&pageToken=" + pagina : ""}`;
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401) { localStorage.removeItem("google-token-leitura"); throw new Error("O acesso ao Google expirou. Toque de novo para reconectar."); }
    if (!r.ok) throw new Error(`O Google Drive não respondeu (${r.status}).`);
    const j = await r.json(); out.push(...(j.files || [])); pagina = j.nextPageToken || "";
  } while (pagina);
  return out;
}
async function arvoreDoDrive(token, pastaId, caminho = [], out = [], aviso = null) {
  aviso && aviso(`Lendo a pasta ${caminho.length ? caminho.join(" › ") : ""}…`);
  for (const f of await listarDrive(token, `'${pastaId}' in parents and trashed=false`)) {
    if (f.mimeType === MIME_PASTA_DRIVE) await arvoreDoDrive(token, f.id, [...caminho, f.name], out, aviso);
    else if (/\.pdf$/i.test(f.name) || f.mimeType === "application/pdf")
      out.push({ caminho, nome: f.name, chave: "drive:" + f.id, md5: f.md5Checksum || f.modifiedTime || "",
        ler: async () => { const r = await fetch(`${baseGoogle()}/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + token } });
          if (!r.ok) throw new Error(`não foi possível baixar do Drive (${r.status})`); return new Uint8Array(await r.arrayBuffer()); } });
  }
  return out;
}
/* arquivos de uma pasta do computador (input com webkitdirectory) ou de um .zip */
function entradasDeArquivos(arquivos) {
  const pdfs = arquivos.filter(a => /\.pdf$/i.test(a.name));
  const caminhos = pdfs.map(a => (a.webkitRelativePath || a.name).split("/"));
  const raiz = caminhos.length && caminhos.every(c => c.length > 1 && c[0] === caminhos[0][0]) ? caminhos[0][0] : null;
  return { raiz, entradas: pdfs.map((a, k) => ({ caminho: caminhos[k].slice(raiz ? 1 : 0, -1), nome: a.name, chave: null, md5: `${a.size}-${a.lastModified}`, ler: async () => new Uint8Array(await a.arrayBuffer()) })) };
}
async function entradasDoZip(arq) {
  await carregarScript("libs/jszip.min.js");
  const zip = await window.JSZip.loadAsync(arq);
  const arqs = Object.values(zip.files).filter(f => !f.dir && /\.pdf$/i.test(f.name) && !/(^|\/)(__MACOSX|\._)/.test(f.name));
  const caminhos = arqs.map(f => f.name.split("/").filter(Boolean));
  const raiz = caminhos.length && caminhos.every(c => c.length > 1 && c[0] === caminhos[0][0]) ? caminhos[0][0] : arq.name.replace(/\.zip$/i, "");
  const tira = caminhos.length && caminhos.every(c => c.length > 1 && c[0] === raiz) ? 1 : 0;
  return { raiz, entradas: arqs.map((f, k) => ({ caminho: caminhos[k].slice(tira, -1), nome: caminhos[k][caminhos[k].length - 1], chave: null,
    md5: hashCurto(String(f._data?.crc32 ?? "") + f.name + (f._data?.uncompressedSize ?? "")), ler: () => f.async("uint8array") })) };
}
async function garantirPastaLS(nome, pai) {
  const achada = pastasDe(PLATAFORMA_LS, pai || null).find(p => normNome(p.nome) === normNome(nome));
  return achada || await novaPasta(PLATAFORMA_LS, pai || null, nome);
}
async function importarArvoreLS(entradas, destinoId, nomeRaiz, aviso, origemDrive = null) {
  const rel = { novas: [], atualizadas: [], iguais: 0, erros: [], publicadas: 0, questoes: 0 };
  let raiz = destinoId || null;
  if (nomeRaiz) {
    const p = await garantirPastaLS(nomeRaiz, destinoId);
    if (origemDrive && p.origemDrive?.id !== origemDrive.id) { p.origemDrive = origemDrive; await salvarItem(p); }
    raiz = p.id;
  }
  const pastaDo = new Map();
  const pastaPara = async cam => {
    let atual = raiz;
    for (let k = 0; k < cam.length; k++) {
      const chave = cam.slice(0, k + 1).join("/");
      if (!pastaDo.has(chave)) pastaDo.set(chave, (await garantirPastaLS(cam[k], atual)).id);
      atual = pastaDo.get(chave);
    }
    return atual;
  };
  const pdfjs = entradas.length ? await abrirPdfJs() : null;
  const vistas = new Set();
  for (const [k, en] of entradas.entries()) {
    const titulo = en.nome.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
    try {
      const pasta = await pastaPara(en.caminho);
      const naPasta = new Set(itensDaPasta(PLATAFORMA_LS, pasta));
      const existente = (en.chave && listasLS().find(c => origemDaLista(c.id)?.chave === en.chave))
        || listasLS().find(c => naPasta.has(c.id) && (normNome(c.titulo) === normNome(titulo) || normNome(c.tituloOriginal) === normNome(titulo)));
      if (existente) vistas.add(existente.id);
      const orig = existente ? origemDaLista(existente.id) : null;
      if (existente && orig && en.md5 && orig.md5 === en.md5) {
        rel.iguais++;
        if (pastaDoItem(PLATAFORMA_LS, existente.id)?.id !== pasta) await moverParaPasta(PLATAFORMA_LS, existente.id, pasta);
        continue;
      }
      aviso && aviso(`Lendo ${k + 1} de ${entradas.length}: ${en.caminho.concat(en.nome).join(" › ")}…`);
      const linhas = await linhasDoPdfLS(pdfjs, await en.ler(), () => {});
      const r = lerListaLeiSeca(linhas, catalogoParaVinculo());
      if (!r.questoes.length) { rel.erros.push(`${en.nome}: nenhuma questão encontrada`); continue; }
      const igual = existente && existente.questoes.length === r.questoes.length && existente.questoes.every((q, i) => q.id === r.questoes[i].id);
      const origem = { chave: en.chave, md5: en.md5, nome: en.nome, em: agoraISO() };
      if (igual) {                                              // mesmo conteúdo: só guarda a origem para pular da próxima vez
        const locais = lerLS("cadernos-locais", []); const l = locais.find(c => c.id === existente.id);
        if (l) { l.origem = origem; gravarLS("cadernos-locais", locais); }
        if (pastaDoItem(PLATAFORMA_LS, existente.id)?.id !== pasta) await moverParaPasta(PLATAFORMA_LS, existente.id, pasta);
        rel.iguais++; continue;
      }
      const c = await salvarListaLS(existente ? (existente.tituloOriginal || existente.titulo) : titulo, r.questoes, pasta, { id: existente?.id || null, origem, recarregar: false });
      vistas.add(c.id);
      (existente ? rel.atualizadas : rel.novas).push(c.id);
      rel.questoes += r.questoes.length;
    } catch (e) { rel.erros.push(`${en.nome}: ${e.message}`); }
  }
  await carregarQuestoes();
  // listas alteradas que já estavam visíveis para todos: atualiza o que os outros veem
  if (cfgDono()) for (const id of rel.atualizadas.filter(ehVisivelParaTodos)) {
    try { aviso && aviso(`Atualizando para os outros usuários: ${estado.cadernos[id]?.titulo || id}…`); await publicarCaderno(id); rel.publicadas++; }
    catch (e) { rel.erros.push(`${estado.cadernos[id]?.titulo || id}: não foi possível atualizar para os outros (${e.message})`); }
  }
  const naArvore = raiz ? [raiz, ...descendentes(raiz)].flatMap(pid => itensDaPasta(PLATAFORMA_LS, pid)) : [];
  rel.sobrando = nomeRaiz ? naArvore.filter(id => estado.cadernos[id] && !vistas.has(id)).map(id => estado.cadernos[id].titulo) : [];
  rel.raiz = raiz;
  return rel;
}
function textoRelatorioLS(rel) {
  return `<div class="cartao" style="margin-top:12px">
    <p class="txt-ok"><strong>✓ Pasta importada.</strong></p>
    <p>${rel.novas.length} lista(s) nova(s) · ${rel.atualizadas.length} atualizada(s) · ${rel.iguais} sem mudança${rel.questoes ? ` · ${rel.questoes} questões lidas` : ""}${rel.publicadas ? ` · ${rel.publicadas} atualizada(s) também para os outros usuários` : ""}.</p>
    ${rel.atualizadas.length ? '<p class="contagem">Nas listas atualizadas, as respostas das questões que continuam iguais foram mantidas.</p>' : ""}
    ${rel.sobrando.length ? `<p class="contagem">${rel.sobrando.length} lista(s) desta pasta no app não estão mais na pasta de origem e ficaram como estavam: ${esc(rel.sobrando.slice(0, 8).join(", "))}${rel.sobrando.length > 8 ? "…" : ""}.</p>` : ""}
    ${rel.erros.length ? `<p class="alerta">✗ ${rel.erros.length} problema(s):<br>${rel.erros.slice(0, 10).map(esc).join("<br>")}</p>` : ""}
    ${rel.raiz ? `<div class="acoes-linha"><a class="botao primario" href="${rotaPastaArea(PLATAFORMA_LS, rel.raiz)}" style="text-decoration:none" data-fechar>📂 Abrir a pasta</a></div>` : ""}</div>`;
}
/* navegador de pastas do Google Drive (funciona também no iPad, sem a janela do Google) */
function painelPastaDriveLS(destinoId) {
  const pilha = [{ id: "root", nome: "Meu Drive" }];
  let aba = "meu", token = null;
  const desenhar = async () => {
    const atual = pilha[pilha.length - 1];
    abrirPainel(`<h2>☁️ Escolher pasta no Google Drive ${botaoFechar}</h2>
      <div class="linha-chips"><button class="chip-ls" data-aba-drive="meu" aria-pressed="${aba === "meu"}">Meu Drive</button><button class="chip-ls" data-aba-drive="comp" aria-pressed="${aba === "comp"}">Compartilhados comigo</button></div>
      <p class="contagem">${pilha.map((p, k) => k < pilha.length - 1 ? `<button class="link" data-subir="${k}">${esc(p.nome)}</button>` : `<strong>${esc(p.nome)}</strong>`).join(" › ")}</p>
      <div id="drive-lista"><p class="contagem">Carregando…</p></div>
      <div id="drive-res"></div>`);
    $$("[data-aba-drive]").forEach(b => b.onclick = () => { aba = b.dataset.abaDrive; pilha.length = 0; pilha.push(aba === "meu" ? { id: "root", nome: "Meu Drive" } : { id: null, nome: "Compartilhados comigo" }); desenhar(); });
    $$("[data-subir]").forEach(b => b.onclick = () => { pilha.length = Number(b.dataset.subir) + 1; desenhar(); });
    try {
      token = token || await tokenDriveLeitura();
      const q = atual.id ? `'${atual.id}' in parents and trashed=false` : `sharedWithMe=true and mimeType='${MIME_PASTA_DRIVE}' and trashed=false`;
      const itensD = await listarDrive(token, q);
      const pastas = itensD.filter(f => f.mimeType === MIME_PASTA_DRIVE), pdfs = itensD.filter(f => /\.pdf$/i.test(f.name) || f.mimeType === "application/pdf");
      $("#drive-lista").innerHTML = `${atual.id && atual.id !== "root" ? `<div class="acoes" style="margin-bottom:10px"><button class="botao primario" id="drive-importar">📥 Importar a pasta “${esc(atual.nome)}” (com as subpastas)</button></div>` : ""}
        <ul class="acervo">${pastas.map((f, k) => `<li class="lei-item"><button class="abrir" data-entrar="${k}"><span class="lei-nome">${ICONE_PASTA} ${esc(f.name)}</span></button></li>`).join("")}
        ${pdfs.map(f => `<li class="lei-item"><span class="abrir"><span class="lei-nome">📄 ${esc(f.name)}</span></span></li>`).join("")}</ul>
        ${!pastas.length && !pdfs.length ? '<p class="contagem">Pasta vazia.</p>' : ""}`;
      $$("[data-entrar]").forEach(b => b.onclick = () => { const f = pastas[Number(b.dataset.entrar)]; pilha.push({ id: f.id, nome: f.name }); desenhar(); });
      if ($("#drive-importar")) $("#drive-importar").onclick = () => importarPastaDrive(token, atual, destinoId, $("#drive-res"), $("#drive-importar"));
    } catch (e) { $("#drive-lista").innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p><div class="acoes"><button class="botao" id="drive-tentar">Tentar de novo</button></div>`; $("#drive-tentar").onclick = () => { token = null; desenhar(); }; }
  };
  desenhar();
}
async function importarPastaDrive(token, pasta, destinoId, res, botao) {
  if (botao) botao.disabled = true;
  const aviso = t => { res.innerHTML = `<p class="contagem">${esc(t)}</p>`; };
  try {
    const entradas = await arvoreDoDrive(token, pasta.id, [], [], aviso);
    if (!entradas.length) { res.innerHTML = '<p class="alerta">Nenhum PDF nesta pasta nem nas subpastas.</p>'; if (botao) botao.disabled = false; return; }
    const rel = await importarArvoreLS(entradas, destinoId, pasta.nome, aviso, { id: pasta.id, nome: pasta.nome });
    res.innerHTML = textoRelatorioLS(rel);
    redesenharListasLS();
  } catch (e) { res.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; if (botao) botao.disabled = false; }
}
function painelImportarPastaLS(destinoId) {
  const suportaPasta = "webkitdirectory" in document.createElement("input") && !ehAparelhoApple();
  abrirPainel(`<h2>📂 Importar pasta inteira ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">A pasta escolhida vira a pasta principal (Código/Lei), as subpastas viram os assuntos e cada PDF vira uma lista.
      Para atualizar o banco, é só importar a mesma pasta de novo: listas sem mudança são puladas, as alteradas são trocadas (as suas respostas continuam) e as novas entram.
      ${destinoId ? `A pasta vai para dentro de <strong>${esc(textoCaminho(destinoId))}</strong>.` : ""}</p>
    <div class="acoes">
      <button class="botao primario" id="pasta-drive">☁️ Pasta do Google Drive</button>
      ${suportaPasta ? '<button class="botao" id="pasta-pc">💻 Pasta deste computador</button>' : ""}
      <button class="botao" id="pasta-zip">🗜 Arquivo .zip com a pasta</button>
    </div>
    <p class="contagem">${ehAparelhoApple() ? "No iPad, a opção do Google Drive abre as suas pastas aqui mesmo. O .zip também funciona: no app Arquivos, toque e segure a pasta → Comprimir." : "O .zip pode ser o que o próprio Google Drive gera ao baixar uma pasta."}</p>
    <input type="file" id="pasta-arq" webkitdirectory multiple hidden>
    <input type="file" id="zip-arq" accept=".zip,application/zip" hidden>
    <div id="pasta-res"></div>`);
  const res = $("#pasta-res");
  const aviso = t => { res.innerHTML = `<p class="contagem">${esc(t)}</p>`; };
  const rodar = async ({ raiz, entradas }) => {
    if (!entradas.length) { res.innerHTML = '<p class="alerta">Nenhum PDF encontrado.</p>'; return; }
    try { res.innerHTML = textoRelatorioLS(await importarArvoreLS(entradas, destinoId, raiz, aviso)); redesenharListasLS(); }
    catch (e) { res.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; }
  };
  $("#pasta-drive").onclick = () => painelPastaDriveLS(destinoId);
  if ($("#pasta-pc")) $("#pasta-pc").onclick = () => $("#pasta-arq").click();
  $("#pasta-arq").onchange = e => { const a = [...e.target.files]; e.target.value = ""; if (a.length) rodar(entradasDeArquivos(a)); };
  $("#pasta-zip").onclick = () => $("#zip-arq").click();
  $("#zip-arq").onchange = async e => { const a = e.target.files[0]; e.target.value = ""; if (!a) return; aviso("Abrindo o .zip…"); try { await rodar(await entradasDoZip(a)); } catch (er) { res.innerHTML = `<p class="alerta">⚠️ Não consegui abrir o .zip (${esc(er.message)}).</p>`; } };
}
/* redesenha a tela de listas por trás do painel (sem fechá-lo) */
function redesenharListasLS() {
  const m = location.hash.match(/^#\/leiseca\/listas(?:\/pasta\/([^/]+))?$/);
  if (m) telaListasLS(m[1] ? decodeURIComponent(m[1]) : null);
}
/* pasta que veio do Drive: atualizar com um toque */
async function atualizarPastaDoDriveLS(pastaId, res) {
  const p = estado.itens.get(pastaId);
  if (!p?.origemDrive) return;
  const aviso = t => { res.innerHTML = `<p class="contagem">${esc(t)}</p>`; };
  try {
    const token = await tokenDriveLeitura();
    const entradas = await arvoreDoDrive(token, p.origemDrive.id, [], [], aviso);
    const rel = await importarArvoreLS(entradas, paiDe(p), p.nome, aviso, p.origemDrive);
    res.innerHTML = textoRelatorioLS(rel);
  } catch (e) { res.innerHTML = `<p class="alerta">⚠️ ${esc(e.message)}</p>`; }
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
        <a class="botao" href="#/leiseca/estatisticas" style="text-decoration:none">📊 Estatísticas</a>
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
function iniciarSessaoLS(lista, titulo, pos = 0) {
  if (!lista.length) { alert("Nenhuma questão com esse filtro."); return; }
  gravarLS("sessao-ls", { ids: lista.map(q => q.id), pos: Math.min(pos, lista.length - 1), titulo, criada: agoraISO() });
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

/* =====================================================================
   ESTATÍSTICAS DA LEI SECA
   Rodada atual (desde o último "redefinir") + histórico de TODAS as respostas,
   com período, desempenho por lei/assunto/artigo/banca…, pontos fracos e viés V/F.
   ===================================================================== */
const PERIODOS_LS = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["tudo", "Tudo"]];
const DIMENSOES_LS = [
  ["leis", "Código/Lei"], ["assuntos", "Assunto"], ["subassuntos", "SubAssunto"], ["artigos", "Artigo"],
  ["bancas", "Banca"], ["anos", "Ano"], ["cargos", "Cargo"], ["instituicoes", "Instituição"], ["gabarito", "Gabarito"],
];
const valoresDimLS = (q, dim) => dim === "gabarito" ? [q.gabarito === "C" ? "Verdadeiro" : "Falso"] : CAMPOS_LS.find(c => c[0] === dim)[2](q);
const rotuloDimLS = (dim, v) => dim === "gabarito" ? v : CAMPOS_LS.find(c => c[0] === dim)[3](v);
const diaLocal = iso => new Date(iso).toLocaleDateString("sv-SE");

function calcularEstatLS(qs, mapa, periodo) {
  const desde = periodo === "tudo" ? "" : new Date(Date.now() - (Number(periodo) - 1) * 864e5).toLocaleDateString("sv-SE");
  const e = { total: qs.length, resolvidas: 0, certas: 0, erradas: 0, respostas: 0, acertos: 0, erros: 0, tempo: 0, porDia: {}, dias: new Set(),
    marcouV: 0, gabV: { r: 0, a: 0 }, gabF: { r: 0, a: 0 }, porQ: [] };
  for (const q of qs) {
    const atual = respostaAtual(mapa, q.id);
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
  // dias seguidos estudando (até hoje ou ontem), sempre sobre o histórico inteiro
  const todosDias = new Set();
  for (const q of qs) for (const r of mapa.get(q.id) || []) todosDias.add(diaLocal(r.em));
  let seq = 0, d = new Date();
  if (!todosDias.has(d.toLocaleDateString("sv-SE"))) d = new Date(Date.now() - 864e5);
  while (todosDias.has(d.toLocaleDateString("sv-SE"))) { seq++; d = new Date(d.getTime() - 864e5); }
  e.sequencia = seq;
  return e;
}
function agruparLS(porQ, dim) {
  const g = new Map();
  for (const x of porQ) for (const v of new Set(valoresDimLS(x.q, dim))) {
    const o = g.get(v) || { v, total: 0, resolvidas: 0, respostas: 0, acertos: 0, erros: 0, ids: [] };
    o.total++; o.ids.push(x.q.id); o.respostas += x.a + x.x; o.acertos += x.a; o.erros += x.x; if (x.atual) o.resolvidas++;
    g.set(v, o);
  }
  return [...g.values()];
}
const pctDe = o => o.respostas ? Math.round(100 * o.acertos / o.respostas) : null;
function graficoEvolucaoLS(porDia, nDias) {
  const dias = [];
  for (let k = nDias - 1; k >= 0; k--) dias.push(new Date(Date.now() - k * 864e5).toLocaleDateString("sv-SE"));
  const max = Math.max(1, ...dias.map(d => (porDia[d]?.certas || 0) + (porDia[d]?.erradas || 0)));
  const L = 600, A = 140, w = L / nDias;
  let barras = "", linha = [];
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
function telaEstatisticasLS() {
  definirTopo({ titulo: "📊 Estatísticas — Lei Seca", voltar: "#/leiseca" });
  marcarAba("questoes");
  const cfg = Object.assign({ periodo: "30", escopo: "tudo", dim: "leis", ordem: "pior" }, lerLS("estat-ls", {}));
  const mapa = mapaRespostas();
  const todas = baseLS(), f = filtroLS();
  const qs = cfg.escopo === "filtro" ? todas.filter(q => passaFiltroLS(q, { ...f, situacao: "todas", comentarios: "todos" }, mapa)) : todas;
  const e = calcularEstatLS(qs, mapa, cfg.periodo);
  const nDias = cfg.periodo === "tudo" ? Math.min(90, Math.max(7, e.dias.size ? Math.ceil((Date.now() - new Date([...e.dias].sort()[0]).getTime()) / 864e5) + 1 : 30)) : Number(cfg.periodo);
  const chip = (k, v, r) => `<button class="chip-ls" data-estat="${k}" data-v="${v}" aria-pressed="${cfg[k] === v}">${r}</button>`;
  const pctRes = e.total ? Math.round(100 * e.resolvidas / e.total) : 0;
  let grupos = agruparLS(e.porQ, cfg.dim);
  const ord = { pior: (a, b) => (pctDe(a) ?? 101) - (pctDe(b) ?? 101) || b.respostas - a.respostas, mais: (a, b) => b.respostas - a.respostas, nome: (a, b) => String(rotuloDimLS(cfg.dim, a.v)).localeCompare(String(rotuloDimLS(cfg.dim, b.v)), "pt-BR", { numeric: true }) };
  if (cfg.dim === "artigos" && cfg.ordem === "nome") grupos.sort((a, b) => { const [la, aa] = a.v.split("|"), [lb, ab] = b.v.split("|"); return la.localeCompare(lb) || compararArtigos(aa, ab); });
  else grupos.sort(ord[cfg.ordem] || ord.pior);
  const fracos = agruparLS(e.porQ, "artigos").filter(o => o.respostas >= 2 && pctDe(o) < 70).sort(ord.pior).slice(0, 8);
  const maisErra = e.porQ.filter(x => x.x).sort((a, b) => b.x - a.x || (a.a - b.a)).slice(0, 10);
  const pV = e.gabV.r ? Math.round(100 * e.gabV.a / e.gabV.r) : null, pF = e.gabF.r ? Math.round(100 * e.gabF.a / e.gabF.r) : null;
  const vies = e.respostas ? Math.round(100 * e.marcouV / e.respostas) : null;
  const linhaGrupo = (o, k) => {
    const p = pctDe(o);
    return `<div class="linha-desemp"><span class="nome-desemp">${esc(rotuloDimLS(cfg.dim, o.v))} <span class="contagem">(${o.total} questões · ${o.resolvidas} resolvidas)</span></span>
      <span class="barra-desemp" aria-hidden="true"><span class="b-ok" style="width:${o.respostas ? 100 * o.acertos / o.respostas : 0}%"></span><span class="b-erro" style="width:${o.respostas ? 100 * o.erros / o.respostas : 0}%"></span></span>
      <span class="num-desemp">${o.respostas ? `${o.acertos} ✓ · ${o.erros} ✗ · <strong>${p}%</strong>` : "sem respostas"} <button class="link" data-treinar-grupo="${k}">treinar ›</button></span></div>`;
  };
  $("#conteudo").innerHTML = `<div class="secao estat-ls">
    <div class="linha-chips"><span>Período:</span>${PERIODOS_LS.map(([v, r]) => chip("periodo", v, r)).join("")}</div>
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
    <h3 class="grupo-assunto">Banco de questões (rodada atual)</h3>
    <div class="cobertura-ls"><span class="b-ok" style="width:${e.total ? 100 * e.certas / e.total : 0}%"></span><span class="b-erro" style="width:${e.total ? 100 * e.erradas / e.total : 0}%"></span></div>
    <p class="contagem">${e.resolvidas} de ${e.total} questões resolvidas (${pctRes}%) · <span class="txt-ok">${e.certas} certas</span> · <span class="txt-erro">${e.erradas} erradas</span> · ${e.total - e.resolvidas} sem resposta.
      Redefinir questões começa uma nova rodada, mas o histórico continua contando aqui.</p>
    <div class="acoes-linha">
      ${e.total - e.resolvidas ? `<button class="botao primario" data-treinar="nao">▶️ Resolver as ${e.total - e.resolvidas} não resolvidas</button>` : ""}
      ${e.erradas ? `<button class="botao" data-treinar="erradas">🔁 Refazer as ${e.erradas} que errei</button>` : ""}
    </div>
    <h3 class="grupo-assunto">Evolução ${cfg.periodo === "tudo" ? `(últimos ${nDias} dias)` : `(${nDias} dias)`}</h3>${graficoEvolucaoLS(e.porDia, nDias)}
    <p class="legenda-diff"><span style="color:var(--ok)">■ acertos</span><span style="color:var(--alt)">■ erros</span><span style="color:var(--oliva)">- - % de acerto do dia</span></p>
    <h3 class="grupo-assunto">Verdadeiro ou Falso</h3>
    <p>${e.respostas ? `Quando o gabarito é <strong>Verdadeiro</strong>, você acerta <strong>${pV ?? "—"}${pV === null ? "" : "%"}</strong>; quando é <strong>Falso</strong>, <strong>${pF ?? "—"}${pF === null ? "" : "%"}</strong>.
      Você marca Verdadeiro em ${vies}% das respostas${pV !== null && pF !== null && Math.abs(pV - pF) >= 15 ? ` — <span class="txt-erro">atenção: você tende a errar mais as ${pV < pF ? "verdadeiras (desconfia demais)" : "falsas (deixa passar a pegadinha)"}</span>` : ""}.` : "Sem respostas no período."}</p>
    <h3 class="grupo-assunto">Desempenho por</h3>
    <div class="linha-chips">${DIMENSOES_LS.map(([v, r]) => chip("dim", v, r)).join("")}</div>
    <div class="linha-chips"><span>Ordem:</span>${chip("ordem", "pior", "Menor acerto")}${chip("ordem", "mais", "Mais respondidas")}${chip("ordem", "nome", "Nome")}</div>
    ${grupos.length ? `<div class="tabela-desemp">${grupos.slice(0, 60).map(linhaGrupo).join("")}</div>${grupos.length > 60 ? `<p class="contagem">Mostrando 60 de ${grupos.length}.</p>` : ""}` : '<p class="contagem">Nada para mostrar.</p>'}
    <h3 class="grupo-assunto">Pontos fracos: artigos com menos de 70% de acerto</h3>
    ${fracos.length ? `<ul class="resultados">${fracos.map((o, k) => `<li><button data-treinar-fraco="${k}"><span class="res-titulo">${esc(rotuloDimLS("artigos", o.v))} — ${pctDe(o)}% (${o.acertos} ✓ · ${o.erros} ✗)</span>
        <span class="res-trecho">${o.total} questão(ões) · toque para treinar</span></button></li>`).join("")}</ul>
      <div class="acoes-linha"><button class="botao primario" id="treinar-fracos">🎯 Treinar todos os pontos fracos</button></div>`
      : '<p class="contagem">Nenhum artigo abaixo de 70% (com pelo menos 2 respostas). 👏</p>'}
    <h3 class="grupo-assunto">Questões que você mais erra</h3>
    ${maisErra.length ? `<ul class="resultados">${maisErra.map((x, k) => `<li><button data-mais-erra="${k}"><span class="res-titulo">${x.x} erro(s) em ${x.a + x.x} resposta(s) · ${esc((x.q.refs || []).filter(r => r.lei).map(rotuloRef).join("; ") || x.q.referencia || "")}</span>
        <span class="res-trecho">${esc(x.q.enunciado.join(" ").slice(0, 150))}…</span></button></li>`).join("")}</ul>` : '<p class="contagem">Nenhum erro no período.</p>'}`}
  </div>`;
  $$("[data-estat]").forEach(b => b.onclick = () => { const c = Object.assign({}, cfg, { [b.dataset.estat]: b.dataset.v }); gravarLS("estat-ls", c); telaEstatisticasLS(); });
  const porId = new Map(qs.map(q => [q.id, q]));
  const treinar = (ids, titulo, pos = 0) => iniciarSessaoLS(ordenarLS(ids.map(id => porId.get(id)).filter(Boolean)), titulo, pos);
  $$("[data-treinar-grupo]").forEach(b => b.onclick = () => { const o = grupos[Number(b.dataset.treinarGrupo)]; treinar(o.ids, `${DIMENSOES_LS.find(d => d[0] === cfg.dim)[1]}: ${rotuloDimLS(cfg.dim, o.v)}`); });
  $$("[data-treinar-fraco]").forEach(b => b.onclick = () => { const o = fracos[Number(b.dataset.treinarFraco)]; treinar(o.ids, `Ponto fraco: ${rotuloDimLS("artigos", o.v)}`); });
  if ($("#treinar-fracos")) $("#treinar-fracos").onclick = () => treinar([...new Set(fracos.flatMap(o => o.ids))], "Pontos fracos");
  $$("[data-treinar]").forEach(b => b.onclick = async () => {
    if (b.dataset.treinar === "nao") return treinar(e.porQ.filter(x => !x.atual).map(x => x.q.id), "Não resolvidas");
    const ids = e.porQ.filter(x => x.atual && !x.atual.correta).map(x => x.q.id);
    await redefinirQuestoes(ids); treinar(ids, "Refazendo as que errei");
  });
  $$("[data-mais-erra]").forEach(b => b.onclick = () => iniciarSessaoLS(maisErra.map(x => x.q), "Questões que mais erro", Number(b.dataset.maisErra)));
}
