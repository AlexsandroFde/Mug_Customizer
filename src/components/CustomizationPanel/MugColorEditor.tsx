import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  COLOR_PALETTE,
  DEFAULT_MUG_COLORS,
  getPaletteName,
  getPartInfo,
  MUG_COLOR_REGIONS,
  MUG_PARTS,
  resolveMugColors,
  type MugColorRegion,
  type MugColorSettings,
  type MugPart,
} from '../../config/mugColors'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import { prefersDarkForeground } from '../../lib/color'
import { ColorPicker } from '../ui/ColorPicker'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'
import { HexColorField } from '../ui/HexColorField'

interface MugColorEditorProps {
  colors: MugColorSettings
  selected: MugPart
  onSelect(part: MugPart): void
  onBodyColor(color: string): void
  onResetBody(): void
  /** "Aplicar a todas as partes": alça, borda e interior voltam a acompanhar a cor da caneca. */
  onApplyToAll(): void
  onPartColor(region: MugColorRegion, color: string): void
  onLinkPart(region: MugColorRegion): void
}

const toHexLabel = (hex: string) => `#${hex.slice(1).toUpperCase()}`

/**
 * Cores da caneca: a cor-base (o corpo, que as outras partes acompanham por padrão) e as cores
 * próprias da alça, da borda e do interior. A paleta, o seletor livre e o código hexadecimal
 * editam a mesma cor, por isso ficam sempre sincronizados.
 */
export function MugColorEditor({
  colors,
  selected,
  onSelect,
  onBodyColor,
  onResetBody,
  onApplyToAll,
  onPartColor,
  onLinkPart,
}: MugColorEditorProps) {
  const touch = useCoarsePointer()
  const [customOpen, setCustomOpen] = useState(false)
  const resolved = resolveMugColors(colors)
  const isRegion = selected !== 'body'
  const region = selected as MugColorRegion
  const linked = isRegion && colors.overrides[region] === null
  const current = resolved[selected]
  const info = getPartInfo(selected)
  const customRegions = MUG_COLOR_REGIONS.filter((item) => colors.overrides[item] !== null)
  const inPalette = getPaletteName(current) !== null

  const change = (color: string) => (isRegion ? onPartColor(region, color) : onBodyColor(color))

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = MUG_PARTS.findIndex((item) => item.part === selected)
    const next = MUG_PARTS[(index + step + MUG_PARTS.length) % MUG_PARTS.length].part
    onSelect(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-part="${next}"]`)?.focus()
  }

  return (
    <div className="color-tab">
      <div className="part-list" role="radiogroup" aria-label="Parte da caneca" onKeyDown={onListKeyDown}>
        {MUG_PARTS.map(({ part, label }) => {
          const partLinked = part !== 'body' && colors.overrides[part] === null
          const checked = part === selected
          return (
            <button
              key={part}
              type="button"
              role="radio"
              data-part={part}
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="part-row"
              onClick={() => onSelect(part)}
            >
              <span className="part-row__swatch" aria-hidden="true">
                <span className="swatch" style={{ background: resolved[part] }} />
                {/* Na versão compacta (telas estreitas) o vínculo aparece como selo sobre a amostra. */}
                {partLinked && (
                  <span className="part-row__badge">
                    <Icon name="link" size={10} />
                  </span>
                )}
              </span>
              <span className="part-row__text">
                <span className="part-row__label">{label}</span>
                <span className="part-row__status">
                  {partLinked ? (
                    <>
                      <Icon name="link" size={13} />
                      Acompanha a caneca
                    </>
                  ) : part === 'body' ? (
                    toHexLabel(resolved[part])
                  ) : (
                    `Cor própria · ${toHexLabel(resolved[part])}`
                  )}
                </span>
              </span>
              {checked && <Icon name="check" size={18} className="part-row__check" />}
            </button>
          )
        })}
      </div>

      <section className="color-panel" aria-labelledby="color-panel-title">
        <h3 id="color-panel-title" className="group__title">
          Cor {info.ofLabel}
        </h3>
        {isRegion && (
          <Switch
            checked={linked}
            // Desvincular mantém a cor atual como cor própria: a parte só muda quando o usuário escolher outra.
            onChange={(next) => (next ? onLinkPart(region) : onPartColor(region, resolved.body))}
            label="Acompanhar a cor da caneca"
            description={linked ? 'Muda junto com a cor da caneca (padrão).' : 'Cor própria, mantida ao mudar a cor da caneca.'}
          />
        )}

        <div className="palette" role="group" aria-label={`Cores sugeridas ${info.ofLabel}`}>
          {COLOR_PALETTE.map((swatch) => {
            const pressed = swatch.hex === current
            return (
              <button
                key={swatch.hex}
                type="button"
                className="palette__swatch"
                style={{ '--swatch': swatch.hex } as CSSProperties}
                aria-label={swatch.name}
                aria-pressed={pressed}
                title={`${swatch.name} · ${toHexLabel(swatch.hex)}`}
                onClick={() => change(swatch.hex)}
              >
                {pressed && <Icon name="check" size={16} className={prefersDarkForeground(swatch.hex) ? 'is-dark' : undefined} />}
              </button>
            )
          })}
          <button
            type="button"
            className={`palette__more${!inPalette ? ' is-current' : ''}`}
            aria-expanded={customOpen}
            aria-controls="custom-color"
            aria-label={customOpen ? 'Fechar o seletor de cor livre' : 'Mais cores: escolher qualquer cor'}
            title="Mais cores"
            onClick={() => setCustomOpen((open) => !open)}
          >
            <Icon name={customOpen ? 'close' : 'plus'} size={16} />
          </button>
        </div>

        {customOpen && (
          <div id="custom-color">
            {/* A chave recria o seletor ao trocar de parte, para que ele assuma a cor da nova parte. */}
            <ColorPicker key={selected} value={current} onChange={change} ofLabel={info.ofLabel} />
          </div>
        )}

        <div className="color-panel__value">
          <span
            className="swatch swatch--lg"
            style={{ background: current }}
            role="img"
            aria-label={`Cor atual ${info.ofLabel}: ${getPaletteName(current) ?? 'personalizada'}`}
          />
          <HexColorField value={current} onChange={change} label={`Código hexadecimal da cor ${info.ofLabel}`} />
        </div>

        {!isRegion && (
          <div className="color-panel__actions">
            <button type="button" className="button button--secondary" onClick={onApplyToAll} disabled={customRegions.length === 0}>
              Aplicar a todas as partes
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={onResetBody}
              disabled={colors.body === DEFAULT_MUG_COLORS.body}
            >
              Restaurar branco
            </button>
            <p className="field-hint">
              {customRegions.length === 0
                ? 'Alça, borda e interior acompanham esta cor.'
                : `Com cor própria: ${customRegions.map((item) => getPartInfo(item).label.toLowerCase()).join(', ')}. Elas não mudam com a cor da caneca.`}
            </p>
          </div>
        )}
      </section>

      <p className="field-hint">
        <Icon name="info" size={14} />
        {touch ? 'Toque' : 'Clique'} em uma parte da caneca para selecioná-la.
      </p>
    </div>
  )
}
