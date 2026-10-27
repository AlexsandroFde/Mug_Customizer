import { PRINT_LIMITS, PRINTABLE } from '../../config/mugSpec'
import type { AreaDimension, ChangeKind } from '../../hooks/useMugCustomization'
import { formatCm, formatDecimal, formatPercent, formatSignedCm } from '../../lib/format'
import {
  AREA_SHAPES,
  DEFAULT_PRINT_AREA,
  getAreaLimits,
  getAreaOffsetRange,
  getAreaScale,
  getAreaScaleRange,
  getAreaSideOffset,
  getAreaSizeRange,
  type AreaLimits,
  type AreaShape,
  type PrintArea,
} from '../../lib/printArea'
import type { PrintSide } from '../../lib/printMapping'
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { SliderField } from './SliderField'

interface PrintAreaControlsProps {
  area: PrintArea
  onShapeChange(shape: AreaShape): void
  onSizeChange(dimension: AreaDimension, value: number): void
  onMove(offset: { offsetX?: number; offsetY?: number }, kind: ChangeKind): void
  onSideChange(side: PrintSide): void
  onCenter(): void
  onReset(): void
}

const SHAPE_OPTIONS: ReadonlyArray<SegmentedOption<AreaShape>> = [
  { value: 'rectangle', label: 'Retangular', description: 'Proporções da faixa de impressão padrão' },
  { value: 'square', label: 'Quadrado', description: 'Largura e altura iguais' },
  { value: 'custom', label: 'Personalizado', description: 'Largura e altura independentes' },
]

const SHAPE_HELP: Record<AreaShape, string> = {
  rectangle: `Faixa com as proporções da região imprimível inteira (${formatDecimal(AREA_SHAPES.rectangle.aspect!)} : 1).`,
  square: 'Largura e altura sempre iguais, para composições compactas.',
  custom: 'Largura e altura independentes, dentro dos limites da caneca.',
}

const SIDE_OPTIONS: ReadonlyArray<SegmentedOption<PrintSide>> = [
  { value: 'left', label: 'Esquerdo', description: 'Lado visível com a alça à esquerda' },
  { value: 'center', label: 'Centro', description: 'Oposto à alça' },
  { value: 'right', label: 'Direito', description: 'Lado visível com a alça à direita' },
]

const SIDE_TOLERANCE = 0.05

/** Descreve, em linguagem simples, quais limites físicos a área atingiu. */
function describeLimits(limits: AreaLimits): string | null {
  if (limits.maxWidth && limits.maxHeight) return 'A área ocupa toda a região imprimível da caneca.'
  const parts: string[] = []
  if (limits.left && limits.right) parts.push('junto à alça, dos dois lados')
  else if (limits.left) parts.push('junto à alça, à esquerda')
  else if (limits.right) parts.push('junto à alça, à direita')
  if (limits.top) parts.push('junto à borda')
  if (limits.bottom) parts.push('junto à base')
  const minimum = limits.minWidth || limits.minHeight
  if (!parts.length && !minimum) return null
  const edges = parts.length
    ? `A área chegou ao limite imprimível ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0]}.`
    : ''
  return [edges, minimum ? `Tamanho mínimo: ${formatCm(PRINT_LIMITS.minAreaSize)} por lado.` : ''].filter(Boolean).join(' ')
}

