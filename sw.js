const CACHE = "browserdroid-shell-v3";
const ASSETS = ["./","./index.html","./manifest.webmanifest","./src/styles.css","./src/main.js","./src/db.js","./assets/icon-192.png","./assets/icon-512.png","./assets/apple-touch-icon.png","./assets/favicon-32.png","./diagnostics.html","./lab.html","./src/diagnostics.js","./src/diag-worker.js","./src/diagnostics.css","./src/lab.js"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // Large engine artifacts are fetched straight from the network (HTTP cache handles them); keep them out of the shell cache.
  if (url.pathname.includes("/engine/") || url.pathname.includes("/vendor/")) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    if (response.ok && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".svg"))) {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});