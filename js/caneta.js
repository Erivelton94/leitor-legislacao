/* =====================================================================
   CANETA: ferramentas Caneta, Marca-texto, Ícones e Borracha.
   - Pencil desenha; dedo rola. Com "Usar o dedo": 1 dedo desenha, 2 rolam.
   - Borracha livre (apaga só onde passa) ou de traço inteiro.
   - Desfazer e Refazer valem para tudo (traços e ícones), separados por lei e por resumo.
   - Cada ferramenta lembra a sua cor; traço suavizado e com pressão do Pencil;
     rabiscar para apagar; laço para selecionar, mover, redimensionar, trocar a cor e apagar.
   Cada artigo guarda seus traços e ícones junto com o tamanho de letra usado.
   ===================================================================== */
const NS_SVG = "http://www.w3.org/2000/svg";
const CORES_CANETA = [["#D32F2F", "Vermelho"], ["#1E5BD8", "Azul"], ["#15803D", "Verde"], ["#1F2A36", "Preto"], ["#E0B000", "Amarelo"]];
const ESP_CANETA = [[1.5, "Fina"], [2.5, "Média"], [4, "Grossa"]];
const ESP_MARCA = [[10, "Fino"], [15, "Médio"], [22, "Grosso"]];
const TAMANHOS_BORRACHA = [[3, "P"], [8, "M"], [16, "G"]];
const ICONES = [["⭐", "Importante"], ["🔥", "Muito cobrado"], ["🎯", "Cai em prova"], ["⚠️", "Pegadinha"], ["❗", "Atenção"],
                ["💡", "Dica"], ["❓", "Dúvida"], ["📌", "Fixar"], ["🔁", "Revisar"], ["✅", "Revisado"]];
const TAM_ICONE = [[28, "P"], [40, "M"], [54, "G"]];
const SUAVIZACAO = [["nenhuma", "Sem suavização"], ["leve", "Leve"], ["forte", "Forte"]];
const prefCaneta = lerLS("preferencias-caneta", {});
const caneta = Object.assign(
  { ferramenta: "caneta", corCaneta: prefCaneta.cor || "#D32F2F", corMarca: "#E0B000", esp: 2.5, espMarca: 15, modoBorracha: "parcial", raio: 8, icone: "⭐", tamIcone: 40, dedo: false,
    suavizacao: "leve", pressao: true, rabiscar: true },
  prefCaneta,
  { ativa: false, pilhas: new Map(), tracando: null, apagando: null, arrastando: null, lacando: null, selecao: null });
