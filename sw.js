const CACHE = "browserdroid-shell-v4";
const ASSETS = ["./","./index.html","./manifest.webmanifest","./src/styles.css","./src/main.js","./src/db.js","./assets/icon-192.png","./assets/icon-512.png","./assets/apple-touch-icon.png","./assets/favicon-32.png","./diagnostics.html","./lab.html","./src/diagnostics.js","./src/diag-worker.js","./src/diagnostics.css","./src/lab.js"];

// Hosts such as Cloudflare redirect /page.html -> /page. A response with redirected=true must never be served to a navigation
// (browsers reject it), so rebuild it as a plain response (headers, including COOP/COEP, are preserved).
const clean = async (r) => (r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(ASSETS.map(async (a) => {
    const r = await fetch(a, { cache: "reload" });
    if (r.ok) await cache.put(a, await clean(r));
  }))));
});
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/engine/") || url.pathname.includes("/vendor/")) return; // large engine artifacts: network/HTTP cache only
  // Page navigations: always let the network (and its redirects/headers) win; fall back to cache only when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match(url.pathname.endsWith("/") ? "./index.html" : url.pathname.replace(/^\//, "./") + (url.pathname.endsWith(".html") ? "" : ".html"))) || (await caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(async (response) => {
    if (response.ok && /\.(js|css|svg)$/.test(url.pathname)) { const copy = await clean(response.clone()); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return response;
  })));
});
