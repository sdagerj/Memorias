import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function Tarjeta({ children, className = '' }: Props) {
  return (
    <section
      className={[
        'rounded-suave border border-borde',
        'bg-superficie p-5',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}
