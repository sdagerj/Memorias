import type { ReactNode } from 'react'

interface Props {
  titulo?: string
  /** Frase bajo el título. Opcional y siempre corta. */
  entrada?: string
  children: ReactNode
}

/** Contenedor de ancho cómodo, centrado, pensado primero para el teléfono. */
export function Pantalla({ titulo, entrada, children }: Props) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-24 pt-9">
      {titulo !== undefined && (
        <header className="mb-7">
          <h1>{titulo}</h1>
          {entrada !== undefined && (
            <p className="mt-2 text-[1.0625rem] text-texto-tenue">{entrada}</p>
          )}
        </header>
      )}
      {children}
    </main>
  )
}
