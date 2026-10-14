/* =====================================================================
   MODO SIMULADO (Lei Seca e Múltipla Escolha)
   Prova com tempo: as questões do filtro (sorteadas ou na ordem), sem gabarito nem resolução até o fim.
   Dá para trocar a resposta e pular. Ao entregar (ou quando o tempo acaba), as respostas entram no
   histórico e nas estatísticas, e o resultado mostra o desempenho por assunto e cada questão com a resolução.
   O simulado em andamento fica guardado neste aparelho (se fechar o app, continua de onde parou;
   o relógio continua correndo, como numa prova).
   ===================================================================== */
const simAtivo = () => lerLS("simulado-ativo", null);
let simIntervalo = null;
const segParaRelogio = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

/* distribuição: as questões vão para cada disciplina na proporção de quantas ela tem no filtro
   (método dos maiores restos), com pelo menos 1 para cada disciplina marcada quando o total permite.
   Se o filtro tiver uma disciplina só, a divisão é feita pelos assuntos dela. */
function nivelDoSimulado(P, lista) {
  // o primeiro nível que separa as questões: Lei/Disciplina; se for uma só, o Assunto; depois o arquivo (SubAssunto)
  const nomes = c => new Set(lista.map(q => c[2](q)[0] || "Sem classificação"));
  return P.campos.slice(0, 3).find(c => nomes(c).size > 1) || P.campos[0];
}
function distribuirSimulado(grupos, n) {
  const total = grupos.reduce((s, g) => s + g.qs.length, 0);
  if (!total) return [];
  n = Math.min(n, total);
  const cotas = grupos.map(g => ({ g, exata: n * g.qs.length / total }));
  cotas.forEach(c => { c.n = Math.min(c.g.qs.length, Math.floor(c.exata)); });
  if (n >= grupos.length) cotas.forEach(c => { if (!c.n && c.g.qs.length) c.n = 1; });   // ninguém marcado fica de fora
  let soma = cotas.reduce((s, c) => s + c.n, 0);
  const porResto = cotas.slice().sort((a, b) => (b.exata - Math.floor(b.exata)) - (a.exata - Math.floor(a.exata)) || b.g.qs.length - a.g.qs.length);
  for (let k = 0; soma < n && k < porResto.length * 3; k++) { const c = porResto[k % porResto.length]; if (c.n < c.g.qs.length) { c.n++; soma++; } }
  const porMaior = cotas.slice().sort((a, b) => b.n - a.n);
  for (let k = 0; soma > n; k++) { const c = porMaior[k % porMaior.length]; if (c.n > 1) { c.n--; soma--; } }
  return cotas.map(c => ({ nome: c.g.nome, n: c.n, qs: c.g.qs }));
}
const embaralhar = l => { l = l.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };

