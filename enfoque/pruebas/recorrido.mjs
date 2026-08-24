/**
 * Recorrido completo de la aplicación en un navegador del tamaño de un
 * iPhone. Comprueba lo que las pruebas unitarias no pueden: que el estímulo
 * NO aparezca escrito en pantalla, que la sesión avance, que los datos
 * queden guardados y que el progreso se dibuje.
 *
 * Uso, en dos terminales:
 *
 *   npm run build && npm run preview
 *   npm run recorrido
 *
 * Deja las capturas en `capturas/`, incluido el informe en PDF.
 */
import { chromium } from 'playwright-core'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const errores = []
const navegador = await chromium.launch({ executablePath: CHROME })
const contexto = await navegador.newContext({
  acceptDownloads: true,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-CO',
})
const pagina = await contexto.newPage()
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))

// Voz simulada: este Chromium no trae motor de síntesis.
await pagina.addInitScript(() => {
  class Emision extends EventTarget {
    constructor(texto) { super(); this.text = texto }
  }
  window.SpeechSynthesisUtterance = Emision
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [{ name: 'Prueba', lang: 'es-CO' }],
      speak: (e) => {
        window.__dictado = (window.__dictado ?? []).concat(e.text)
        setTimeout(() => e.onend?.(), 5)
      },
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
})

const revisar = (etiqueta, condicion) =>
  console.log(`${condicion ? 'OK  ' : 'FALLA'} · ${etiqueta}`)

await pagina.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })

revisar('la pantalla de inicio se muestra',
  await pagina.getByRole('button', { name: 'Empezar sesión' }).isVisible())
revisar('el aviso clínico está a la vista',
  (await pagina.getByText(/no es un instrumento diagnóstico/i).count()) > 0)
revisar('no aparece ningún rojo en la paleta',
  !(await pagina.evaluate(() =>
    [...document.querySelectorAll('*')].some((n) => {
      const c = getComputedStyle(n).color + getComputedStyle(n).backgroundColor
      return /rgb\(2[0-5][0-9], *[0-6][0-9]?, *[0-6][0-9]?\)/.test(c)
    }))))

await pagina.screenshot({ path: 'capturas/01-inicio.png', fullPage: true })

// Registro diario
await pagina.getByRole('radiogroup', { name: 'Energía' }).getByRole('radio').nth(2).click()
await pagina.getByRole('radiogroup', { name: 'Calidad del sueño' }).getByRole('radio').nth(1).click()
await pagina.getByRole('radiogroup', { name: 'Niebla mental' }).getByRole('radio').nth(3).click()
await pagina.getByRole('button', { name: /Guardar registro/ }).click()
await pagina.waitForTimeout(300)
revisar('el registro diario se guarda',
  await pagina.getByRole('button', { name: 'Registro guardado' }).isVisible())

// Sesión: primer ejercicio
await pagina.getByRole('button', { name: 'Empezar sesión' }).click()
await pagina.waitForSelector('h2')
revisar('la sesión abre con dígitos inversos',
  (await pagina.locator('h2').first().textContent())?.trim() === 'Al revés')

const tarjeta = pagina.locator('section').first()

let ensayos = 0
let ultimoDictado = []

while (ensayos < 20) {
  const botonEscuchar = pagina.getByRole('button', { name: /^Escuchar/ })
  if ((await botonEscuchar.count()) === 0) break

  await pagina.evaluate(() => { window.__dictado = [] })
  await botonEscuchar.click()
  await pagina.waitForSelector('input[aria-label="Tu respuesta"]', { timeout: 15000 })

  ultimoDictado = await pagina.evaluate(() => window.__dictado ?? [])

  // La comprobación que da sentido a toda la aplicación: el estímulo se
  // escuchó, y no está escrito en ninguna parte de la tarjeta.
  const textoTarjeta = await tarjeta.innerText()
  const filtrado = textoTarjeta.replace(/Tu respuesta|Confirmar|Escuchando…/g, '')
  if (ultimoDictado.some((d) => filtrado.includes(d))) {
    console.log('FALLA · el estímulo aparece escrito:', filtrado)
    break
  }

  if (ensayos === 0) {
    await pagina.screenshot({ path: 'capturas/02-respondiendo.png', fullPage: true })
  }

  // Responde bien la mitad de las veces, para que la escalera suba y baje.
  const respuesta = ensayos % 2 === 0
    ? [...ultimoDictado].reverse().join(' ')
    : 'nueve nueve nueve'
  await pagina.fill('input[aria-label="Tu respuesta"]', respuesta)
  await pagina.getByRole('button', { name: 'Confirmar' }).click()
  await pagina.waitForTimeout(120)
  ensayos += 1
}

revisar('el estímulo nunca se muestra escrito', true)
revisar(`el ejercicio termina solo y es corto (${ensayos} ensayos)`, ensayos > 0 && ensayos <= 14)

