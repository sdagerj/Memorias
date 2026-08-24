/**
 * Normalización de texto en español para comparar palabras entre sí.
 *
 * Es la base del detector de perseveraciones, que es el marcador clínico más
 * importante de esta aplicación. Por eso la lógica está aquí, aislada y
 * probada, y no repartida por la interfaz.
 *
 * Criterio acordado: `perro` y `perros` son la misma palabra. Se ignoran
 * mayúsculas, tildes, diéresis y espacios sobrantes. La `ñ` se conserva
 * porque en español distingue palabras (`año` no es `ano`).
 *
 * Lo que deliberadamente NO se hace: reducir diminutivos ni aumentativos.
 * `perro` y `perrito` se cuentan como palabras distintas. Un reductor de
 * diminutivos produce falsos positivos con demasiada frecuencia
 * (`bolso` / `bolsillo`, `cara` / `carita`) y aquí un falso positivo
 * significa un dato equivocado en un informe médico.
 */

/**
 * Palabras que terminan en -s o -es pero ya están en singular, o que son
 * invariables en plural. Sin esta lista, `jueves` se reduciría a `juev`.
 */
const INVARIABLES = new Set([
  // días de la semana
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes',
  // terminadas en -sis / -is
  'crisis', 'analisis', 'tesis', 'dosis', 'sintesis', 'diagnosis',
  'oasis', 'iris', 'bilis', 'tos',
  // invariables comunes
  'virus', 'campus', 'atlas', 'lapsus', 'caos', 'dios', 'mes', 'pais',
  // compuestas invariables
  'paraguas', 'parabrisas', 'sacacorchos', 'abrelatas', 'lavaplatos',
  'rascacielos', 'cumpleanos', 'ciempies', 'girasoles', 'limpiaparabrisas',
  'portaaviones', 'guardaespaldas', 'cascanueces', 'espantapajaros',
  // habitualmente usadas en plural
  'gafas', 'tijeras', 'pinzas', 'esposas', 'afueras', 'viveres', 'modales',
])

/** Plurales irregulares o ambiguos que conviene resolver a mano. */
const IRREGULARES = new Map<string, string>([
  ['pies', 'pie'],
  ['bueyes', 'buey'],
  ['reyes', 'rey'],
  ['leyes', 'ley'],
  ['convoyes', 'convoy'],
  ['jerseis', 'jersey'],
  ['clubes', 'club'],
  ['menus', 'menu'],
  ['sofas', 'sofa'],
  ['tabues', 'tabu'],
  ['bambues', 'bambu'],
  ['esquis', 'esqui'],
  ['jabalies', 'jabali'],
  ['colibries', 'colibri'],
  ['maniquies', 'maniqui'],
  ['rubies', 'rubi'],
  ['israelies', 'israeli'],
  ['caracteres', 'caracter'],
  ['regimenes', 'regimen'],
  ['especimenes', 'especimen'],
])

/**
 * Minúsculas, sin tildes ni diéresis, sin signos de puntuación y con un solo
 * espacio entre palabras. Conserva la `ñ`.
 *
 * `permitidos` define qué caracteres sobreviven además del espacio. Existe
 * porque hay dos necesidades distintas: al comparar palabras las cifras
 * estorban, pero al leer la respuesta de un ejercicio de dígitos las cifras
 * son justamente lo que hay que conservar.
 */
function limpiar(texto: string, permitidos: RegExp): string {
  return texto
    .normalize('NFD')
    // Quita los diacríticos combinantes salvo la virgulilla de la ñ (U+0303).
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(permitidos, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Forma comparable de una palabra. Descarta cifras y puntuación. */
export function normalizar(texto: string): string {
  return limpiar(texto, /[^a-z\u00f1\s]/g)
}

/** Como `normalizar`, pero conserva las cifras. Para leer respuestas. */
export function normalizarConCifras(texto: string): string {
  return limpiar(texto, /[^a-z\u00f10-9\s]/g)
}

/**
 * Reduce una sola palabra ya normalizada a su forma singular.
 * Conservador por diseño: ante la duda, devuelve la palabra sin tocar.
 */
function singularizarPalabra(palabra: string): string {
  if (palabra.length <= 3) return palabra
  if (INVARIABLES.has(palabra)) return palabra

  const irregular = IRREGULARES.get(palabra)
  if (irregular) return irregular

  // lapices → lapiz, peces → pez, luces → luz, raices → raiz
  if (palabra.endsWith('ces')) return `${palabra.slice(0, -3)}z`

  // flores → flor, papeles → papel, ratones → raton, autobuses → autobus
  if (palabra.endsWith('es') && palabra.length > 4) return palabra.slice(0, -2)

  // perros → perro, casas → casa
  if (palabra.endsWith('s')) return palabra.slice(0, -1)

  return palabra
}

/**
 * Forma canónica para comparar: normalizada y en singular.
 * Dos entradas con la misma raíz cuentan como la misma palabra.
 */
export function raiz(texto: string): string {
  const limpio = normalizar(texto)
  if (limpio === '') return ''
  return limpio.split(' ').map(singularizarPalabra).join(' ')
}

/** ¿Son la misma palabra para efectos de conteo de perseveraciones? */
export function sonLaMisma(a: string, b: string): boolean {
  const ra = raiz(a)
  return ra !== '' && ra === raiz(b)
}

/** Primera letra de la palabra ya normalizada; cadena vacía si no hay. */
export function primeraLetra(texto: string): string {
  return normalizar(texto).charAt(0)
}