function painelSimulado(P, lista) {
  if (!lista.length) { alert("Nenhuma questão com esse filtro."); return; }
  const ativo = simAtivo();
  if (ativo && !confirm("Já existe um simulado em andamento. Começar outro e descartar aquele?")) return;
  const nivel = nivelDoSimulado(P, lista);
  const mapaG = new Map();
  for (const q of lista) { const nome = nivel[2](q)[0] || "Sem classificação"; if (!mapaG.has(nome)) mapaG.set(nome, []); mapaG.get(nome).push(q); }
  const grupos = [...mapaG.entries()].map(([nome, qs]) => ({ nome, qs })).sort((a, b) => b.qs.length - a.qs.length);
  const padraoN = Math.min(lista.length, P.vf ? 30 : 20), minPorQ = P.vf ? 1 : 3;
  abrirPainel(`<h2>⏱ Novo simulado ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Com as ${lista.length} questões do filtro. O gabarito e as resoluções só aparecem quando você entregar.</p>
    <div class="sim-config">
      <label><span class="contagem">Quantas questões</span><input class="campo" id="sim-n" type="number" min="1" max="${lista.length}" value="${padraoN}"></label>
      <label><span class="contagem">Tempo (minutos)</span><input class="campo" id="sim-min" type="number" min="1" max="600" value="${padraoN * minPorQ}"></label>
    </div>
    <h3 class="grupo-assunto">${esc(nivel[1])}: como as questões vão ser divididas</h3>
    <p class="contagem">Cada uma recebe questões na proporção de quantas tem. Desmarque o que não quer no simulado.</p>
    <ul class="sim-disc">${grupos.map((g, k) => `<li><label><input type="checkbox" data-sim-g="${k}" checked> <span class="sim-disc-nome">${esc(nivel[3](g.nome))}</span>
      <span class="contagem">${g.qs.length} no filtro</span></label><strong class="sim-disc-n" id="sim-gn-${k}"></strong></li>`).join("")}</ul>
    <p class="contagem" id="sim-resumo"></p>
    <label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="sim-misturar"> Misturar as disciplinas (sem isso, ficam agrupadas como numa prova)</label>
    <div class="acoes" style="margin-top:14px"><button class="botao primario" id="sim-comecar">Começar o simulado</button></div>`);
  const marcados = () => grupos.filter((g, k) => $(`[data-sim-g="${k}"]`).checked);
  const plano = () => {
    const sel = marcados(), max = sel.reduce((s, g) => s + g.qs.length, 0);
    const n = Math.max(1, Math.min(max || 1, Number($("#sim-n").value) || padraoN));
    return { n, dist: distribuirSimulado(sel, n), max };
  };
  const atualizar = () => {
    const { n, dist, max } = plano();
    grupos.forEach((g, k) => { const d = dist.find(x => x.nome === g.nome); $(`#sim-gn-${k}`).textContent = d ? d.n : "–"; });
    $("#sim-resumo").textContent = max ? `${n} questões de ${dist.filter(d => d.n).length} ${nivel[1].toLowerCase().includes("assunto") ? "assunto(s)" : "disciplina(s)"}.` : "Marque pelo menos uma.";
    $("#sim-comecar").disabled = !max;
  };
  $("#sim-n").oninput = () => { const n = Math.max(1, Math.min(lista.length, Number($("#sim-n").value) || 1)); $("#sim-min").value = n * minPorQ; atualizar(); };
  $$("[data-sim-g]").forEach(b => b.onchange = atualizar);
  atualizar();
  $("#sim-comecar").onclick = () => {
    const { n, dist } = plano();
    let qs = dist.flatMap(d => embaralhar(d.qs).slice(0, d.n));
    if ($("#sim-misturar").checked) qs = embaralhar(qs);
    const min = Math.max(1, Number($("#sim-min").value) || n * minPorQ);
    gravarLS("simulado-ativo", { id: uid().slice(0, 12), plat: P.chave, titulo: `Simulado de ${P.vf ? "Lei Seca" : "Múltipla Escolha"}`, ids: qs.map(q => q.id),
      partes: dist.filter(d => d.n).map(d => [nivel[3](d.nome), d.n]), marcadas: {}, pos: 0, inicio: Date.now(), duracao: min * 60 });
    fecharPainel();
    location.hash = "#/simulado";
  };
}

