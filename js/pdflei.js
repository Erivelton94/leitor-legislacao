/* =====================================================================
   BAIXAR LEI EM PDF
   Lei inteira ou de um artigo até outro, com o texto formatado como na
   leitura (títulos, parágrafos, incisos, alíneas) e, se você quiser,
   com os seus grifos coloridos e as suas anotações.
   ===================================================================== */
const CORES_GRIFO_PDF = { amarelo: [1, 0.9, 0.54], verde: [0.74, 0.92, 0.77], azul: [0.75, 0.87, 0.97], vermelho: [0.97, 0.76, 0.76] };

async function painelBaixarLeiPdf(id) {
  const lei = await leiDoCache(id);
  if (!lei) { alert("O texto desta lei ainda não está no aparelho. Abra a lei uma vez com internet e tente de novo."); return; }
  const arts = prepararLei(lei).arts;
  const opcoes = arts.map((a, k) => `<option value="${k}">${esc(rotuloArt(a.id, id))}</option>`).join("");
  abrirPainel(`<h2>Baixar em PDF ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">${esc(nomeLei(id))}</p>
    <div class="segmentado" id="pdf-escopo" style="margin-bottom:12px"><button data-escopo="tudo" aria-pressed="true">Lei completa</button><button data-escopo="trecho" aria-pressed="false">Escolher os artigos</button></div>
    <div id="pdf-trecho" class="oculto">
      <div class="linha-ajuste"><span>Do artigo</span><select class="campo" id="pdf-de">${opcoes}</select></div>
      <div class="linha-ajuste"><span>Até o artigo</span><select class="campo" id="pdf-ate">${opcoes}</select></div>
    </div>
    <label class="linha-ajuste"><span>Incluir os meus grifos (com as cores)</span><input type="checkbox" id="pdf-grifos" checked style="width:22px;height:22px"></label>
    <label class="linha-ajuste" style="border:0"><span>Incluir as minhas anotações</span><input type="checkbox" id="pdf-notas" style="width:22px;height:22px"></label>
    <div class="acoes" style="margin-top:8px"><button class="botao primario" id="pdf-gerar">Gerar PDF</button></div>
    <p class="contagem" id="pdf-msg"></p>`);
  $("#pdf-ate").value = String(arts.length - 1);
  $$("#pdf-escopo button").forEach(b => b.onclick = () => {
    $$("#pdf-escopo button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#pdf-trecho").classList.toggle("oculto", b.dataset.escopo !== "trecho");
  });
  $("#pdf-gerar").onclick = async () => {
    const trecho = $("#pdf-escopo [aria-pressed=true]").dataset.escopo === "trecho";
    let de = trecho ? Number($("#pdf-de").value) : 0, ate = trecho ? Number($("#pdf-ate").value) : arts.length - 1;
    if (de > ate) [de, ate] = [ate, de];
    const b = $("#pdf-gerar"); b.disabled = true; b.textContent = "Gerando…";
    try {
      const blob = await gerarPdfLei(id, de, ate, { grifos: $("#pdf-grifos").checked, notas: $("#pdf-notas").checked }, t => { $("#pdf-msg").textContent = t; });
      const sufixo = de === 0 && ate === arts.length - 1 ? "" : ` (${rotuloArt(arts[de].id, id)} a ${rotuloArt(arts[ate].id, id)})`;
      await entregarArquivo(blob, `${nomeLei(id)}${sufixo}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
      $("#pdf-msg").textContent = `✓ PDF gerado: ${ate - de + 1} artigo(s).`;
    } catch (e) { $("#pdf-msg").textContent = "⚠️ Não foi possível gerar o PDF: " + e.message; }
    b.disabled = false; b.textContent = "Gerar PDF";
  };
}

async function gerarPdfLei(id, de, ate, { grifos = true, notas = false } = {}, aviso) {
  await carregarScript("libs/pdf-lib.min.js");
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const lei = await leiDoCache(id);
  const { arts, pre } = prepararLei(lei);
  const pdf = await PDFDocument.create();
  pdf.setTitle(nomeLei(id)); pdf.setCreator("Leitor de Legislação");
  const F = {
    texto: await pdf.embedFont(StandardFonts.TimesRoman), negrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italico: await pdf.embedFont(StandardFonts.TimesRomanItalic), titulo: await pdf.embedFont(StandardFonts.HelveticaBold), sans: await pdf.embedFont(StandardFonts.Helvetica),
  };
  // só caracteres que as fontes do PDF conhecem (troca um por um, para os grifos não saírem do lugar)
  const conjunto = new Set(F.texto.getCharacterSet());
  const TROCAS = { "\u2264": "<", "\u2265": ">", "\u2192": ">", "\u2190": "<", "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u00ad": "-", "\u200b": " ", "\u2009": " ", "\u202f": " " };
  const limpar = t => [...t].map(c => (c === "\n" ? " " : conjunto.has(c.codePointAt(0)) ? c : (TROCAS[c] || "?"))).join("");
  const A4 = [595.28, 841.89], M = { esq: 64, dir: 64, topo: 64, base: 62 };
  const LARG = A4[0] - M.esq - M.dir;
  let pag = null, y = 0;
  const novaPagina = () => { pag = pdf.addPage(A4); y = A4[1] - M.topo; };
  novaPagina();
  const cabe = h => { if (y - h < M.base) novaPagina(); };
  /* escreve um parágrafo com quebra de linha, justificado ou centralizado, com destaques (grifos) */
  const escrever = (textoBruto, op = {}) => {
    const { fonte = F.texto, tam = 11.5, recuo = 0, alinhar = "justificar", cor = [0.1, 0.12, 0.15], destaques = [], negritoAte = 0, antes = 0, depois = 5, entrelinha = 1.42 } = op;
    const texto = limpar(textoBruto);
    if (!texto.trim()) return;
    const palavras = [...texto.matchAll(/\S+/g)].map(m => {
      const f = m.index < negritoAte ? F.negrito : fonte;
      return { s: m[0], ini: m.index, fim: m.index + m[0].length, f, w: f.widthOfTextAtSize(m[0], tam) };
    });
    const esp = fonte.widthOfTextAtSize(" ", tam);
    const largura = LARG - recuo;
    const linhas = [];
    let atual = [], soma = 0;
    for (const p of palavras) {
      if (atual.length && soma + esp + p.w > largura) { linhas.push(atual); atual = []; soma = 0; }
      soma += (atual.length ? esp : 0) + p.w; atual.push(p);
    }
    if (atual.length) linhas.push(atual);
    const alt = tam * entrelinha;
    y -= antes;
    linhas.forEach((ln, k) => {
      cabe(alt);
      const ultima = k === linhas.length - 1;
      const usado = ln.reduce((s, p) => s + p.w, 0);
      const gap = alinhar === "justificar" && !ultima && ln.length > 1 ? (largura - usado) / (ln.length - 1) : esp;
      let x = M.esq + recuo + (alinhar === "centro" ? (largura - (usado + esp * (ln.length - 1))) / 2 : 0);
      const base = y - tam;
      ln.forEach((p, j) => {
        const d = destaques.find(([a, b]) => p.ini < b && p.fim > a);
        if (d) {
          const prox = ln[j + 1];
          const continua = prox && destaques.some(([a, b]) => prox.ini < b && prox.fim > a && a === d[0]);
          pag.drawRectangle({ x: x - 0.5, y: base - tam * 0.22, width: p.w + (continua ? gap : 0) + 1, height: tam * 1.18, color: rgb(...d[2]) });
        }
        pag.drawText(p.s, { x, y: base, size: tam, font: p.f, color: rgb(...cor) });
        x += p.w + gap;
      });
      y -= alt;
    });
    y -= depois;
  };
  /* destaques de um trecho: onde o texto grifado aparece nesta linha */
  const grifosDoArt = art => grifos ? itens("grifo", g => g.lei === id && g.art === art) : [];
  const destaquesDaLinha = (linha, lista) => {
    const out = [];
    for (const g of lista) {
      const alvo = (g.texto || "").replace(/\s+/g, " ").trim();
      if (!alvo) continue;
      let k = linha.indexOf(alvo);
      if (k < 0 && alvo.length > 12) {                              // grifo que atravessa linhas: pega o pedaço desta linha
        for (let n = alvo.length - 1; n >= 12 && k < 0; n--) { const ini = linha.indexOf(alvo.slice(0, n)); if (ini >= 0 && ini + n === linha.trimEnd().length) { out.push([ini, ini + n, CORES_GRIFO_PDF[g.cor] || CORES_GRIFO_PDF.amarelo]); k = -2; } }
        for (let n = alvo.length - 1; n >= 12 && k === -1; n--) { if (linha.startsWith(alvo.slice(-n))) { out.push([0, n, CORES_GRIFO_PDF[g.cor] || CORES_GRIFO_PDF.amarelo]); k = -2; } }
      }
      if (k >= 0) out.push([k, k + alvo.length, CORES_GRIFO_PDF[g.cor] || CORES_GRIFO_PDF.amarelo]);
    }
    return out;
  };
  // cabeçalho do documento
  const st = estado.status[id] || {};
  escrever(nomeLei(id), { fonte: F.titulo, tam: 16, alinhar: "centro", depois: 2, cor: [0.27, 0.32, 0.11] });
  if (st.numero) escrever(st.numero, { fonte: F.sans, tam: 10, alinhar: "centro", depois: 2, cor: [0.35, 0.38, 0.4] });
  const parcial = !(de === 0 && ate === arts.length - 1);
  escrever(`${parcial ? `Do ${rotuloArt(arts[de].id, id)} ao ${rotuloArt(arts[ate].id, id)} · ` : ""}Texto compilado do Planalto, versão de ${dataCurta(lei.versao)} · gerado em ${dataHora(agoraISO())}`,
    { fonte: F.sans, tam: 8.5, alinhar: "centro", depois: 16, cor: [0.45, 0.47, 0.5] });
  if (!parcial) for (const l of pre) {
    if (l.tipo === "epigrafe") escrever(l.t, { fonte: F.negrito, tam: 12, alinhar: "centro", depois: 8 });
    else if (l.tipo === "ementa") escrever(l.t, { fonte: F.italico, tam: 10.5, recuo: LARG * 0.45, alinhar: "esquerda", depois: 8 });
    else if (l.tipo === "notalinha") escrever(l.t, { fonte: F.italico, tam: 9, alinhar: "centro", depois: 4, cor: [0.4, 0.42, 0.45] });
    else if (l.tipo === "estrutura") escrever(l.t, { fonte: F.titulo, tam: 10.5, alinhar: "centro", antes: 6, depois: 4 });
    else escrever(l.t, { depois: 6 });
  }
  for (let k = de; k <= ate; k++) {
    const a = arts[k];
    if (aviso && k % 25 === 0) aviso(`Montando o PDF: ${k - de + 1} de ${ate - de + 1} artigos…`);
    for (const l of (k === de && de === 0 ? [] : a.antes)) {
      if (l.tipo === "estrutura") escrever(l.t, { fonte: F.titulo, tam: 10.5, alinhar: "centro", antes: 10, depois: 4, cor: [0.27, 0.32, 0.11] });
      else if (l.tipo === "notalinha") escrever(l.t, { fonte: F.italico, tam: 9, alinhar: "centro", depois: 4, cor: [0.4, 0.42, 0.45] });
      else escrever(l.t, { fonte: F.titulo, tam: 9.5, alinhar: "esquerda", antes: 6, depois: 3, cor: [0.3, 0.33, 0.36] });
    }
    const gs = grifosDoArt(a.id);
    a.linhas.forEach((l, i) => {
      const t = limpar(l.t);
      const dest = destaquesDaLinha(t, gs);
      if (i === 0) {
        const m = t.match(/^(Art\.?\s*[\dºo°]+(?:-[A-Z]{1,2})*\.?)/);
        escrever(t, { negritoAte: m ? m[1].length : 0, destaques: dest, antes: 7, depois: 4 });
        return;
      }
      const estilo = {
        par: { recuo: 14 }, inc: { recuo: 22 }, ali: { recuo: 32 }, pena: { recuo: 14, fonte: F.italico },
        rubrica: { fonte: F.titulo, tam: 9.5, alinhar: "esquerda", antes: 4, cor: [0.3, 0.33, 0.36] }, estrutura: { fonte: F.titulo, tam: 9.5, alinhar: "esquerda", antes: 4 },
        notalinha: { fonte: F.italico, tam: 9, alinhar: "esquerda", cor: [0.4, 0.42, 0.45] },
      }[l.tipo] || {};
      escrever(t, { ...estilo, destaques: dest });
    });
    if (notas) for (const n of itens("anotacao", n => n.lei === id && n.art === a.id && n.nota)) {
      cabe(30);
      const topo = y;
      escrever("Anotação: " + n.nota, { fonte: F.italico, tam: 10, recuo: 22, alinhar: "esquerda", cor: [0.2, 0.3, 0.45], antes: 2, depois: 6, negritoAte: 0 });
      pag.drawRectangle({ x: M.esq + 12, y: y + 6, width: 2, height: Math.max(8, topo - y - 8), color: rgb(0.45, 0.55, 0.75) });
    }
  }
  // rodapé com o nome da lei e o número da página
  const paginas = pdf.getPages();
  paginas.forEach((p, k) => {
    const txt = limpar(`${nomeLei(id)} · página ${k + 1} de ${paginas.length}`);
    const w = F.sans.widthOfTextAtSize(txt, 8);
    p.drawText(txt, { x: (A4[0] - w) / 2, y: 30, size: 8, font: F.sans, color: rgb(0.5, 0.52, 0.55) });
  });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

/* =====================================================================
   ORDEM DAS LEIS NO ACERVO
   1º as fixadas · 2º as que você alterou (a mais recente em cima)
   · depois as demais, na ordem de sempre. Só abrir não muda a ordem.
   ===================================================================== */
const idFixada = id => "fixado|lei|" + id;
const ehFixada = id => { const i = estado.itens.get(idFixada(id)); return !!i && !i.apagado; };
async function alternarFixada(id) {
  if (ehFixada(id)) await apagarItem(idFixada(id));
  else await salvarItem({ id: idFixada(id), tipo: "fixado", area: "leis", alvo: id, em: agoraISO() });
}
function ultimaAlteracaoPorLei() {
  const m = new Map();
  for (const i of estado.itens.values()) {
    if (i.apagado) continue;
    const lei = i.tipo === "nome-lei" ? i.alvo : i.lei;
    if (!lei || String(lei).startsWith("resumo:") || !["grifo", "anotacao", "tinta", "favorito", "nome-lei"].includes(i.tipo)) continue;
    const t = i.atualizadoEm || i.criadoEm || "";
    if (t > (m.get(lei) || "")) m.set(lei, t);
  }
  return m;
}
function ordenarLeis(ids, todos) {
  const alt = ultimaAlteracaoPorLei();
  const chave = id => [ehFixada(id) ? 0 : 1, alt.get(id) || ""];
  return [...ids].sort((a, b) => {
    const [fa, ta] = chave(a), [fb, tb] = chave(b);
    if (fa !== fb) return fa - fb;
    if (ta !== tb) return ta && tb ? tb.localeCompare(ta) : ta ? -1 : 1;     // alterada mais recente primeiro
    return todos.indexOf(a) - todos.indexOf(b);
  });
}
