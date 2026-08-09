// Service worker: permite que la app funcione sin conexión (offline).
const CACHE = 'memorias-v28';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/geo.js',
  './js/book.js',
  './js/voice.js',
  './js/essence.js',
  './js/numero.js',
  './js/rss.js',
  './js/claude-api.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/elnumero-logo.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // No cacheamos llamadas a la red de terceros (p. ej. el geocodificador).
  if (url.origin !== self.location.origin) return;

  // Network-first: si hay internet, usamos siempre la versión más reciente
  // (así las actualizaciones llegan sin quedarse pegadas en una versión vieja);
  // si no hay conexión, caemos al caché para seguir funcionando sin internet.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
