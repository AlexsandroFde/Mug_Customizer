import type { Ref } from 'react'
import { PRINT_HEIGHT, PRINT_WIDTH, SCALE_RANGE } from '../../config/mugSpec'
import type {
  ChangeKind,
  CustomizationActions,
  CustomizationState,
  PrintSummary,
} from '../../hooks/useMugCustomization'
import { formatCm, formatDegrees, formatInteger, formatPercent, formatSignedCm } from '../../lib/format'
import {
  DEFAULT_TRANSFORM,
  getPrintedSize,
  getSideOffset,
  normalizeDegrees,
  type FitMode,
  type PrintQuality,
  type PrintSide,
  type PrintTransform,
} from '../../lib/printMapping'
import { ImageUploader, type ImageUploaderHandle } from '../ImageUploader/ImageUploader'
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { MugColorEditor } from './MugColorEditor'
import { PrintLayoutEditor } from './PrintLayoutEditor'
import { SliderField } from './SliderField'

interface CustomizationPanelProps {
  state: CustomizationState
  summary: PrintSummary | null
  actions: CustomizationActions
  uploaderRef: Ref<ImageUploaderHandle>
  onTransformChange(patch: Partial<PrintTransform>, kind: ChangeKind): void
  onSideChange(side: PrintSide): void
  onLayoutDraggingChange(dragging: boolean): void
}

const FIT_OPTIONS: ReadonlyArray<SegmentedOption<FitMode>> = [
  { value: 'contain', label: 'Ajustar', description: 'Mostra a imagem inteira, sem distorcer' },
  { value: 'cover', label: 'Preencher', description: 'Cobre toda a área, sem distorcer (pode cortar)' },
  { value: 'stretch', label: 'Esticar', description: 'Ocupa exatamente a área, alterando as proporções' },
]

const FIT_HELP: Record<FitMode, string> = {
  contain: 'Mantém as proporções e mostra a imagem inteira.',
  cover: 'Mantém as proporções e cobre toda a área de impressão; o excedente é cortado.',
  stretch: 'Distorce a imagem para ocupar exatamente a área de impressão.',
}

const SIDE_OPTIONS: ReadonlyArray<SegmentedOption<PrintSide>> = [
  { value: 'left', label: 'Esquerdo', description: 'Lado visível com a alça à esquerda' },
  { value: 'center', label: 'Centro', description: 'Oposto à alça' },
  { value: 'right', label: 'Direito', description: 'Lado visível com a alça à direita' },
]

const QUALITY_LABELS: Record<PrintQuality, string> = {
  excellent: 'Excelente',
  good: 'Boa',
  acceptable: 'Aceitável',
  low: 'Baixa',
}

const SIDE_TOLERANCE = 0.05

