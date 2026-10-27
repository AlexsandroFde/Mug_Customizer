import { useId, type CSSProperties, type ReactNode } from 'react'
import { snapValue } from '../../lib/printMapping'
import { NumberField } from './NumberField'

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Valor restaurado com um duplo clique. */
  defaultValue: number
  /** Texto do valor para leitores de tela (por exemplo, "+1,5 cm"). */
  format(value: number): string
  onChange(value: number): void
  /** Unidade do campo numérico editável ("cm", "%", "°"). */
  unit: string
  /** Multiplicador entre o valor interno e o exibido (100 para escalas em %). */
  displayFactor?: number
  decimals?: number
  /** Mostra "+" em valores positivos. */
  signed?: boolean
  /** Informação complementar abaixo do rótulo (por exemplo, o tamanho em cm). */
  detail?: string
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
  unit,
  displayFactor = 1,
  decimals = 1,
  signed = false,
  detail,
  snapPoints,
  snapDistance = 0,
  disabled,
  accessory,
  origin = min,
}: SliderFieldProps) {
  const id = useId()
  // Uma faixa vazia (min = max) desativa o controle, por exemplo quando a área ocupa toda a largura.
  const empty = max - min < 1e-6
  const inactive = disabled || empty
  const toPercent = (input: number) => (empty ? 0 : ((input - min) / (max - min)) * 100)
  const fillStart = Math.min(toPercent(origin), toPercent(value))
  const fillEnd = Math.max(toPercent(origin), toPercent(value))

  return (
    <div className={`slider-field${inactive ? ' slider-field--disabled' : ''}`}>
      <div className="slider-field__header">
        <div className="slider-field__heading">
          <label htmlFor={id} className="slider-field__label">
            {label}
          </label>
          {detail && <span className="slider-field__detail">{detail}</span>}
        </div>
        <NumberField
          value={value}
          factor={displayFactor}
          decimals={decimals}
          unit={unit}
          signed={signed}
          step={step}
          label={`${label}, em ${unit}`}
          disabled={inactive}
          onCommit={onChange}
        />
        {accessory}
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={empty ? min + 1 : max}
        step={step}
        value={value}
        disabled={inactive}
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
