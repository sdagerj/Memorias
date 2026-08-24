import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tono = 'principal' | 'secundario' | 'discreto'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tono?: Tono
  ancho?: boolean
  children: ReactNode
}

const ESTILOS: Record<Tono, string> = {
  principal:
    'bg-acento text-white border border-transparent active:bg-[#3f6b60]',
  secundario:
    'bg-superficie text-texto border border-borde active:bg-[#f2efe9]',
  discreto:
    'bg-transparent text-texto-suave border border-transparent active:bg-[#f2efe9]',
}

export function Boton({ tono = 'principal', ancho = false, className = '', ...resto }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center gap-2 rounded-suave',
        'px-6 py-4 text-[1.0625rem] font-medium',
        'transition-colors disabled:opacity-40',
        ancho ? 'w-full' : '',
        ESTILOS[tono],
        className,
      ].join(' ')}
      {...resto}
    />
  )
}
