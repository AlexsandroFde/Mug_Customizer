import { useId, type ReactNode } from 'react'

interface GroupProps {
  title: string
  /** Conteúdo à direita do título (um valor resumido ou uma ação pequena). */
  aside?: ReactNode
  children: ReactNode
}

/** Grupo de controles com título discreto, usado para organizar cada aba do painel. */
export function Group({ title, aside, children }: GroupProps) {
  const id = useId()
  return (
    <section className="group" aria-labelledby={id}>
      <div className="group__header">
        <h3 id={id} className="group__title">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
