/* =====================================================================
   SINCRONIZAÇÃO AUTOMÁTICA NA NUVEM (GitHub privado ou Google Drive)
   - Cada pessoa usa a PRÓPRIA nuvem; a chave fica só no aparelho dela.
   - Depois de cada edição (15 s sem mexer), ao sair do app e ao abrir,
     o app envia o que mudou e traz o que mudou nos outros aparelhos.
   - Em cada item vale a versão mais recente (igual ao "juntar" do backup).
   - Arquivos grandes (PDF, Word, imagens) sobem uma vez só.
   - Opcional: senha — tudo é embaralhado (AES) antes de sair do aparelho.
   ===================================================================== */
// ID do cliente Google do app (criado pelo dono do app no Google Cloud; veja as instruções).
const GOOGLE_CLIENT_ID = "";
const sync = { rodando: false, tempo: null, chave: null, google: null, ultimoErro: null };
const cfgSync = () => lerLS("sync-config", null);
const estSync = () => lerLS("sync-estado", { hashes: {}, locais: {} });

/* ---------- provedores ---------- */
function provedorGitHub(cfg) {
  const base = lerLS("sync-api-base", "https://api.github.com");     // (os testes usam um servidor de mentira)
  const cab = extra => Object.assign({ Authorization: `Bearer ${cfg.token}`, "X-GitHub-Api-Version": "2022-11-28" }, extra || {});
  let ramo = cfg.ramo || "main";
  const chamar = async (url, op = {}) => {
    const r = await fetch(base + url, { ...op, headers: cab(op.headers) });
    const venc = r.headers.get("github-authentication-token-expiration");
    if (venc) { const c = cfgSync(); if (c && c.tokenExpira !== venc) { c.tokenExpira = venc; gravarLS("sync-config", c); } }
    if (r.status === 401) throw new Error("A chave do GitHub não é mais válida (venceu ou foi apagada). Gere uma nova em Configurações.");
    return r;
  };
  const caminho = p => p.split("/").map(encodeURIComponent).join("/");
  return {
    nome: "GitHub",
    async preparar() {
      const r = await chamar(`/repos/${cfg.repo}`);
      if (r.status === 404) throw new Error("Repositório não encontrado. Confira o nome (usuário/repositório) e se a chave tem acesso a ele.");
      const info = await r.json();
      ramo = info.default_branch || "main";
      return info;
    },
    async listar() {
      const r = await chamar(`/repos/${cfg.repo}/git/trees/${ramo}?recursive=1`);
      const m = new Map();
      if (r.status === 409 || r.status === 404) return m;            // repositório ainda vazio
      if (!r.ok) throw new Error("GitHub respondeu " + r.status);
      for (const t of (await r.json()).tree || []) if (t.type === "blob") m.set(t.path, { ref: t.sha, hash: t.sha });
      return m;
    },
    async baixar(p) {
      const r = await chamar(`/repos/${cfg.repo}/contents/${caminho(p)}?ref=${ramo}`, { headers: { Accept: "application/vnd.github.raw" } });
      if (!r.ok) throw new Error(`Não foi possível baixar ${p} (${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async enviar(p, bytes, anterior) {
      const corpo = { message: "Sincronização do Leitor de Legislação", content: bytesParaBase64(bytes), branch: ramo };
      if (anterior) corpo.sha = anterior.ref;
      const r = await chamar(`/repos/${cfg.repo}/contents/${caminho(p)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (r.status === 409 || r.status === 422) { const e = new Error("conflito"); e.conflito = true; throw e; }
      if (!r.ok) throw new Error(`Não foi possível enviar ${p} (${r.status})`);
      const sha = (await r.json()).content.sha;
      return { ref: sha, hash: sha };
    },
  };
}
function provedorGoogle() {
  const chamar = async (url, op = {}) => {
    const tk = lerLS("google-token", null);
    if (!tk || Date.now() > tk.expira - 60000) { const e = new Error("Toque em ☁️ para reconectar ao Google (a conexão dura 1 hora por segurança)."); e.reconectar = true; throw e; }
    const r = await fetch(url, { ...op, headers: Object.assign({ Authorization: "Bearer " + tk.token }, op.headers || {}) });
    if (r.status === 401) { localStorage.removeItem("google-token"); const e = new Error("Toque em ☁️ para reconectar ao Google."); e.reconectar = true; throw e; }
    return r;
  };
  let ids = new Map();
  return {
    nome: "Google Drive",
    async preparar() { return true; },
    async listar() {
      const m = new Map(); ids = new Map(); let pag = "";
      do {
        const r = await chamar(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,md5Checksum)${pag ? "&pageToken=" + pag : ""}`);
        if (!r.ok) throw new Error("Google Drive respondeu " + r.status);
        const j = await r.json();
        for (const f of j.files || []) { m.set(f.name, { ref: f.id, hash: f.md5Checksum }); ids.set(f.name, f.id); }
        pag = j.nextPageToken || "";
      } while (pag);
      return m;
    },
    async baixar(p) {
      const r = await chamar(`https://www.googleapis.com/drive/v3/files/${ids.get(p)}?alt=media`);
      if (!r.ok) throw new Error(`Não foi possível baixar ${p} (${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async enviar(p, bytes, anterior) {
      let r;
      if (anterior) r = await chamar(`https://www.googleapis.com/upload/drive/v3/files/${anterior.ref}?uploadType=media&fields=id,md5Checksum`, { method: "PATCH", body: bytes });
      else {
        const meta = new Blob([JSON.stringify({ name: p, parents: ["appDataFolder"] })], { type: "application/json" });
        const fd = new FormData(); fd.append("metadata", meta); fd.append("file", new Blob([bytes]));
        r = await chamar("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum", { method: "POST", body: fd });
      }
      if (!r.ok) throw new Error(`Não foi possível enviar ${p} (${r.status})`);
      const j = await r.json();
      return { ref: j.id, hash: j.md5Checksum };
    },
  };
}
function provedorAtual() {
  const c = cfgSync(); if (!c) return null;
  return c.provedor === "google" ? provedorGoogle() : provedorGitHub(c);
}
function idClienteGoogle() { return lerLS("google-client-id", "") || GOOGLE_CLIENT_ID; }
async function conectarGoogle(consentimento) {        // precisa ser chamado a partir de um toque (o Google abre uma janelinha)
  if (!idClienteGoogle()) throw new Error("O dono do app ainda não configurou o acesso ao Google.");
  await carregarScript("https://accounts.google.com/gsi/client");
  return new Promise((ok, falha) => {
    const cli = google.accounts.oauth2.initTokenClient({
      client_id: idClienteGoogle(), scope: "https://www.googleapis.com/auth/drive.appdata",
      callback: r => {
        if (r.error) return falha(new Error("O Google não autorizou: " + r.error));
        gravarLS("google-token", { token: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
        ok(true);
      },
      error_callback: e => falha(new Error("A janela do Google foi fechada ou bloqueada (" + (e.type || "erro") + ")."))
    });
    cli.requestAccessToken({ prompt: consentimento ? "consent" : "" });
  });
}

/* ---------- utilidades: bytes, base64, texto, senha ---------- */
function bytesParaBase64(b) { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function base64ParaBytes(t) { const s = atob(t); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
const MARCA_CIFRA = new TextEncoder().encode("LLC1");
async function chaveDaSenha(senha, sal) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function cifrar(bytes) {
  if (!sync.chave) return bytes;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sync.chave, bytes));
  const out = new Uint8Array(4 + 12 + c.length); out.set(MARCA_CIFRA); out.set(iv, 4); out.set(c, 16); return out;
}
async function decifrar(bytes) {
  const cifrado = bytes.length > 16 && MARCA_CIFRA.every((v, i) => bytes[i] === v);
  if (!cifrado) return bytes;
  if (!sync.chave) { const e = new Error("Os dados na nuvem estão protegidos por senha. Informe a senha em Configurações → Sincronização."); e.senha = true; throw e; }
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(4, 16) }, sync.chave, bytes.subarray(16))); }
  catch { const e = new Error("Senha da sincronização incorreta."); e.senha = true; throw e; }
}
const paraBytes = obj => new TextEncoder().encode(JSON.stringify(obj));
const deBytes = b => JSON.parse(new TextDecoder().decode(b));
async function prepararSenha(p, lista) {
  const c = cfgSync();
  sync.chave = null;
  if (lista.has("cripto.json")) {
    const info = deBytes(await p.baixar("cripto.json"));
    if (!c.senha) { const e = new Error("Os dados na nuvem estão protegidos por senha. Informe a senha em Configurações → Sincronização."); e.senha = true; throw e; }
    sync.chave = await chaveDaSenha(c.senha, base64ParaBytes(info.sal));
    const teste = new TextDecoder().decode(await decifrar(base64ParaBytes(info.teste)));
    if (teste !== "leitor-ok") throw new Error("Senha da sincronização incorreta.");
  } else if (c.senha) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    sync.chave = await chaveDaSenha(c.senha, sal);
    const teste = await cifrar(new TextEncoder().encode("leitor-ok"));
    const r = await p.enviar("cripto.json", paraBytes({ sal: bytesParaBase64(sal), teste: bytesParaBase64(teste), criadoEm: agoraISO() }), null);
    lista.set("cripto.json", r);
  }
}

/* ---------- a sincronização em si ---------- */
const EXT_IMG = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const MIME_EXT = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
function marcarMudanca() {
  if (!cfgSync() || window.syncSilencio) return;
  clearTimeout(sync.tempo);
  sync.tempo = setTimeout(() => sincronizar("edição"), 15000);        // 15 s depois da última mudança
  atualizarIndicadorSync("pendente");
}
async function sincronizar(motivo = "manual", tentativa = 1) {
  const c = cfgSync();
  if (!c || sync.rodando) return;
  if (!navigator.onLine) { atualizarIndicadorSync("offline"); return; }
  const p = provedorAtual();
  sync.rodando = true; window.syncSilencio = true;
  atualizarIndicadorSync("rodando");
  const est = estSync(); est.hashes = est.hashes || {}; est.locais = est.locais || {};
  let trazidos = 0, enviados = 0;
  const baixarJson = async caminho => deBytes(await decifrar(await p.baixar(caminho)));
  const enviarJson = async (lista, caminho, obj) => {
    const hLocal = hashCurto(JSON.stringify(obj));
    if (lista.has(caminho) && est.locais[caminho] === hLocal) return;          // nada mudou desde o último envio
    const r = await p.enviar(caminho, await cifrar(paraBytes(obj)), lista.get(caminho));
    lista.set(caminho, r); est.hashes[caminho] = r.hash; est.locais[caminho] = hLocal; enviados++;
  };
  const remotoMudou = (lista, caminho) => lista.has(caminho) && lista.get(caminho).hash !== est.hashes[caminho];
  try {
    await p.preparar();
    const lista = await p.listar();
    await prepararSenha(p, lista);

    // 1) acervo e cadernos importados
    if (remotoMudou(lista, "config.json")) {
      const r = await baixarJson("config.json");
      const meus = lerLS("info-leis", {});
      for (const [id, v] of Object.entries(r.infoLeis || {})) if (!meus[id]) { meus[id] = v; trazidos++; }
      gravarLS("info-leis", meus);
      const locais = new Map(lerLS("cadernos-locais", []).map(x => [x.id, x]));
      for (const cad of r.cadernos || []) {
        const loc = locais.get(cad.id);
        if (!loc || (cad.atualizadoEm || "") > (loc.atualizadoEm || "")) { locais.set(cad.id, cad); trazidos++; }
      }
      gravarLS("cadernos-locais", [...locais.values()]);
      est.hashes["config.json"] = lista.get("config.json").hash;
    }
    const cache = await caches.open(CACHE_DADOS);
    for (const cad of lerLS("cadernos-locais", [])) {                          // caderno que chegou de outro aparelho
      const caminho = `cadernos/${cad.id}.json`;
      if (cad.apagado) { await cache.delete(cad.url); continue; }
      if (!(await cache.match(cad.url)) && lista.has(caminho)) {
        await cache.put(new Request(cad.url), new Response(JSON.stringify(await baixarJson(caminho)), { headers: { "content-type": "application/json" } }));
        est.hashes[caminho] = lista.get(caminho).hash; trazidos++;
      }
      if (!lista.has(caminho) && (await cache.match(cad.url))) await enviarJson(lista, caminho, await (await cache.match(cad.url)).json());
    }
    await enviarJson(lista, "config.json", { infoLeis: lerLS("info-leis", {}), cadernos: lerLS("cadernos-locais", []) });

    // 2) marcações, anotações, desenhos, favoritos, pastas, respostas…
    if (remotoMudou(lista, "itens.json")) {
      for (const r of await baixarJson("itens.json")) {
        const loc = estado.itens.get(r.id);
        if (!loc || (r.atualizadoEm || "") > (loc.atualizadoEm || "")) { await bdGravar("itens", r); estado.itens.set(r.id, r); trazidos++; }
      }
      est.hashes["itens.json"] = lista.get("itens.json").hash;
      if (trazidos) versaoItens++;
    }
    await enviarJson(lista, "itens.json", [...estado.itens.values()]);

    // 3) resumos: lista e o conteúdo de cada um (edições)
    let arquivosRemotos = [];
    if (remotoMudou(lista, "resumos.json")) {
      const r = await baixarJson("resumos.json");
      arquivosRemotos = r.arquivos || [];
      for (const m of r.resumos || []) {
        const loc = await bdLer("resumos", m.id);
        if (!loc || (m.atualizadoEm || "") > (loc.atualizadoEm || "")) {
          await bdGravar("resumos", m);
          if (m.apagado) await bdApagar("resumos_conteudo", m.id);
          else if (lista.has(`resumos/${m.id}.json`)) { await bdGravar("resumos_conteudo", await baixarJson(`resumos/${m.id}.json`)); est.hashes[`resumos/${m.id}.json`] = lista.get(`resumos/${m.id}.json`).hash; await bdApagar("miniaturas", m.id); }
          trazidos++;
        }
      }
      est.hashes["resumos.json"] = lista.get("resumos.json").hash;
      resumos.lista = null; resumos.textos = null;
    }
    const metas = await bdTodos("resumos");
    const arqsLocais = await bdTodos("arquivos");
    for (const cont of await bdTodos("resumos_conteudo")) {
      const m = metas.find(x => x.id === cont.id);
      if (m && !m.apagado) await enviarJson(lista, `resumos/${cont.id}.json`, cont);
    }
    await enviarJson(lista, "resumos.json", { resumos: metas, arquivos: arqsLocais.map(a => ({ id: a.id, nome: a.nome, tipo: a.blob?.type || "", atualizadoEm: a.atualizadoEm })) });

    // 4) arquivos originais e imagens: sobem e descem uma vez só
    for (const a of arqsLocais) {
      const caminho = `arquivos/${a.id}`;
      if (lista.has(caminho)) continue;
      atualizarIndicadorSync("rodando", `Enviando ${a.nome || "arquivo"}…`);
      const r = await p.enviar(caminho, await cifrar(new Uint8Array(await a.blob.arrayBuffer())), null);
      lista.set(caminho, r); enviados++;
    }
    const idsArq = new Set(arqsLocais.map(a => a.id));
    for (const a of arquivosRemotos) {
      if (idsArq.has(a.id) || !lista.has(`arquivos/${a.id}`)) continue;
      atualizarIndicadorSync("rodando", `Baixando ${a.nome || "arquivo"}…`);
      const bytes = await decifrar(await p.baixar(`arquivos/${a.id}`));
      await bdGravar("arquivos", { id: a.id, nome: a.nome, atualizadoEm: a.atualizadoEm, blob: new Blob([bytes], { type: a.tipo }) });
      trazidos++;
    }
    const imgsLocais = await bdTodos("imagens");
    const idsImg = new Set(imgsLocais.map(i => i.id));
    const remotasImg = new Map([...lista.keys()].filter(k => k.startsWith("imagens/")).map(k => { const n = k.slice(8); const d = n.lastIndexOf("."); return [n.slice(0, d), n.slice(d + 1)]; }));
    for (const im of imgsLocais) {
      if (remotasImg.has(im.id)) continue;
      const caminho = `imagens/${im.id}.${EXT_IMG[im.tipoMime || im.blob?.type] || "jpg"}`;
      const r = await p.enviar(caminho, await cifrar(new Uint8Array(await im.blob.arrayBuffer())), null);
      lista.set(caminho, r); enviados++;
    }
    for (const [id, ext] of remotasImg) {
      if (idsImg.has(id)) continue;
      const bytes = await decifrar(await p.baixar(`imagens/${id}.${ext}`));
      await bdGravar("imagens", { id, blob: new Blob([bytes], { type: MIME_EXT[ext] || "image/jpeg" }), tipoMime: MIME_EXT[ext] || "image/jpeg", atualizadoEm: agoraISO() });
      trazidos++;
    }

    est.ultimaEm = agoraISO(); est.erro = null; est.trazidos = trazidos; est.enviados = enviados;
    gravarLS("sync-estado", est);
    sync.ultimoErro = null;
    if (enviados) gravarLS("ultimo-backup", est.ultimaEm);                    // a nuvem conta como backup
    atualizarIndicadorSync("ok");
    if (trazidos) aplicarSincronizacaoNaTela(trazidos);
  } catch (e) {
    gravarLS("sync-estado", est);
    if (e.conflito && tentativa < 3) { sync.rodando = false; window.syncSilencio = false; return sincronizar(motivo, tentativa + 1); }  // outro aparelho gravou ao mesmo tempo
    sync.ultimoErro = e;
    const est2 = estSync(); est2.erro = e.message; gravarLS("sync-estado", est2);
    atualizarIndicadorSync(e.reconectar ? "reconectar" : e.senha ? "senha" : "erro");
  } finally {
    sync.rodando = false; window.syncSilencio = false;
  }
}
function aplicarSincronizacaoNaTela(n) {
  estado.info = lerLS("info-leis", {});
  const editando = caneta.ativa || document.querySelector("[contenteditable=true]") || !$("#painel").classList.contains("oculto");
  carregarQuestoes().then(() => { if (!editando) rotear(); });
  mostrarAvisoRapido(`☁️ ${n} atualização(ões) trazida(s) de outro aparelho`);
}
function mostrarAvisoRapido(txt) {
  let a = $("#aviso-rapido");
  if (!a) { a = document.createElement("div"); a.id = "aviso-rapido"; a.className = "aviso-rapido"; ($("#camada-fixa") || document.body).appendChild(a); }
  a.textContent = txt; a.classList.add("visivel");
  clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove("visivel"), 3500);
}

