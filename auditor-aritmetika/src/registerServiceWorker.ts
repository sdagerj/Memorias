/**
 * Registra el service worker que deja la app disponible sin conexion.
 *
 * Solo en produccion: en desarrollo un SW cacheando el bundle estorba mas de lo
 * que ayuda. Si el navegador no lo soporta o el registro falla, la app funciona
 * igual — simplemente pierde el modo offline.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  // Al abrir el HTML de un solo archivo (file://) no hay SW posible.
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;

  window.addEventListener('load', () => {
    const url = new URL('sw.js', window.location.href);
    navigator.serviceWorker.register(url, { scope: './' }).catch((error) => {
      console.info('Service worker no registrado; la app sigue funcionando en linea.', error);
    });
  });
}
