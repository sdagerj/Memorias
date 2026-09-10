import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tono = 'principal' | 'secundario' | 'discreto'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tono?: Tono
  ancho?: boolean
  children: ReactNode
}

const ESTILOS: Record<Tono, string> = {
  principal:
    'bg-acento text-white border border-transparent shadow-[var(--shadow-realce)] active:bg-acento-hondo active:shadow-none',
  secundario:
    'bg-superficie text-texto border border-borde shadow-[var(--shadow-tarjeta)] active:bg-[#f1ece4] active:shadow-none',
  discreto:
    'bg-transparent text-texto-suave border border-transparent active:bg-[#efe9e1]',
}

export function Boton({ tono = 'principal', ancho = false, className = '', ...resto }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center gap-2 rounded-suave',
        'py-4 text-[1.125rem] font-semibold tracking-[-0.01em] text-balance',
        'transition-all duration-150 active:scale-[0.985]',
        'disabled:opacity-35 disabled:shadow-none disabled:active:scale-100',
        ancho ? 'w-full px-4' : 'px-7',
        ESTILOS[tono],
        className,
      ].join(' ')}
      {...resto}
    />
  )
}
