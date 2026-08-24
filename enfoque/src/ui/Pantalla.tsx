import type { ReactNode } from 'react'

interface Props {
  titulo?: string
  children: ReactNode
}

/** Contenedor de ancho cómodo, centrado, pensado primero para el teléfono. */
export function Pantalla({ titulo, children }: Props) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-6">
      {titulo !== undefined && (
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">{titulo}</h1>
      )}
      {children}
    </main>
  )
}
