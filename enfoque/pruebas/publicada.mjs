/**
 * Comprueba que la versión compilada funcione servida bajo un subdirectorio,
 * como la sirve GitHub Pages. Una ruta base mal puesta no rompe la
 * compilación: rompe la aplicación ya publicada, y solo se nota al abrirla
 * en el teléfono.
 */
import { chromium } from 'playwright-core'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = process.argv[2] ?? 'http://127.0.0.1:4180/Memorias/cognitiva/'

const errores = []
const fallos404 = []
const navegador = await chromium.launch({ executablePath: CHROME })
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } })
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
pagina.on('response', (r) => { if (r.status() >= 400) fallos404.push(`${r.status()} ${r.url()}`) })

await pagina.goto(URL, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(800)

const revisar = (etiqueta, condicion) =>
  console.log(`${condicion ? 'OK  ' : 'FALLA'} · ${etiqueta}`)

revisar('la aplicación carga desde el subdirectorio',
  await pagina.getByRole('button', { name: 'Empezar sesión' }).isVisible())
revisar('ningún recurso falta', fallos404.length === 0)
if (fallos404.length > 0) console.log('   ', fallos404.join('\n    '))

const manifiesto = await pagina.evaluate(async () => {
  const enlace = document.querySelector('link[rel="manifest"]')
  if (!enlace) return null
  return (await fetch(enlace.href)).json()
})
revisar('el manifiesto apunta al subdirectorio',
  manifiesto?.start_url === '/Memorias/cognitiva/')
revisar('la aplicación se puede instalar', manifiesto?.display === 'standalone')
revisar('sin errores de consola', errores.length === 0)
if (errores.length > 0) console.log('   ', errores.join('\n    '))

await navegador.close()