export function CustomizationPanel({
  state,
  summary,
  actions,
  uploaderRef,
  onTransformChange,
  onSideChange,
  onLayoutDraggingChange,
}: CustomizationPanelProps) {
  const { image, transform, upload } = state

  const sides = (() => {
    if (!image) return { current: null, movable: false }
    const size = getPrintedSize(image.aspect, transform)
    // O centro vem primeiro: se a estampa ocupa toda a largura, os três lados coincidem nele.
    const order: PrintSide[] = ['center', 'left', 'right']
    const offsets = order.map((side) => getSideOffset(side, transform.rotation, size))
    const index = offsets.findIndex((offset) => Math.abs(offset - transform.offsetX) < SIDE_TOLERANCE)
    return { current: index >= 0 ? order[index] : null, movable: offsets[1] !== offsets[2] }
  })()
  const sideOptions = SIDE_OPTIONS.map((option) =>
    option.value === 'center' || sides.movable ? option : { ...option, disabled: true },
  )

  return (
    <div className="panel">
      <header className="panel__header">
        <p className="panel__eyebrow">Caneca de cerâmica branca · 325 ml</p>
        <h1 className="panel__title">Personalize sua caneca</h1>
        <p className="panel__lead">Envie uma imagem e ajuste a estampa enquanto confere o resultado em 3D.</p>
      </header>

      <section className="panel__section" aria-labelledby="section-image">
        <h2 id="section-image" className="section-title">
          Imagem
        </h2>
        <ImageUploader
          ref={uploaderRef}
          image={image}
          status={upload}
          onFile={actions.loadFile}
          onRemove={actions.removeImage}
          onDismissError={actions.dismissError}
        />
      </section>

      <section className="panel__section" aria-labelledby="section-layout">
        <div className="section-heading">
          <h2 id="section-layout" className="section-title">
            Área de impressão
          </h2>
          <span className="section-meta">
            {formatCm(PRINT_WIDTH)} × {formatCm(PRINT_HEIGHT)}
          </span>
        </div>
        <PrintLayoutEditor
          image={image}
          transform={transform}
          onMove={onTransformChange}
          onDraggingChange={onLayoutDraggingChange}
        />
        <p className="field-help">
          {image
            ? 'Arraste a imagem para posicioná-la. As faixas hachuradas, junto à alça, à borda e à base, não recebem impressão.'
            : 'A estampa contorna a caneca e fica longe da alça, da borda e da base, como na impressão real.'}
        </p>
      </section>

      {image && summary && (
        <section className="panel__section" aria-labelledby="section-adjust">
          <h2 id="section-adjust" className="section-title">
            Ajustes
          </h2>

          <div className="field">
            <span className="field__label">Encaixe</span>
            <SegmentedControl label="Encaixe da imagem" options={FIT_OPTIONS} value={transform.fit} onChange={actions.setFit} />
            <p className="field-help">{FIT_HELP[transform.fit]}</p>
          </div>

          <div className="field">
            <span className="field__label">Lado da caneca</span>
            <SegmentedControl label="Lado da caneca" options={sideOptions} value={sides.current} onChange={onSideChange} />
            {!sides.movable && <p className="field-help">A estampa ocupa toda a largura da área de impressão.</p>}
          </div>

          <SliderField
            label="Posição horizontal"
            value={transform.offsetX}
            min={-PRINT_WIDTH / 2}
            max={PRINT_WIDTH / 2}
            step={0.05}
            defaultValue={DEFAULT_TRANSFORM.offsetX}
            origin={0}
            format={formatSignedCm}
            snapPoints={[0]}
            snapDistance={0.2}
            onChange={(offsetX) => onTransformChange({ offsetX }, 'continuous')}
          />
          <SliderField
            label="Posição vertical"
            value={transform.offsetY}
            min={-PRINT_HEIGHT / 2}
            max={PRINT_HEIGHT / 2}
            step={0.05}
            defaultValue={DEFAULT_TRANSFORM.offsetY}
            origin={0}
            format={formatSignedCm}
            snapPoints={[0]}
            snapDistance={0.1}
            onChange={(offsetY) => onTransformChange({ offsetY }, 'continuous')}
          />
          <SliderField
            label="Tamanho"
            value={transform.scale}
            min={SCALE_RANGE.min}
            max={SCALE_RANGE.max}
            step={0.01}
            defaultValue={DEFAULT_TRANSFORM.scale}
            format={(scale) => `${formatPercent(scale)} · ${formatCm(summary.printedSize.width)} × ${formatCm(summary.printedSize.height)}`}
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
            <button type="button" className="button button--secondary" onClick={actions.center}>
              <Icon name="center" size={18} />
              Centralizar
            </button>
            <button type="button" className="button button--secondary" onClick={actions.reset}>
              <Icon name="reset" size={18} />
              Redefinir ajustes
            </button>
          </div>

          <PrintNotes summary={summary} hasTransparency={image.hasTransparency} />
        </section>
      )}

      <section className="panel__section" aria-labelledby="section-colors">
        <h2 id="section-colors" className="section-title">
          Cores da caneca
        </h2>
        <MugColorEditor colors={state.colors} onChange={actions.setColor} onReset={actions.resetColor} />
      </section>
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
          As áreas transparentes da imagem mostram o branco da cerâmica.
        </p>
      )}
    </div>
  )
}