function telaSimulado(idResultado) {
  clearInterval(simIntervalo);
  if (idResultado === "historico") return telaHistoricoSimulados();
  if (idResultado) return telaResultadoSimulado(idResultado);
  const s = simAtivo();
  if (!s) return telaHistoricoSimulados();
  const P = PLAT[s.plat]; P.base();
  const qs = s.ids.map(id => estado.q.get(id)).filter(Boolean);
  if (!qs.length) { localStorage.removeItem("simulado-ativo"); return telaHistoricoSimulados(); }
  definirTopo({ titulo: "⏱ Simulado", voltar: P.rota });
  marcarAba("questoes");
  const restante = () => s.duracao - (Date.now() - s.inicio) / 1000;
  if (restante() <= 0) return entregarSimulado(true);
  const i = Math.min(s.pos || 0, qs.length - 1), q = qs[i];
  const resp = Object.keys(s.marcadas).length;
  $("#conteudo").innerHTML = `<div class="secao simulado">
    <div class="sim-topo"><strong>Questão ${i + 1} de ${qs.length}</strong>
      <span class="sim-relogio" id="sim-relogio">⏱ ${segParaRelogio(restante())}</span>
      <span class="contagem">${resp} respondida(s)</span></div>
    <div class="sim-grade">${qs.map((x, k) => `<button class="sim-num ${s.marcadas[x.id] ? "feita" : ""} ${k === i ? "atual" : ""}" data-sim-ir="${k}">${k + 1}</button>`).join("")}</div>
    <article class="questao">
      <p class="q-prova">${esc([q.banca, q.ano].filter(Boolean).join(" "))}${q.cargo ? " · " + esc(q.cargo) : ""}</p>
      <div class="q-enunciado">${q.enunciado.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <ul class="alternativas ${q.tipo === "CE" ? "ce" : ""}">
        ${q.alternativas.map(a => `<li><button class="alt ${s.marcadas[q.id] === a.letra ? "marcada" : ""}" data-sim-alt="${esc(a.letra)}">
          <span class="letra">${esc(q.tipo === "CE" ? a.letra : a.letra)}</span><span class="alt-texto">${esc(a.texto)}</span></button></li>`).join("")}
      </ul>
    </article>
    <div class="barra-q">
      <button class="icone-btn" data-sim-nav="-1" ${i === 0 ? "disabled" : ""}>← Anterior</button>
      <button class="icone-btn" data-sim-nav="1" ${i === qs.length - 1 ? "disabled" : ""}>Próxima →</button>
      <button class="botao primario" id="sim-entregar">Entregar o simulado</button>
      <button class="link-acao perigo" id="sim-desistir">Desistir</button>
    </div></div>`;
  const ir = k => { s.pos = k; gravarLS("simulado-ativo", s); telaSimulado(); window.scrollTo(0, 0); };
  $$("[data-sim-ir]").forEach(b => b.onclick = () => ir(Number(b.dataset.simIr)));
  $$("[data-sim-nav]").forEach(b => b.onclick = () => ir(i + Number(b.dataset.simNav)));
  $$("[data-sim-alt]").forEach(b => b.onclick = () => {
    const l = b.dataset.simAlt;
    if (s.marcadas[q.id] === l) delete s.marcadas[q.id]; else s.marcadas[q.id] = l;      // tocar de novo desmarca
    gravarLS("simulado-ativo", s);
    if (s.marcadas[q.id] && i < qs.length - 1) setTimeout(() => ir(i + 1), 250); else telaSimulado();
  });
  $("#sim-entregar").onclick = () => {
    const falta = qs.length - Object.keys(s.marcadas).length;
    if (falta && !confirm(`${falta} questão(ões) sem resposta (contam como em branco). Entregar mesmo assim?`)) return;
    entregarSimulado(false);
  };
  $("#sim-desistir").onclick = () => { if (!confirm("Desistir do simulado? Nada será guardado.")) return; localStorage.removeItem("simulado-ativo"); location.hash = P.rota; };
  simIntervalo = setInterval(() => {
    if (location.hash !== "#/simulado") { clearInterval(simIntervalo); return; }
    const r = restante(), el = $("#sim-relogio");
    if (el) { el.textContent = "⏱ " + segParaRelogio(r); el.classList.toggle("acabando", r < 60); }
    if (r <= 0) { clearInterval(simIntervalo); entregarSimulado(true); }
  }, 1000);
}

async function entregarSimulado(tempoEsgotado) {
  clearInterval(simIntervalo);
  const s = simAtivo();
  if (!s) return;
  localStorage.removeItem("simulado-ativo");
  const P = PLAT[s.plat]; P.base();
  const qs = s.ids.map(id => estado.q.get(id)).filter(Boolean);
  const usado = Math.min(s.duracao, Math.round((Date.now() - s.inicio) / 1000));
  const feitas = qs.filter(q => s.marcadas[q.id]);
  const tempo = feitas.length ? Math.min(1800, Math.round(usado / feitas.length)) : 0;
  let certas = 0;
  for (const q of feitas) {
    const correta = s.marcadas[q.id] === q.gabarito;
    if (correta) certas++;
    await salvarItem({ id: uid(), tipo: "resposta", q: q.id, caderno: q.caderno, marcada: s.marcadas[q.id], correta, em: agoraISO(), tempo, simulado: s.id });
  }
  await salvarItem({ id: "simulado|" + s.id, tipo: "simulado", plat: s.plat, titulo: s.titulo, em: agoraISO(), ids: s.ids, marcadas: s.marcadas, partes: s.partes || [],
    total: qs.length, certas, erradas: feitas.length - certas, branco: qs.length - feitas.length, duracao: s.duracao, usado, esgotado: !!tempoEsgotado });
  if (tempoEsgotado) mostrarAvisoRapido("⏱ O tempo acabou: o simulado foi entregue.");
  location.hash = "#/simulado/" + s.id;
}

