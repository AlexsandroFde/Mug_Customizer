import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { EXPORT_LIMITS } from '../../config/mugSpec'
import { getImagePixels, type PrintImage } from '../../hooks/useMugCustomization'
import { downloadBlob } from '../../lib/download'
import {
  canEncode,
  coversArea,
  drawArt,
  EXPORT_FORMATS,
  ExportError,
  exportArt,
  getArtComposition,
  getExportLimits,
  getNativeDensity,
  planExport,
  type ExportFormat,
  type ExportPlan,
  type ExportSizeMode,
} from '../../lib/exportArt'
import { formatDecimal, formatInteger } from '../../lib/format'
import type { PrintArea } from '../../lib/printArea'
import { clamp, getPrintedSize, type PrintTransform } from '../../lib/printMapping'
import { SliderField } from '../CustomizationPanel/SliderField'
import { HexColorField } from '../ui/HexColorField'
import { Icon } from '../ui/Icon'
import { NumberField } from '../ui/NumberField'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'

interface ExportDialogProps {
  open: boolean
  onClose(): void
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  /** Cor-base da caneca, oferecida como cor de fundo. */
  bodyColor: string
  onRequestUpload(): void
  onExported(result: { fileName: string; bytes: number }): void
}

type BackgroundMode = 'transparent' | 'solid'
type Status = { state: 'idle' } | { state: 'working' } | { state: 'error'; message: string }

const SIZE_MODES: ReadonlyArray<{ mode: ExportSizeMode; label: string; hint: string }> = [
  { mode: 'original', label: 'Original', hint: 'Mesma resolução da imagem enviada' },
  { mode: 'high', label: 'Alta', hint: 'O dobro da original' },
  { mode: 'print', label: 'Para impressão', hint: 'Medida em cm e resolução em dpi' },
  { mode: 'custom', label: 'Personalizada', hint: 'Largura e altura em pixels' },
]

const FORMAT_NOTES: Record<ExportFormat, string> = {
  png: 'Sem perdas e com transparência. Recomendado para a estampa.',
  jpeg: 'Arquivo menor, sem transparência. Indicado para fotos.',
  webp: 'Arquivo menor, com transparência.',
}

/** A partir desta ampliação o aviso de que ampliar não cria detalhes aparece. */
const UPSCALE_WARNING = 1.2
/** Caixa máxima da prévia, em pixels de tela. */
const PREVIEW_BOX = { width: 512, height: 200 }

const formatPixels = (plan: Pick<ExportPlan, 'width' | 'height'>) => `${formatInteger(plan.width)} × ${formatInteger(plan.height)} px`

function previewSize(area: PrintArea) {
  const aspect = area.width / area.height
  const width = Math.min(PREVIEW_BOX.width, PREVIEW_BOX.height * aspect)
  return { width, height: width / aspect }
}

