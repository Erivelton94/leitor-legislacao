"use strict";
/* =====================================================================
   Leitor Inteligente de Legislação — Entrega 2
   Leis: vêm do robô (dados/). Só baixa uma lei quando o hash dela mudou.
   Seus dados (grifos, anotações, imagens, favoritos, pastas): IndexedDB,
   separados das leis. Atualizar ou remover uma lei nunca apaga nada seu.
   ===================================================================== */

const CACHE_DADOS = "legislacao-dados-v1";
const HORAS_PENDENTE = 36;
const CORES_ABA = ["#5E6B25", "#2F5D7C", "#8A3B2E", "#6B4E8A", "#2E7466", "#8A6A1F"];
const CORES = { amarelo: "Amarelo", verde: "Verde", azul: "Azul", vermelho: "Vermelho" };
const REPO_ACTIONS = "https://github.com/Erivelton94/leitor-legislacao/actions/workflows/verificar.yml";
const LIMITE_IMAGENS_MB = 200;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const estado = {
  status: {}, leis: {}, historicos: {}, offline: false, statusEm: null,
  info: lerLS("info-leis", {}),
  alteracoes: lerLS("alteracoes-nao-vistas", {}),
  sincronizando: new Set(),
  itens: new Map(),        // grifos, anotações, favoritos, pastas (id -> item)
};

