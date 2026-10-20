/* =====================================================================
   AVISO "A LEI MUDOU DEPOIS DESTA PROVA"
   O texto de cada artigo traz as notas do Planalto: "(Redação dada pela Lei nº 15.402, de 2026)",
   "(Incluído pela Lei nº 13.964, de 2019)", "(Revogado pela...)". Se alguma nota do artigo citado
   na questão (ou do parágrafo/inciso citado, quando a referência diz qual) for de ano posterior ao
   da prova, a questão ganha um aviso: o gabarito pode não valer mais pela redação atual.
   Tudo é calculado na hora, com o texto da lei que o app já tem; nada é guardado.
   ===================================================================== */
const _leisAviso = new Map();
function leiParaAviso(id) {
  if (!_leisAviso.has(id)) _leisAviso.set(id, textoLeiParaPainel(id).catch(() => null));
  return _leisAviso.get(id);
}
const RE_NOTA_ALTERACAO = /\(\s*(Redação dada|Incluíd[oa]|Acrescentad[oa]|Revogad[oa]|Renumerad[oa])\s+pel[oa]\s+([^()]*?),?\s+de\s+(?:[\dº]{1,3}\.\d{1,2}\.)?(\d{4})\s*\)/gi;
function refsParaAviso(q) {
  const refs = (q.refs || []).filter(r => r.lei && r.art);
  if (refs.length) return refs.slice(0, 4);
  return q.vinculo && q.vinculo.lei && q.vinculo.de === q.vinculo.ate ? [{ lei: q.vinculo.lei, art: q.vinculo.de }] : [];
}
async function alteracoesDepoisDaProva(q) {
  const ano = parseInt(q.ano, 10);
  if (!ano) return [];
  const achados = [];
  for (const r of refsParaAviso(q)) {
    const lei = await leiParaAviso(r.lei);
    const a = lei && lei.artigos && lei.artigos[r.art];
    if (!a || !a.texto) continue;
    let linhas = a.texto.split("\n");
    if (r.disp) { const d = linhasDestacadas(a.texto, r.disp).filter(x => x.d).map(x => x.l); if (d.length) linhas = [linhas[0], ...d]; }
    const normas = new Set();
    for (const l of linhas) for (const m of l.matchAll(RE_NOTA_ALTERACAO)) if (Number(m[3]) > ano) normas.add(`${m[2].replace(/\s+/g, " ").trim()}/${m[3]}`);
    if (normas.size) achados.push({ ref: r, normas: [...normas] });
  }
  return achados;
}
/* "Já analisei": a questão deixa de mostrar o aviso (volta se a lei mudar de novo depois disso) */
const avisoLeiOculto = (q, achados) => { const o = lerLS("avisos-lei-ocultos", {})[q.id]; return !!o && o === assinaturaAviso(achados); };
const assinaturaAviso = achados => achados.map(x => x.normas.join(",")).join("|");
function ocultarAvisoLei(q, achados) {
  const o = lerLS("avisos-lei-ocultos", {});
  o[q.id] = assinaturaAviso(achados);
  const ids = Object.keys(o); if (ids.length > 3000) for (const k of ids.slice(0, ids.length - 3000)) delete o[k];
  gravarLS("avisos-lei-ocultos", o);
}
async function mostrarAvisoLeiAlterada(q, el) {
  if (!el) return;
  const achados = await alteracoesDepoisDaProva(q).catch(() => []);
  if (!achados.length || !el.isConnected || el.dataset.q !== q.id || avisoLeiOculto(q, achados)) return;
  el.innerHTML = `<p class="aviso forte aviso-lei-alterada">⚠️ <strong>A lei mudou depois desta prova (${esc(String(q.ano))}).</strong>
    ${achados.map(x => `${esc(rotuloArt(x.ref.art, x.ref.lei))}${x.ref.disp ? ", " + esc(x.ref.disp) : ""}: ${esc(x.normas.join(", "))}`).join(" · ")}.
    O gabarito pode não valer mais pela redação atual.
    ${achados.map((x, k) => `<button class="link" data-aviso-art="${k}">📖 Ver ${esc(rotuloArt(x.ref.art, x.ref.lei))} hoje</button>`).join(" ")}
    <button class="link" data-aviso-ok>✓ Já analisei, tirar o aviso</button></p>`;
  el.querySelector("[data-aviso-ok]").onclick = () => { ocultarAvisoLei(q, achados); el.innerHTML = ""; mostrarAvisoRapido("✓ Aviso retirado desta questão"); };
  el.querySelectorAll("[data-aviso-art]").forEach(b => b.onclick = () => painelArtigoLS(achados[Number(b.dataset.avisoArt)].ref));
}
