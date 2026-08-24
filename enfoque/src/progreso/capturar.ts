/**
 * Convierte una gráfica de la pantalla en una imagen PNG para el PDF.
 *
 * Recharts dibuja en SVG y jsPDF necesita un mapa de bits. El paso delicado
 * es que el SVG usa variables CSS (`var(--color-serie-1)`) que existen en el
 * documento pero no dentro de una imagen aislada: al serializarlo tal cual,
 * la gráfica saldría sin colores. Por eso se resuelven las variables contra
 * los estilos calculados antes de serializar.
 */

const VARIABLES = [
  '--color-serie-1',
  '--color-serie-2',
  '--color-serie-3',
  '--color-serie-4',
  '--color-referencia',
  '--color-borde',
  '--color-texto',
  '--color-texto-suave',
  '--color-texto-tenue',
  '--color-superficie',
  '--color-fondo',
  '--color-acento',
]

function resolverVariables(svg: string): string {
  const estilos = getComputedStyle(document.documentElement)
  let salida = svg
  for (const variable of VARIABLES) {
    const valor = estilos.getPropertyValue(variable).trim()
    if (valor === '') continue
    salida = salida.split(`var(${variable})`).join(valor)
  }
  return salida
}

export interface Captura {
  imagen: string
  anchoPx: number
  altoPx: number
}

/**
 * Rasteriza el primer SVG que haya dentro del elemento indicado.
 * Devuelve `null` si el elemento no existe o no contiene una gráfica.
 */
export async function capturarGrafica(idContenedor: string, escala = 2): Promise<Captura | null> {
  const contenedor = document.getElementById(idContenedor)
  const svg = contenedor?.querySelector('svg')
  if (!svg) return null

  const ancho = svg.clientWidth || Number(svg.getAttribute('width')) || 600
  const alto = svg.clientHeight || Number(svg.getAttribute('height')) || 240

  const copia = svg.cloneNode(true) as SVGSVGElement
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copia.setAttribute('width', String(ancho))
  copia.setAttribute('height', String(alto))

  const fuente = resolverVariables(new XMLSerializer().serializeToString(copia))
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fuente)}`

  const imagen = await cargarImagen(url)
  if (!imagen) return null

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const contexto = lienzo.getContext('2d')
  if (!contexto) return null

  // Fondo blanco: sin él, el PNG sale transparente y en el PDF se ve sucio.
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, lienzo.width, lienzo.height)
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)

  return {
    imagen: lienzo.toDataURL('image/png'),
    anchoPx: lienzo.width,
    altoPx: lienzo.height,
  }
}

function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolver) => {
    const imagen = new Image()
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => resolver(null)
    imagen.src = url
  })
}
