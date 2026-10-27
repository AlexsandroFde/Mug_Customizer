import { PRINT_REFERENCE_DPI, SCALE_RANGE } from '../../config/mugSpec'
import { getImagePixels, type ChangeKind, type PrintImage, type PrintSummary } from '../../hooks/useMugCustomization'
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
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { SliderField } from './SliderField'

interface PrintImageControlsProps {
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  summary: PrintSummary | null
  onTransformChange(patch: Partial<PrintTransform>, kind: ChangeKind): void
  onFitChange(fit: FitMode): void
  onCenter(): void
  onReset(): void
  onRequestUpload(): void
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

function FitHelp({ fit, image }: { fit: FitMode; image: PrintImage }) {
  switch (fit) {
    case 'contain':
      return <p className="field-help">Mostra a imagem inteira dentro da área, sem distorcer. Pode sobrar espaço nas laterais ou em cima e embaixo.</p>
    case 'cover':
      return <p className="field-help">Cobre toda a área sem distorcer; o excedente é cortado. Ajuste a posição para escolher o enquadramento.</p>
    case 'stretch':
      return (
        <p className="note note--warning">
          <Icon name="alert" size={16} />
          Estica a imagem para ocupar exatamente a área: as proporções originais podem ser alteradas.
        </p>
      )
    case 'original': {
      const natural = getOriginalPrintSize(getImagePixels(image))
      return (
        <p className="field-help">
          Imprime no tamanho natural do arquivo, a {PRINT_REFERENCE_DPI} dpi ({formatCm(natural.width)} × {formatCm(natural.height)}
          ), independentemente da área. O que não couber nela é cortado.
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
  onTransformChange,
  onFitChange,
  onCenter,
  onReset,
  onRequestUpload,
}: PrintImageControlsProps) {
  if (!image || !summary) {
    return (
      <div className="empty-state">
        <p>Adicione uma imagem para ajustar o encaixe, a posição, o tamanho e a rotação da estampa dentro da área.</p>
        <button type="button" className="button button--secondary" onClick={onRequestUpload}>
          <Icon name="upload" size={18} />
          Adicionar imagem
        </button>
      </div>
    )
  }

  return (
    <div className="control-stack">
      <div className="field">
        <span className="field__label">Encaixe na área</span>
        <SegmentedControl label="Encaixe da imagem na área" options={FIT_OPTIONS} value={transform.fit} onChange={onFitChange} compact />
        <FitHelp fit={transform.fit} image={image} />
      </div>

      <SliderField
        label="Posição horizontal"
        detail="A partir do centro da área"
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
        label="Posição vertical"
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
      <SliderField
        label="Tamanho"
        detail={`${formatCm(summary.printedSize.width)} × ${formatCm(summary.printedSize.height)}`}
        value={transform.scale}
        min={SCALE_RANGE.min}
        max={SCALE_RANGE.max}
        step={0.01}
        defaultValue={DEFAULT_TRANSFORM.scale}
        unit="%"
        displayFactor={100}
        decimals={0}
        format={(scale) => `${formatPercent(scale)}, ${formatCm(summary.printedSize.width)} por ${formatCm(summary.printedSize.height)}`}
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
            className="icon-button icon-button--small"
            aria-label="Girar 90° no sentido horário"
            title="Girar 90° no sentido horário"
            onClick={() => onTransformChange({ rotation: normalizeDegrees(transform.rotation + 90) }, 'discrete')}
          >
            <Icon name="rotate" size={16} />
          </button>
        }
      />

      <div className="panel__actions">
        <button type="button" className="button button--secondary" onClick={onCenter}>
          <Icon name="center" size={18} />
          Centralizar na área
        </button>
        <button type="button" className="button button--secondary" onClick={onReset}>
          <Icon name="reset" size={18} />
          Redefinir estampa
        </button>
      </div>

      <PrintNotes summary={summary} hasTransparency={image.hasTransparency} />
    </div>
  )
}

function PrintNotes({ summary, hasTransparency }: { summary: PrintSummary; hasTransparency: boolean }) {
  const { quality, dpi, cropped } = summary
  return (
    <div className="print-notes">
      <div className={`quality quality--${quality}`}>
        <span className="quality__dot" aria-hidden="true" />
        <span>
          Qualidade de impressão: <strong>{QUALITY_LABELS[quality]}</strong>
        </span>
        <span className="quality__dpi">{formatInteger(dpi)} dpi</span>
      </div>
      {(quality === 'low' || quality === 'acceptable') && (
        <p className={`note ${quality === 'low' ? 'note--warning' : 'note--info'}`}>
          <Icon name="alert" size={16} />
          {quality === 'low'
            ? 'A imagem pode ficar pixelada neste tamanho. Diminua a estampa ou use um arquivo com mais resolução.'
            : 'A imagem pode perder um pouco de nitidez neste tamanho.'}
        </p>
      )}
      {cropped && (
        <p className="note note--info">
          <Icon name="info" size={16} />
          Parte da imagem fica fora da área de impressão e será cortada.
        </p>
      )}
      {hasTransparency && (
        <p className="note note--info">
          <Icon name="transparency" size={16} />
          As áreas transparentes da imagem mostram a cor da cerâmica.
        </p>
      )}
    </div>
  )
}
