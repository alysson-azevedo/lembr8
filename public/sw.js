// Lembr8 service worker (LB-27) — shell offline. Dados do app são local-first
// (localStorage) e NÃO passam por aqui; /api/* é network-only. Bump VERSION
// quando a lista de precache ou esta lógica mudarem (assets /_next/static são
// hashados no URL, então conteúdo novo vem por URL novo). Sem dependências —
// ver docs/product/design/lb-27-pwa-instalavel-android.md.
const VERSION = "v1";
const SHELL_CACHE = `lembr8-shell-${VERSION}`;
const STATIC_CACHE = `lembr8-static-${VERSION}`;
const PRECACHE = [
  "/",
  "/login",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network-only — nunca cache

  if (req.mode === "navigate") {
    // Navegações: network-first com fallback ao cache (última shell
    // visitada; última instância: "/"). Offline abre o shell do app.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  // Imutáveis (hash no URL) e ícones: cache-first com preenchimento runtime.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
