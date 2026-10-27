import { useId, useState } from 'react'
import { isCompleteHexColor, parseHexColor } from '../../lib/color'

interface HexColorFieldProps {
  /** Cor atual em "#rrggbb". */
  value: string
  onChange(value: string): void
  label: string
}

const toDisplay = (hex: string) => hex.slice(1).toUpperCase()

/**
 * Campo de código hexadecimal sincronizado com a cor atual.
 * Enquanto o usuário digita, seis dígitos válidos já aplicam a cor; a forma curta (F00) e
 * entradas incompletas só são resolvidas ao confirmar. Um código inválido volta à cor atual.
 */
export function HexColorField({ value, onChange, label }: HexColorFieldProps) {
  const id = useId()
  // Texto em edição; null quando o campo apenas mostra a cor atual.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? toDisplay(value)
  const invalid = draft !== null && draft !== '' && parseHexColor(draft) === null

  const commit = () => {
    const parsed = draft === null ? null : parseHexColor(draft)
    if (parsed) onChange(parsed)
    setDraft(null)
  }

  return (
    <div className="hex-field">
      <div className={`hex-field__box${invalid ? ' hex-field__box--invalid' : ''}`}>
        <label htmlFor={id} className="visually-hidden">
          {label}
        </label>
        <span className="hex-field__prefix" aria-hidden="true">
          #
        </span>
        <input
          id={id}
          className="hex-field__input"
          value={shown}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="characters"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onFocus={(event) => {
            setDraft(shown)
            event.currentTarget.select()
          }}
          onChange={(event) => {
            const next = event.target.value.replace(/^#/, '').toUpperCase()
            setDraft(next)
            if (isCompleteHexColor(next)) onChange(parseHexColor(next)!)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            // Esc descarta a edição e volta a mostrar a cor atual.
            if (event.key === 'Escape') setDraft(toDisplay(value))
          }}
        />
      </div>
      {invalid && (
        <span id={`${id}-error`} className="hex-field__error">
          Use 3 ou 6 dígitos hexadecimais, como FF0000.
        </span>
      )}
    </div>
  )
}
