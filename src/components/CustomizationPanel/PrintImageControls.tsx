import { PRINT_REFERENCE_DPI, SCALE_RANGE } from '../../config/mugSpec'
import { getImagePixels, type ChangeKind, type PrintImage, type PrintSummary } from '../../hooks/useMugCustomization'
import { relativeLuminance } from '../../lib/color'
import { formatCm, formatDegrees, formatInteger, formatPercent, formatSignedCm } from '../../lib/format'
import type { PrintArea } from '../../lib/printArea'
import {
  DEFAULT_TRANSFORM,
  getOriginalPrintSize,
  normalizeDegrees,
  type FitMode,
  type PrintQuality,
  type PrintTransform,
} from '../../lib/printMapping'
import { Group } from '../ui/Group'
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { SliderField } from './SliderField'

interface PrintImageControlsProps {
  image: PrintImage
  transform: PrintTransform
  area: PrintArea
  summary: PrintSummary
  /** Cor-base da caneca, para avisar quando o fundo branco da imagem aparecer sobre ela. */
  bodyColor: string
  onTransformChange(patch: Partial<PrintTransform>, kind: ChangeKind): void
  onFitChange(fit: FitMode): void
  onCenter(): void
  onReset(): void
}

const FIT_OPTIONS: ReadonlyArray<SegmentedOption<FitMode>> = [
  { value: 'contain', label: 'Conter', description: 'Mostra a imagem inteira, sem distorcer' },
  { value: 'cover', label: 'Cobrir', description: 'Cobre toda a área, sem distorcer (pode cortar)' },
  { value: 'stretch', label: 'Preencher', description: 'Ocupa exatamente a área, alterando as proporções' },
  { value: 'original', label: 'Original', description: `Tamanho original do arquivo, a ${PRINT_REFERENCE_DPI} dpi` },
]

const QUALITY_LABELS: Record<PrintQuality, string> = {
  excellent: 'Excelente',
  good: 'Boa',
  acceptable: 'Aceitável',
  low: 'Baixa',
}

/** Abaixo desta luminância a caneca já não parece branca e o fundo branco da imagem se destaca. */
const COLORED_MUG_LUMINANCE = 0.75

function FitHelp({ fit, image }: { fit: FitMode; image: PrintImage }) {
  switch (fit) {
    case 'contain':
      return <p className="field-hint">Imagem inteira dentro da área, sem distorcer.</p>
    case 'cover':
      return <p className="field-hint">Cobre a área sem distorcer; o excedente é cortado.</p>
    case 'stretch':
      return (
        <p className="note note--warning">
          <Icon name="alert" size={16} />
          Estica a imagem para ocupar a área: as proporções podem ser alteradas.
        </p>
      )
    case 'original': {
      const natural = getOriginalPrintSize(getImagePixels(image))
      return (
        <p className="field-hint">
          Tamanho natural do arquivo a {PRINT_REFERENCE_DPI} dpi ({formatCm(natural.width)} × {formatCm(natural.height)}). O que não
          couber na área é cortado.
        </p>
      )
    }
  }
}

