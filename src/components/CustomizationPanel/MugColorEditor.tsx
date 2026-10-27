import { useState, type CSSProperties } from 'react'
import { COLOR_PALETTE, DEFAULT_MUG_COLORS, MUG_COLOR_REGIONS, type MugColorRegion, type MugColors } from '../../config/mugColors'
import { prefersDarkForeground } from '../../lib/color'
import { ColorPicker } from '../ui/ColorPicker'
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { HexColorField } from './HexColorField'

interface MugColorEditorProps {
  colors: MugColors
  onChange(region: MugColorRegion, color: string): void
  onReset(region: MugColorRegion): void
}

/**
 * Cores da alça, da borda e do interior. Uma região é editada por vez; as três cores ficam
 * sempre visíveis nas abas, e o seletor visual, o código hexadecimal e a paleta editam
 * a mesma cor, portanto se mantêm sincronizados.
 */
export function MugColorEditor({ colors, onChange, onReset }: MugColorEditorProps) {
  const [active, setActive] = useState<MugColorRegion>('handle')
  const region = MUG_COLOR_REGIONS.find((item) => item.region === active)!
  const current = colors[active]
  const paletteMatch = COLOR_PALETTE.find((swatch) => swatch.hex === current)
  const change = (color: string) => onChange(active, color)

  const tabs: ReadonlyArray<SegmentedOption<MugColorRegion>> = MUG_COLOR_REGIONS.map((item) => ({
    value: item.region,
    description: item.label,
    label: (
      <>
        <span className="color-dot" style={{ background: colors[item.region] }} aria-hidden="true" />
        <span>{item.label}</span>
      </>
    ),
  }))

  return (
    <div className="color-editor">
      <SegmentedControl label="Parte da caneca" options={tabs} value={active} onChange={(next) => setActive(next)} />
      <p className="field-help">{region.description}</p>

      {/* A chave recria o seletor ao trocar de região, para que ele assuma a cor da nova região. */}
      <ColorPicker key={active} value={current} onChange={change} ofLabel={region.ofLabel} />

      <div className="color-editor__row">
        <span
          className="color-editor__swatch"
          style={{ background: current }}
          role="img"
          aria-label={`Cor atual ${region.ofLabel}: ${paletteMatch?.name ?? 'personalizada'}`}
        />
        <HexColorField value={current} onChange={change} label={`Código hexadecimal da cor ${region.ofLabel}`} />
        <button
          type="button"
          className="button button--secondary button--small color-editor__reset"
          onClick={() => onReset(active)}
          disabled={current === DEFAULT_MUG_COLORS[active]}
          aria-label={`Restaurar a cor original ${region.ofLabel}`}
          title={`Restaurar a cor original ${region.ofLabel}`}
        >
          <Icon name="reset" size={16} />
          Original
        </button>
      </div>

      <div className="color-palette" role="group" aria-label={`Cores sugeridas: ${region.label}`}>
        {COLOR_PALETTE.map((swatch) => {
          const selected = swatch.hex === current
          return (
            <button
              key={swatch.hex}
              type="button"
              className="color-palette__swatch"
              style={{ '--swatch': swatch.hex } as CSSProperties}
              aria-label={swatch.name}
              aria-pressed={selected}
              title={`${swatch.name} · #${swatch.hex.slice(1).toUpperCase()}`}
              onClick={() => change(swatch.hex)}
            >
              {selected && (
                <Icon name="check" size={16} className={prefersDarkForeground(swatch.hex) ? 'color-palette__check--dark' : undefined} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
