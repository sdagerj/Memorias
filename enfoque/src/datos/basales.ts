/**
 * Valores basales de la evaluación neuropsicológica de septiembre de 2025.
 *
 * Sirven como línea de referencia en las gráficas: la comparación es contra
 * el propio punto de partida, no contra promedios ni percentiles de nadie
 * más. Esa decisión es deliberada y no debe cambiarse sin motivo clínico.
 *
 * Advertencia que también aparece en la aplicación y en el PDF: los puntajes
 * de esta herramienta NO son equivalentes a los de las pruebas normalizadas
 * que aplicó la profesional. Las condiciones de aplicación son distintas
 * (autoaplicada, en casa, con voz sintética). Sirven para ver tendencia
 * propia a lo largo del tiempo, no para reemplazar una medición.
 */

export const FECHA_BASAL = '2025-09-01'

export interface Basal {
  dominio: string
  etiqueta: string
  valor: number
  unidad: string
  /** Nota que aparece junto a la línea de referencia. */
  nota: string
}

export const BASALES: Basal[] = [
  {
    dominio: 'fluidez-semantica',
    etiqueta: 'Fluidez semántica',
    valor: 18,
    unidad: 'palabras',
    nota: 'Límite inferior para su nivel educativo.',
  },
  {
    dominio: 'fluidez-fonologica',
    etiqueta: 'Fluidez fonológica',
    valor: 14,
    unidad: 'palabras',
    nota: 'Límite inferior para su nivel educativo.',
  },
  {
    dominio: 'digitos-directos',
    etiqueta: 'Dígitos en orden directo',
    valor: 5,
    unidad: 'dígitos',
    nota: 'Dentro de lo esperado.',
  },
  {
    dominio: 'digitos-inversos',
    etiqueta: 'Dígitos en orden inverso',
    valor: 3.5,
    unidad: 'dígitos',
    nota: 'Por debajo de lo esperado para su edad y escolaridad.',
  },
]

export function basalDe(dominio: string): Basal | undefined {
  return BASALES.find((b) => b.dominio === dominio)
}

export const AVISO_CLINICO =
  'Esta herramienta es un apoyo de práctica personal. No es un instrumento ' +
  'diagnóstico. Sus puntajes no equivalen a los de las pruebas normalizadas ' +
  'aplicadas por un profesional, y no reemplaza la rehabilitación ' +
  'neuropsicológica supervisada ni el seguimiento médico.'