export function PrintAreaControls({
  area,
  onShapeChange,
  onSizeChange,
  onMove,
  onSideChange,
  onCenter,
  onReset,
}: PrintAreaControlsProps) {
  const sizeRange = getAreaSizeRange(area)
  const scaleRange = getAreaScaleRange(area)
  const offsetRange = getAreaOffsetRange(area)
  const locked = AREA_SHAPES[area.shape].aspect !== null
  const limitsMessage = describeLimits(getAreaLimits(area))

  // O centro vem primeiro: se a área ocupa toda a largura, os três lados coincidem nele.
  const sideOrder: PrintSide[] = ['center', 'left', 'right']
  const sideOffsets = sideOrder.map((side) => getAreaSideOffset(side, area))
  const currentSideIndex = sideOffsets.findIndex((offset) => Math.abs(offset - area.offsetX) < SIDE_TOLERANCE)
  const canMoveSideways = offsetRange.x > 0
  const sideOptions = SIDE_OPTIONS.map((option) =>
    option.value === 'center' || canMoveSideways ? option : { ...option, disabled: true },
  )

  return (
    <div className="control-stack">
      <div className="field">
        <span className="field__label">Formato</span>
        <SegmentedControl label="Formato da área de impressão" options={SHAPE_OPTIONS} value={area.shape} onChange={onShapeChange} />
        <p className="field-help">{SHAPE_HELP[area.shape]}</p>
      </div>

      <SliderField
        label="Largura"
        detail={locked ? undefined : 'Ao redor da circunferência'}
        value={area.width}
        min={sizeRange.width.min}
        max={sizeRange.width.max}
        step={0.1}
        defaultValue={DEFAULT_PRINT_AREA.width}
        unit="cm"
        format={formatCm}
        onChange={(width) => onSizeChange('width', width)}
      />
      <SliderField
        label="Altura"
        value={area.height}
        min={sizeRange.height.min}
        max={sizeRange.height.max}
        step={0.1}
        defaultValue={DEFAULT_PRINT_AREA.height}
        unit="cm"
        format={formatCm}
        onChange={(height) => onSizeChange('height', height)}
      />
      {locked && (
        <p className="note note--info">
          <Icon name="lock" size={16} />
          Proporção travada pelo formato: largura e altura mudam juntas. Escolha Personalizado para ajustá-las
          separadamente.
        </p>
      )}
      <SliderField
        label="Escala"
        detail="100% = maior área com estas proporções"
        value={getAreaScale(area)}
        min={scaleRange.min}
        max={scaleRange.max}
        step={0.01}
        defaultValue={1}
        unit="%"
        displayFactor={100}
        decimals={0}
        format={formatPercent}
        onChange={(scale) => onSizeChange('scale', scale)}
      />

      <div className="field">
        <span className="field__label">Lado da caneca</span>
        <SegmentedControl
          label="Lado da caneca"
          options={sideOptions}
          value={currentSideIndex >= 0 ? sideOrder[currentSideIndex] : null}
          onChange={onSideChange}
        />
      </div>

      <SliderField
        label="Posição horizontal"
        detail={canMoveSideways ? 'Ao redor da caneca' : 'A área ocupa toda a largura imprimível'}
        value={area.offsetX}
        min={-offsetRange.x}
        max={offsetRange.x}
        step={0.05}
        defaultValue={0}
        origin={0}
        unit="cm"
        signed
        format={formatSignedCm}
        snapPoints={[0]}
        snapDistance={0.2}
        onChange={(offsetX) => onMove({ offsetX }, 'continuous')}
      />
      <SliderField
        label="Posição vertical"
        detail={offsetRange.y > 0 ? undefined : 'A área ocupa toda a altura imprimível'}
        value={area.offsetY}
        min={-offsetRange.y}
        max={offsetRange.y}
        step={0.05}
        defaultValue={0}
        origin={0}
        unit="cm"
        signed
        format={formatSignedCm}
        snapPoints={[0]}
        snapDistance={0.1}
        onChange={(offsetY) => onMove({ offsetY }, 'continuous')}
      />

      <div className="panel__actions">
        <button type="button" className="button button--secondary" onClick={onCenter}>
          <Icon name="center" size={18} />
          Centralizar
        </button>
        <button type="button" className="button button--secondary" onClick={onReset}>
          <Icon name="reset" size={18} />
          Redefinir área
        </button>
      </div>

      <div className="print-notes">
        {limitsMessage && (
          <p className="note note--limit" role="status">
            <span className="limit-swatch" aria-hidden="true" />
            {limitsMessage}
          </p>
        )}
        <p className="note note--muted">
          <Icon name="info" size={16} />
          Limites de referência desta caneca: {formatCm(PRINT_LIMITS.marginTop)} abaixo da borda,{' '}
          {formatCm(PRINT_LIMITS.marginBottom)} acima da base e {formatCm(PRINT_LIMITS.handleClearance)} de cada lado da alça
          (região imprimível de {formatCm(PRINTABLE.width)} × {formatCm(PRINTABLE.height)}).
        </p>
      </div>
    </div>
  )
}
