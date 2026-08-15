// Minimal app-shell service worker. Keeps the install-to-home-screen
// promise (works offline enough to open) without trying to cache every
// dynamic server-rendered route -- data freshness matters more here than
// aggressive caching. The client-side offline queue (see offlineQueue.ts)
// is what actually protects quick-add/task-complete writes.
const CACHE = "shift-ops-shell-v1";
const SHELL_URLS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache/interfere with mutations
  if (SHELL_URLS.some((u) => req.url.endsWith(u))) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
  }
});