delete caneta.cor;
/* cada ferramenta lembra a sua cor: a caneta continua vermelha mesmo depois de usar o marca-texto amarelo */
Object.defineProperty(caneta, "cor", {
  get() { return this.ferramenta === "marca" ? this.corMarca : this.corCaneta; },
  set(v) { if (this.ferramenta === "marca") this.corMarca = v; else this.corCaneta = v; },
});
if (["borracha", "figura", "laco"].includes(caneta.ferramenta)) caneta.ferramenta = "caneta";
if (![28, 40, 54].includes(caneta.tamIcone)) caneta.tamIcone = 40;     // tamanhos antigos passam para o novo padrão
function gravarPrefCaneta() {
  const { ferramenta, corCaneta, corMarca, esp, espMarca, modoBorracha, raio, icone, tamIcone, dedo, posicao, suavizacao, pressao, rabiscar } = caneta;
  gravarLS("preferencias-caneta", { ferramenta, corCaneta, corMarca, esp, espMarca, modoBorracha, raio, icone, tamIcone, dedo, posicao, suavizacao, pressao, rabiscar });
}
const idTinta = (lei, art, fonte) => `tinta|${lei}|${art}|${fonte}`;
const temConteudo = t => (t.tracos && t.tracos.length) || (t.carimbos && t.carimbos.length) || (t.figuras && t.figuras.length);
function tintasDoArtigo(lei, art) { return (marcasDaLei(lei).get(art)?.tintas || []).filter(temConteudo); }
let larguraCache = null;
function larguraTexto() {
  if (larguraCache === null) { const el = $("#texto-lei"); if (!el) return 0; larguraCache = Math.round(el.clientWidth); }
  return larguraCache;
}
function tintaVisivel(lei, art) {
  const larg = larguraTexto();
  return tintasDoArtigo(lei, art).find(t => t.fonte === fonteAtual() && (Math.abs((t.largura || larg) - larg) <= 8 || !ehResumoAberto())) || null;
}
function caminhoD(p) {
  if (p.length < 4) return `M${p[0]} ${p[1]} l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += ` Q${p[i]} ${p[i + 1]} ${((p[i] + p[i + 2]) / 2).toFixed(1)} ${((p[i + 1] + p[i + 3]) / 2).toFixed(1)}`;
  return d + ` L${p[p.length - 2]} ${p[p.length - 1]}`;
}
const ehMarca = t => t.marca || t.cor === "marca";                  // "marca" = formato antigo (amarelo)
const larguraTraco = t => (ehMarca(t) ? (t.cor === "marca" ? 14 : t.esp) : t.esp);
function translucida(hex, alfa) {
  if (hex === "marca") hex = "#E0B000";
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
/* Traço com pressão do Pencil: guarda a força de cada ponto (t.pr, 0 a 100). Para desenhar, o traço é
   dividido em trechos de espessura igual, emendados com pontas redondas (fica igual na tela, no PDF e nas miniaturas). */
const fatorPressao = p => 0.45 + 1.15 * Math.max(0, Math.min(1, p / 100));
const temPressao = t => !!(t.pr && t.pr.length * 2 === t.pts.length && !ehMarca(t));
function partesDoTraco(t) {
  if (!temPressao(t)) return [{ pts: t.pts, esp: larguraTraco(t) }];
  const passo = Math.max(0.12, t.esp * 0.08);
  const out = [];
  let atual = null;
  for (let k = 0; k < t.pr.length; k++) {
    const w = +(Math.max(passo, Math.round(t.esp * fatorPressao(t.pr[k]) / passo) * passo)).toFixed(2);
    const x = t.pts[2 * k], y = t.pts[2 * k + 1];
    if (atual && atual.esp === w) { atual.pts.push(x, y); continue; }
    const ini = atual ? atual.pts.slice(-2) : [];
    atual = { esp: w, pts: [...ini, x, y] };
    out.push(atual);
  }
  return out;
}
function elTraco(t) {
  const marca = ehMarca(t);
  let el;
  if (temPressao(t)) {
    el = document.createElementNS(NS_SVG, "g");
    el.setAttribute("stroke", t.cor); el.setAttribute("fill", "none");
    el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round");
    for (const pt of partesDoTraco(t)) {
      const p = document.createElementNS(NS_SVG, "path");
      p.setAttribute("d", caminhoD(pt.pts)); p.setAttribute("stroke-width", pt.esp);
      el.appendChild(p);
    }
  } else {
    el = document.createElementNS(NS_SVG, "path");
    el.setAttribute("d", caminhoD(t.pts));
    el.setAttribute("stroke", marca ? translucida(t.cor, t.cor === "#1F2A36" ? 0.22 : 0.35) : t.cor);
    el.setAttribute("stroke-width", larguraTraco(t));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke-linecap", marca ? "butt" : "round");
    el.setAttribute("stroke-linejoin", "round");
    if (marca) el.setAttribute("class", "traco-marca");
  }
  el.dataset.traco = t.id;
  return el;
}
function elCarimbo(c) {
  const el = document.createElementNS(NS_SVG, "text");
  el.setAttribute("x", c.x); el.setAttribute("y", c.y);
  el.setAttribute("font-size", c.tam);
  el.setAttribute("text-anchor", "middle"); el.setAttribute("dominant-baseline", "central");
  el.setAttribute("class", "carimbo");
  el.textContent = c.icone;
  el.dataset.carimbo = c.id;
  return el;
}
function svgDo(div, criar) {
  let s = div.querySelector(":scope > svg.tinta");
  if (!s && criar) { s = document.createElementNS(NS_SVG, "svg"); s.setAttribute("class", "tinta"); s.setAttribute("aria-hidden", "true"); div.appendChild(s); }
  return s;
}
function desenharTracos(div, item) {
  const outros = ehResumoAberto() ? [] : tintasDoArtigo(leiAberta, div.dataset.art).filter(t => t !== item && t.id !== item.id).flatMap(t => elementosAdaptados(div, t));
  // mesma letra, largura de tela diferente (iPad girado): os desenhos acompanham o texto
  const deslocado = !ehResumoAberto() && item.largura && Math.abs(item.largura - larguraTexto()) > 8;
  const proprios = deslocado ? elementosAdaptados(div, item) : [...(item.tracos || []).map(elTraco), ...(item.carimbos || []).map(elCarimbo)];
  svgDo(div, true).replaceChildren(...outros, ...(item.figuras || []).map(elFigura), ...proprios);
}
function pintarTinta(leiId, div) {
  div.querySelectorAll(":scope > svg.tinta, :scope > .aviso-tinta").forEach(e => e.remove());
  const art = div.dataset.art;
  const todas = tintasDoArtigo(leiId, art);
  if (!todas.length) return;
  const atual = tintaVisivel(leiId, art);
  if (!atual && !ehResumoAberto()) svgDo(div, true).replaceChildren(...todas.flatMap(t => elementosAdaptados(div, t)));   // só desenhos de outro tamanho: aparecem ajustados
  if (atual) {
    desenharTracos(div, atual);
    completarAncoras(div, atual);
    if (estado.leis[leiId] && atual.hashArt !== estado.leis[leiId]?.artigos[art]?.hash) {
      const a = document.createElement("span");
      a.className = "aviso-tinta alerta-tinta";
      a.dataset.rotulo = `✎ O artigo mudou depois destas marcações (feitas na versão de ${dataCurta(atual.versao)})`;
      div.appendChild(a);
    }
  }
  const outra = todas.find(t => t !== atual);
  if (outra && ehResumoAberto()) {
    const b = document.createElement("button");
    b.className = "aviso-tinta";
    b.dataset.fonteTinta = outra.fonte;
    b.dataset.rotulo = "✎ Desenhos feitos com a tela em outra posição (gire o iPad para vê-los)";
    div.appendChild(b);
  } else if (outra && outra.fonte !== fonteAtual()) {
    const b = document.createElement("button");             // aparecem ajustados; para apagar ou mexer neles, volta ao tamanho original
    b.className = "aviso-tinta discreto";
    b.dataset.fonteTinta = outra.fonte;
    b.dataset.rotulo = `✎ desenhos ajustados da letra ${outra.fonte} · tocar para editá-los no tamanho original`;
    div.appendChild(b);
  }
}
function repintarTintas() {
  larguraCache = null;
  if (!leiAberta || !document.getElementById("texto-lei")) return;
  const comTinta = new Set([...marcasDaLei(leiAberta).entries()].filter(([, m]) => m.tintas.length).map(([a]) => a));
  // só mexe nos artigos que têm desenho (ou que tinham e precisam ser limpos)
  $$("#texto-lei .artigo").forEach(div => { if (comTinta.has(div.dataset.art) || div.querySelector(":scope > svg.tinta, :scope > .aviso-tinta")) pintarTinta(leiAberta, div); });
}
let tempoResize = null;
window.addEventListener("resize", () => { larguraCache = null; clearTimeout(tempoResize); tempoResize = setTimeout(repintarTintas, 300); });

function itemTintaAtual(div) {
  const lei = estado.leis[leiAberta], art = div.dataset.art;
  const id = idTinta(leiAberta, art, fonteAtual());
  const ex = estado.itens.get(id);
  if (ex && !ex.apagado && (ex.tracos || ex.carimbos)) { ex.tracos = ex.tracos || []; ex.carimbos = ex.carimbos || []; return ex; }
  return { id, tipo: "tinta", lei: leiAberta, art, fonte: fonteAtual(), largura: larguraTexto(),
           versao: lei?.versao || "", hashArt: lei?.artigos[art]?.hash || "", tracos: [], carimbos: [] };
}
function pontoRel(div, ev) { const r = div.getBoundingClientRect(), z = fz(); return [+((ev.clientX - r.left) / z).toFixed(1), +((ev.clientY - r.top) / z).toFixed(1)]; }
const fotografar = item => ({ tracos: (item.tracos || []).slice(), carimbos: (item.carimbos || []).map(c => ({ ...c })), figuras: (item.figuras || []).map(f => ({ ...f })) });

/* ---------- desfazer / refazer: cada lei e cada resumo tem a sua própria lista ---------- */
function pilhaDoc(doc = leiAberta) {
  if (!caneta.pilhas.has(doc)) caneta.pilhas.set(doc, { hist: [], refeitos: [] });
  return caneta.pilhas.get(doc);
}
function registrarAcao(item, antes) { registrarGrupo([{ item: item.id, art: item.art, antes, depois: fotografar(item) }], []); }
function registrarGrupo(partes, grifos) {
  if (!partes.length && !grifos.length) return;
  const pl = pilhaDoc();
  pl.hist.push({ partes, grifos });
  if (pl.hist.length > 100) pl.hist.shift();
  pl.refeitos = [];
  atualizarBotoesHist();
}
async function aplicarVersaoTracos(parte, qual) {
  const base = estado.itens.get(parte.item) || { id: parte.item, tipo: "tinta" };
  const foto = parte[qual];
  const item = { ...base, apagado: false, tracos: foto.tracos.slice(), carimbos: foto.carimbos.map(c => ({ ...c })), figuras: (foto.figuras || []).map(f => ({ ...f })) };
  if (!item.lei) {
    const [, lei, art, fonte] = parte.item.split("|");
    Object.assign(item, { lei, art, fonte: Number(fonte), largura: larguraTexto(), versao: estado.leis[lei]?.versao, hashArt: estado.leis[lei]?.artigos[art]?.hash });
  }
  await salvarItem(item);
  const div = document.getElementById("art-" + parte.art);
  if (div && item.lei === leiAberta) pintarTinta(leiAberta, div);
}
async function aplicarGrupo(g, qual) {
  for (const p of g.partes) await aplicarVersaoTracos(p, qual);
  for (const gr of g.grifos) {            // grifos de texto apagados pela borracha
    if (qual === "antes") await salvarItem({ ...gr, apagado: false }); else await apagarItem(gr.id);
    if (gr.lei === leiAberta) repintarArtigo(gr.lei, gr.art);
  }
}
async function desfazerTinta() { limparSelecaoLaco(); const pl = pilhaDoc(), g = pl.hist.pop(); if (!g) return; await aplicarGrupo(g, "antes"); pl.refeitos.push(g); atualizarBotoesHist(); }
async function refazerTinta() { limparSelecaoLaco(); const pl = pilhaDoc(), g = pl.refeitos.pop(); if (!g) return; await aplicarGrupo(g, "depois"); pl.hist.push(g); atualizarBotoesHist(); }
function atualizarBotoesHist() {
  const d = $("#cn-desfazer"), r = $("#cn-refazer"), pl = pilhaDoc();
  if (d) d.disabled = !pl.hist.length;
  if (r) r.disabled = !pl.refeitos.length;
}

/* ---------- borracha (livre: apaga só onde passa; ou traço inteiro) ---------- */
function distPontoSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function densificar(p, passo = 1, pr = null) {
  const out = [p[0], p[1]], prs = pr ? [pr[0]] : null;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = out[out.length - 2], y0 = out[out.length - 1], x1 = p[i], y1 = p[i + 1];
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / passo);
    for (let k = 1; k <= n; k++) {
      out.push(+(x0 + (x1 - x0) * k / (n + 1)).toFixed(1), +(y0 + (y1 - y0) * k / (n + 1)).toFixed(1));
      if (prs) prs.push(Math.round(pr[i / 2 - 1] + (pr[i / 2] - pr[i / 2 - 1]) * k / (n + 1)));
    }
    out.push(x1, y1);
    if (prs) prs.push(pr[i / 2]);
  }
  return pr ? { pts: out, pr: prs } : out;
}
const densos = new WeakMap();                       // pontos refinados de cada traço (calculados uma vez)
const refinados = new WeakSet();                    // pedaços cortados pela borracha (ainda com pontos demais)
function densoDe(t) {
  if (!densos.has(t)) densos.set(t, temPressao(t) ? densificar(t.pts, 1, t.pr) : { pts: densificar(t.pts), pr: null });
  return densos.get(t);
}
const caixas = new WeakMap();                       // retângulo de cada traço: descarta rápido o que está longe
function tracoPerto(t, ax, ay, x, y, alc) {
  let c = caixas.get(t);
  if (!c) {
    c = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.pts.length; i += 2) { c[0] = Math.min(c[0], t.pts[i]); c[1] = Math.min(c[1], t.pts[i + 1]); c[2] = Math.max(c[2], t.pts[i]); c[3] = Math.max(c[3], t.pts[i + 1]); }
    caixas.set(t, c);
  }
  return !(Math.max(ax, x) + alc < c[0] || Math.min(ax, x) - alc > c[2] || Math.max(ay, y) + alc < c[1] || Math.min(ay, y) - alc > c[3]);
}
function passarBorracha(a, x, y) {
  const [ax, ay] = a.ultimo;
  a.ultimo = [x, y];
  const item = a.item;
  const svg = svgDo(a.div, true);
  let mudou = false;
  const novos = [];
  for (const t of item.tracos) {
    // a borracha precisa encostar no traço desenhado (considera a espessura do traço)
    const alcance = caneta.raio + larguraTraco(t) / 2;
    if (!tracoPerto(t, ax, ay, x, y, alcance)) { novos.push(t); continue; }       // longe: nem calcula
    const { pts, pr } = densoDe(t);
    const dentro = new Uint8Array(pts.length / 2);
    let tocou = false;
    for (let i = 0, k = 0; i < pts.length; i += 2, k++) if (distPontoSegmento(pts[i], pts[i + 1], ax, ay, x, y) <= alcance) { dentro[k] = 1; tocou = true; }
    if (!tocou) { novos.push(t); continue; }
    mudou = true;
    svg.querySelector(`[data-traco="${t.id}"]`)?.remove();       // atualiza só o traço cortado, não o desenho todo
    if (caneta.modoBorracha === "traco") continue;
    let run = [], runPr = [];
    const fechar = () => {
      if (run.length >= 4) {
        const pedaco = { ...t, id: uid().slice(0, 8), pts: run };
        if (pr) pedaco.pr = runPr; else delete pedaco.pr;
        densos.set(pedaco, { pts: run, pr: pr ? runPr : null });       // o pedaço já está refinado
        refinados.add(pedaco);
        novos.push(pedaco);
        svg.appendChild(elTraco(enxugarTraco(pedaco)));
      }
      run = []; runPr = [];
    };
    for (let k = 0; k < dentro.length; k++) { if (dentro[k]) fechar(); else { run.push(pts[2 * k], pts[2 * k + 1]); if (pr) runPr.push(pr[k]); } }
    fechar();
  }
  const antesIcones = item.carimbos.length;
  item.carimbos = item.carimbos.filter(c => {
    const fica = distPontoSegmento(c.x, c.y, ax, ay, x, y) > caneta.raio + c.tam * 0.4;
    if (!fica) svg.querySelector(`text[data-carimbo="${c.id}"]`)?.remove();
    return fica;
  });
  if (item.carimbos.length !== antesIcones) mudou = true;
  if (item.figuras && item.figuras.length) {
    const antesFig = item.figuras.length;
    item.figuras = item.figuras.filter(f => {
      const fica = !(x >= f.x - caneta.raio && x <= f.x + f.w + caneta.raio && y >= f.y - caneta.raio && y <= f.y + f.h + caneta.raio);
      if (!fica) svg.querySelector(`image[data-figura="${f.id}"]`)?.remove();
      return fica;
    });
    if (item.figuras.length !== antesFig) mudou = true;
  }
  if (mudou) item.tracos = novos;
}
/* ao salvar, os pedaços cortados ficam com um ponto a cada ~2 px (precisão mantida, arquivo menor) */
function enxugarPontos(p, pr = null, dist = 2) {
  if (p.length <= 8) return pr ? { pts: p, pr } : p;
  const out = [p[0], p[1]], prs = pr ? [pr[0]] : null;
  for (let i = 2; i < p.length - 2; i += 2) if (Math.hypot(p[i] - out[out.length - 2], p[i + 1] - out[out.length - 1]) >= dist) { out.push(p[i], p[i + 1]); if (prs) prs.push(pr[i / 2]); }
  out.push(p[p.length - 2], p[p.length - 1]);
  if (prs) prs.push(pr[pr.length - 1]);
  return pr ? { pts: out, pr: prs } : out;
}
function enxugarTraco(t, dist = 2) {
  if (temPressao(t)) { const r = enxugarPontos(t.pts, t.pr, dist); return { ...t, pts: r.pts, pr: r.pr }; }
  return { ...t, pts: enxugarPontos(t.pts, null, dist) };
}
function mostrarCursorBorracha(ev) {
  let c = $("#cursor-borracha");
  if (!c) { c = document.createElement("div"); c.id = "cursor-borracha"; document.body.appendChild(c); }
  const d = Math.max(caneta.raio * 2 * fz(), 6);
  Object.assign(c.style, { width: d + "px", height: d + "px", left: ev.clientX - d / 2 + "px", top: ev.clientY - d / 2 + "px", display: "block" });
}
function esconderCursorBorracha() { const c = $("#cursor-borracha"); if (c) c.style.display = "none"; }

/* ---------- entrada: Pencil, mouse e (opcional) dedo ---------- */
function eventosDe(e) { const l = e.getCoalescedEvents ? e.getCoalescedEvents() : []; return l.length ? l : [e]; }
const dedos = new Map();
let rolagemDedos = null;
const naAreaDaLei = e => !!(e.target.closest && e.target.closest("#conteudo.modo-leitor .leitor-wrap, #conteudo.modo-leitor .visor-original") && !e.target.closest(".sumario-lateral"));
function artigoNoPonto(e) {
  const direto = e.target.closest && e.target.closest("#texto-lei .artigo");
  if (direto) return direto;
  if (!naAreaDaLei(e)) return null;
  // margem, títulos entre artigos ou preâmbulo: usa o artigo daquela altura ou, se não houver, o seguinte
  // (os títulos pertencem ao artigo que vem logo abaixo; o desenho fica preso a ele, acima do texto)
  const arts = $$("#texto-lei .artigo");
  for (const d of arts) {
    const r = d.getBoundingClientRect();
    if (e.clientY <= r.bottom) return d;
  }
  return arts[arts.length - 1] || null;
}
const mediaY = () => [...dedos.values()].reduce((s, p) => s + p.y, 0) / dedos.size;
function cancelarTraco() {
  if (caneta.lacando) { caneta.lacando = null; const svg = $("#laco-desenho"); if (svg) svg.style.display = "none"; }
  if (caneta.tracando) { clearTimeout(caneta.tracando.pausa); caneta.tracando.el.remove(); caneta.tracando = null; }
  if (caneta.arrastando) { const a = caneta.arrastando; Object.assign(a.item, fotografar(a.antes)); desenharTracos(a.div, a.item); caneta.arrastando = null; }
  if (caneta.apagando) {
    for (const x of caneta.apagando.alvos.values()) { Object.assign(x.item, fotografar(x.antes)); desenharTracos(x.div, x.item); }
    $$("mark.grifo.apagando").forEach(m => m.classList.remove("apagando"));
    caneta.apagando = null;
  }
  esconderCursorBorracha();
}
/* A borracha não fica presa a um artigo: apaga desenhos de qualquer artigo por onde passar
   (inclusive traços que invadiram o artigo vizinho) e também grifos feitos no texto. */
function iniciarBorracha(e) {
  // posição de cada artigo com desenho medida UMA vez (medir a cada movimento, entre alterações na tela, travava)
  const candidatos = [...marcasDaLei(leiAberta).entries()].filter(([, m]) => m.tintas.length)
    .map(([art]) => document.getElementById("art-" + art)).filter(Boolean)
    .map(div => {
      const r = div.getBoundingClientRect();
      const caixa = caixaDaTinta(div.dataset.art);            // até onde os desenhos deste artigo chegam (medido 1 vez)
      const z = fz();
      return { div, r, z, topo: Math.min(r.top, caixa ? r.top + caixa[1] * z : r.top), base: Math.max(r.bottom, caixa ? r.top + caixa[3] * z : r.bottom) };
    });
  // grifos do texto perto da tela: posição medida 1 vez (sem consultar a página a cada movimento)
  const alturaTela = window.innerHeight;
  const marcas = $$("#texto-lei mark.grifo[data-grifo]").flatMap(m => [...m.getClientRects()]
    .filter(r => r.bottom > -alturaTela && r.top < 2 * alturaTela).map(r => ({ id: m.dataset.grifo, l: r.left, t: r.top, rr: r.right, b: r.bottom })));
  caneta.apagando = { pointerId: e.pointerId, candidatos, marcas, alvos: new Map(), grifos: new Map(), ultimo: [e.clientX, e.clientY] };
  mostrarCursorBorracha(e);
  apagarEntre(e.clientX, e.clientY);
}
function apagarEntre(cx, cy, semGrifo) {
  const g = caneta.apagando;
  const [px, py] = g.ultimo;
  g.ultimo = [cx, cy];
  const folga = (caneta.raio + 30) * fz();
  for (const { div, r, z, topo, base } of g.candidatos) {
    // desenhos podem ficar acima do artigo (títulos, preâmbulo): a caixa considera os traços, não só o texto
    if (Math.max(cy, py) < topo - folga || Math.min(cy, py) > base + folga) continue;
    const rr = r;
    let alvo = g.alvos.get(div.dataset.art);
    if (!alvo) {
      const item = tintaVisivel(leiAberta, div.dataset.art);
      if (!item) continue;
      item.tracos = item.tracos || []; item.carimbos = item.carimbos || [];
      alvo = { div, item, antes: fotografar(item), ultimo: [(px - rr.left) / z, (py - rr.top) / z] };
      g.alvos.set(div.dataset.art, alvo);
    }
    alvo.ultimo = [(px - rr.left) / z, (py - rr.top) / z];
    passarBorracha(alvo, (cx - rr.left) / z, (cy - rr.top) / z);
  }
  if (!semGrifo) marcarGrifoEm(cx, cy);
}
function marcarGrifoEm(x, y) {
  const g = caneta.apagando;
  const r = Math.max(caneta.raio * fz(), 2);
  const achou = g.marcas.find(m => x + r >= m.l && x - r <= m.rr && y + r >= m.t && y - r <= m.b && !g.grifos.has(m.id));
  if (!achou) return;
  const item = estado.itens.get(achou.id);
  if (item) { g.grifos.set(item.id, { ...item }); $$(`mark.grifo[data-grifo="${item.id}"]`).forEach(el => el.classList.add("apagando")); }
}
// grifo feito no texto: some na hora (fica esmaecido) e é apagado ao soltar
function marcarGrifo(el) {
  const g = caneta.apagando;
  const m = el && el.closest && el.closest("mark.grifo[data-grifo]");
  if (!g || !m || g.grifos.has(m.dataset.grifo)) return;
  const item = estado.itens.get(m.dataset.grifo);
  if (item) { g.grifos.set(item.id, { ...item }); $$(`mark.grifo[data-grifo="${item.id}"]`).forEach(x => x.classList.add("apagando")); }
}
function caixaDaTinta(art) {
  const item = tintaVisivel(leiAberta, art);
  if (!item) return null;
  const c = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of item.tracos || []) { const b = caixas.get(t) || (tracoPerto(t, 0, 0, 0, 0, 0), caixas.get(t)); c[0] = Math.min(c[0], b[0]); c[1] = Math.min(c[1], b[1]); c[2] = Math.max(c[2], b[2]); c[3] = Math.max(c[3], b[3]); }
  for (const k of item.carimbos || []) { c[1] = Math.min(c[1], k.y - k.tam); c[3] = Math.max(c[3], k.y + k.tam); }
  return c[1] === Infinity ? null : c;
}
/* ícone novo: é guardado na hora (se o iPad interromper o toque, ele não some) */
function colocarIcone(div, p, item = itemTintaAtual(div), antes = fotografar(item)) {
  const c = { id: uid().slice(0, 8), icone: caneta.icone, tam: caneta.tamIcone, x: p[0], y: p[1] };
  if (!ehResumoAberto()) { const a = ancoraDe(div, p[0], p[1]); if (a) c.anc = a; }
  item.carimbos.push(c);
  desenharTracos(div, item);
  salvarItem(item).then(() => registrarAcao(item, antes));
  const r = div.getBoundingClientRect();
  caneta.ultimoIcone = { em: Date.now(), x: r.left + p[0] * fz(), y: r.top + p[1] * fz() };
  return c;
}
/* Garantia extra para os ícones: se o toque não chegou como "Pencil encostou" (acontece sobre o
   texto dos PDFs no iPad) ou foi feito com o dedo, o toque simples (clique) coloca o ícone. */
document.addEventListener("click", e => {
  if (!caneta.ativa || caneta.ferramenta !== "icone" || !leiAberta || !naAreaDaLei(e)) return;
  e.preventDefault(); e.stopPropagation();
  const u = caneta.ultimoIcone;
  if (u && Date.now() - u.em < 700 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 30) return;   // o Pencil já colocou este
  const div = artigoNoPonto(e);
  if (!div) return;
  const p = pontoRel(div, e);
  const item = itemTintaAtual(div);
  if (acharCarimbo(item, ...p)) return;                                // tocou num ícone que já existe
  colocarIcone(div, p, item);
}, true);
function acharCarimbo(item, x, y) {
  return [...(item.carimbos || [])].reverse().find(c => Math.hypot(c.x - x, c.y - y) <= c.tam * 0.6 + 6);
}
document.addEventListener("pointerdown", e => {
  if (!caneta.ativa || !leiAberta) return;
  const noTexto = naAreaDaLei(e);
  if (e.pointerType === "touch") {
    if (!caneta.dedo || !noTexto) return;
    dedos.set(e.pointerId, { y: e.clientY });
    if (dedos.size >= 2) { cancelarTraco(); rolagemDedos = { y: mediaY() }; return; }
  }
  const f = caneta.ferramenta;
  if (f === "borracha") {
    if (!naAreaDaLei(e)) return;
    e.preventDefault();
    iniciarBorracha(e);
    return;
  }
  const div = artigoNoPonto(e);
  if (!div) return;
  e.preventDefault();
  const p = pontoRel(div, e);
  if (f === "figura") {
    const item = itemTintaAtual(div);
    item.figuras = item.figuras || [];
    const hit = acharFigura(item, ...p);
    if (hit) {                                                  // tocou numa imagem: seleciona e arrasta
      caneta.figuraSel = { art: div.dataset.art, id: hit.id };
      desenharTracos(div, item);
      caneta.arrastando = { div, item, fig: hit, antes: fotografar(item), dx: hit.x - p[0], dy: hit.y - p[1], pointerId: e.pointerId };
      montarBarraCaneta();
      return;
    }
    if (caneta.figuraPendente) { colocarFigura(div, p); return; }
    caneta.opcoesAbertas = true; montarBarraCaneta();           // ainda não escolheu a imagem: abre as opções
    return;
  }
  if (f === "icone") {
    const item = itemTintaAtual(div);
    const antes = fotografar(item);
    let c = acharCarimbo(item, ...p);                       // tocou num ícone: arrasta
    if (!c) {
      c = colocarIcone(div, p, item, antes);
      caneta.arrastando = { div, item, c, antes: fotografar(item), dx: 0, dy: 0, pointerId: e.pointerId };
      return;
    }
    desenharTracos(div, item);
    caneta.arrastando = { div, item, c, antes, dx: c.x - p[0], dy: c.y - p[1], pointerId: e.pointerId };
    return;
  }
  if (f === "laco") { iniciarLaco(e); return; }
  const marca = f === "marca";
  const t = { id: uid().slice(0, 8), cor: caneta.cor, esp: marca ? caneta.espMarca : caneta.esp, pts: p };
  if (marca) t.marca = true;
  const comPressao = !marca && caneta.pressao && e.pointerType === "pen" && e.pressure > 0;
  if (comPressao) t.pr = [Math.round(e.pressure * 100)];
  const el = elTraco(t);
  svgDo(div, true).appendChild(el);
  caneta.tracando = { div, t, el, pointerId: e.pointerId, ancora: p.slice(), reto: false,
                      filtro: p.slice(), bruto: p.slice(), prF: comPressao ? e.pressure : null, suave: FATOR_SUAVE[caneta.suavizacao] ?? 0.3 };
}, { passive: false });
document.addEventListener("pointermove", e => {
  if (e.pointerType === "touch" && dedos.has(e.pointerId)) {
    dedos.get(e.pointerId).y = e.clientY;
    if (rolagemDedos && dedos.size >= 2) { e.preventDefault(); if (pinca && pinca.ativo) return; const m = mediaY(); window.scrollBy(0, rolagemDedos.y - m); rolagemDedos.y = m; return; }
  }
  const ar = caneta.arrastando;
  if (ar && ar.pointerId === e.pointerId) {
    e.preventDefault();
    const [x, y] = pontoRel(ar.div, e);
    if (ar.fig) {
      ar.fig.x = Math.round(x + ar.dx); ar.fig.y = Math.round(y + ar.dy);
      const el = ar.div.querySelector(`svg.tinta image[data-figura="${ar.fig.id}"]`);
      if (el) { el.setAttribute("x", ar.fig.x); el.setAttribute("y", ar.fig.y); }
      return;
    }
    ar.c.x = +(x + ar.dx).toFixed(1); ar.c.y = +(y + ar.dy).toFixed(1);
    const el = ar.div.querySelector(`svg.tinta text[data-carimbo="${ar.c.id}"]`);
    if (el) { el.setAttribute("x", ar.c.x); el.setAttribute("y", ar.c.y); } else desenharTracos(ar.div, ar.item);
    return;
  }
  if (caneta.lacando && caneta.lacando.pointerId === e.pointerId) { e.preventDefault(); moverLaco(e); return; }
  const a = caneta.apagando;
  if (a && a.pointerId === e.pointerId) {
    e.preventDefault(); mostrarCursorBorracha(e);
    for (const ev of eventosDe(e)) apagarEntre(ev.clientX, ev.clientY);
    return;
  }
  const tr = caneta.tracando;
  if (!tr || tr.pointerId !== e.pointerId) return;
  e.preventDefault();
  if (!tr.r) tr.r = tr.div.getBoundingClientRect();
  const z = fz();
  const x = +((e.clientX - tr.r.left) / z).toFixed(1), y = +((e.clientY - tr.r.top) / z).toFixed(1);
  if (tr.reto) {
    tr.t.pts = linhaReta(tr.t.pts[0], tr.t.pts[1], x, y);      // já endireitou: a ponta segue o Pencil, a linha continua reta
  } else {
    for (const ev of eventosDe(e)) adicionarPonto(tr, (ev.clientX - tr.r.left) / z, (ev.clientY - tr.r.top) / z, ev.pressure);
    if (Math.hypot(x - tr.ancora[0], y - tr.ancora[1]) > 3) {   // mexeu de verdade: recomeça a contar a pausa
      tr.ancora = [x, y];
      clearTimeout(tr.pausa);
      tr.pausa = setTimeout(() => endireitar(tr), 450);
    }
  }
  if (!tr.quadro) tr.quadro = requestAnimationFrame(() => { tr.quadro = 0; atualizarElTraco(tr); });
}, { passive: false });
const mudouFoto = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
/* Suavização (como no GoodNotes): cada ponto novo anda só uma parte do caminho até onde o Pencil está,
   o que tira a tremedeira da mão; ao soltar, o traço termina exatamente onde o Pencil parou. */
const FATOR_SUAVE = { nenhuma: 0, leve: 0.3, forte: 0.55 };
function adicionarPonto(tr, x, y, pressao) {
  tr.bruto = [x, y];
  const f = tr.filtro, s = tr.suave;
  f[0] += (x - f[0]) * (1 - s); f[1] += (y - f[1]) * (1 - s);
  if (tr.prF !== null && pressao > 0) tr.prF += (pressao - tr.prF) * 0.3;
  const p = tr.t.pts;
  if (Math.hypot(f[0] - p[p.length - 2], f[1] - p[p.length - 1]) < 0.6) return;     // pontos colados: não guarda
  p.push(+f[0].toFixed(1), +f[1].toFixed(1));
  if (tr.t.pr) tr.t.pr.push(Math.round(tr.prF * 100));
}
function atualizarElTraco(tr) {
  if (tr.el.tagName === "path") { tr.el.setAttribute("d", caminhoD(tr.t.pts)); return; }
  const novo = elTraco(tr.t);
  if (tr.el.classList.contains("endireitado")) novo.classList.add("endireitado");
  tr.el.replaceWith(novo); tr.el = novo;
}
/* ao soltar: chega até o ponto final, alisa mais um pouco (média com os vizinhos) e tira pontos desnecessários */
function finalizarTraco(tr) {
  const t = tr.t;
  if (tr.reto) return t;
  const p = t.pts;
  if (tr.suave && Math.hypot(tr.bruto[0] - p[p.length - 2], tr.bruto[1] - p[p.length - 1]) >= 0.6) {
    p.push(+tr.bruto[0].toFixed(1), +tr.bruto[1].toFixed(1));
    if (t.pr) t.pr.push(t.pr[t.pr.length - 1]);
  }
  const raio = { nenhuma: 0, leve: 1, forte: 2 }[caneta.suavizacao] ?? 1;
  if (raio && p.length >= 10) {
    const n = p.length / 2, q = p.slice();
    for (let k = 1; k < n - 1; k++) {
      let sx = 0, sy = 0, c = 0;
      for (let j = Math.max(0, k - raio); j <= Math.min(n - 1, k + raio); j++) { sx += p[2 * j]; sy += p[2 * j + 1]; c++; }
      q[2 * k] = +(sx / c).toFixed(1); q[2 * k + 1] = +(sy / c).toFixed(1);
    }
    t.pts = q;
  }
  return enxugarTraco(t, 0.8);
}
/* Segurar o Pencil parado no fim do traço por meio segundo: o traço vira uma linha reta.
   Perto da horizontal ou da vertical, ela "gruda" no alinhamento exato. */
function linhaReta(x0, y0, x1, y1) {
  const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
  const a = ((ang % 180) + 180) % 180;
  if (a < 6 || a > 174) y1 = y0;
  else if (Math.abs(a - 90) < 6) x1 = x0;
  return [x0, y0, +x1.toFixed(1), +y1.toFixed(1)];
}
function endireitar(tr) {
  if (caneta.tracando !== tr || tr.reto) return;
  const p = tr.t.pts;
  if (Math.hypot(tr.ancora[0] - p[0], tr.ancora[1] - p[1]) < 15) return;     // traço curto demais
  tr.reto = true;
  tr.t.pts = linhaReta(p[0], p[1], tr.ancora[0], tr.ancora[1]);
  if (tr.t.pr) { const m = Math.round(tr.t.pr.reduce((a, b) => a + b, 0) / tr.t.pr.length); tr.t.pr = [m, m]; }
  atualizarElTraco(tr);
  tr.el.classList.add("endireitado");
  if (navigator.vibrate) navigator.vibrate(8);
}
async function fimPonteiro(e) {
  if (e.pointerType === "touch") { dedos.delete(e.pointerId); if (dedos.size < 2) rolagemDedos = null; }
  if (caneta.lacando && caneta.lacando.pointerId === e.pointerId) { terminarLaco(); return; }
  const g = caneta.apagando;
  if (g && g.pointerId === e.pointerId) {
    caneta.apagando = null; esconderCursorBorracha();
    const partes = [];
    for (const x of g.alvos.values()) {
      x.item.tracos = x.item.tracos.map(t => (refinados.has(t) ? enxugarTraco(t) : t));
      if (mudouFoto(x.antes, fotografar(x.item))) { await salvarItem(x.item); partes.push({ item: x.item.id, art: x.item.art, antes: x.antes, depois: fotografar(x.item) }); }
    }
    const grifos = [...g.grifos.values()];
    for (const gr of grifos) { await apagarItem(gr.id); repintarArtigo(gr.lei, gr.art); }
    registrarGrupo(partes, grifos);
    return;
  }
  const ar = caneta.arrastando;
  if (ar && ar.pointerId === e.pointerId) {
    caneta.arrastando = null;
    if (mudouFoto(ar.antes, fotografar(ar.item))) { await salvarItem(ar.item); registrarAcao(ar.item, ar.antes); }
    return;
  }
  const tr = caneta.tracando;
  if (!tr || tr.pointerId !== e.pointerId) return;
  clearTimeout(tr.pausa);
  caneta.tracando = null;
  const t = finalizarTraco(tr);
  if (!t.marca && !tr.reto && caneta.rabiscar && await rabiscoApagou(tr, t)) return;
  const item = itemTintaAtual(tr.div);
  const antes = fotografar(item);
  if (!ehResumoAberto() && t.pts.length >= 2) { const a = ancoraDe(tr.div, t.pts[0], t.pts[1]); if (a) t.anc = a; }
  item.tracos = [...item.tracos, t];
  await salvarItem(item);
  registrarAcao(item, antes);
  pintarTinta(leiAberta, tr.div);
}
document.addEventListener("pointerup", fimPonteiro);
document.addEventListener("pointercancel", e => { if (e.pointerType === "touch") { dedos.delete(e.pointerId); if (dedos.size < 2) rolagemDedos = null; } cancelarTraco(); });
for (const tipo of ["touchstart", "touchmove"]) {
  document.addEventListener(tipo, e => {
    if (!caneta.ativa || !leiAberta || !naAreaDaLei(e)) return;
    if ([...e.touches].some(t => t.touchType === "stylus") || caneta.dedo) e.preventDefault();
  }, { passive: false });
}

/* ---------- áreas com desenho perto de um ponto da tela (usado pelo rabisco e pelo laço) ---------- */
function divsComTinta(l, t, r, b) {
  const lista = new Set([...marcasDaLei(leiAberta).entries()].filter(([, m]) => m.tintas.length)
    .map(([art]) => document.getElementById("art-" + art)).filter(Boolean));
  const z = fz(), out = [];
  for (const div of lista) {
    const rr = div.getBoundingClientRect(), cx = caixaDaTinta(div.dataset.art);
    const topo = Math.min(rr.top, cx ? rr.top + cx[1] * z : rr.top), base = Math.max(rr.bottom, cx ? rr.top + cx[3] * z : rr.bottom);
    const esq = Math.min(rr.left, cx ? rr.left + cx[0] * z : rr.left), dir = Math.max(rr.right, cx ? rr.left + cx[2] * z : rr.right);
    if (b < topo || t > base || r < esq || l > dir) continue;
    const item = tintaVisivel(leiAberta, div.dataset.art);
    if (item) out.push({ div, r: rr, z, item });
  }
  return out;
}
const caixaPts = p => { const c = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 2) { c[0] = Math.min(c[0], p[i]); c[1] = Math.min(c[1], p[i + 1]); c[2] = Math.max(c[2], p[i]); c[3] = Math.max(c[3], p[i + 1]); } return c; };
const sobreposicao = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
function pertoDaLinha(px, py, linha, alc) {
  for (let i = 2; i < linha.length; i += 2) if (distPontoSegmento(px, py, linha[i - 2], linha[i - 1], linha[i], linha[i + 1]) <= alc) return true;
  return false;
}

/* ---------- rabiscar para apagar (como no GoodNotes) ----------
   Um zigue-zague rápido feito com a caneta por cima de um desenho apaga o que está embaixo
   (traços, marca-texto, ícones; se não houver nenhum, a imagem). Sem nada embaixo, vira um traço normal. */
function ehRabisco(p) {
  const n = p.length / 2;
  if (n < 10) return false;
  const [x0, y0, x1, y1] = caixaPts(p), w = x1 - x0, h = y1 - y0, maior = Math.max(w, h);
  if (maior < 10) return false;
  let comp = 0;
  for (let i = 2; i < p.length; i += 2) comp += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  if (comp < 3.2 * maior) return false;
  const voltas = eixo => {
    const lim = Math.max(5, (eixo ? h : w) * 0.5);
    let dir = 0, ref = p[eixo], cont = 0;
    for (let k = 1; k < n; k++) {
      const v = p[2 * k + eixo];
      if (!dir) { if (Math.abs(v - ref) >= lim) { dir = Math.sign(v - ref); ref = v; } }
      else if (dir > 0) { if (v > ref) ref = v; else if (ref - v >= lim) { cont++; dir = -1; ref = v; } }
      else { if (v < ref) ref = v; else if (v - ref >= lim) { cont++; dir = 1; ref = v; } }
    }
    return cont;
  };
  // vai e volta no sentido mais comprido do rabisco (escrita normal, como "mmm", só sobe e desce no sentido curto)
  const principal = w >= h ? 0 : 1;
  if (voltas(principal) >= 4) return true;
  return Math.min(w, h) >= 0.6 * maior && voltas(1 - principal) >= 4;
}
async function rabiscoApagou(tr, t) {
  if (!ehRabisco(t.pts)) return false;
  const r0 = tr.div.getBoundingClientRect(), z = fz();
  const cli = t.pts.map((v, i) => (i % 2 ? r0.top + v * z : r0.left + v * z));
  const [l, tp, r, b] = caixaPts(cli);
  const alvos = divsComTinta(l - 10, tp - 10, r + 10, b + 10);
  const achados = [];
  for (const a of alvos) {
    const loc = cli.map((v, i) => (i % 2 ? (v - a.r.top) / a.z : (v - a.r.left) / a.z));
    const cx = caixaPts(loc), B = [cx[0] - 4, cx[1] - 4, cx[2] + 4, cx[3] + 4];
    const tracos = new Set(), icones = new Set();
    for (const q of a.item.tracos || []) {
      const e = larguraTraco(q) / 2 + 2, c = caixaPts(q.pts), T = [c[0] - e, c[1] - e, c[2] + e, c[3] + e];
      const area = (T[2] - T[0]) * (T[3] - T[1]);
      if (!area || sobreposicao(B, T) / area < 0.5) continue;              // o rabisco precisa cobrir boa parte do traço
      const { pts } = densoDe(q);
      for (let i = 0; i < pts.length; i += 6) if (pertoDaLinha(pts[i], pts[i + 1], loc, larguraTraco(q) / 2 + 4)) { tracos.add(q.id); break; }
    }
    for (const c of a.item.carimbos || []) if (c.x >= B[0] && c.x <= B[2] && c.y >= B[1] && c.y <= B[3] && pertoDaLinha(c.x, c.y, loc, c.tam * 0.5)) icones.add(c.id);
    achados.push({ ...a, loc, B, tracos, icones, figuras: new Set() });
  }
  if (!achados.some(a => a.tracos.size || a.icones.size)) {                  // nada desenhado embaixo: tenta a imagem
    for (const a of achados) for (const f of [...(a.item.figuras || [])].reverse()) {
      const F = [f.x, f.y, f.x + f.w, f.y + f.h], meioX = (a.B[0] + a.B[2]) / 2, meioY = (a.B[1] + a.B[3]) / 2;
      if (meioX >= F[0] && meioX <= F[2] && meioY >= F[1] && meioY <= F[3] && sobreposicao(a.B, F) >= 0.12 * f.w * f.h) { a.figuras.add(f.id); break; }
    }
  }
  const partes = [];
  for (const a of achados) {
    if (!a.tracos.size && !a.icones.size && !a.figuras.size) continue;
    const antes = fotografar(a.item);
    a.item.tracos = (a.item.tracos || []).filter(q => !a.tracos.has(q.id));
    a.item.carimbos = (a.item.carimbos || []).filter(c => !a.icones.has(c.id));
    if (a.item.figuras) a.item.figuras = a.item.figuras.filter(f => !a.figuras.has(f.id));
    await salvarItem(a.item);
    partes.push({ item: a.item.id, art: a.item.art, antes, depois: fotografar(a.item) });
  }
  if (!partes.length) return false;
  tr.el.remove();
  registrarGrupo(partes, []);
  for (const a of achados) pintarTinta(leiAberta, a.div);
  if (navigator.vibrate) navigator.vibrate(12);
  return true;
}

/* ---------- laço: contorne desenhos para mover, mudar o tamanho, trocar a cor, duplicar ou apagar ---------- */
function dentroDoPoligono(x, y, pol) {
  let dentro = false;
  for (let i = 0, j = pol.length - 2; i < pol.length; j = i, i += 2) {
    const xi = pol[i], yi = pol[i + 1], xj = pol[j], yj = pol[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function iniciarLaco(e) {
  limparSelecaoLaco();
  let svg = $("#laco-desenho");
  if (!svg) { svg = document.createElementNS(NS_SVG, "svg"); svg.id = "laco-desenho"; svg.appendChild(document.createElementNS(NS_SVG, "path")); document.body.appendChild(svg); }
  svg.style.display = "block";
  caneta.lacando = { pointerId: e.pointerId, pts: [e.clientX, e.clientY], el: svg.firstChild };
  caneta.lacando.el.setAttribute("d", "");
}
function moverLaco(e) {
  const l = caneta.lacando;
  for (const ev of eventosDe(e)) l.pts.push(ev.clientX, ev.clientY);
  if (!l.quadro) l.quadro = requestAnimationFrame(() => { l.quadro = 0; l.el.setAttribute("d", "M" + l.pts.join(" ")); });
}
function terminarLaco() {
  const l = caneta.lacando;
  caneta.lacando = null;
  const svg = $("#laco-desenho"); if (svg) svg.style.display = "none";
  if (!l || l.pts.length < 8) return;
  const [ml, mt, mr, mb] = caixaPts(l.pts);
  const partes = [];
  for (const a of divsComTinta(ml, mt, mr, mb)) {
    const pol = l.pts.map((v, i) => (i % 2 ? (v - a.r.top) / a.z : (v - a.r.left) / a.z));
    const tr = new Set(), ca = new Set(), fi = new Set();
    for (const t of a.item.tracos || []) {
      let dentro = 0, total = 0;
      for (let i = 0; i < t.pts.length; i += 2) { total++; if (dentroDoPoligono(t.pts[i], t.pts[i + 1], pol)) dentro++; }
      if (total && dentro / total >= 0.5) tr.add(t.id);
    }
    for (const c of a.item.carimbos || []) if (dentroDoPoligono(c.x, c.y, pol)) ca.add(c.id);
    for (const f of a.item.figuras || []) if (dentroDoPoligono(f.x + f.w / 2, f.y + f.h / 2, pol)) fi.add(f.id);
    if (tr.size || ca.size || fi.size) partes.push({ div: a.div, art: a.div.dataset.art, tr, ca, fi });
  }
  if (!partes.length) return;
  caneta.selecao = { partes };
  mostrarSelecaoLaco();
}
function caixaDaSelecao() {
  const sel = caneta.selecao; if (!sel) return null;
  const z = fz(), u = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of sel.partes) {
    if (!p.div.isConnected) return null;
    const item = tintaVisivel(leiAberta, p.art); if (!item) continue;
    const r = p.div.getBoundingClientRect();
    const junta = (a, b, c, d) => { u[0] = Math.min(u[0], r.left + a * z); u[1] = Math.min(u[1], r.top + b * z); u[2] = Math.max(u[2], r.left + c * z); u[3] = Math.max(u[3], r.top + d * z); };
    for (const t of item.tracos || []) if (p.tr.has(t.id)) { const c = caixaPts(t.pts), e = larguraTraco(t) / 2; junta(c[0] - e, c[1] - e, c[2] + e, c[3] + e); }
    for (const c of item.carimbos || []) if (p.ca.has(c.id)) junta(c.x - c.tam / 2, c.y - c.tam / 2, c.x + c.tam / 2, c.y + c.tam / 2);
    for (const f of item.figuras || []) if (p.fi.has(f.id)) junta(f.x, f.y, f.x + f.w, f.y + f.h);
  }
  return u[0] === Infinity ? null : u;
}
function mostrarSelecaoLaco() {
  let box = $("#selecao-laco");
  if (!box) {
    box = document.createElement("div");
    box.id = "selecao-laco";
    box.innerHTML = `<div class="menu-laco" role="toolbar" aria-label="Seleção">
        ${CORES_CANETA.map(([c, n]) => `<button class="cor-btn" data-cor-laco="${c}" aria-label="${n}" style="background:${c}"></button>`).join("")}
        <span class="sep"></span>
        <button data-laco="duplicar">Duplicar</button>
        <button data-laco="apagar" class="perigo">Apagar</button>
      </div><div class="alca-laco" aria-label="Arraste para mudar o tamanho"></div>`;
    document.body.appendChild(box);
    box.addEventListener("pointerdown", e => {
      if (e.target.closest(".menu-laco")) return;
      e.preventDefault(); e.stopPropagation();
      const c = caixaDaSelecao(); if (!c) return;
      box.setPointerCapture(e.pointerId);
      caneta.movendoSel = { modo: e.target.closest(".alca-laco") ? "escala" : "mover", x0: e.clientX, y0: e.clientY, caixa: c, pointerId: e.pointerId, dx: 0, dy: 0, s: 1 };
    });
    box.addEventListener("pointermove", e => {
      const m = caneta.movendoSel; if (!m || m.pointerId !== e.pointerId) return;
      e.preventDefault();
      m.dx = e.clientX - m.x0; m.dy = e.clientY - m.y0;
      if (m.modo === "escala") { const w = m.caixa[2] - m.caixa[0] || 1, h = m.caixa[3] - m.caixa[1] || 1; m.s = Math.max(0.2, Math.min(6, ((w + m.dx) / w + (h + m.dy) / h) / 2)); }
      previaSelecao(m);
    });
    const soltar = async e => {
      const m = caneta.movendoSel; if (!m || m.pointerId !== e.pointerId) return;
      caneta.movendoSel = null;
      if (m.modo === "mover" && Math.hypot(m.dx, m.dy) < 2) { previaSelecao(null); return; }
      if (m.modo === "escala" && Math.abs(m.s - 1) < 0.01) { previaSelecao(null); return; }
      await aplicarNaSelecao(m.modo, m);
    };
    box.addEventListener("pointerup", soltar);
    box.addEventListener("pointercancel", () => { caneta.movendoSel = null; previaSelecao(null); posicionarSelecaoLaco(); });
    box.querySelector(".menu-laco").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.corLaco) aplicarNaSelecao("cor", { cor: b.dataset.corLaco });
      else aplicarNaSelecao(b.dataset.laco);
    });
  }
  box.style.display = "block";
  posicionarSelecaoLaco();
}
function posicionarSelecaoLaco(c = caixaDaSelecao()) {
  const box = $("#selecao-laco");
  if (!box) return;
  if (!c) { if (caneta.selecao && !caneta.movendoSel) limparSelecaoLaco(); return; }
  Object.assign(box.style, { left: c[0] - 6 + "px", top: c[1] - 6 + "px", width: c[2] - c[0] + 12 + "px", height: c[3] - c[1] + 12 + "px" });
  box.classList.toggle("menu-embaixo", c[1] < 120);
  const sel = caneta.selecao;
  const soTracos = sel && sel.partes.some(p => p.tr.size);
  box.querySelectorAll("[data-cor-laco]").forEach(b => { b.hidden = !soTracos; });
}
function elementosSelecionados(p) {
  const svg = svgDo(p.div); if (!svg) return [];
  return [...svg.children].filter(el => p.tr.has(el.dataset.traco) || p.ca.has(el.dataset.carimbo) || p.fi.has(el.dataset.figura));
}
function previaSelecao(m) {
  const sel = caneta.selecao; if (!sel) return;
  const z = fz();
  for (const p of sel.partes) {
    const r = p.div.getBoundingClientRect();
    let tf = "";
    if (m && m.modo === "mover") tf = `translate(${m.dx / z} ${m.dy / z})`;
    else if (m && m.modo === "escala") { const ox = (m.caixa[0] - r.left) / z, oy = (m.caixa[1] - r.top) / z; tf = `translate(${ox} ${oy}) scale(${m.s}) translate(${-ox} ${-oy})`; }
    for (const el of elementosSelecionados(p)) if (tf) el.setAttribute("transform", tf); else el.removeAttribute("transform");
  }
  if (m) {
    const c = m.caixa, w = c[2] - c[0], h = c[3] - c[1];
    posicionarSelecaoLaco(m.modo === "mover" ? [c[0] + m.dx, c[1] + m.dy, c[2] + m.dx, c[3] + m.dy] : [c[0], c[1], c[0] + w * m.s, c[1] + h * m.s]);
  }
}
async function aplicarNaSelecao(acao, m = {}) {
  const sel = caneta.selecao; if (!sel) return;
  const z = fz(), partesHist = [], novasPartes = [];
  for (const p of sel.partes) {
    const item = tintaVisivel(leiAberta, p.art); if (!item) continue;
    item.tracos = item.tracos || []; item.carimbos = item.carimbos || [];
    const antes = fotografar(item);
    const r = p.div.getBoundingClientRect();
    let fx = (x, y) => [x, y], s = 1;
    if (acao === "mover") fx = (x, y) => [x + m.dx / z, y + m.dy / z];
    if (acao === "duplicar") fx = (x, y) => [x + 24, y + 24];
    if (acao === "escala") { s = m.s; const ox = (m.caixa[0] - r.left) / z, oy = (m.caixa[1] - r.top) / z; fx = (x, y) => [ox + (x - ox) * s, oy + (y - oy) * s]; }
    const ancorar = (obj, x, y) => { if (!ehResumoAberto()) { const a = ancoraDe(p.div, x, y); if (a) obj.anc = a; else delete obj.anc; } return obj; };
    const moverTraco = t => {
      const pts = [];
      for (let i = 0; i < t.pts.length; i += 2) { const [x, y] = fx(t.pts[i], t.pts[i + 1]); pts.push(+x.toFixed(1), +y.toFixed(1)); }
      return ancorar({ ...t, pts, esp: +(t.esp * s).toFixed(2) }, pts[0], pts[1]);
    };
    const moverIcone = c => { const [x, y] = fx(c.x, c.y); return ancorar({ ...c, x: +x.toFixed(1), y: +y.toFixed(1), tam: Math.round(Math.max(12, Math.min(200, c.tam * s))) }, x, y); };
    const moverFigura = f => { const [x, y] = fx(f.x, f.y); return { ...f, x: Math.round(x), y: Math.round(y), w: Math.round(f.w * s), h: Math.round(f.h * s) }; };
    const nova = { div: p.div, art: p.art, tr: new Set(), ca: new Set(), fi: new Set() };
    if (acao === "apagar") {
      item.tracos = item.tracos.filter(t => !p.tr.has(t.id));
      item.carimbos = item.carimbos.filter(c => !p.ca.has(c.id));
      if (item.figuras) item.figuras = item.figuras.filter(f => !p.fi.has(f.id));
    } else if (acao === "duplicar") {
      const novoId = () => uid().slice(0, 8);
      const tr = item.tracos.filter(t => p.tr.has(t.id)).map(t => ({ ...moverTraco(t), id: novoId() }));
      const ca = item.carimbos.filter(c => p.ca.has(c.id)).map(c => ({ ...moverIcone(c), id: novoId() }));
      const fi = (item.figuras || []).filter(f => p.fi.has(f.id)).map(f => ({ ...moverFigura(f), id: novoId() }));
      item.tracos = [...item.tracos, ...tr]; item.carimbos = [...item.carimbos, ...ca];
      if (fi.length) item.figuras = [...(item.figuras || []), ...fi];
      tr.forEach(t => nova.tr.add(t.id)); ca.forEach(c => nova.ca.add(c.id)); fi.forEach(f => nova.fi.add(f.id));
    } else if (acao === "cor") {
      item.tracos = item.tracos.map(t => (p.tr.has(t.id) ? { ...t, cor: m.cor } : t));
    } else {
      item.tracos = item.tracos.map(t => (p.tr.has(t.id) ? moverTraco(t) : t));
      item.carimbos = item.carimbos.map(c => (p.ca.has(c.id) ? moverIcone(c) : c));
      if (item.figuras) item.figuras = item.figuras.map(f => (p.fi.has(f.id) ? moverFigura(f) : f));
    }
    await salvarItem(item);
    partesHist.push({ item: item.id, art: item.art, antes, depois: fotografar(item) });
    pintarTinta(leiAberta, p.div);
    if (acao === "duplicar") novasPartes.push(nova);
  }
  registrarGrupo(partesHist, []);
  if (acao === "apagar") { limparSelecaoLaco(); return; }
  if (acao === "duplicar") caneta.selecao = { partes: novasPartes };
  posicionarSelecaoLaco();
}
function limparSelecaoLaco() {
  caneta.selecao = null; caneta.movendoSel = null;
  const box = $("#selecao-laco"); if (box) box.style.display = "none";
}
document.addEventListener("scroll", () => { if (caneta.selecao && !caneta.movendoSel) posicionarSelecaoLaco(); }, true);
window.addEventListener("resize", () => { if (caneta.selecao) setTimeout(() => posicionarSelecaoLaco(), 350); });

/* ---------- barra de ferramentas ---------- */
function montarBarraCaneta() {
  const b = $("#barra-caneta");
  const f = caneta.ferramenta;
  if (!caneta.posicao) caneta.posicao = caneta.noTopo ? "topo" : "baixo";
  if (caneta.posicao === "lateral") caneta.posicao = "direita";
  const vertical = caneta.posicao === "direita" || caneta.posicao === "esquerda";
  b.classList.toggle("no-topo", caneta.posicao === "topo");
  b.classList.toggle("lateral", vertical);
  b.classList.toggle("esquerda", caneta.posicao === "esquerda");
  const seg = (lista, atual, attr) => `<div class="segmentado">${lista.map(([v, n]) => `<button ${attr}="${v}" aria-pressed="${atual === v}">${n}</button>`).join("")}</div>`;
  const cores = `<div class="cores-linha">${CORES_CANETA.map(([c, n]) => `<button class="cor-btn" data-cor-caneta="${c}" aria-label="${n}" aria-pressed="${caneta.cor === c}" style="background:${f === "marca" ? translucida(c, 0.45) : c}"></button>`).join("")}</div>`;
  let resumo, opcoes;
  const liga = (attr, ativo, texto) => `<button ${attr} aria-pressed="${!!ativo}">${ativo ? "✓ " : ""}${texto}</button>`;
  if (f === "caneta") { resumo = `<span class="ponto-cor" style="background:${caneta.cor}"></span>${ESP_CANETA.find(x => x[0] === caneta.esp)?.[1] || ""}`;
    opcoes = cores + seg(ESP_CANETA, caneta.esp, "data-esp") +
      `<p class="rotulo-opcao">Traço</p>` + seg(SUAVIZACAO, caneta.suavizacao, "data-suave") +
      `<div class="segmentado">${liga("data-pressao", caneta.pressao, "Espessura pela pressão do Pencil")}${liga("data-rabiscar", caneta.rabiscar, "Rabiscar para apagar")}</div>` +
      '<p class="dica-icones" style="width:100%">Rabiscar para apagar: faça um zigue-zague rápido por cima de um desenho, ícone ou imagem para apagá-lo.</p>'; }
  else if (f === "marca") { resumo = `<span class="ponto-cor" style="background:${translucida(caneta.cor, 0.5)}"></span>${ESP_MARCA.find(x => x[0] === caneta.espMarca)?.[1] || ""}`; opcoes = cores + seg(ESP_MARCA, caneta.espMarca, "data-esp-marca"); }
  else if (f === "icone") { resumo = `<span style="font-size:18px">${caneta.icone}</span>${TAM_ICONE.find(x => x[0] === caneta.tamIcone)?.[1] || ""}`;
    opcoes = `<div class="icones-escolha">${ICONES.map(([i, n]) => `<button class="icone-escolha" data-icone="${i}" aria-pressed="${caneta.icone === i}" title="${n}" aria-label="${n}">${i}</button>`).join("")}</div>` + seg(TAM_ICONE, caneta.tamIcone, "data-tam-icone") +
      '<p class="dica-icones" style="width:100%">Toque no texto ou na margem para colocar · arraste para mover · apague com a borracha</p>'; }
  else if (f === "laco") {
    resumo = `<span style="font-size:18px">➰</span>${caneta.selecao ? "Selecionado" : "Laço"}`;
    opcoes = '<p class="dica-icones" style="width:100%">Contorne escritas, ícones ou imagens para selecioná-los. Depois arraste para mover, puxe a bolinha do canto para mudar o tamanho, ou use os botões para trocar a cor, duplicar ou apagar.</p>';
  }
  else if (f === "figura") {
    resumo = `<span style="font-size:18px">🖼️</span>${caneta.figuraPendente ? "Toque na página" : "Imagem"}`;
    opcoes = `<div class="acoes-figura">
        <button class="botao primario" id="fig-escolher">📁 Escolher imagem</button>
        ${caneta.figuraSel ? '<div class="segmentado"><button id="fig-menor">− Menor</button><button id="fig-maior">+ Maior</button></div><button class="botao" id="fig-excluir" style="color:var(--alt)">Excluir imagem</button>' : ""}
      </div>
      <p class="dica-icones" style="width:100%">${caneta.figuraPendente ? "Imagem escolhida: toque na página onde quer colocá-la." : "Escolha uma imagem e toque na página para colocar. Toque numa imagem para selecionar e arrastar."}</p>`;
  }
  else { resumo = `<span class="ind-borracha" style="font-size:16px">${caneta.modoBorracha === "traco" ? "⌫" : "◯"}</span>${caneta.modoBorracha === "traco" ? "Traço inteiro" : "Livre"} · ${TAMANHOS_BORRACHA.find(x => x[0] === caneta.raio)?.[1] || ""}`;
    opcoes = `<div class="segmentado"><button data-modo-borracha="parcial" aria-pressed="${caneta.modoBorracha === "parcial"}">Livre (só onde passar)</button>
      <button data-modo-borracha="traco" aria-pressed="${caneta.modoBorracha === "traco"}">Traço inteiro</button></div>` + seg(TAMANHOS_BORRACHA, caneta.raio, "data-raio") +
      '<p class="dica-icones" style="width:100%">A borracha apaga desenhos, marca-texto, ícones e também grifos feitos no texto.</p>'; }
  const painel = `<div class="painel-opcoes ${caneta.opcoesAbertas ? "" : "oculto"}">${opcoes}</div>`;
  const barra = `<div class="barra-fina">
      ${[["caneta", "✏️", "Caneta"], ["marca", "🖍️", "Marca-texto"], ["icone", "⭐", "Ícones"], ...(ehResumoAberto() ? [["figura", "🖼️", "Imagem"]] : []), ["laco", "➰", "Laço (selecionar e mover)"], ["borracha", "⌫", "Borracha"]].map(([v, i, n]) =>
        `<button class="bf" data-ferramenta="${v}" aria-pressed="${f === v}" aria-label="${n}" title="${n}">${i}${v === "caneta" || v === "marca" ? `<span class="bf-cor" style="background:${v === "marca" ? translucida(caneta.corMarca, 0.6) : caneta.corCaneta}"></span>` : ""}</button>`).join("")}
      <span class="sep"></span>
      <button class="bf bf-opcoes" id="cn-opcoes" aria-expanded="${!!caneta.opcoesAbertas}" title="Cor, espessura e opções"><span class="bf-resumo">${resumo}</span><span class="bf-seta">${caneta.opcoesAbertas ? "▴" : "▾"}</span></button>
      <span class="sep"></span>
      <button class="bf" id="cn-desfazer" aria-label="Desfazer" title="Desfazer">↶</button>
      <button class="bf" id="cn-refazer" aria-label="Refazer" title="Refazer">↷</button>
      <button class="bf" id="cn-dedo" aria-pressed="${caneta.dedo}" aria-label="Usar o dedo" title="Usar o dedo (1 dedo desenha, 2 dedos rolam)">✋</button>
      <button class="bf" id="cn-posicao" aria-label="Mudar a barra de lugar" title="Levar a barra para ${{ baixo: "cima", topo: "a direita", direita: "a esquerda", esquerda: "baixo" }[caneta.posicao]}">${{ baixo: "⤒", topo: "⇥", direita: "⇤", esquerda: "⤓" }[caneta.posicao]}</button>
      <button class="bf" id="cn-fechar" aria-label="Concluir" title="Concluir">✕</button>
    </div>`;
  b.innerHTML = caneta.posicao === "topo" || caneta.posicao === "esquerda" ? barra + painel : painel + barra;     // as opções abrem para o lado do texto
  const ligar = (sel, fn, fechar) => $$(sel, b).forEach(x => x.onclick = () => { fn(x); if (fechar) caneta.opcoesAbertas = false; gravarPrefCaneta(); montarBarraCaneta(); });
  ligar("[data-ferramenta]", x => { caneta.opcoesAbertas = caneta.ferramenta === x.dataset.ferramenta ? !caneta.opcoesAbertas : false; if (caneta.ferramenta !== x.dataset.ferramenta) limparSelecaoLaco(); caneta.ferramenta = x.dataset.ferramenta; });
  ligar("[data-suave]", x => { caneta.suavizacao = x.dataset.suave; });
  ligar("[data-pressao]", () => { caneta.pressao = !caneta.pressao; });
  ligar("[data-rabiscar]", () => { caneta.rabiscar = !caneta.rabiscar; });
  ligar("#cn-opcoes", () => { caneta.opcoesAbertas = !caneta.opcoesAbertas; });
  ligar("[data-cor-caneta]", x => { caneta.cor = x.dataset.corCaneta; }, true);
  ligar("[data-esp]", x => { caneta.esp = Number(x.dataset.esp); }, true);
  ligar("[data-esp-marca]", x => { caneta.espMarca = Number(x.dataset.espMarca); }, true);
  ligar("[data-icone]", x => { caneta.icone = x.dataset.icone; }, true);
  ligar("[data-tam-icone]", x => { caneta.tamIcone = Number(x.dataset.tamIcone); }, true);
  ligar("[data-modo-borracha]", x => { caneta.modoBorracha = x.dataset.modoBorracha; });
  ligar("[data-raio]", x => { caneta.raio = Number(x.dataset.raio); }, true);
  ligar("#cn-dedo", () => { caneta.dedo = !caneta.dedo; document.body.classList.toggle("caneta-dedo", caneta.dedo); });
  ligar("#cn-posicao", () => { caneta.posicao = { baixo: "topo", topo: "direita", direita: "esquerda", esquerda: "baixo" }[caneta.posicao]; });
  $("#cn-desfazer").onclick = desfazerTinta;
  $("#cn-refazer").onclick = refazerTinta;
  $("#cn-fechar").onclick = () => alternarCaneta(false);
  if ($("#fig-escolher", b)) $("#fig-escolher", b).onclick = () => escolherFiguraPendente();
  if ($("#fig-menor", b)) { $("#fig-menor", b).onclick = () => mudarFiguraSelecionada("menor"); $("#fig-maior", b).onclick = () => mudarFiguraSelecionada("maior"); $("#fig-excluir", b).onclick = () => mudarFiguraSelecionada("excluir"); }
  atualizarBotoesHist();
}
function alternarCaneta(ligar = !caneta.ativa) {
  caneta.ativa = ligar && !!leiAberta;
  if (!caneta.ativa) { cancelarTraco(); limparSelecaoLaco(); dedos.clear(); rolagemDedos = null; }
  document.body.classList.toggle("modo-caneta", caneta.ativa);
  document.body.classList.toggle("caneta-dedo", caneta.ativa && caneta.dedo);
  $("#barra-caneta").classList.toggle("oculto", !caneta.ativa);
  $("#btn-caneta").setAttribute("aria-pressed", caneta.ativa);
  $("#btn-caneta").innerHTML = caneta.ativa ? '✏️<span class="rot"> Caneta ligada</span>' : '✏️<span class="rot"> Caneta</span>';
  if ($("#res-caneta")) $("#res-caneta").setAttribute("aria-pressed", caneta.ativa);
  if (caneta.ativa) { esconderBarra(); window.getSelection()?.removeAllRanges(); montarBarraCaneta(); }
}

/* ---------- tela cheia: só o texto da lei ---------- */
function alternarTelaCheia(ligar = !document.body.classList.contains("tela-cheia")) {
  document.body.classList.toggle("tela-cheia", ligar && !!leiAberta);
  const ativo = document.body.classList.contains("tela-cheia");
  $("#btn-tela-cheia").textContent = ativo ? "Sair da tela cheia" : "⛶ Tela cheia";
  $("#btn-tela-cheia").setAttribute("aria-pressed", ativo);
  gravarLS("tela-cheia", ativo);
  const el = document.documentElement;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  try {   // no Safari do iPad (fora do app instalado) também esconde a barra do navegador
    if (!standalone) {
      if (ativo && !document.fullscreenElement && !document.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
      if (!ativo && (document.fullscreenElement || document.webkitFullscreenElement)) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
    }
  } catch {}
  repintarTintas();
}