function aoParar(fn, ms = 160) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function lerLS(chave, padrao) { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } }
function gravarLS(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
  if ((chave === "info-leis" || chave === "cadernos-locais") && typeof marcarMudanca === "function") marcarMudanca();
}
function esc(t) { return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function semAcento(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function dataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dataCurta(iso) { if (!iso) return "—"; const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; }
function agoraISO() { return new Date().toISOString(); }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
function urlLei(id) { return `dados/leis/${id}.json`; }
function nomeLei(id) { return estado.status[id]?.nome || id; }
function rotuloArt(art, lei = leiAberta) {
  const base = "Art. " + String(art).replace(/#\d+$/, "");
  const l = lei && estado.leis[lei];
  return l && l.artigos && l.artigos[art] && l.artigos[art].secao === "ADCT" ? "ADCT, " + base : base;
}

/* ---------------- ajustes de leitura ---------------- */
const ajustes = Object.assign({ fonte: 19, entrelinha: 1.7, tema: "auto" }, lerLS("ajustes", {}));
function aplicarAjustes() {
  const r = document.documentElement;
  r.style.setProperty("--fonte", ajustes.fonte + "px");
  r.style.setProperty("--entrelinha", ajustes.entrelinha);
  if (ajustes.tema === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", ajustes.tema);
  gravarLS("ajustes", ajustes);
  setTimeout(() => { if (typeof repintarTintas === "function") repintarTintas(); }, 0);   // desenhos dependem do tamanho da letra
}
aplicarAjustes();

/* =====================================================================
   SEUS DADOS (IndexedDB)
   Cada item tem id, tipo e atualizadoEm. Apagar = marcar "apagado"
   (assim a importação de um backup antigo não ressuscita o que você apagou).
   ===================================================================== */
let BD = null;
function abrirBD() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open("meus-estudos", 4);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const nome of ["itens", "imagens", "resumos", "resumos_conteudo", "arquivos", "miniaturas"])
        if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome, { keyPath: "id" });
    };
    r.onsuccess = () => ok(BD = r.result);
    r.onerror = () => erro(r.error);
  });
}
function bd(store, modo, fn) {
  return new Promise((ok, erro) => {
    const t = BD.transaction(store, modo);
    const req = fn(t.objectStore(store));
    let res;
    if (req) req.onsuccess = () => { res = req.result; };
    t.oncomplete = () => ok(res);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}
const bdTodos = store => bd(store, "readonly", s => s.getAll());
const bdLer = (store, id) => bd(store, "readonly", s => s.get(id));
const LOJAS_SINCRONIZADAS = new Set(["itens", "resumos", "resumos_conteudo", "arquivos", "imagens"]);
const bdGravar = (store, obj) => {
  if (LOJAS_SINCRONIZADAS.has(store) && typeof marcarMudanca === "function") marcarMudanca();   // a nuvem recebe depois de alguns segundos
  return bd(store, "readwrite", s => s.put(obj));
};
const bdApagar = (store, id) => bd(store, "readwrite", s => s.delete(id));
const bdLimpar = store => bd(store, "readwrite", s => s.clear());

async function carregarItens() {
  for (const it of await bdTodos("itens")) estado.itens.set(it.id, it);
}
async function salvarItem(item) {
  item.atualizadoEm = agoraISO();
  if (!item.criadoEm) item.criadoEm = item.atualizadoEm;
  await bdGravar("itens", item);
  estado.itens.set(item.id, item);
  versaoItens++;
  if (/^tinta\|resumo:[^|]+\|p1\|/.test(item.id)) bdApagar("miniaturas", item.id.split("|")[1].slice(7));
  gravarLS("ultima-mudanca", item.atualizadoEm);
  return item;
}
async function apagarItem(id) {
  const velho = estado.itens.get(id);
  if (velho && velho.tipo === "anotacao") for (const img of velho.imagens || []) await bdApagar("imagens", img);
  await salvarItem({ id, tipo: velho ? velho.tipo : "?", apagado: true });
}
function itens(tipo, filtro = () => true) {
  return [...estado.itens.values()].filter(i => !i.apagado && i.tipo === tipo && filtro(i));
}

/* ---------------- meu acervo: quais leis do catálogo EU acompanho (fica no aparelho) ---------------- */
const idAcervo = lei => `acv|${lei}`;
function noAcervo(lei) { const i = estado.itens.get(idAcervo(lei)); return !!(i && !i.apagado); }
function idsAcervo() { return Object.keys(estado.status).filter(noAcervo); }
async function migrarAcervo() {
  // quem já usava o app antes do catálogo continua com as leis que tinha baixado
  // (só se o aparelho nunca teve acervo — nem itens removidos —, para não "ressuscitar" o que você tirou)
  if ([...estado.itens.values()].some(i => i.tipo === "acervo")) return;
  for (const id of Object.keys(estado.info)) await salvarItem({ id: idAcervo(id), tipo: "acervo", lei: id });
}

/* ---------------- favoritos ---------------- */
const idFavLei = lei => `fav|lei|${lei}`;
const idFavArt = (lei, art) => `fav|art|${lei}|${art}`;
function ehFavorito(id) { const i = estado.itens.get(id); return !!(i && !i.apagado); }
async function alternarFavorito(id, dados) {
  if (ehFavorito(id)) await apagarItem(id);
  else await salvarItem({ id, tipo: "favorito", ...dados });
}

/* =====================================================================
   LEIS: status, download incremental e histórico
   ===================================================================== */
async function buscarComTempo(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { cache: "no-cache", signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  } finally { clearTimeout(t); }
}

async function carregarStatus() {
  const cache = await caches.open(CACHE_DADOS);
  try {
    const r = await buscarComTempo("dados/status.json");
    await cache.put("dados/status.json", r.clone());
    estado.status = await r.json();
    estado.offline = false;
    estado.statusEm = agoraISO();
    gravarLS("status-em", estado.statusEm);
  } catch {
    estado.offline = true;
    const antigo = await cache.match("dados/status.json");
    estado.status = antigo ? await antigo.json() : {};
    estado.statusEm = lerLS("status-em", null);
  }
}

async function leiDoCache(id) {
  if (estado.leis[id]) return estado.leis[id];
  const cache = await caches.open(CACHE_DADOS);
  const r = await cache.match(urlLei(id));
  if (!r) return null;
  estado.leis[id] = await r.json();
  return estado.leis[id];
}

async function sincronizarLei(id) {
  const st = estado.status[id];
  if (!st || !st.hash) return;
  const local = estado.info[id];
  const cache = await caches.open(CACHE_DADOS);
  const temCopia = await cache.match(urlLei(id));
  if (temCopia && local && local.hash === st.hash) return;
  if (estado.offline) return;
  estado.sincronizando.add(id);
  try {
    const r = await buscarComTempo(urlLei(id), 30000);
    const copia = r.clone();
    const lei = await r.json();
    await cache.put(urlLei(id), copia);
    estado.leis[id] = lei;
    if (local && local.versao && lei.versao !== local.versao) await registrarAlteracoes(id, local.versao, lei.versao);
    estado.info[id] = { hash: lei.hash, versao: lei.versao, baixadoEm: agoraISO() };
    gravarLS("info-leis", estado.info);
  } catch { /* segue marcada como pendente */ }
  finally { estado.sincronizando.delete(id); }
}

async function carregarHistorico(id) {
  const url = `dados/historico/${id}.json`;
  const cache = await caches.open(CACHE_DADOS);
  if (!estado.offline) {
    try {
      const r = await buscarComTempo(url);
      await cache.put(url, r.clone());
      return (estado.historicos[id] = await r.json());
    } catch { /* sem histórico ainda (nenhuma alteração) ou sem conexão */ }
  }
  const c = await cache.match(url);
  return (estado.historicos[id] = c ? await c.json() : []);
}

async function registrarAlteracoes(id, desde, ate) {
  const hist = await carregarHistorico(id);
  let artigos = [];
  for (const reg of hist) {
    if (reg.versao_nova > desde) {
      reg.alterados.forEach(a => artigos.push({ artigo: a.artigo, tipo: "alterado" }));
      reg.incluidos.forEach(a => artigos.push({ artigo: a.artigo, tipo: "incluído" }));
      reg.removidos.forEach(a => artigos.push({ artigo: a.artigo, tipo: "removido" }));
    }
  }
  const vistos = new Set();
  artigos = artigos.filter(a => !vistos.has(a.artigo) && vistos.add(a.artigo));
  estado.alteracoes[id] = { desde, ate, artigos };
  gravarLS("alteracoes-nao-vistas", estado.alteracoes);
}

function situacao(id) {
  const st = estado.status[id];
  if (!st) return { cls: "pend", txt: "Verificação pendente", sub: "Ainda não há verificação registrada." };
  const local = estado.info[id];
  const okEm = st.ultima_verificacao_ok;
  const subOk = "Última verificação confirmada: " + dataHora(okEm);
  if (estado.alteracoes[id]) return { cls: "alt", txt: "Alteração detectada", sub: "A lei mudou desde a sua última leitura. " + subOk };
  if (!local || local.hash !== st.hash) {
    if (estado.sincronizando.has(id)) return { cls: "pend", txt: "Baixando versão atual", sub: subOk };
    return local
      ? { cls: "alt", txt: "Alteração detectada", sub: "Há uma versão nova que ainda não foi baixada. Conecte-se à internet." }
      : { cls: "pend", txt: "Ainda não baixada", sub: "Conecte-se à internet para baixar esta lei." };
  }
  if (st.status === "ERRO_VERIFICACAO") return { cls: "erro", txt: "Não foi possível confirmar a atualização", sub: subOk };
  if (!okEm) return { cls: "pend", txt: "Verificação pendente", sub: "A fonte oficial ainda não foi consultada com sucesso." };
  if ((Date.now() - new Date(okEm)) / 36e5 > HORAS_PENDENTE) return { cls: "pend", txt: "Verificação pendente", sub: subOk };
  return { cls: "ok", txt: "Atualizada", sub: subOk };
}

/* =====================================================================
   INTERPRETAÇÃO DO TEXTO
   ===================================================================== */
const RE_NOTA = /\((?:Reda[çc][ãa]o|Inclu[íi]d|Revogad|Vide|Vig[êe]ncia|Renumerad|Acrescid|Regulamento|Produ[çc][ãa]o de efeito|Declarad|Suspens|Promulga|Vetad|Convertid|Express[ãa]o|Texto)[^()]*(?:\([^()]*\)[^()]*)*\)/g;
const RE_ESTRUTURA = /^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|Se[çc][ãa]o|SUBSE[ÇC][ÃA]O|Subse[çc][ãa]o|DISPOSI[ÇC][ÕO]ES)\b/;

function tipoLinha(l, i) {
  if (i === 0) return "caput";
  if (/^(§|Par[áa]grafo [úu]nico)/i.test(l)) return "par";
  if (/^[IVXLC]+\s*[-–—]/.test(l)) return "inc";
  if (/^[a-z]\)\s/.test(l)) return "ali";
  if (/^Pena\s*[-–—]/.test(l)) return "pena";
  if (/^\(.*\)$/.test(l)) return "notalinha";
  if (RE_ESTRUTURA.test(l)) return "estrutura";
  const letras = l.replace(/[^A-Za-zÀ-ú]/g, "");
  if (letras.length > 3 && letras === letras.toUpperCase()) return "estrutura";
  if (l.length <= 140 && !/[.;:,]$/.test(l) && /^[A-ZÀ-Ú]/.test(l) && !/^Art/.test(l)) return "rubrica";
  return "texto";
}