function grupoDoSimulado(P, q) {
  return P.chave === "ls" ? [q.pastaLS, q.assuntoLS].filter(Boolean).join(" › ") || "Sem assunto" : q.assunto || q.materia || "Sem assunto";
}
function telaResultadoSimulado(id) {
  const r = estado.itens.get("simulado|" + id);
  if (!r || r.apagado) { location.replace("#/simulado/historico"); return; }
  const P = PLAT[r.plat]; P.base();
  const qs = r.ids.map(x => estado.q.get(x)).filter(Boolean);
  definirTopo({ titulo: "Resultado do simulado", voltar: P.rota });
  marcarAba("questoes");
  const pct = r.total ? Math.round(100 * r.certas / r.total) : 0;
  const grupos = {};
  for (const q of qs) {
    const g = grupos[grupoDoSimulado(P, q)] = grupos[grupoDoSimulado(P, q)] || { t: 0, c: 0 };
    g.t++; if (r.marcadas[q.id] === q.gabarito) g.c++;
  }
  const letra = (q, l) => !l ? "em branco" : P.chave === "ls" ? (l === "C" ? "Verdadeiro" : "Falso") : letraExibida(q, l);
  const erradas = qs.filter(q => r.marcadas[q.id] !== q.gabarito);
  $("#conteudo").innerHTML = `<div class="secao simulado">
    <div class="cartao sim-placar">
      <p class="sim-nota"><strong>${r.certas} de ${r.total}</strong> (${pct}%)</p>
      <p><span class="txt-ok">${r.certas} certas</span> · <span class="txt-erro">${r.erradas} erradas</span> · ${r.branco} em branco · tempo ${segParaRelogio(r.usado)} de ${segParaRelogio(r.duracao)}${r.esgotado ? " (o tempo acabou)" : ""}</p>
      <p class="contagem">${esc(dataHora(r.em))}. As respostas já entraram nas estatísticas.</p>
    </div>
    <h3 class="grupo-assunto">Por assunto</h3>
    <ul class="sim-assuntos">${Object.entries(grupos).sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t).map(([n, g]) => { const p = Math.round(100 * g.c / g.t);
      return `<li><span class="sim-assunto-nome">${esc(n)}</span><span class="sim-assunto-barra"><i style="width:${p}%"></i></span><span class="contagem">${g.c} de ${g.t} (${p}%)</span></li>`; }).join("")}</ul>
    <h3 class="grupo-assunto">Questões</h3>
    <ol class="sim-lista">${qs.map((q, k) => { const m = r.marcadas[q.id], ok = m === q.gabarito;
      return `<li><span class="${ok ? "txt-ok" : m ? "txt-erro" : ""}">${ok ? "✓" : m ? "✗" : "–"}</span> ${esc((q.enunciado[0] || "").slice(0, 110))}${(q.enunciado[0] || "").length > 110 ? "…" : ""}
        <span class="contagem"> · sua: ${esc(letra(q, m))} · gabarito: ${esc(letra(q, q.gabarito))}</span> <button class="link" data-sim-res="${k}">📖 Resolução</button></li>`; }).join("")}</ol>
    <div class="acoes-linha" style="margin-top:14px">
      ${erradas.length ? `<button class="botao primario" id="sim-refazer">🔁 Refazer as ${erradas.length} que errei ou deixei em branco</button>` : ""}
      <a class="botao" href="${P.rota}" style="text-decoration:none">Voltar ao filtro</a>
      <a class="botao" href="#/simulado/historico" style="text-decoration:none">Meus simulados</a></div></div>`;
  $$("[data-sim-res]").forEach(b => b.onclick = () => {
    const q = qs[Number(b.dataset.simRes)];
    abrirPainel(`<h2>Questão ${Number(b.dataset.simRes) + 1} ${botaoFechar}</h2>
      <div class="q-enunciado">${q.enunciado.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${q.tipo !== "CE" ? `<ul class="alternativas">${q.alternativas.map(a => `<li><span class="alt ${a.letra === q.gabarito ? "certa" : a.letra === r.marcadas[q.id] ? "errada" : ""}"><span class="letra">${esc(a.letra)}</span><span class="alt-texto">${esc(a.texto)}</span></span></li>`).join("")}</ul>` : ""}
      <p><strong>Sua resposta:</strong> ${esc(letra(q, r.marcadas[q.id]))} · <strong>Gabarito:</strong> ${esc(letra(q, q.gabarito))}</p>
      ${temResolucao(q) ? `<div class="resolucao-ls painel-res">${q.resolucaoFormato === "rica" ? htmlResolucao(q) : `<h3>Resolução</h3>${textoResolucaoLS(q.resolucao || [])}`}</div>` : '<p class="contagem">Esta questão não tem resolução.</p>'}
      ${typeof botoesArtigosQ === "function" ? botoesArtigosQ(q) : ""}`);
  });
  if ($("#sim-refazer")) $("#sim-refazer").onclick = async () => { await redefinirQuestoes(erradas.map(q => q.id)); P.iniciar(erradas, "Refazendo o simulado"); };
}
function telaHistoricoSimulados() {
  definirTopo({ titulo: "⏱ Simulados", voltar: "#/questoes" });
  marcarAba("questoes");
  const lista = itens("simulado").sort((a, b) => b.em.localeCompare(a.em));
  const ativo = simAtivo();
  const pctS = r => r.total ? Math.round(100 * r.certas / r.total) : 0;
  const media = lista.length ? Math.round(lista.reduce((s, r) => s + pctS(r), 0) / lista.length) : 0;
  const melhor = lista.length ? Math.max(...lista.map(pctS)) : 0;
  const nomePlat = c => c === "ls" ? "⚖️ Lei Seca" : "📝 Múltipla Escolha";
  const cartao = r => { const p = pctS(r);
    return `<li class="sim-cartao"><button class="sim-cartao-abrir" data-href="#/simulado/${esc(r.id.split("|")[1])}">
      <span class="sim-cartao-topo"><span class="contagem">${nomePlat(r.plat)} · ${esc(dataHora(r.em))}</span></span>
      <span class="sim-cartao-nota"><strong>${p}%</strong> <span>${r.certas} de ${r.total}</span></span>
      <span class="sim-cartao-barra"><i class="b-ok" style="width:${r.total ? 100 * r.certas / r.total : 0}%"></i><i class="b-erro" style="width:${r.total ? 100 * r.erradas / r.total : 0}%"></i></span>
      <span class="contagem"><span class="txt-ok">${r.certas} certas</span> · <span class="txt-erro">${r.erradas} erradas</span> · ${r.branco} em branco · ${segParaRelogio(r.usado)}</span>
      ${(r.partes || []).length ? `<span class="contagem sim-cartao-partes">${esc(r.partes.slice(0, 4).map(([n, k]) => `${n} (${k})`).join(" · "))}${r.partes.length > 4 ? " …" : ""}</span>` : ""}
    </button><button class="icone-btn sim-apagar" data-sim-apagar="${esc(r.id)}" aria-label="Apagar este simulado">🗑</button></li>`; };
  $("#conteudo").innerHTML = `<div class="secao simulado">
    ${ativo ? `<div class="aviso forte">⏱ Você tem um simulado em andamento. <a href="#/simulado">Continuar</a></div>` : ""}
    <div class="sim-novo">
      <div><strong>Novo simulado</strong><p class="contagem">Monte o filtro (por exemplo, as disciplinas da sua prova) e toque em “⏱ Simulado”. As questões são divididas entre as disciplinas na proporção de quantas cada uma tem.</p></div>
      <div class="acoes-linha"><a class="botao primario" href="#/multipla" style="text-decoration:none">📝 Múltipla Escolha</a><a class="botao" href="#/leiseca" style="text-decoration:none">⚖️ Lei Seca</a></div>
    </div>
    ${lista.length ? `<div class="numeros-desemp sim-numeros">
      <div><strong>${lista.length}</strong><span>simulado(s) feitos</span></div>
      <div><strong>${media}%</strong><span>média de acerto</span></div>
      <div><strong class="txt-ok">${melhor}%</strong><span>melhor resultado</span></div>
      <div><strong>${pctS(lista[0])}%</strong><span>no último</span></div></div>
    <h3 class="grupo-assunto">Histórico</h3>
    <ul class="sim-cartoes">${lista.map(cartao).join("")}</ul>` : '<p class="vazio">Nenhum simulado feito ainda.</p>'}
  </div>`;
  $$("[data-sim-apagar]").forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm("Apagar este simulado do histórico? As respostas continuam nas estatísticas.")) return;
    await apagarItem(b.dataset.simApagar); telaHistoricoSimulados();
  });
}
