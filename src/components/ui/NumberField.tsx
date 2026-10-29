import { useState } from 'react'

interface NumberFieldProps {
  /** Valor interno (por exemplo, a escala 0,5). */
  value: number
  /** Multiplicador entre o valor interno e o exibido (100 para mostrar 0,5 como 50 %). */
  factor: number
  decimals: number
  unit: string
  /** Mostra "+" em valores positivos (deslocamentos). */
  signed: boolean
  /** Passo das setas do teclado, no valor interno. */
  step: number
  label: string
  disabled?: boolean
  onCommit(value: number): void
}

/**
 * Campo numérico para ajustes precisos, no formato brasileiro (vírgula decimal).
 * O texto só é aplicado ao confirmar (Enter ou ao sair do campo); um valor inválido volta ao atual.
 * Os limites são aplicados por quem recebe o valor, que é a mesma lógica dos sliders.
 */
export function NumberField({ value, factor, decimals, unit, signed, step, label, disabled, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const format = (input: number) => {
    const shown = Number((input * factor).toFixed(decimals))
    const text = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
      shown === 0 ? 0 : shown,
    )
    return signed && shown > 0 ? `+${text}` : text
  }

  const commit = () => {
    if (draft !== null) {
      const parsed = Number(draft.replace(/\s|\+/g, '').replace(',', '.'))
      if (draft.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed / factor)
    }
    setDraft(null)
  }

  return (
    <span className={`number-field${disabled ? ' number-field--disabled' : ''}`}>
      <input
        className="number-field__input"
        value={draft ?? format(value)}
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        aria-label={label}
        onFocus={(event) => {
          setDraft(format(value))
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            onCommit(value + (event.key === 'ArrowUp' ? step : -step) * (event.shiftKey ? 10 : 1))
            // Sem rascunho, o campo mostra o valor já corrigido pelos limites.
            setDraft(null)
          }
        }}
      />
      <span className="number-field__unit" aria-hidden="true">
        {unit}
      </span>
    </span>
  )
}