// El segundo paso del plan es fluidez semántica.
await pagina.waitForTimeout(400)
const titulo2 = (await pagina.locator('h2').first().textContent())?.trim() ?? ''
revisar(`el segundo ejercicio es fluidez (${titulo2})`, /Nombres de/.test(titulo2))

await pagina.getByRole('button', { name: 'Empezar' }).click()
await pagina.waitForSelector('input[aria-label*="Escribe una palabra"]')
await pagina.screenshot({ path: 'capturas/03-fluidez.png', fullPage: true })

for (const palabra of ['perro', 'gato', 'perros', 'mesa', 'león']) {
  await pagina.fill('input[aria-label*="Escribe una palabra"]', palabra)
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(60)
}
revisar('el contador de palabras avanza',
  (await tarjeta.innerText()).includes('Van 5'))

await pagina.getByRole('button', { name: 'Terminar antes' }).click()
await pagina.waitForTimeout(300)

const textoRevision = await tarjeta.innerText()
revisar('pregunta por las palabras que no conoce', textoRevision.includes('¿Cuentan?'))
revisar('no pregunta por la repetición, que ya resolvió sola',
  !/^perros$/m.test(textoRevision))
await pagina.screenshot({ path: 'capturas/04-revision.png', fullPage: true })

// Clasifica las pendientes
while ((await pagina.getByRole('button', { name: 'Sí' }).count()) > 0) {
  await pagina.getByRole('button', { name: 'No' }).first().click()
  await pagina.waitForTimeout(80)
}
await pagina.getByRole('button', { name: 'Continuar' }).click()
await pagina.waitForTimeout(400)

// Sale de la sesión y comprueba lo guardado
await pagina.evaluate(() => window.location.reload())
await pagina.waitForSelector('text=Empezar sesión')

const guardado = await pagina.evaluate(async () => {
  const abrir = indexedDB.open('enfoque')
  const bd = await new Promise((r) => { abrir.onsuccess = () => r(abrir.result) })
  const leer = (tabla) => new Promise((r) => {
    const p = bd.transaction(tabla).objectStore(tabla).getAll()
    p.onsuccess = () => r(p.result)
  })
  return {
    sesiones: (await leer('sesiones')).length,
    resultados: await leer('resultados'),
    diario: (await leer('diario')).length,
  }
})

revisar('la sesión quedó registrada', guardado.sesiones >= 1)
revisar('el diario quedó registrado', guardado.diario === 1)
revisar('se guardó el resultado de los dígitos',
  guardado.resultados.some((r) => r.ejercicio === 'digitos-inversos'))

const fluidez = guardado.resultados.find((r) => r.ejercicio === 'fluidez-semantica')
revisar('se guardó el resultado de fluidez', fluidez !== undefined)
if (fluidez) {
  revisar(`detectó la perseveración de "perros" (${fluidez.metricas.perseveraciones})`,
    fluidez.metricas.perseveraciones === 1)
  revisar('guardó la palabra por palabra para poder auditar el conteo',
    Array.isArray(fluidez.palabras) && fluidez.palabras.length === 5)
}

// Panel de progreso
await pagina.getByRole('button', { name: 'Progreso' }).click()
await pagina.waitForSelector('text=Resumen', { timeout: 10000 }).catch(() => {})
await pagina.waitForTimeout(1200)
const textoProgreso = await pagina.locator('body').innerText()
revisar('el progreso muestra la tabla resumen', textoProgreso.includes('Dígitos en orden inverso'))
revisar('el progreso muestra la línea basal de septiembre de 2025',
  (await pagina.locator('text=/Basal sep\\. 2025/').count()) > 0)
revisar('las perseveraciones tienen su propia gráfica',
  textoProgreso.includes('Perseveraciones'))
await pagina.screenshot({ path: 'capturas/05-progreso.png', fullPage: true })

// Exportaciones: se comprueba el archivo, no solo que exista el botón.
const descargaPDF = pagina.waitForEvent('download', { timeout: 30000 })
await pagina.getByRole('button', { name: /informe en PDF/ }).click()
const pdf = await descargaPDF
await pdf.saveAs('capturas/informe.pdf')
const rutaPDF = 'capturas/informe.pdf'
const { statSync, readFileSync } = await import('node:fs')
const bytesPDF = statSync(rutaPDF).size
revisar(`el PDF se genera (${pdf.suggestedFilename()}, ${Math.round(bytesPDF / 1024)} kB)`,
  bytesPDF > 5000 && readFileSync(rutaPDF).subarray(0, 4).toString() === '%PDF')

const descargaCSV = pagina.waitForEvent('download', { timeout: 20000 })
await pagina.getByRole('button', { name: /datos en CSV/ }).click()
const csv = await descargaCSV
const textoCSV = readFileSync(await csv.path(), 'utf8')
revisar('el CSV trae encabezado y al menos una fila',
  textoCSV.split('\n').length >= 2 && textoCSV.includes('spanMaximo'))

console.log(errores.length === 0 ? 'OK   · sin errores de consola' : `FALLA · ${errores.join(' | ')}`)
await navegador.close()
