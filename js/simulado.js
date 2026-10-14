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

function painelSimulado(P, lista) {
  if (!lista.length) { alert("Nenhuma questão com esse filtro."); return; }
  const ativo = simAtivo();
  if (ativo && !confirm("Já existe um simulado em andamento. Começar outro e descartar aquele?")) return;
  const padraoN = Math.min(lista.length, P.vf ? 30 : 20), minPorQ = P.vf ? 1 : 3;
  abrirPainel(`<h2>⏱ Simulado ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Com as ${lista.length} questões deste filtro. O gabarito e as resoluções só aparecem quando você entregar.</p>
    <label class="contagem">Quantas questões</label>
    <input class="campo" id="sim-n" type="number" min="1" max="${lista.length}" value="${padraoN}">
    <label class="contagem" style="display:block;margin-top:10px">Tempo (minutos)</label>
    <input class="campo" id="sim-min" type="number" min="1" max="600" value="${padraoN * minPorQ}">
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="sim-sortear" checked> Sortear as questões</label>
    <div class="acoes" style="margin-top:14px"><button class="botao primario" id="sim-comecar">Começar o simulado</button></div>`);
  $("#sim-n").oninput = () => { const n = Math.max(1, Math.min(lista.length, Number($("#sim-n").value) || 1)); $("#sim-min").value = n * minPorQ; };
  $("#sim-comecar").onclick = () => {
    const n = Math.max(1, Math.min(lista.length, Number($("#sim-n").value) || padraoN));
    const min = Math.max(1, Number($("#sim-min").value) || n * minPorQ);
    let qs = lista.slice();
    if ($("#sim-sortear").checked) for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
    qs = qs.slice(0, n);
    gravarLS("simulado-ativo", { id: uid().slice(0, 12), plat: P.chave, titulo: `Simulado de ${P.vf ? "Lei Seca" : "Múltipla Escolha"}`, ids: qs.map(q => q.id),
      marcadas: {}, pos: 0, inicio: Date.now(), duracao: min * 60 });
    fecharPainel();
    location.hash = "#/simulado";
  };
}

function telaSimulado(idResultado) {
  clearInterval(simIntervalo);
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
  await salvarItem({ id: "simulado|" + s.id, tipo: "simulado", plat: s.plat, titulo: s.titulo, em: agoraISO(), ids: s.ids, marcadas: s.marcadas,
    total: qs.length, certas, erradas: feitas.length - certas, branco: qs.length - feitas.length, duracao: s.duracao, usado, esgotado: !!tempoEsgotado });
  if (tempoEsgotado) mostrarAvisoRapido("⏱ O tempo acabou: o simulado foi entregue.");
  location.hash = "#/simulado/" + s.id;
}

function grupoDoSimulado(P, q) {
  return P.chave === "ls" ? [q.pastaLS, q.assuntoLS].filter(Boolean).join(" › ") || "Sem assunto" : q.assunto || q.materia || "Sem assunto";
}
function telaResultadoSimulado(id) {
  const r = estado.itens.get("simulado|" + id);
  if (!r || r.apagado) { location.replace("#/simulado"); return; }
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
      <a class="botao" href="#/simulado" style="text-decoration:none">Meus simulados</a></div></div>`;
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
  definirTopo({ titulo: "Meus simulados", voltar: "#/questoes" });
  marcarAba("questoes");
  const lista = itens("simulado").sort((a, b) => b.em.localeCompare(a.em)).slice(0, 30);
  $("#conteudo").innerHTML = `<div class="secao simulado">
    <p class="contagem">Para fazer um simulado, monte o filtro na Lei Seca ou na Múltipla Escolha e toque em “⏱ Simulado”.</p>
    ${lista.length ? `<ul class="acervo">${lista.map(r => `<li class="lei-item"><button class="abrir" data-href="#/simulado/${esc(r.id.split("|")[1])}">
      <span class="lei-nome">${esc(r.titulo)} · ${r.certas} de ${r.total} (${r.total ? Math.round(100 * r.certas / r.total) : 0}%)</span>
      <span class="contagem">${esc(dataHora(r.em))}</span></button></li>`).join("")}</ul>` : '<p class="vazio">Nenhum simulado feito ainda.</p>'}
    <div class="acoes-linha"><a class="botao" href="#/leiseca" style="text-decoration:none">⚖️ Lei Seca</a><a class="botao" href="#/multipla" style="text-decoration:none">📝 Múltipla Escolha</a></div></div>`;
}
