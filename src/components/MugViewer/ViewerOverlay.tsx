import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import { Icon } from '../ui/Icon'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import type { ViewPreset } from './CameraRig'
import type { InteractionMode } from './MugViewer'

interface ViewerOverlayProps {
  hasImage: boolean
  mode: InteractionMode
  onModeChange(mode: InteractionMode): void
  onView(view: ViewPreset): void
  onResetView(): void
  onZoom(direction: 1 | -1): void
  guidesVisible: boolean
  onToggleGuides(): void
  loadingFileName: string | null
  onRequestUpload(): void
  contextLost: boolean
  onRestore(): void
}

const VIEWS: ReadonlyArray<{ view: ViewPreset; label: string; description: string }> = [
  { view: 'front', label: 'Frente', description: 'Lado oposto à alça' },
  { view: 'handle', label: 'Alça', description: 'Alça de perfil' },
  { view: 'back', label: 'Verso', description: 'Lado da alça' },
  { view: 'top', label: 'Topo', description: 'Abertura e interior vistos de cima' },
]

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<InteractionMode>> = [
  {
    value: 'orbit',
    label: (
      <>
        <Icon name="orbit" size={18} />
        <span>Girar</span>
      </>
    ),
    description: 'Girar a caneca',
  },
  {
    value: 'edit',
    label: (
      <>
        <Icon name="move" size={18} />
        <span>Mover estampa</span>
      </>
    ),
    description: 'Mover a estampa sobre a caneca',
  },
]

export function ViewerOverlay({
  hasImage,
  mode,
  onModeChange,
  onView,
  onResetView,
  onZoom,
  guidesVisible,
  onToggleGuides,
  loadingFileName,
  onRequestUpload,
  contextLost,
  onRestore,
}: ViewerOverlayProps) {
  const touch = useCoarsePointer()
  const hint =
    mode === 'edit'
      ? touch
        ? 'Arraste na área de impressão para mover a estampa'
        : 'Arraste sobre a área de impressão para mover a estampa. Fora dela, a caneca gira.'
      : touch
        ? 'Arraste para girar · Use dois dedos para aproximar'
        : 'Arraste para girar · Role para aproximar'

  return (
    <div className="viewer-overlay">
      <p className={`viewer-hint${mode === 'edit' ? ' viewer-hint--edit' : ''}`} aria-live="polite">
        {mode === 'edit' && <Icon name="move" size={16} />}
        {hint}
      </p>

      <div className="viewer-views">
        <nav className="viewer-views__group" aria-label="Vistas da caneca">
          {VIEWS.map(({ view, label, description }) => (
            <button key={view} type="button" className="chip" title={description} onClick={() => onView(view)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="viewer-views__divider" aria-hidden="true" />
        <button
          type="button"
          className="chip viewer-guides"
          onClick={onToggleGuides}
          aria-pressed={guidesVisible}
          aria-label="Guias de edição"
          title={guidesVisible ? 'Ocultar as guias e ver o resultado final' : 'Mostrar a área de impressão na caneca'}
        >
          <Icon name={guidesVisible ? 'eye' : 'eyeOff'} size={17} />
          <span className="viewer-guides__label">Guias</span>
        </button>
      </div>

      <div className="viewer-bottom">
        {hasImage ? (
          <SegmentedControl label="Modo de interação" options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
        ) : (
          <button type="button" className="button button--primary viewer-cta" onClick={onRequestUpload}>
            <Icon name="upload" size={18} />
            Adicionar imagem
          </button>
        )}

        <div className="viewer-zoom" role="group" aria-label="Zoom e vista">
          <button type="button" className="icon-button" onClick={() => onZoom(-1)} aria-label="Afastar" title="Afastar">
            <Icon name="zoomOut" />
          </button>
          <button type="button" className="icon-button" onClick={() => onZoom(1)} aria-label="Aproximar" title="Aproximar">
            <Icon name="zoomIn" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onResetView}
            aria-label="Voltar à vista inicial"
            title="Voltar à vista inicial"
          >
            <Icon name="focus" />
          </button>
        </div>
      </div>

      {loadingFileName && (
        <div className="viewer-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Aplicando imagem…</span>
        </div>
      )}

      {contextLost && (
        <div className="viewer-lost" role="alert">
          <p>A visualização 3D foi interrompida pelo navegador.</p>
          <button type="button" className="button button--primary" onClick={onRestore}>
            Recarregar visualização
          </button>
        </div>
      )}
    </div>
  )
}