/* ---------- indicador ☁️ no topo ---------- */
function atualizarIndicadorSync(situacao, detalhe) {
  const b = $("#btn-sync"); if (!b) return;
  const c = cfgSync();
  b.classList.toggle("oculto", !c);
  if (!c) return;
  const txt = { ok: "☁️✓", rodando: "☁️…", pendente: "☁️•", offline: "☁️", erro: "☁️!", reconectar: "☁️↻", senha: "☁️🔒" }[situacao] || "☁️";
  b.textContent = txt;
  b.dataset.situacao = situacao;
  b.title = detalhe || { ok: "Sincronizado", rodando: "Sincronizando…", pendente: "Alterações serão enviadas em instantes", offline: "Sem internet: envia quando voltar",
    erro: "Erro na sincronização (toque para ver)", reconectar: "Toque para reconectar ao Google", senha: "Informe a senha da sincronização" }[situacao] || "";
}
async function tocarIndicadorSync() {
  const b = $("#btn-sync");
  if (b.dataset.situacao === "reconectar") {
    try { await conectarGoogle(false); sincronizar("reconectou"); } catch (e) { alert(e.message); }
    return;
  }
  location.hash = "#/ajustes";
  setTimeout(() => $("#secao-sync")?.scrollIntoView({ block: "start" }), 300);
}

