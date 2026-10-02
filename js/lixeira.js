/* =====================================================================
   LIXEIRA
   Resumos, pastas de resumos e cadernos importados apagados vêm para cá
   e ficam 30 dias. Dá para restaurar cada arquivo ou a pasta inteira,
   ou apagar de vez. Depois de 30 dias, somem sozinhos.
   ===================================================================== */
const DIAS_LIXEIRA = 30;
async function resumoParaLixeira(r, grupo = null) {
  r.lixeira = { em: agoraISO(), materia: r.materia || "", assunto: r.assunto || "", ...(grupo ? { grupo } : {}) };
  await salvarMeta(r);
}
async function resumosParaLixeira(lista, grupo = null) {
  for (const r of lista) await resumoParaLixeira(r, grupo);
  resumos.textos = null;
}
async function restaurarResumo(r) {
  const l = r.lixeira || {};
  if (l.materia && !materiasResumo().includes(l.materia)) await salvarItem({ id: uid(), tipo: "materia", nome: l.materia });
  if (l.materia && l.assunto && !assuntosDe(l.materia).includes(l.assunto)) await salvarItem({ id: uid(), tipo: "assunto", materia: l.materia, nome: l.assunto });
  r.materia = l.materia || ""; r.assunto = l.assunto || "";
  delete r.lixeira;
  await salvarMeta(r);
}
async function cadernoParaLixeira(id) {
  const locais = lerLS("cadernos-locais", []);
  gravarLS("cadernos-locais", locais.map(x => x.id === id ? { ...x, lixeira: { em: agoraISO() }, atualizadoEm: agoraISO() } : x));
  delete estado.cadernos[id];
  await carregarQuestoes();
}
async function restaurarCaderno(id) {
  gravarLS("cadernos-locais", lerLS("cadernos-locais", []).map(x => { if (x.id !== id) return x; const { lixeira, ...resto } = x; return { ...resto, atualizadoEm: agoraISO() }; }));
  await carregarQuestoes();
}
async function apagarCadernoDeVez(id) {
  const locais = lerLS("cadernos-locais", []);
  const loc = locais.find(x => x.id === id);
  if (loc) await (await caches.open(CACHE_DADOS)).delete(loc.url);
  gravarLS("cadernos-locais", locais.map(x => x.id === id ? { ...x, apagado: true, lixeira: undefined, atualizadoEm: agoraISO() } : x));
  delete estado.cadernos[id];
}
function itensDaLixeira() {
  const res = [...(resumos.lista?.values() || [])].filter(r => r.lixeira && !r.apagado);
  const cads = lerLS("cadernos-locais", []).filter(c => c.lixeira && !c.apagado);
  return { res, cads, total: res.length + cads.length };
}
/* passados 30 dias, some de vez (roda ao abrir o app) */
async function limparLixeiraVencida() {
  await carregarResumos();
  const limite = Date.now() - DIAS_LIXEIRA * 864e5;
  const { res, cads } = itensDaLixeira();
  for (const r of res) if (Date.parse(r.lixeira.em) < limite) await excluirResumo(r.id);
  for (const c of cads) if (Date.parse(c.lixeira.em) < limite) await apagarCadernoDeVez(c.id);
}
const diasRestantes = em => Math.max(0, DIAS_LIXEIRA - Math.floor((Date.now() - Date.parse(em)) / 864e5));

