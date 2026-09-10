import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Tarjeta({ children, className = '' }: Props) {
  return (
    <section
      className={[
        'rounded-hondo border border-borde-suave bg-superficie',
        'p-6 shadow-[var(--shadow-tarjeta)]',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}