function chaveOrdem(id) {
  const [base, dup] = id.split("#");
  const [num, ...letras] = base.split("-");
  return { num: parseInt(num, 10), letras, dup: parseInt(dup || "1", 10) };
}
function compararArtigos(a, b) {
  const x = chaveOrdem(a), y = chaveOrdem(b);
  if (x.num !== y.num) return x.num - y.num;
  for (let i = 0; i < Math.max(x.letras.length, y.letras.length); i++) {
    if (x.letras[i] === undefined) return -1;
    if (y.letras[i] === undefined) return 1;
    if (x.letras[i] !== y.letras[i]) return x.letras[i] < y.letras[i] ? -1 : 1;
  }
  return x.dup - y.dup;
}

const ehTitulo = l => l && (l.tipo === "rubrica" || l.tipo === "estrutura");
/* Títulos no fim de um bloco pertencem ao artigo seguinte (inclui uma nota logo abaixo de um título). */
function tirarTitulosDoFim(ls, minimo) {
  const mover = [];
  while (ls.length > minimo) {
    const u = ls[ls.length - 1], pen = ls[ls.length - 2];
    if (ehTitulo(u) || (u.tipo === "notalinha" && ehTitulo(pen) && ls.length - 1 > minimo)) mover.unshift(ls.pop());
    else break;
  }
  return mover;
}

