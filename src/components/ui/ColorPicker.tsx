import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToHsv, hsvToHex, type Hsv } from '../../lib/color'

interface ColorPickerProps {
  /** Cor atual em "#rrggbb". */
  value: string
  onChange(value: string): void
  /** Complemento dos rótulos acessíveis, como "da alça". */
  ofLabel: string
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const KEY_STEP = 0.01
const KEY_STEP_LARGE = 0.1
/** Raio do marcador (px): o curso dele fica dentro da área, sem ultrapassar as bordas. */
const KNOB_RADIUS = 10

/**
 * Seletor visual de cor: área de saturação e brilho mais uma faixa de matiz.
 *
 * Guarda a cor em HSV localmente, porque branco, cinza e preto não têm matiz (nem, no caso do
 * preto, saturação) definidos: sem isso, os controles saltariam ao passar por essas cores.
 */
export function ColorPicker({ value, onChange, ofLabel }: ColorPickerProps) {
  const [color, setColor] = useState<Hsv>(() => hexToHsv(value))
  // Última cor já refletida no estado local (emitida aqui ou recebida de fora).
  const [synced, setSynced] = useState(value)

  if (value !== synced) {
    // A cor mudou por fora (paleta, código hexadecimal, restaurar): sincroniza, preservando o
    // matiz e a saturação quando a nova cor não os define.
    const next = hexToHsv(value)
    setSynced(value)
    setColor((current) => ({
      h: next.s > 0 && next.v > 0 ? next.h : current.h,
      s: next.v > 0 ? next.s : current.s,
      v: next.v,
    }))
  }

  const update = (patch: Partial<Hsv>) => {
    const next = { ...color, ...patch }
    const hex = hsvToHex(next)
    setColor(next)
    setSynced(hex)
    onChange(hex)
  }

  const pickAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    update({
      s: clamp01((event.clientX - rect.left - KNOB_RADIUS) / (rect.width - 2 * KNOB_RADIUS)),
      v: clamp01(1 - (event.clientY - rect.top - KNOB_RADIUS) / (rect.height - 2 * KNOB_RADIUS)),
    })
  }

  const onAreaKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    update({ s: clamp01(color.s + move[0]), v: clamp01(color.v + move[1]) })
  }

  const style = {
    '--hue': color.h,
    '--color': value,
    '--saturation': color.s,
    '--brightness': color.v,
    '--knob-radius': `${KNOB_RADIUS}px`,
  } as CSSProperties

  return (
    <div className="color-picker" style={style}>
      <div
        className="color-picker__area"
        role="slider"
        tabIndex={0}
        aria-label={`Saturação e brilho da cor ${ofLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(color.s * 100)}
        aria-valuetext={`Saturação ${Math.round(color.s * 100)}%, brilho ${Math.round(color.v * 100)}%`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.focus({ preventScroll: true })
          pickAt(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event)
        }}
        onKeyDown={onAreaKeyDown}
      >
        <span className="color-picker__knob" />
      </div>
      <input
        type="range"
        className="color-picker__hue"
        min={0}
        max={359}
        step={1}
        value={Math.round(color.h) % 360}
        aria-label={`Matiz da cor ${ofLabel}`}
        onChange={(event) => update({ h: Number(event.target.value) })}
      />
    </div>
  )
}
