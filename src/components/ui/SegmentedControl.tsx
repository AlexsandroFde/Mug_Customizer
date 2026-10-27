import type { KeyboardEvent, ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Texto para leitores de tela e dica ao passar o mouse, quando o rótulo visível for curto. */
  description?: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  /** Opção marcada; null quando o estado atual não corresponde a nenhuma delas. */
  value: T | null
  onChange(value: T): void
}

/** Grupo de opções exclusivas, navegável pelas setas do teclado (padrão de "radio group"). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const enabled = options.filter((option) => !option.disabled)
  const checkedOption = enabled.find((option) => option.value === value)
  // Sempre há exatamente uma opção alcançável pelo Tab.
  const tabStop = checkedOption ?? enabled[0]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step || enabled.length === 0) return
    event.preventDefault()
    const index = enabled.findIndex((option) => option.value === (checkedOption ?? tabStop).value)
    const next = enabled[(index + step + enabled.length) % enabled.length]
    onChange(next.value)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={option.value === value}
          // Rótulos que não são texto (ícones) recebem a descrição como nome acessível.
          aria-label={typeof option.label === 'string' ? undefined : option.description}
          title={option.description}
          tabIndex={option === tabStop ? 0 : -1}
          disabled={option.disabled}
          className="segmented__option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
