/**
 * Informe en PDF para llevar a consulta.
 *
 * Se arma en el navegador, sin servidor. Incluye siempre la advertencia
 * sobre el alcance de estos puntajes: el informe puede terminar en una
 * historia clínica y no debe leerse como si fueran resultados de pruebas
 * normalizadas.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ResultadoEjercicio, RegistroDiario } from '../datos/db'
import { resumenConDatos } from './resumen'
import { rangoDeFechas } from './series'
import { AVISO_CLINICO, FECHA_BASAL } from '../datos/basales'

const MARGEN = 40

/**
 * Estilo compartido de las tablas.
 *
 * El color del texto se fija de forma explícita en vez de heredar el valor
 * por defecto de la librería: la regla de que en esta aplicación no aparece
 * el rojo por ninguna parte no puede quedar a merced de un valor por defecto
 * que cambie en una actualización.
 */
const ESTILO_TABLA = {
  styles: { fontSize: 9, cellPadding: 5, textColor: [44, 41, 38] as [number, number, number] },
  headStyles: {
    fillColor: [74, 124, 111] as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
  },
  alternateRowStyles: { fillColor: [250, 248, 245] as [number, number, number] },
}

export interface ContenidoInforme {
  resultados: ResultadoEjercicio[]
  diario: RegistroDiario[]
  /** Gráficas ya rasterizadas, en formato `data:image/png`. */
  graficas: Array<{ titulo: string; imagen: string; anchoPx: number; altoPx: number }>
}

function textoEnvuelto(doc: jsPDF, texto: string, y: number, tamano = 9): number {
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2
  doc.setFontSize(tamano)
  const lineas = doc.splitTextToSize(texto, ancho)
  doc.text(lineas, MARGEN, y)
  return y + lineas.length * (tamano + 2)
}

export function generarInforme(contenido: ContenidoInforme): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const anchoUtil = doc.internal.pageSize.getWidth() - MARGEN * 2

  doc.setFontSize(18)
  doc.text('Enfoque — informe de práctica cognitiva', MARGEN, 60)

  doc.setFontSize(10)
  doc.setTextColor(90)
  let y = 80
  y = textoEnvuelto(doc, `Periodo: ${rangoDeFechas(contenido.resultados)}`, y, 10)
  y = textoEnvuelto(doc, `Generado el ${new Date().toLocaleDateString('es-CO')}`, y, 10)
  y = textoEnvuelto(doc, `Sesiones registradas: ${contarSesiones(contenido.resultados)}`, y, 10)

  y += 8
  doc.setDrawColor(220)
  doc.line(MARGEN, y, MARGEN + anchoUtil, y)
  y += 16

  doc.setTextColor(60)
  y = textoEnvuelto(doc, AVISO_CLINICO, y, 8.5)
  y += 14

  doc.setTextColor(0)
  doc.setFontSize(13)
  doc.text('Resumen por dominio', MARGEN, y)
  y += 8

  const filas = resumenConDatos(contenido.resultados)
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    head: [[
      'Dominio',
      'Unidad',
      'Primera',
      'Última',
      'Mejor',
      `Basal ${FECHA_BASAL.slice(0, 7)}`,
      'Sesiones',
    ]],
    body: filas.map((fila) => [
      fila.etiqueta,
      fila.unidad,
      formatear(fila.primero),
      formatear(fila.ultimo),
      formatear(fila.mejor),
      formatear(fila.basal),
      String(fila.sesiones),
    ]),
    ...ESTILO_TABLA,
  })

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  y += 10
  doc.setFontSize(8)
  doc.setTextColor(120)
  y = textoEnvuelto(
    doc,
    'La columna basal corresponde a la evaluación neuropsicológica de septiembre de 2025. ' +
      'Los demás valores provienen de esta aplicación, autoaplicada y con presentación por voz ' +
      'sintética, por lo que no son directamente comparables con la prueba original.',
    y,
    8,
  )

  for (const grafica of contenido.graficas) {
    doc.addPage()
    doc.setTextColor(0)
    doc.setFontSize(13)
    doc.text(grafica.titulo, MARGEN, 60)
    const alto = (grafica.altoPx / grafica.anchoPx) * anchoUtil
    doc.addImage(grafica.imagen, 'PNG', MARGEN, 80, anchoUtil, alto)
  }

  if (contenido.diario.length > 0) {
    doc.addPage()
    doc.setTextColor(0)
    doc.setFontSize(13)
    doc.text('Registro diario', MARGEN, 60)
    autoTable(doc, {
      startY: 76,
      margin: { left: MARGEN, right: MARGEN },
      head: [['Fecha', 'Energía', 'Sueño', 'Niebla mental', 'Nota']],
      body: contenido.diario.map((d) => [
        d.fecha,
        String(d.energia),
        String(d.sueno),
        String(d.niebla),
        d.nota,
      ]),
      ...ESTILO_TABLA,
    })
  }

  numerarPaginas(doc)
  return doc
}

function numerarPaginas(doc: jsPDF): void {
  const total = doc.getNumberOfPages()
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `${pagina} de ${total}`,
      doc.internal.pageSize.getWidth() - MARGEN,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' },
    )
  }
}

function formatear(valor: number | null): string {
  if (valor === null) return '—'
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}

function contarSesiones(resultados: ResultadoEjercicio[]): number {
  return new Set(resultados.map((r) => r.sesionId)).size
}

export function nombreArchivoInforme(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `enfoque-informe-${hoy.getFullYear()}-${mes}-${dia}.pdf`
}