function prepararLei(lei) {
  if (lei._prep) return lei._prep;
  // o robô informa a ordem do documento (na Constituição, o ADCT vem depois da parte principal)
  const ids = Object.keys(lei.artigos);
  if (ids.every(id => typeof lei.artigos[id].ordem === "number")) ids.sort((a, b) => lei.artigos[a].ordem - lei.artigos[b].ordem);
  else ids.sort(compararArtigos);
  const arts = ids.map(id => ({
    id, linhas: lei.artigos[id].texto.split("\n").map((t, i) => ({ t, tipo: tipoLinha(t, i) })), antes: [],
  }));
  // preâmbulo: epígrafe, ementa, fórmula de promulgação e os primeiros títulos
  let pre = [];
  if (lei.preambulo && lei.preambulo.length) {
    let promulgou = false;
    pre = lei.preambulo.map((t, i) => {
      let tipo;
      if (i === 0) tipo = "epigrafe";
      else if (/^\(.*\)$/.test(t)) tipo = "notalinha";
      else if (/^(O|A) PRESIDENT|^O CONGRESSO|^AS MESAS/i.test(t)) { tipo = "promulgacao"; promulgou = true; }
      else if (!promulgou) tipo = "ementa";
      else tipo = tipoLinha(t, 1);
      return { t, tipo };
    });
    if (arts.length) arts[0].antes = tirarTitulosDoFim(pre, 0);
  }
  for (let k = 0; k < arts.length - 1; k++) arts[k + 1].antes = tirarTitulosDoFim(arts[k].linhas, 1);
  for (const a of arts) {
    a.antes.forEach((l, j) => {
      const prox = a.antes[j + 1];
      if (l.tipo === "estrutura" && RE_ESTRUTURA.test(l.t) && prox && prox.tipo === "rubrica") prox.tipo = "estrutura";
    });
  }
  const sumario = [];
  for (const a of arts) {
    for (let j = 0; j < a.antes.length; j++) {
      const l = a.antes[j];
      if (/^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS$/i.test(l.t)) { sumario.push({ rotulo: "ADCT — Ato das Disposições Constitucionais Transitórias", nivel: 1, alvo: a.id }); continue; }
      if (l.tipo !== "estrutura" || !RE_ESTRUTURA.test(l.t)) continue;
      let rotulo = l.t;
      const prox = a.antes[j + 1];
      if (prox && prox.tipo === "estrutura" && !RE_ESTRUTURA.test(prox.t)) rotulo += " — " + prox.t;
      const nivel = /^(PARTE|LIVRO|T[ÍI]TULO)/i.test(l.t) ? 1 : /^CAP/i.test(l.t) ? 2 : 3;
      sumario.push({ rotulo, nivel, alvo: a.id });
    }
  }
  lei._prep = { arts, sumario, pre };
  return lei._prep;
}

