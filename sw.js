/* Service worker: guarda a "casca" do app para abrir sem internet.
   Os dados das leis são controlados pela própria página (só baixa o que mudou). */
const VERSAO = "casca-v9";
const CASCA = ["./", "index.html", "manifest.webmanifest", "icone-180.png", "icone-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k.startsWith("casca-") && k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/dados/")) return;                 // dados: a página decide

  // Fontes do Google: guarda na primeira vez e usa a cópia depois.
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSAO).then(async c => {
      const guardada = await c.match(e.request);
      if (guardada) return guardada;
      const r = await fetch(e.request);
      c.put(e.request, r.clone());
      return r;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // App: tenta a internet primeiro (para receber melhorias); sem internet, usa a cópia.
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) caches.open(VERSAO).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
