// Service Worker — PesoDólar PWA
const CACHE = "pesodolar-v1";
const OFFLINE_URL = "/offline.html";

// Recursos a cachear en la instalación
const PRECACHE = ["/", OFFLINE_URL];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Llamadas a la API: network-first, sin caché (datos siempre frescos)
  if (url.pathname.startsWith("/api")) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Sin conexión" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // App shell: cache-first para navegación rápida
  e.respondWith(
    caches.match(request).then(
      (cached) => cached ?? fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
  );
});
