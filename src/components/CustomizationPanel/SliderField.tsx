import { useId, type CSSProperties, type ReactNode } from 'react'
import { snapValue } from '../../lib/printMapping'

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Valor restaurado com um duplo clique. */
  defaultValue: number
  format(value: number): string
  onChange(value: number): void
  /** Valores que "atraem" o controle durante o arraste, como o centro. */
  snapPoints?: readonly number[]
  snapDistance?: number
  disabled?: boolean
  /** Conteúdo extra ao lado do valor (por exemplo, um botão de atalho). */
  accessory?: ReactNode
  /** Valor de onde parte o preenchimento da trilha (o centro, em controles simétricos). */
  origin?: number
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  format,
  onChange,
  snapPoints,
  snapDistance = 0,
  disabled,
  accessory,
  origin = min,
}: SliderFieldProps) {
  const id = useId()
  const toPercent = (input: number) => ((input - min) / (max - min)) * 100
  const fillStart = Math.min(toPercent(origin), toPercent(value))
  const fillEnd = Math.max(toPercent(origin), toPercent(value))

  return (
    <div className="slider-field">
      <div className="slider-field__header">
        <label htmlFor={id} className="slider-field__label">
          {label}
        </label>
        <output htmlFor={id} className="slider-field__value">
          {format(value)}
        </output>
        {accessory}
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        title="Clique duas vezes para restaurar o valor padrão"
        style={{ '--fill-start': `${fillStart}%`, '--fill-end': `${fillEnd}%` } as CSSProperties}
        onChange={(event) => {
          const raw = Number(event.target.value)
          onChange(snapPoints ? snapValue(raw, snapDistance, snapPoints).value : raw)
        }}
        onDoubleClick={() => onChange(defaultValue)}
      />
    </div>
  )
}