/* ---------- Configurações → Sincronização ---------- */
function htmlSecaoSync() {
  const c = cfgSync(), e = estSync();
  if (!c) return `<div class="secao" id="secao-sync"><h2>☁️ Sincronização automática</h2><div class="cartao">
    <p>Guarde seus estudos na <strong>sua própria nuvem</strong>, de graça. Depois de cada edição o app envia sozinho o que mudou, e outros aparelhos seus recebem automaticamente. Ninguém mais vê seus dados.</p>
    <div class="acoes" style="margin-bottom:12px">
      <button class="botao primario" id="sync-github">Conectar ao GitHub (repositório privado)</button>
      <button class="botao" id="sync-google" ${idClienteGoogle() ? "" : "disabled"}>Entrar com Google (Google Drive)</button>
    </div>
    ${idClienteGoogle() ? "" : '<p class="contagem">A opção do Google aparece quando o dono do app concluir a configuração no Google.</p>'}
  </div></div>`;
  const venc = c.tokenExpira ? Math.floor((Date.parse(c.tokenExpira.replace(" UTC", "Z").replace(" ", "T")) - Date.now()) / 864e5) : null;
  return `<div class="secao" id="secao-sync"><h2>☁️ Sincronização automática</h2><div class="cartao">
    <p>Conectado ao <strong>${c.provedor === "google" ? "Google Drive" : "GitHub · " + esc(c.repo)}</strong>${c.senha ? " · 🔒 protegido por senha" : ""}.</p>
    <p class="contagem">${e.ultimaEm ? `Última sincronização: ${esc(dataHora(e.ultimaEm))}.` : "Ainda não sincronizou."} ${e.erro ? `<br><span class="alerta">⚠️ ${esc(e.erro)}</span>` : ""}
      ${venc !== null && venc < 15 ? `<br><span class="alerta">A chave do GitHub vence em ${venc} dia(s). Gere uma nova e troque aqui.</span>` : ""}</p>
    <div class="acoes" style="margin-bottom:12px">
      <button class="botao primario" id="sync-agora">Sincronizar agora</button>
      ${c.provedor === "github" ? '<button class="botao" id="sync-trocar-chave">Trocar a chave</button>' : '<button class="botao" id="sync-reconectar">Reconectar ao Google</button>'}
      <button class="botao" id="sync-senha">${c.senha ? "Trocar a senha neste aparelho" : "Informar senha (se a nuvem tiver)"}</button>
      <button class="botao" id="sync-desligar" style="color:var(--alt)">Desconectar este aparelho</button>
    </div>
    <p class="contagem">Desconectar não apaga nada: nem neste aparelho, nem na nuvem.</p>
  </div></div>`;
}
function ligarSecaoSync() {
  const c = cfgSync();
  if (!c) {
    $("#sync-github").onclick = () => painelConectarGitHub();
    $("#sync-google").onclick = () => painelConectarGoogle();
    return;
  }
  $("#sync-agora").onclick = async () => { $("#sync-agora").textContent = "Sincronizando…"; await sincronizar("manual"); telaAjustes(); };
  if ($("#sync-trocar-chave")) $("#sync-trocar-chave").onclick = () => painelConectarGitHub(c);
  if ($("#sync-reconectar")) $("#sync-reconectar").onclick = async () => { try { await conectarGoogle(false); await sincronizar("reconectou"); telaAjustes(); } catch (e) { alert(e.message); } };
  $("#sync-senha").onclick = () => {
    const s = prompt("Senha da sincronização (a mesma em todos os seus aparelhos). Deixe em branco para não usar senha:", "");
    if (s === null) return;
    const cc = cfgSync(); cc.senha = s || ""; gravarLS("sync-config", cc); sincronizar("senha").then(telaAjustes);
  };
  $("#sync-desligar").onclick = () => {
    if (!confirm("Desconectar este aparelho da nuvem? Nada é apagado; ele só deixa de sincronizar.")) return;
    localStorage.removeItem("sync-config"); localStorage.removeItem("sync-estado"); localStorage.removeItem("google-token");
    atualizarIndicadorSync(); telaAjustes();
  };
}
function painelConectarGitHub(atual) {
  abrirPainel(`<h2>Conectar ao GitHub ${botaoFechar}</h2>
    <p class="contagem" style="margin-top:0">Três passos, feitos uma única vez (no computador é mais fácil):</p>
    <ol class="passos-sync">
      <li><strong>Crie um repositório privado</strong> para os seus dados: <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>. Nome sugerido: <code>meus-estudos-dados</code>, marque <em>Private</em> e também <em>Add a README file</em>, e clique em <em>Create repository</em>.</li>
      <li><strong>Gere uma chave só para ele:</strong> <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>. Dê um nome, escolha a validade (até 1 ano), em <em>Repository access</em> escolha <em>Only select repositories</em> → o repositório criado; em <em>Permissions → Repository permissions → Contents</em> escolha <em>Read and write</em>. Clique em <em>Generate token</em> e copie a chave (começa com <code>github_pat_</code>).</li>
      <li><strong>Cole abaixo</strong> e toque em Conectar.</li>
    </ol>
    <label class="contagem">Repositório (seu-usuário/nome)</label>
    <input class="campo" id="gh-repo" placeholder="SeuUsuario/meus-estudos-dados" value="${esc(atual?.repo || "")}" autocapitalize="off" autocorrect="off">
    <label class="contagem">Chave (token)</label>
    <input class="campo" id="gh-token" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off">
    <label class="contagem">Senha para proteger os dados (opcional)</label>
    <input class="campo" id="gh-senha" type="password" placeholder="Deixe em branco para não usar" value="${esc(atual?.senha || "")}">
    <p class="contagem">Com senha, tudo é embaralhado antes de sair do aparelho; nem quem abrir o repositório consegue ler. Use a mesma senha nos outros aparelhos. Se esquecer a senha, os dados da nuvem ficam ilegíveis (os do aparelho continuam).</p>
    <div class="acoes"><button class="botao primario" id="gh-conectar">Conectar</button></div><p id="gh-msg" class="contagem"></p>`);
  $("#gh-conectar").onclick = async () => {
    const repo = $("#gh-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    const token = $("#gh-token").value.trim() || atual?.token || "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) { $("#gh-msg").textContent = "Preencha o repositório (usuário/nome) e a chave."; return; }
    $("#gh-conectar").disabled = true; $("#gh-msg").textContent = "Conferindo…";
    try {
      const info = await provedorGitHub({ repo, token }).preparar();
      if (!info.private) { if (!confirm("Atenção: esse repositório é PÚBLICO, e qualquer pessoa poderia ver seus dados. Continuar mesmo assim? (Recomendado: torná-lo privado nas configurações do repositório.)")) { $("#gh-conectar").disabled = false; $("#gh-msg").textContent = ""; return; } }
      if (info.permissions && info.permissions.push === false) throw new Error("A chave não tem permissão de escrita. Em Contents, escolha Read and write.");
      gravarLS("sync-config", { provedor: "github", repo, token, senha: $("#gh-senha").value, conectadoEm: agoraISO() });
      gravarLS("sync-estado", { hashes: {}, locais: {} });
      $("#gh-msg").textContent = "Conectado. Fazendo a primeira sincronização (pode levar alguns minutos se houver muitos arquivos)…";
      await sincronizar("primeira");
      const e = estSync();
      if (e.erro) { $("#gh-msg").textContent = "⚠️ " + e.erro; $("#gh-conectar").disabled = false; return; }
      fecharPainel(); telaAjustes(); mostrarAvisoRapido("☁️ Sincronização ligada");
    } catch (err) { $("#gh-msg").textContent = "⚠️ " + err.message; $("#gh-conectar").disabled = false; }
  };
}
function painelConectarGoogle() {
  abrirPainel(`<h2>Entrar com Google ${botaoFechar}</h2>
    <p>Os dados ficam numa <strong>pasta escondida do seu Google Drive</strong>, que só este app acessa (não aparece entre os seus arquivos e não mexe em nada deles).</p>
    <p class="contagem">Por segurança, o Google mantém a conexão por 1 hora. Depois disso, o ícone ☁️↻ aparece no topo: um toque reconecta. As suas edições nunca se perdem — ficam no aparelho e sobem na próxima conexão.</p>
    <label class="contagem">Senha para proteger os dados (opcional)</label>
    <input class="campo" id="go-senha" type="password" placeholder="Deixe em branco para não usar">
    <div class="acoes"><button class="botao primario" id="go-conectar">Entrar com Google</button></div><p id="go-msg" class="contagem"></p>`);
  $("#go-conectar").onclick = async () => {
    $("#go-msg").textContent = "Abrindo o Google…";
    try {
      await conectarGoogle(true);
      gravarLS("sync-config", { provedor: "google", senha: $("#go-senha").value, conectadoEm: agoraISO() });
      gravarLS("sync-estado", { hashes: {}, locais: {} });
      $("#go-msg").textContent = "Conectado. Fazendo a primeira sincronização…";
      await sincronizar("primeira");
      const e = estSync();
      if (e.erro) { $("#go-msg").textContent = "⚠️ " + e.erro; return; }
      fecharPainel(); telaAjustes(); mostrarAvisoRapido("☁️ Sincronização ligada");
    } catch (err) { $("#go-msg").textContent = "⚠️ " + err.message; }
  };
}

/* =====================================================================
   BOAS-VINDAS (primeira vez que a pessoa abre o app)
   ===================================================================== */
const PASSOS_BOAS_VINDAS = [
  ["📚", "Bem-vindo(a) ao Leitor de Legislação", "Um app para estudar lei seca, resolver questões e organizar seus resumos — tudo no seu aparelho, funcionando até sem internet. As leis vêm direto do site do Planalto e são conferidas todos os dias: quando uma lei muda, o app avisa e mostra o que mudou."],
  ["⚖️", "Monte o seu acervo", "Na aba Leis, toque em “+ Adicionar leis” e escolha as que você estuda (são 98 normas: Constituição, códigos, legislação penal, administrativa e mais). Organize em pastas e favorite as mais usadas."],
  ["🖍️", "Estude marcando a lei", "Selecione um trecho para grifar (4 cores) ou anotar. Toque no número do artigo para favoritar, anotar, ouvir em voz alta ou resolver as questões daquele artigo. Com ✏️ Caneta, use o Apple Pencil (ou o dedo) para escrever, marcar, pôr ícones e apagar. A ⚡ Revisão rápida mostra só o que você marcou."],
  ["📝", "Questões", "Na aba Questões, toque em “📥 Importar caderno (PDF)” e escolha uma lista de questões impressa em PDF: o app monta o caderno com gabarito, filtros e estatísticas, e liga cada questão ao artigo da lei."],
  ["📄", "Seus resumos", "Na aba Resumos, importe seus arquivos do Word e PDF (dá para escolher vários de uma vez, inclusive do Google Drive). Eles aparecem com o visual original; você marca por cima com a caneta e pode editar o texto dos arquivos do Word."],
  ["☁️", "Não perca nada", "Tudo fica guardado neste aparelho. Em Configurações você pode ligar a sincronização automática com a sua própria nuvem (GitHub ou Google) — depois de cada edição, o app guarda sozinho — ou gerar um backup completo num único arquivo."],
];
function mostrarBoasVindas(passo = 0) {
  const [ic, tit, txt] = PASSOS_BOAS_VINDAS[passo];
  const ultimo = passo === PASSOS_BOAS_VINDAS.length - 1;
  abrirPainel(`<div class="boas-vindas">
    <div class="bv-icone">${ic}</div><h2 style="justify-content:center">${esc(tit)}</h2><p>${esc(txt)}</p>
    <div class="bv-pontos">${PASSOS_BOAS_VINDAS.map((_, k) => `<span class="${k === passo ? "atual" : ""}"></span>`).join("")}</div>
    <div class="acoes bv-botoes">
      ${ultimo ? "" : '<button id="bv-pular">Pular</button>'}
      ${passo ? '<button id="bv-voltar">Voltar</button>' : ""}
      <button class="botao primario" id="bv-proximo">${ultimo ? "Começar" : "Próximo"}</button>
    </div></div>`);
  gravarLS("boas-vindas-vista", true);
  $("#bv-proximo").onclick = () => { if (ultimo) { fecharPainel(); if (!Object.keys(lerLS("info-leis", {})).length) location.hash = "#/catalogo"; } else mostrarBoasVindas(passo + 1); };
  if ($("#bv-pular")) $("#bv-pular").onclick = () => fecharPainel();
  if ($("#bv-voltar")) $("#bv-voltar").onclick = () => mostrarBoasVindas(passo - 1);
}

/* =====================================================================
   PUBLICAR UM CADERNO PARA TODOS (dono do app)
   Gera os 2 arquivos para subir em dados/questoes do repositório do app.
   ===================================================================== */
async function prepararPublicacaoCaderno(id) {
  const c = estado.cadernos[id];
  const idPublico = id.replace(/^local-/, "").replace(/-[0-9a-f]{12}$/, "") || "caderno";
  const caderno = { id: idPublico, titulo: c.titulo, materia: c.materia, versao: new Date().toISOString().slice(0, 10), assuntos: c.assuntos, observacao: "Publicado pelo app.", questoes: c.questoes.map(({ caderno, ...q }) => q) };
  const texto = JSON.stringify(caderno, null, 1);
  const indice = { cadernos: (estado.indiceQ?.cadernos || []).filter(x => !x.local && x.id !== idPublico).map(({ local, url, ...x }) => x) };
  indice.cadernos.push({ id: idPublico, titulo: c.titulo, materia: c.materia, arquivo: idPublico + ".json", qtd: caderno.questoes.length, hash: hashCurto(texto) });
  await entregarArquivo(new Blob([texto], { type: "application/json" }), idPublico + ".json");
  await entregarArquivo(new Blob([JSON.stringify(indice, null, 1)], { type: "application/json" }), "indice.json");
  abrirPainel(`<h2>Publicar “${esc(c.titulo)}” ${botaoFechar}</h2>
    <p>Foram gerados 2 arquivos: <strong>${esc(idPublico)}.json</strong> e <strong>indice.json</strong>.</p>
    <ol class="passos-sync">
      <li>No GitHub do app, abra a pasta <code>dados/questoes</code>.</li>
      <li><em>Add file → Upload files</em>, arraste os 2 arquivos (o <code>indice.json</code> substitui o atual) e clique em <em>Commit changes</em>.</li>
      <li>Em alguns minutos o caderno aparece para todos que usam o app. Depois disso, você pode excluir a sua cópia importada (as respostas continuam valendo, porque as questões são as mesmas).</li>
    </ol>`);
}
