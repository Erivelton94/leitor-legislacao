/* =====================================================================
   HOJE: o que fazer agora, num lugar só
   Na entrada de Questões: meta do dia (questões respondidas hoje, nas duas plataformas), dias seguidos,
   os últimos 7 dias, "continuar de onde parei", refazer as que errei e o simulado.
   No Meu Acervo, uma faixa curta com o progresso do dia (só para quem já resolve questões).
   É tudo contado na hora a partir das respostas já guardadas; nada novo é salvo além da meta.
   ===================================================================== */
const metaDiaria = () => Math.max(1, Number(lerLS("meta-diaria", 30)) || 30);
function resumoHoje() {
  const resp = itens("resposta");
  const porDia = {};
  for (const r of resp) { const d = new Date(r.em).toLocaleDateString("sv-SE"); porDia[d] = (porDia[d] || 0) + 1; }
  const dia = k => new Date(Date.now() - k * 864e5).toLocaleDateString("sv-SE");
  const hoje = porDia[dia(0)] || 0;
  let seq = 0, k = porDia[dia(0)] ? 0 : 1;              // a sequência não quebra por hoje ainda estar no começo
  while (porDia[dia(k)]) { seq++; k++; }
  const semana = [...Array(7)].map((_, i) => ({ d: dia(6 - i), n: porDia[dia(6 - i)] || 0 }));
  return { total: resp.length, hoje, seq, semana };
}
/* as que errei: pela última resposta já dada em cada questão */
function erradasPorUltima(P, mapa) {
  return P.base().filter(q => { const h = mapa.get(q.id); return h && h.length && !h[h.length - 1].correta; });
}
function cartaoHoje() {
  const r = resumoHoje(), meta = metaDiaria(), mapa = mapaRespostas();
  const pct = Math.min(100, Math.round(100 * r.hoje / meta));
  const sLS = lerLS("sessao-ls", null), sME = lerLS("sessao-me", null), sim = typeof simAtivo === "function" ? simAtivo() : null;
  const errLS = erradasPorUltima(PLAT.ls, mapa), errME = erradasPorUltima(PLAT.me, mapa);
  const maxSem = Math.max(meta, ...r.semana.map(x => x.n));
  const nomeDia = d => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(d + "T12:00").getDay()];
  const html = `<div class="cartao cartao-hoje">
    <div class="hoje-cab"><strong>Hoje</strong> <span class="contagem">${r.seq ? `🔥 ${r.seq} dia(s) seguidos` : "Comece hoje uma sequência de estudo"}</span>
      <button class="link" id="hoje-meta">Meta: ${meta} por dia ✎</button></div>
    <div class="hoje-barra" aria-label="${r.hoje} de ${meta} questões hoje"><span style="width:${pct}%"></span></div>
    <p class="contagem" style="margin:4px 0 8px">${r.hoje} de ${meta} questões hoje${r.hoje >= meta ? " · meta cumprida ✓" : ` · faltam ${meta - r.hoje}`}</p>
    <div class="hoje-semana">${r.semana.map(x => `<span title="${x.n} questões"><em>${x.n || ""}</em><i style="height:${Math.round(70 * x.n / maxSem)}%"></i><b>${nomeDia(x.d)}</b></span>`).join("")}</div>
    <div class="acoes-linha" style="margin-top:10px">
      ${sim ? '<a class="botao primario" href="#/simulado" style="text-decoration:none">⏱ Continuar o simulado</a>' : ""}
      ${sLS && sLS.ids && sLS.ids.length ? `<a class="botao" href="#/leiseca/resolver" style="text-decoration:none">▶️ Lei Seca: questão ${Math.min((sLS.pos || 0) + 1, sLS.ids.length)} de ${sLS.ids.length}</a>` : ""}
      ${sME && sME.ids && sME.ids.length ? `<a class="botao" href="#/multipla/resolver" style="text-decoration:none">▶️ Continuar a Múltipla Escolha (${sME.ids.length})</a>` : ""}
      ${errLS.length ? `<button class="botao" data-hoje-erradas="ls">🔁 Refazer ${errLS.length} que errei (Lei Seca)</button>` : ""}
      ${errME.length ? `<button class="botao" data-hoje-erradas="me">🔁 Refazer ${errME.length} que errei (Múltipla Escolha)</button>` : ""}
      ${typeof telaSimulado === "function" ? '<a class="botao" href="#/simulado" style="text-decoration:none">⏱ Simulados</a>' : ""}
    </div></div>`;
  const ligar = () => {
    $("#hoje-meta").onclick = () => {
      const v = prompt("Quantas questões por dia?", String(meta));
      if (v === null) return;
      const n = Math.round(Number(v));
      if (n > 0) { gravarLS("meta-diaria", n); rotear(); }
    };
    $$("[data-hoje-erradas]").forEach(b => b.onclick = async () => {
      const P = PLAT[b.dataset.hojeErradas], lista = P.ordenar(b.dataset.hojeErradas === "ls" ? errLS : errME);
      await redefinirQuestoes(lista.map(q => q.id));
      P.iniciar(lista, "Refazendo as que errei");
    });
  };
  return { html, ligar };
}
function faixaHojeAcervo() {
  const r = resumoHoje();
  if (!r.total) return "";
  const meta = metaDiaria();
  return `<div class="aviso faixa-hoje">📅 <strong>Hoje:</strong> ${r.hoje} de ${meta} questões${r.hoje >= meta ? " ✓" : ""}${r.seq ? ` · 🔥 ${r.seq} dia(s) seguidos` : ""} · <a href="#/questoes">Estudar questões</a></div>`;
}