async function telaLixeira() {
  await carregarResumos();
  definirTopo({ titulo: "🗑 Lixeira", voltar: "#/resumos" });
  marcarAba("resumos");
  const { res, cads, total } = itensDaLixeira();
  const grupos = new Map();
  const soltos = [];
  for (const r of res) {
    const g = r.lixeira.grupo;
    if (g) { if (!grupos.has(g.id)) grupos.set(g.id, { ...g, itens: [] }); grupos.get(g.id).itens.push(r); }
    else soltos.push(r);
  }
  const nomeArq = r => esc(r.origem || r.titulo || "Sem título");
  const linhaRes = r => `<li class="item-lixo"><div class="lixo-txt"><strong>${nomeArq(r)}</strong>
      <span class="contagem">${[r.lixeira.materia, r.lixeira.assunto].filter(Boolean).map(esc).join(" › ") || "Fora das pastas"} · apagado em ${esc(dataHora(r.lixeira.em))} · some em ${diasRestantes(r.lixeira.em)} dia(s)</span></div>
      <div class="lixo-acoes"><button data-rest-res="${esc(r.id)}">↩ Restaurar</button><button data-del-res="${esc(r.id)}" class="perigo">Apagar de vez</button></div></li>`;
  $("#conteudo").innerHTML = `<div class="secao">
    <p class="contagem" style="margin-top:0">O que você apaga fica aqui por ${DIAS_LIXEIRA} dias. Depois disso, some sozinho.</p>
    ${total ? '<div class="acoes-linha"><button class="botao" id="esvaziar-lixeira" style="color:var(--alt)">Esvaziar a lixeira</button></div>' : '<p class="vazio">A lixeira está vazia.</p>'}
    ${grupos.size ? `<h3 class="grupo-assunto">Pastas apagadas</h3><ul class="lista-lixo">${[...grupos.values()].map(g => `<li class="item-lixo pasta-lixo">
        <details><summary><span class="lixo-txt"><strong>📁 ${esc(g.nome)}</strong>
          <span class="contagem">${g.tipo === "assunto" ? "subpasta de " + esc(g.materia) + " · " : ""}${g.itens.length} arquivo(s) · toque para ver</span></span></summary>
          <ul class="lista-lixo dentro-pasta">${g.itens.map(linhaRes).join("")}</ul></details>
        <div class="lixo-acoes"><button data-rest-grupo="${esc(g.id)}">↩ Restaurar a pasta inteira</button><button data-del-grupo="${esc(g.id)}" class="perigo">Apagar de vez</button></div></li>`).join("")}</ul>` : ""}
    ${soltos.length ? `<h3 class="grupo-assunto">Resumos apagados</h3><ul class="lista-lixo">${soltos.map(linhaRes).join("")}</ul>` : ""}
    ${cads.length ? `<h3 class="grupo-assunto">Cadernos de questões apagados</h3><ul class="lista-lixo">${cads.map(c => `<li class="item-lixo"><div class="lixo-txt"><strong>${esc(c.titulo)}</strong>
        <span class="contagem">${c.qtd || "?"} questões · apagado em ${esc(dataHora(c.lixeira.em))} · some em ${diasRestantes(c.lixeira.em)} dia(s)</span></div>
        <div class="lixo-acoes"><button data-rest-cad="${esc(c.id)}">↩ Restaurar</button><button data-del-cad="${esc(c.id)}" class="perigo">Apagar de vez</button></div></li>`).join("")}</ul>` : ""}
  </div>`;
  const recarregar = () => telaLixeira();
  $$("[data-rest-res]").forEach(b => b.onclick = async () => { await restaurarResumo(resumos.lista.get(b.dataset.restRes)); mostrarAvisoRapido("↩ Resumo restaurado"); recarregar(); });
  $$("[data-del-res]").forEach(b => b.onclick = async () => {
    const r = resumos.lista.get(b.dataset.delRes);
    if (!confirm(`Apagar "${r.origem || r.titulo}" de vez? Não dá para desfazer.`)) return;
    await excluirResumo(r.id); recarregar();
  });
  $$("[data-rest-grupo]").forEach(b => b.onclick = async () => {
    const g = grupos.get(b.dataset.restGrupo);
    for (const r of g.itens) await restaurarResumo(r);
    mostrarAvisoRapido(`↩ Pasta "${g.nome}" restaurada com ${g.itens.length} arquivo(s)`); recarregar();
  });
  $$("[data-del-grupo]").forEach(b => b.onclick = async () => {
    const g = grupos.get(b.dataset.delGrupo);
    if (!confirm(`Apagar de vez a pasta "${g.nome}" e os ${g.itens.length} arquivo(s)? Não dá para desfazer.`)) return;
    for (const r of g.itens) await excluirResumo(r.id);
    recarregar();
  });
  $$("[data-rest-cad]").forEach(b => b.onclick = async () => { await restaurarCaderno(b.dataset.restCad); mostrarAvisoRapido("↩ Caderno restaurado"); recarregar(); });
  $$("[data-del-cad]").forEach(b => b.onclick = async () => {
    if (!confirm("Apagar este caderno de vez? As suas respostas continuam no histórico.")) return;
    await apagarCadernoDeVez(b.dataset.delCad); recarregar();
  });
  const esv = $("#esvaziar-lixeira");
  if (esv) esv.onclick = async () => {
    if (!confirm(`Esvaziar a lixeira? Os ${total} item(ns) serão apagados de vez. Não dá para desfazer.`)) return;
    for (const r of res) await excluirResumo(r.id);
    for (const c of cads) await apagarCadernoDeVez(c.id);
    recarregar();
  };
}

/* =====================================================================
   RENOMEAR leis, cadernos e resumos
   (o nome original continua guardado: deixar em branco volta a ele)
   ===================================================================== */
function nomeProprio(tipo, id) { return estado.itens.get(`nome-${tipo}|${id}`); }
async function renomear(tipo, id, atual, original) {
  const novo = prompt(`Novo nome (deixe em branco para voltar a "${original}"):`, atual);
  if (novo === null) return false;
  const chave = `nome-${tipo}|${id}`;
  if (!novo.trim() || novo.trim() === original) { if (estado.itens.get(chave)) await apagarItem(chave); }
  else await salvarItem({ id: chave, tipo: "nome-" + tipo, alvo: id, nome: novo.trim() });
  return true;
}
async function renomearResumo(r) {
  const atual = r.origem || r.titulo || "";
  const novo = prompt("Novo nome do arquivo:", atual);
  if (novo === null || !novo.trim() || novo.trim() === atual) return false;
  const ext = (atual.match(/\.(pdf|docx|txt|md)$/i) || [""])[0];
  let nome = novo.trim();
  if (ext && !nome.toLowerCase().endsWith(ext.toLowerCase())) nome += ext;
  r.origem = nome; r.titulo = nome.replace(/\.(pdf|docx|txt|md)$/i, "");
  await salvarMeta(r);
  return true;
}
async function renomearCaderno(id) {
  const c = estado.cadernos[id];
  if (c.local) {
    const novo = prompt("Novo nome do caderno:", c.titulo);
    if (novo === null || !novo.trim() || novo.trim() === c.titulo) return false;
    const locais = lerLS("cadernos-locais", []);
    const loc = locais.find(x => x.id === id);
    if (loc) {
      const cache = await caches.open(CACHE_DADOS);
      const g = await cache.match(loc.url);
      if (g) { const j = await g.json(); j.titulo = novo.trim(); await cache.put(new Request(loc.url), new Response(JSON.stringify(j), { headers: { "content-type": "application/json" } })); }
      gravarLS("cadernos-locais", locais.map(x => x.id === id ? { ...x, titulo: novo.trim(), atualizadoEm: agoraISO() } : x));
    }
  } else if (!(await renomear("caderno", id, c.titulo, c.tituloOriginal || c.titulo))) return false;
  await carregarQuestoes();
  return true;
}
