import type { ReactNode } from 'react'

interface Props {
  titulo: string
  instruccion?: string
  children: ReactNode
}

/**
 * Escenario de un ejercicio.
 *
 * A diferencia del resto de la aplicación, aquí no hay tarjeta, ni borde, ni
 * sombra: el contenido flota sobre el fondo, centrado en la pantalla. El
 * principio de un elemento a la vez no es solo no mostrar dos ejercicios
 * juntos; es que tampoco compita el marco que los rodea.
 */
export function Escena({ titulo, instruccion, children }: Props) {
  return (
    <div
      /* Anclaje estable para la prueba de recorrido, que comprueba que el
         estímulo dictado no aparezca escrito dentro de esta zona. */
      data-zona="ejercicio"
      className="flex min-h-[68svh] flex-col items-center justify-center px-1 text-center"
    >
      <h2 className="max-w-sm">{titulo}</h2>
      {instruccion !== undefined && (
        <p className="mx-auto mt-4 max-w-[22rem] text-[1.125rem] leading-relaxed text-texto-suave">
          {instruccion}
        </p>
      )}
      <div className="mt-11 w-full">{children}</div>
    </div>
  )
}

interface PropsPuntos {
  total: number
  /** Índice del elemento en curso. Todos los anteriores quedan encendidos. */
  actual: number
  etiqueta: string
}

/** Avance del dictado. Nunca muestra los elementos, solo cuántos van. */
export function Puntos({ total, actual, etiqueta }: PropsPuntos) {
  return (
    <div aria-live="polite" aria-label={etiqueta}>
      <div className="flex justify-center gap-2.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={[
              'h-2.5 w-2.5 rounded-full transition-all duration-300',
              i <= actual ? 'scale-125 bg-acento' : 'scale-100 bg-borde',
            ].join(' ')}
          />
        ))}
      </div>
      <p className="mt-6 text-[1.0625rem] text-texto-tenue">{etiqueta}</p>
    </div>
  )
}

interface PropsCampo {
  /** `grande` para las series de dígitos, que se leen de un vistazo. */
  variante?: 'normal' | 'grande'
}

/** Clases del campo de respuesta, compartidas por los tres ejercicios. */
export function clasesCampo({ variante = 'normal' }: PropsCampo = {}): string {
  return [
    'w-full rounded-suave border-2 border-borde bg-superficie',
    'text-center transition-colors',
    'focus:border-acento-borde focus:outline-none',
    // El marcador de posición vuelve a la letra del sistema y a un
    // espaciado normal: la separación ancha está pensada para las cifras y
    // en una palabra se lee como un cartel de otra época.
    'placeholder:font-sans placeholder:tracking-normal placeholder:text-[1.125rem]',
    variante === 'grande'
      ? 'cifra px-4 py-5 text-[2.25rem] tracking-[0.16em]'
      : 'px-4 py-4 text-[1.3125rem] leading-relaxed',
  ].join(' ')
}
