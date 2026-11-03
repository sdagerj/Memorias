// Enfoque se mudó a https://sdagerj.github.io/Enfoque/.
// Este service worker reemplaza al anterior, borra su caché y se retira.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys()
    await Promise.all(nombres.filter((n) => n.includes('/Memorias/cognitiva/')).map((n) => caches.delete(n)))
    await self.registration.unregister()
    const ventanas = await self.clients.matchAll({ type: 'window' })
    ventanas.forEach((v) => v.navigate('https://sdagerj.github.io/Enfoque/'))
  })())
})