export function PrintImageControls({
  image,
  transform,
  area,
  summary,
  bodyColor,
  onTransformChange,
  onFitChange,
  onCenter,
  onReset,
}: PrintImageControlsProps) {
  const { quality, dpi, cropped, printedSize } = summary
  const whiteBackgroundShows = !image.hasTransparency && relativeLuminance(bodyColor) < COLORED_MUG_LUMINANCE

  return (
    <>
      <Group title="Encaixe na área">
        <SegmentedControl label="Encaixe da imagem na área" options={FIT_OPTIONS} value={transform.fit} onChange={onFitChange} compact />
        <FitHelp fit={transform.fit} image={image} />
      </Group>

      <Group title="Tamanho e rotação">
        <SliderField
          label="Tamanho"
          detail={`${formatCm(printedSize.width)} × ${formatCm(printedSize.height)}`}
          value={transform.scale}
          min={SCALE_RANGE.min}
          max={SCALE_RANGE.max}
          step={0.01}
          defaultValue={DEFAULT_TRANSFORM.scale}
          unit="%"
          displayFactor={100}
          decimals={0}
          format={(scale) => `${formatPercent(scale)}, ${formatCm(printedSize.width)} por ${formatCm(printedSize.height)}`}
          snapPoints={[1]}
          snapDistance={0.03}
          onChange={(scale) => onTransformChange({ scale }, 'continuous')}
        />
        <SliderField
          label="Rotação"
          value={transform.rotation}
          min={-180}
          max={180}
          step={1}
          defaultValue={DEFAULT_TRANSFORM.rotation}
          origin={0}
          unit="°"
          decimals={0}
          format={formatDegrees}
          snapPoints={[0, 90, -90, 180, -180]}
          snapDistance={3}
          onChange={(rotation) => onTransformChange({ rotation }, 'continuous')}
          accessory={
            <button
              type="button"
              className="icon-button icon-button--sm"
              aria-label="Girar 90° no sentido horário"
              title="Girar 90° no sentido horário"
              onClick={() => onTransformChange({ rotation: normalizeDegrees(transform.rotation + 90) }, 'discrete')}
            >
              <Icon name="rotate" size={16} />
            </button>
          }
        />
      </Group>

      <Group title="Posição na área">
        <SliderField
          label="Horizontal"
          value={transform.offsetX}
          min={-area.width / 2}
          max={area.width / 2}
          step={0.05}
          defaultValue={DEFAULT_TRANSFORM.offsetX}
          origin={0}
          unit="cm"
          signed
          format={formatSignedCm}
          snapPoints={[0]}
          snapDistance={0.2}
          onChange={(offsetX) => onTransformChange({ offsetX }, 'continuous')}
        />
        <SliderField
          label="Vertical"
          value={transform.offsetY}
          min={-area.height / 2}
          max={area.height / 2}
          step={0.05}
          defaultValue={DEFAULT_TRANSFORM.offsetY}
          origin={0}
          unit="cm"
          signed
          format={formatSignedCm}
          snapPoints={[0]}
          snapDistance={0.1}
          onChange={(offsetY) => onTransformChange({ offsetY }, 'continuous')}
        />
        <div className="button-row">
          <button type="button" className="button button--secondary button--sm" onClick={onCenter}>
            <Icon name="center" size={16} />
            Centralizar
          </button>
          <button type="button" className="button button--ghost button--sm" onClick={onReset}>
            <Icon name="reset" size={16} />
            Redefinir estampa
          </button>
        </div>
      </Group>

      <div className="status-list">
        <p className={`status status--${quality}`}>
          <span className="status__dot" aria-hidden="true" />
          Qualidade de impressão: <strong>{QUALITY_LABELS[quality]}</strong>
          <span className="status__meta">{formatInteger(dpi)} dpi</span>
        </p>
        {(quality === 'low' || quality === 'acceptable') && (
          <p className={`note ${quality === 'low' ? 'note--warning' : ''}`}>
            <Icon name="alert" size={16} />
            {quality === 'low'
              ? 'Pode ficar pixelada neste tamanho. Diminua a estampa ou use um arquivo com mais resolução.'
              : 'Pode perder um pouco de nitidez neste tamanho.'}
          </p>
        )}
        {cropped && (
          <p className="note">
            <Icon name="info" size={16} />
            Parte da imagem fica fora da área de impressão e será cortada.
          </p>
        )}
        {whiteBackgroundShows && (
          <p className="note">
            <Icon name="info" size={16} />
            Em canecas coloridas, o fundo branco da imagem também é impresso. Para mostrar a cor da caneca ao redor do
            desenho, use um PNG com fundo transparente.
          </p>
        )}
      </div>
    </>
  )
}