function linhaHTML(texto) { return esc(texto).replace(RE_NOTA, m => `<span class="nota">${m}</span>`); }

function artigoHTML(a, alterados, leiId) {
  let h = "";
  for (const l of a.antes) {
    h += l.tipo === "notalinha" ? `<p class="rubrica"><span class="nota">${esc(l.t)}</span></p>`
      : `<p class="${l.tipo === "estrutura" ? "estrutura" : "rubrica"}">${esc(l.t)}</p>`;
  }
  const caput = a.linhas[0].t;
  const semNotas = caput.replace(RE_NOTA, "").replace(/^Art\.?\s*[\dºo°\-A-Z]+\.?\s*[-–]?\s*/, "").trim();
  const revogado = !semNotas && /Revogad/i.test(caput);
  const m = caput.match(/^(Art\.?\s*[\dºo°]+(?:-[A-Z]{1,2})*\.?)(.*)$/);
  const rot = m ? m[1] : "";
  const resto = m ? m[2] : caput;
  const cls = ["artigo"];
  if (revogado) cls.push("revogado");
  if (alterados && alterados.has(a.id)) cls.push("alterado");
  if (ehFavorito(idFavArt(leiId, a.id))) cls.push("favorito");
  h += `<div class="${cls.join(" ")}" id="art-${esc(a.id)}" data-art="${esc(a.id)}">`;
  h += `<p><button class="rotulo" data-menu="${esc(a.id)}">${esc(rot)}</button>${linhaHTML(resto)}</p>`;
  for (let i = 1; i < a.linhas.length; i++) {
    const l = a.linhas[i];
    const c = { par: "par", inc: "inc", ali: "ali", pena: "pena", rubrica: "rubrica", estrutura: "rubrica" }[l.tipo] || "";
    h += l.tipo === "notalinha" ? `<p><span class="nota">${esc(l.t)}</span></p>` : `<p${c ? ` class="${c}"` : ""}>${linhaHTML(l.t)}</p>`;
  }
  return h + "</div>";
}

function preambuloHTML(pre) {
  if (!pre.length) return "";
  return `<div class="preambulo">${pre.map(l => {
    if (l.tipo === "notalinha") return `<p><span class="nota">${esc(l.t)}</span></p>`;
    const c = { epigrafe: "epigrafe", ementa: "ementa", promulgacao: "promulgacao", estrutura: "estrutura", rubrica: "rubrica" }[l.tipo] || "";
    return `<p class="${c}">${linhaHTML(l.t)}</p>`;
  }).join("")}</div>`;
}

