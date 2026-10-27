import { useId, type ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange(checked: boolean): void
  label: ReactNode
  /** Texto complementar abaixo do rótulo. */
  description?: ReactNode
  disabled?: boolean
}

/** Interruptor liga/desliga com rótulo clicável (padrão WAI-ARIA "switch"). */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const id = useId()
  return (
    <div className={`switch${disabled ? ' switch--disabled' : ''}`}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        className="switch__control"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
      <span className="switch__text">
        <label htmlFor={id} className="switch__label">
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="switch__description">
            {description}
          </span>
        )}
      </span>
    </div>
  )
}