export function ExportDialog({ open, onClose, image, transform, area, bodyColor, onRequestUpload, onExported }: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const exportAbort = useRef<AbortController | null>(null)

  // As escolhas ficam guardadas entre uma exportação e outra.
  const [sizeMode, setSizeMode] = useState<ExportSizeMode>('original')
  const [printWidth, setPrintWidth] = useState<number | null>(null)
  const [dpi, setDpi] = useState<number>(EXPORT_LIMITS.dpi.default)
  const [customWidth, setCustomWidth] = useState<number | null>(null)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState({ jpeg: EXPORT_FORMATS.jpeg.defaultQuality!, webp: EXPORT_FORMATS.webp.defaultQuality! })
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('transparent')
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const working = status.state === 'working'

  // Abre e fecha o <dialog> nativo, que prende o foco e deixa o restante da página inerte.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleClosed = () => {
    exportAbort.current?.abort()
    setStatus({ state: 'idle' })
    onClose()
    returnFocus.current?.focus()
  }

  const limits = useMemo(() => getExportLimits(), [])
  const details = useMemo(() => {
    if (!image) return null
    const pixels = getImagePixels(image)
    const printed = getPrintedSize(pixels, transform, area)
    return {
      composition: getArtComposition(area, transform, pixels),
      nativeDensity: getNativeDensity(pixels, printed),
      hasTransparency: image.hasTransparency || !coversArea(area, transform, printed),
    }
  }, [image, transform, area])

  const aspect = area.width / area.height
  const effectivePrintWidth = printWidth ?? area.width
  const plans = useMemo(() => {
    if (!details) return null
    const base = { printWidth: effectivePrintWidth, dpi, customWidth: 0 }
    const original = planExport({ ...base, mode: 'original' }, area, details.nativeDensity, limits)
    const request = { ...base, customWidth: customWidth ?? original.width }
    return {
      original,
      high: planExport({ ...request, mode: 'high' }, area, details.nativeDensity, limits),
      print: planExport({ ...request, mode: 'print' }, area, details.nativeDensity, limits),
      custom: planExport({ ...request, mode: 'custom' }, area, details.nativeDensity, limits),
    } satisfies Record<ExportSizeMode, ExportPlan>
  }, [details, area, effectivePrintWidth, dpi, customWidth, limits])

  const supportsAlpha = EXPORT_FORMATS[format].transparency
  const background =
    !details?.hasTransparency || (supportsAlpha && backgroundMode === 'transparent') ? null : backgroundColor
  const formatQuality = format === 'png' ? null : quality[format]

  // A prévia usa a mesma função de desenho do arquivo, com a cópia já carregada da imagem.
  useEffect(() => {
    const canvas = previewRef.current
    if (!open || !image || !details || !canvas || image.source.width === 0) return
    const controller = new AbortController()
    const box = previewSize(area)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(box.width * ratio))
    canvas.height = Math.max(1, Math.round(box.height * ratio))
    drawArt(canvas, image.source, { width: image.source.width, height: image.source.height }, details.composition, {
      background,
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error(error)
    })
    return () => controller.abort()
  }, [open, image, details, area, background])

  const runExport = async () => {
    if (!image || !details || !plans) return
    const controller = new AbortController()
    exportAbort.current = controller
    setStatus({ state: 'working' })
    try {
      const result = await exportArt({
        file: image.file,
        composition: details.composition,
        plan: plans[sizeMode],
        format,
        quality: formatQuality,
        background,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      downloadBlob(result.blob, result.fileName)
      onExported({ fileName: result.fileName, bytes: result.blob.size })
      dialogRef.current?.close()
    } catch (error) {
      if (controller.signal.aborted) return
      console.error(error)
      setStatus({
        state: 'error',
        message: error instanceof ExportError ? error.message : 'Não foi possível exportar a estampa. Tente novamente.',
      })
      return
    } finally {
      if (exportAbort.current === controller) exportAbort.current = null
    }
  }

  const plan = plans?.[sizeMode]
  const box = previewSize(area)
  const webpAvailable = open && canEncode('webp')
  const formatOptions: ReadonlyArray<SegmentedOption<ExportFormat>> = (['png', 'jpeg', 'webp'] as const).map((value) => ({
    value,
    label: EXPORT_FORMATS[value].label,
    description: value === 'webp' && !webpAvailable ? 'Este navegador não gera WebP' : undefined,
    disabled: value === 'webp' && !webpAvailable,
  }))
  const swatches = [
    { name: 'Branco', hex: '#ffffff' },
    { name: 'Preto', hex: '#000000' },
    ...(bodyColor.toLowerCase() !== '#ffffff' ? [{ name: 'Cor da caneca', hex: bodyColor }] : []),
  ]

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="export-title"
      aria-describedby="export-description"
      onClose={handleClosed}
    >
      <header className="dialog__header">
        <div>
          <h2 id="export-title" className="dialog__title">
            Exportar estampa
          </h2>
          <p id="export-description" className="dialog__subtitle">
            Arte planificada da área de impressão, sem a caneca e sem guias.
          </p>
        </div>
        <button type="button" className="icon-button" onClick={() => dialogRef.current?.close()} aria-label="Fechar">
          <Icon name="close" />
        </button>
      </header>

      {!image || !details || !plan || !plans ? (
        <div className="dialog__body">
          <div className="export-empty">
            <p>Ainda não há estampa para exportar. Adicione uma imagem para criar a arte.</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                dialogRef.current?.close()
                onRequestUpload()
              }}
            >
              <Icon name="upload" size={18} />
              Adicionar imagem
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="dialog__body">
            <figure className="export-preview">
              <canvas
                ref={previewRef}
                className={background ? undefined : 'checkerboard'}
                style={{ width: box.width, aspectRatio: `${area.width} / ${area.height}` } as CSSProperties}
                role="img"
                aria-label={`Prévia da estampa exportada, ${formatPixels(plan)}`}
              />
              <figcaption className="export-summary">
                <strong>{formatPixels(plan)}</strong>
                <span>
                  {formatDecimal(plan.physical.width)} × {formatDecimal(plan.physical.height)} cm a {formatInteger(plan.dpi)} dpi
                </span>
              </figcaption>
            </figure>

            <fieldset className="export-fields" disabled={working}>
              <fieldset className="choice-list">
                <legend className="group__title">Resolução</legend>
                {SIZE_MODES.map(({ mode, label, hint }) => (
                  <div key={mode} className={`choice${sizeMode === mode ? ' is-selected' : ''}`}>
                    <label className="choice__row">
                      <input type="radio" name="export-size" checked={sizeMode === mode} onChange={() => setSizeMode(mode)} />
                      <span className="choice__text">
                        <span className="choice__label">{label}</span>
                        <span className="choice__hint">{hint}</span>
                      </span>
                      <span className="choice__value">{formatPixels(plans[mode])}</span>
                    </label>

                    {mode === 'print' && sizeMode === 'print' && (
                      <div className="choice__fields">
                        <div className="field-row">
                          <NumberField
                            value={effectivePrintWidth}
                            factor={1}
                            decimals={1}
                            unit="cm"
                            signed={false}
                            step={0.1}
                            label="Largura da arte, em cm"
                            onCommit={(value) =>
                              setPrintWidth(clamp(value, EXPORT_LIMITS.printWidth.min, EXPORT_LIMITS.printWidth.max))
                            }
                          />
                          <span aria-hidden="true">×</span>
                          <NumberField
                            value={effectivePrintWidth / aspect}
                            factor={1}
                            decimals={1}
                            unit="cm"
                            signed={false}
                            step={0.1}
                            label="Altura da arte, em cm"
                            onCommit={(value) =>
                              setPrintWidth(clamp(value * aspect, EXPORT_LIMITS.printWidth.min, EXPORT_LIMITS.printWidth.max))
                            }
                          />
                          <span className="field-row__gap" aria-hidden="true">
                            a
                          </span>
                          <NumberField
                            value={dpi}
                            factor={1}
                            decimals={0}
                            unit="dpi"
                            signed={false}
                            step={10}
                            label="Resolução de impressão, em dpi"
                            onCommit={(value) => setDpi(Math.round(clamp(value, EXPORT_LIMITS.dpi.min, EXPORT_LIMITS.dpi.max)))}
                          />
                        </div>
                        <p className="field-hint">
                          Começa com a medida da área nesta caneca de referência (325 ml). Confirme com a gráfica as medidas e
                          a resolução do seu modelo.
                        </p>
                      </div>
                    )}

                    {mode === 'custom' && sizeMode === 'custom' && (
                      <div className="choice__fields">
                        <div className="field-row">
                          <NumberField
                            value={plans.custom.width}
                            factor={1}
                            decimals={0}
                            unit="px"
                            signed={false}
                            step={10}
                            label="Largura, em pixels"
                            onCommit={(value) => setCustomWidth(Math.max(EXPORT_LIMITS.minSide, Math.round(value)))}
                          />
                          <span aria-hidden="true">×</span>
                          <NumberField
                            value={plans.custom.height}
                            factor={1}
                            decimals={0}
                            unit="px"
                            signed={false}
                            step={10}
                            label="Altura, em pixels"
                            onCommit={(value) => setCustomWidth(Math.max(EXPORT_LIMITS.minSide, Math.round(value * aspect)))}
                          />
                        </div>
                        <p className="field-hint">
                          <Icon name="lock" size={14} />A altura acompanha a proporção da área de impressão.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>

              <div className="group">
                <span className="group__title">Formato</span>
                <SegmentedControl label="Formato do arquivo" options={formatOptions} value={format} onChange={(next) => setFormat(next)} />
                <p className="field-hint">{FORMAT_NOTES[format]}</p>
                {format !== 'png' && (
                  <SliderField
                    label="Qualidade"
                    value={quality[format]}
                    min={0.5}
                    max={1}
                    step={0.01}
                    defaultValue={EXPORT_FORMATS[format].defaultQuality!}
                    unit="%"
                    displayFactor={100}
                    decimals={0}
                    format={(value) => `${formatInteger(value * 100)}%`}
                    onChange={(value) => setQuality((current) => ({ ...current, [format]: value }))}
                  />
                )}
              </div>

              {details.hasTransparency && (
                <div className="group">
                  <span className="group__title">Fundo</span>
                  {supportsAlpha ? (
                    <SegmentedControl
                      label="Fundo da arte"
                      options={[
                        { value: 'transparent', label: 'Transparente' },
                        { value: 'solid', label: 'Cor sólida' },
                      ]}
                      value={backgroundMode}
                      onChange={(next) => setBackgroundMode(next)}
                    />
                  ) : (
                    <p className="field-hint">O JPEG não guarda transparência: as áreas vazias recebem esta cor.</p>
                  )}
                  {background && (
                    <div className="background-row">
                      {swatches.map((swatch) => (
                        <button
                          key={swatch.name}
                          type="button"
                          className="palette__swatch"
                          style={{ '--swatch': swatch.hex } as CSSProperties}
                          aria-label={swatch.name}
                          aria-pressed={backgroundColor === swatch.hex}
                          title={swatch.name}
                          onClick={() => setBackgroundColor(swatch.hex)}
                        />
                      ))}
                      <HexColorField value={backgroundColor} onChange={setBackgroundColor} label="Código hexadecimal da cor de fundo" />
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            <div className="status-list" aria-live="polite">
              {plan.sourceScale >= UPSCALE_WARNING && (
                <p className="note note--warning">
                  <Icon name="alert" size={16} />
                  A imagem original será ampliada {formatDecimal(plan.sourceScale)}×. O arquivo fica maior, mas a ampliação não
                  recupera detalhes que não existem na imagem.
                </p>
              )}
              {plan.limited && (
                <p className="note">
                  <Icon name="info" size={16} />
                  O tamanho pedido passa do limite deste dispositivo ({formatInteger(limits.maxSide)} px por lado e{' '}
                  {formatInteger(limits.maxPixels / 1_000_000)} MP). A arte será gerada com {formatPixels(plan)}.
                </p>
              )}
              {status.state === 'error' && (
                <p className="alert" role="alert">
                  <Icon name="alert" size={18} className="alert__icon" />
                  <span className="alert__text">{status.message}</span>
                </p>
              )}
            </div>
          </div>

          <footer className="dialog__footer">
            <button type="button" className="button button--ghost" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className="button button--primary" onClick={runExport} disabled={working} aria-busy={working}>
              {working ? <span className="spinner spinner--sm spinner--inverse" aria-hidden="true" /> : <Icon name="download" size={18} />}
              {working ? 'Gerando arquivo…' : 'Exportar estampa'}
            </button>
          </footer>
        </>
      )}
    </dialog>
  )
}