/* =====================================================================
   ÂNCORAS DOS GRIFOS E ANOTAÇÕES
   Cada marcação guarda: artigo, posição, o trecho exato, 40 letras antes e
   depois, o hash do artigo e uma cópia do texto do artigo naquela versão.
   ===================================================================== */
function textoDoArtigo(div) { return div.textContent; }
function posicaoNoArtigo(div, no, off) {
  const r = document.createRange();
  r.setStart(div, 0);
  r.setEnd(no, off);
  return r.toString().length;
}
function pintar(div, ini, fim, cls, dados) {
  const alvos = [];
  const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let n, pos = 0;
  while ((n = w.nextNode())) {
    const a = pos, b = pos + n.data.length;
    pos = b;
    if (b <= ini || a >= fim) continue;
    alvos.push([n, Math.max(ini, a) - a, Math.min(fim, b) - a]);
  }
  for (const [no, s, e] of alvos) {
    let alvo = no;
    if (e < alvo.data.length) alvo.splitText(e);
    if (s > 0) alvo = alvo.splitText(s);
    const m = document.createElement("mark");
    m.className = cls;
    Object.assign(m.dataset, dados);
    alvo.parentNode.insertBefore(m, alvo);
    m.appendChild(alvo);
  }
}
function comumFim(a, b) { let k = 0; while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++; return k; }
function comumInicio(a, b) { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; }

/* Onde está o trecho marcado no texto atual? exato | reposicionado | perdido */
function localizar(item, textoAtual, hashAtual) {
  if (!item.texto) return { estado: "artigo" };
  if (textoAtual.slice(item.ini, item.fim) === item.texto &&
      textoAtual.slice(Math.max(0, item.ini - item.prefixo.length), item.ini) === item.prefixo) {
    return { ini: item.ini, fim: item.fim, estado: item.hashArt === hashAtual ? "exato" : "reposicionado" };
  }
  let melhor = null, idx = textoAtual.indexOf(item.texto);
  while (idx >= 0) {
    const pre = textoAtual.slice(Math.max(0, idx - item.prefixo.length), idx);
    const suf = textoAtual.slice(idx + item.texto.length, idx + item.texto.length + item.sufixo.length);
    const nota = comumFim(pre, item.prefixo) + comumInicio(suf, item.sufixo);
    if (!melhor || nota > melhor.nota) melhor = { ini: idx, fim: idx + item.texto.length, nota };
    idx = textoAtual.indexOf(item.texto, idx + 1);
  }
  if (!melhor) return { estado: "perdido" };
  return { ini: melhor.ini, fim: melhor.fim, estado: item.hashArt === hashAtual ? "exato" : "reposicionado" };
}

function artigoMudou(item) {
  const lei = estado.leis[item.lei];
  if (!lei) return false;                   // lei ainda não carregada: não acusa mudança sem conferir
  const art = lei && item.art && lei.artigos[item.art];
  if (!item.art) return false;
  if (!art) return true;                  // artigo não existe mais nesta versão
  return item.hashArt !== art.hash;
}

/* Índice das suas marcações por artigo. Antes, cada um dos centenas de artigos percorria
   TODAS as suas marcações; agora o índice é montado uma vez e só refeito quando algo muda. */
let versaoItens = 0, cacheMarcas = null;
function marcasDaLei(lei) {
  if (cacheMarcas && cacheMarcas.lei === lei && cacheMarcas.v === versaoItens) return cacheMarcas.m;
  const m = new Map();
  const de = art => { if (!m.has(art)) m.set(art, { grifos: [], notas: [], trechos: [], tintas: [] }); return m.get(art); };
  for (const i of estado.itens.values()) {
    if (i.apagado || i.lei !== lei || !i.art) continue;
    if (i.tipo === "grifo") de(i.art).grifos.push(i);
    else if (i.tipo === "anotacao") de(i.art).notas.push(i);
    else if (i.tipo === "favorito" && i.alvo === "trecho") de(i.art).trechos.push(i);
    else if (i.tipo === "tinta" && ((i.tracos && i.tracos.length) || (i.carimbos && i.carimbos.length) || (i.figuras && i.figuras.length))) de(i.art).tintas.push(i);
  }
  cacheMarcas = { lei, v: versaoItens, m };
  return m;
}
function marcacoesDoArtigo(leiId, art) {
  const x = marcasDaLei(leiId).get(art);
  return x ? [...x.grifos, ...x.notas, ...x.trechos] : [];
}

