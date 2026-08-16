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

self.addEventListener("push", (event) => {
  let data = { title: "Shift Ops", body: "" };
  try {
    data = event.data.json();
  } catch {
    // no-op: fall back to the default above if the payload isn't JSON
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Shift Ops", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/my-shift" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/my-shift";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
