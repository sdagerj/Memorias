/**
 * Service worker: deja la app disponible sin conexion.
 *
 * Estrategia por tipo de recurso:
 *  - Navegacion (el HTML): red primero, cache como respaldo. Asi un despliegue
 *    nuevo se ve de inmediato, pero la app sigue abriendo sin internet.
 *  - Assets con hash en el nombre (JS, CSS, iconos): cache primero. Su nombre
 *    cambia en cada build, asi que nunca sirven contenido viejo.
 *
 * No hay nada que sincronizar ni ningun dato que subir: los archivos Excel se
 * procesan en el navegador y nunca salen del dispositivo.
 */

const CACHE = 'auditor-aritmetika-v1';

self.addEventListener('install', (event) => {
  // La app es un solo bundle; se cachea sola en el primer uso.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Sin red y sin copia: al menos devolvemos la raiz si esta cacheada.
    const fallback = await cache.match('./');
    if (fallback) return fallback;
    throw new Error('Sin conexion y sin copia local de la app.');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