function aplicarMarcacoes(leiId, div) {
  const art = div.dataset.art;
  const marcas = marcasDaLei(leiId).get(art);
  if (!marcas) {                                           // caminho rápido: a maioria dos artigos
    div.querySelectorAll(":scope > .ind-notas, :scope > svg.tinta, :scope > .aviso-tinta").forEach(e => e.remove());
    return;
  }
  const lei = estado.leis[leiId];
  const hashAtual = lei.artigos[art]?.hash;
  const grifos = marcas.grifos;
  const notas = marcas.notas;
  const texto = grifos.length ? textoDoArtigo(div) : "";
  for (const g of grifos) {
    const loc = localizar(g, texto, hashAtual);
    if (loc.estado === "perdido" || loc.estado === "artigo") continue;
    const comNota = notas.some(n => n.grifoId === g.id);
    pintar(div, loc.ini, loc.fim, `grifo g-${g.cor}${comNota ? " com-nota" : ""}`, { grifo: g.id });
  }
  pintarTinta(leiId, div);
  div.querySelector(".ind-notas")?.remove();
  if (notas.length) {
    const b = document.createElement("button");
    b.className = "ind-notas" + (notas.some(artigoMudou) ? " atencao" : "");
    b.dataset.n = notas.length;
    b.dataset.notas = art;
    b.setAttribute("aria-label", `${notas.length} anotação(ões) neste artigo`);
    div.appendChild(b);
  }
}
function repintarArtigo(leiId, art) {
  const div = document.getElementById("art-" + art);
  if (!div) return;
  const prep = prepararLei(estado.leis[leiId]);
  const a = prep.arts.find(x => x.id === art);
  const alt = estado.alteracoes[leiId];
  const tmp = document.createElement("div");
  tmp.innerHTML = artigoHTML({ ...a, antes: [] }, alt ? new Set(alt.artigos.map(x => x.artigo)) : null, leiId);
  const novo = tmp.firstElementChild;
  div.replaceWith(novo);
  aplicarMarcacoes(leiId, novo);
}

/* =====================================================================
   COMPARAÇÃO PALAVRA A PALAVRA
   ===================================================================== */
function diffPalavras(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  if (n * m > 4e6) return [{ t: "del", s: a }, { t: "ins", s: b }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const add = (t, s) => { if (out.length && out[out.length - 1].t === t) out[out.length - 1].s += s; else out.push({ t, s }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { add("eq", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) add("del", A[i++]);
    else add("ins", B[j++]);
  }
  while (i < n) add("del", A[i++]);
  while (j < m) add("ins", B[j++]);
  return out;
}
function diffHTML(antes, depois) {
  const partes = diffPalavras(antes, depois);
  return partes.map((p, k) => {
    if (p.t === "del") return `<del>${esc(p.s)}</del>`;
    if (p.t === "ins") return `<ins>${esc(p.s)}</ins>`;
    // trechos iguais longos: mostra só o entorno da mudança
    const s = p.s, CTX = 120;
    if (s.length <= CTX * 2 + 40) return esc(s);
    const inicio = k === 0 ? "" : s.slice(0, CTX);
    const fim = k === partes.length - 1 ? "" : s.slice(-CTX);
    return esc(inicio) + `<span class="corte"> [ … trecho sem alteração … ] </span>` + esc(fim);
  }).join("");
}
function normaAlteradora(antes, depois) {
  const notas = t => new Set((t.match(RE_NOTA) || []).map(x => x.trim()));
  const a = notas(antes);
  const novas = [...notas(depois)].filter(x => !a.has(x));
  return novas.length ? novas.join(" ") : "";
}
