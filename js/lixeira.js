/* =====================================================================
   LIXEIRA
   Leis removidas, pastas (de qualquer área), resumos e cadernos importados vêm para cá
   e ficam 30 dias. Dá para restaurar cada arquivo ou a pasta inteira,
   ou apagar de vez. Depois de 30 dias, somem sozinhos.
   ===================================================================== */
const DIAS_LIXEIRA = 30;
async function resumoParaLixeira(r, grupo = null) {
  r.lixeira = { em: agoraISO(), pasta: r.pasta || "", ...(grupo ? { grupo } : {}) };
  await salvarMeta(r);
}
async function resumosParaLixeira(lista, grupo = null) {
  for (const r of lista) await resumoParaLixeira(r, grupo);
  resumos.textos = null;
}
async function restaurarResumo(r) {
  const l = r.lixeira || {};
  let pasta = l.pasta || "";
  if (!pasta && l.materia) {                                  // apagado antes das pastas novas
    pasta = idPastaLegada(l.materia, l.assunto || "");
    if (!estado.itens.get(pasta) || estado.itens.get(pasta).apagado) { await migrarPastaDe(l.materia, l.assunto || ""); }
  }
  const p = estado.itens.get(pasta);
  r.pasta = p && !p.apagado ? pasta : "";
  if (p && p.lixeira && !(typeof l.grupo === "string" && p.lixeira.grupo === l.grupo)) { delete p.lixeira; await salvarItem({ ...p, lixeira: undefined }); }   // a pasta dele volta junto
  delete r.lixeira; delete r.materia; delete r.assunto;
  await salvarMeta(r);
}
async function migrarPastaDe(m, a) {
  const idM = idPastaLegada(m);
  if (!estado.itens.get(idM) || estado.itens.get(idM).apagado) await salvarItem({ id: idM, tipo: "pasta", area: "resumos", nome: m, pai: null, leis: [], cadernos: [] });
  if (a) { const idA = idPastaLegada(m, a); if (!estado.itens.get(idA) || estado.itens.get(idA).apagado) await salvarItem({ id: idA, tipo: "pasta", area: "resumos", nome: a, pai: idM, leis: [], cadernos: [] }); }
}
async function cadernoParaLixeira(id, grupo = null) {
  const locais = lerLS("cadernos-locais", []);
  gravarLS("cadernos-locais", locais.map(x => x.id === id ? { ...x, lixeira: { em: agoraISO(), ...(grupo ? { grupo } : {}) }, atualizadoEm: agoraISO() } : x));
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
/* tudo o que está na lixeira; pastas apagadas inteiras aparecem como um grupo com o que tinham dentro */
function itensDaLixeira() {
  const res = [...(resumos.lista?.values() || [])].filter(r => r.lixeira && !r.apagado);
  const cads = lerLS("cadernos-locais", []).filter(c => c.lixeira && !c.apagado);
  const leis = leisNaLixeira();
  const pastas = itens("pasta", p => p.lixeira);
  const grupos = new Map();
  for (const p of pastas) if (p.lixeira.topo) grupos.set(p.lixeira.grupo, { id: p.lixeira.grupo, nome: p.nome, area: p.area || "leis", em: p.lixeira.em, res: [], cads: [], leis: [], subpastas: 0 });
  for (const p of pastas) if (!p.lixeira.topo && grupos.has(p.lixeira.grupo)) grupos.get(p.lixeira.grupo).subpastas++;
  const soltos = { res: [], cads: [], leis: [] };
  const colocar = (tipo, x, g) => {
    if (typeof g === "string" && grupos.has(g)) return grupos.get(g)[tipo].push(x);
    if (g && typeof g === "object") {                             // grupo do jeito antigo (pasta de resumos)
      if (!grupos.has(g.id)) grupos.set(g.id, { id: g.id, nome: g.nome, area: "resumos", em: x.lixeira?.em, res: [], cads: [], leis: [], subpastas: 0, antigo: true });
      return grupos.get(g.id)[tipo].push(x);
    }
    soltos[tipo].push(x);
  };
  for (const r of res) colocar("res", r, r.lixeira.grupo);
  for (const c of cads) colocar("cads", c, c.lixeira.grupo);
  for (const l of leis) colocar("leis", l, l.grupo);
  return { res, cads, leis, grupos, soltos, total: res.length + cads.length + leis.length + [...grupos.values()].filter(g => !g.res.length && !g.cads.length && !g.leis.length).length };
}
async function restaurarGrupo(g) {
  for (const p of itens("pasta", p => p.lixeira && p.lixeira.grupo === g.id)) { const q = { ...p }; delete q.lixeira; await salvarItem(q); }
  for (const r of g.res) await restaurarResumo(r);
  for (const c of g.cads) await restaurarCaderno(c.id);
  for (const l of g.leis) await restaurarLei(l.lei);
}
async function apagarGrupoDeVez(g) {
  for (const r of g.res) await excluirResumo(r.id);
  for (const c of g.cads) await apagarCadernoDeVez(c.id);
  for (const l of g.leis) await apagarItem(l.id);
  for (const p of itens("pasta", p => p.lixeira && p.lixeira.grupo === g.id)) await apagarItem(p.id);
}
/* passados 30 dias, some de vez (roda ao abrir o app) */
async function limparLixeiraVencida() {
  await carregarResumos();
  const limite = Date.now() - DIAS_LIXEIRA * 864e5;
  const { grupos, soltos } = itensDaLixeira();
  for (const g of grupos.values()) if (g.em && Date.parse(g.em) < limite) await apagarGrupoDeVez(g);
  for (const r of soltos.res) if (Date.parse(r.lixeira.em) < limite) await excluirResumo(r.id);
  for (const c of soltos.cads) if (Date.parse(c.lixeira.em) < limite) await apagarCadernoDeVez(c.id);
  for (const l of soltos.leis) if (Date.parse(l.em) < limite) await apagarItem(l.id);
}
const diasRestantes = em => Math.max(0, DIAS_LIXEIRA - Math.floor((Date.now() - Date.parse(em)) / 864e5));

async function telaLixeira() {
  await carregarResumos();
  definirTopo({ titulo: "🗑 Lixeira", voltar: null });
  marcarAba("");
  const L = itensDaLixeira();
  const { grupos, soltos, total } = L;
  const quando = em => `apagado em ${esc(dataHora(em))} · some em ${diasRestantes(em)} dia(s)`;
  const nomeArq = r => esc(r.origem || r.titulo || "Sem título");
  const linhaRes = r => `<li class="item-lixo"><div class="lixo-txt"><strong>📄 ${nomeArq(r)}</strong>
      <span class="contagem">${esc(textoCaminho(r.lixeira.pasta) || "Fora das pastas")} · ${quando(r.lixeira.em)}</span></div>
      <div class="lixo-acoes"><button data-rest-res="${esc(r.id)}">↩ Restaurar</button><button data-del-res="${esc(r.id)}" class="perigo">Apagar de vez</button></div></li>`;
  const linhaCad = c => `<li class="item-lixo"><div class="lixo-txt"><strong>📝 ${esc(c.titulo)}</strong>
      <span class="contagem">${c.qtd || "?"} questões · ${quando(c.lixeira.em)}</span></div>
      <div class="lixo-acoes"><button data-rest-cad="${esc(c.id)}">↩ Restaurar</button><button data-del-cad="${esc(c.id)}" class="perigo">Apagar de vez</button></div></li>`;
  const linhaLei = l => `<li class="item-lixo"><div class="lixo-txt"><strong>⚖️ ${esc(l.nome || nomeLei(l.lei))}</strong>
      <span class="contagem">${quando(l.em)} · suas marcações continuam guardadas</span></div>
      <div class="lixo-acoes"><button data-rest-lei="${esc(l.lei)}">↩ Restaurar</button><button data-del-lei="${esc(l.id)}" class="perigo">Tirar da lixeira</button></div></li>`;
  const rotArea = { leis: "Leis", questoes: "Questões", resumos: "Resumos" };
  $("#conteudo").innerHTML = `<div class="secao">
    <p class="contagem" style="margin-top:0">O que você apaga (leis removidas, pastas, resumos e cadernos) fica aqui por ${DIAS_LIXEIRA} dias. Depois disso, some sozinho.</p>
    ${total ? '<div class="acoes-linha"><button class="botao" id="esvaziar-lixeira" style="color:var(--alt)">Esvaziar a lixeira</button></div>' : '<p class="vazio">A lixeira está vazia.</p>'}
    ${grupos.size ? `<h3 class="grupo-assunto">Pastas apagadas</h3><ul class="lista-lixo">${[...grupos.values()].map(g => `<li class="item-lixo pasta-lixo">
        <details><summary><span class="lixo-txt"><strong>📁 ${esc(g.nome)}</strong>
          <span class="contagem">${rotArea[g.area]} · ${g.res.length + g.cads.length + g.leis.length} item(ns)${g.subpastas ? ` · ${g.subpastas} subpasta(s)` : ""}${g.em ? " · " + quando(g.em) : ""} · toque para ver</span></span></summary>
          <ul class="lista-lixo dentro-pasta">${g.res.map(linhaRes).join("")}${g.cads.map(linhaCad).join("")}${g.leis.map(linhaLei).join("")}</ul></details>
        <div class="lixo-acoes"><button data-rest-grupo="${esc(g.id)}">↩ Restaurar a pasta inteira</button><button data-del-grupo="${esc(g.id)}" class="perigo">Apagar de vez</button></div></li>`).join("")}</ul>` : ""}
    ${soltos.leis.length ? `<h3 class="grupo-assunto">Leis removidas do acervo</h3><ul class="lista-lixo">${soltos.leis.map(linhaLei).join("")}</ul>` : ""}
    ${soltos.res.length ? `<h3 class="grupo-assunto">Resumos apagados</h3><ul class="lista-lixo">${soltos.res.map(linhaRes).join("")}</ul>` : ""}
    ${soltos.cads.length ? `<h3 class="grupo-assunto">Cadernos de questões apagados</h3><ul class="lista-lixo">${soltos.cads.map(linhaCad).join("")}</ul>` : ""}
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
    b.disabled = true; b.textContent = "Restaurando…";
    await restaurarGrupo(g);
    mostrarAvisoRapido(`↩ Pasta "${g.nome}" restaurada`); recarregar();
  });
  $$("[data-del-grupo]").forEach(b => b.onclick = async () => {
    const g = grupos.get(b.dataset.delGrupo);
    if (!confirm(`Apagar de vez a pasta "${g.nome}" e o que está dentro? Não dá para desfazer.${g.leis.length ? " (As marcações das leis continuam guardadas.)" : ""}`)) return;
    await apagarGrupoDeVez(g); recarregar();
  });
  $$("[data-rest-cad]").forEach(b => b.onclick = async () => { await restaurarCaderno(b.dataset.restCad); mostrarAvisoRapido("↩ Caderno restaurado"); recarregar(); });
  $$("[data-del-cad]").forEach(b => b.onclick = async () => {
    if (!confirm("Apagar este caderno de vez? As suas respostas continuam no histórico.")) return;
    await apagarCadernoDeVez(b.dataset.delCad); recarregar();
  });
  $$("[data-rest-lei]").forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = "Baixando…"; await restaurarLei(b.dataset.restLei); mostrarAvisoRapido("↩ Lei de volta ao acervo"); recarregar(); });
  $$("[data-del-lei]").forEach(b => b.onclick = async () => { await apagarItem(b.dataset.delLei); recarregar(); });
  const esv = $("#esvaziar-lixeira");
  if (esv) esv.onclick = async () => {
    if (!confirm(`Esvaziar a lixeira? Tudo o que está nela será apagado de vez. Não dá para desfazer.`)) return;
    for (const g of grupos.values()) await apagarGrupoDeVez(g);
    for (const r of soltos.res) await excluirResumo(r.id);
    for (const c of soltos.cads) await apagarCadernoDeVez(c.id);
    for (const l of soltos.leis) await apagarItem(l.id);
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
