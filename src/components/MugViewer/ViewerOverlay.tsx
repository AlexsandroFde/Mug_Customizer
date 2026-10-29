import type { MugPart } from '../../config/mugColors'
import { getPartInfo } from '../../config/mugColors'
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
  /** Baixa uma foto da vista atual da caneca (PNG). */
  onSavePhoto(): void
  savingPhoto: boolean
  /** Dica de uso inicial, até a primeira vez que o usuário gira ou aproxima a caneca. */
  showIntroHint: boolean
  /** Parte sob o ponteiro quando a seleção de partes está ativa. */
  hoveredPart: MugPart | null
  loadingFileName: string | null
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
        <span>
          Mover<span className="mode-label-extra"> estampa</span>
        </span>
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
  onSavePhoto,
  savingPhoto,
  showIntroHint,
  hoveredPart,
  loadingFileName,
  contextLost,
  onRestore,
}: ViewerOverlayProps) {
  const touch = useCoarsePointer()

  return (
    <div className="viewer-overlay">
      {mode === 'edit' ? (
        <p className="viewer-banner" role="status">
          <Icon name="move" size={16} />
          {touch ? 'Arraste na área de impressão para mover a estampa' : 'Arraste sobre a área de impressão para mover a estampa'}
        </p>
      ) : (
        hoveredPart && (
          <p className="viewer-tag" aria-hidden="true">
            <Icon name="palette" size={15} />
            {touch ? 'Toque' : 'Clique'} para editar a cor {getPartInfo(hoveredPart).ofLabel}
          </p>
        )
      )}

      <div className="toolbar viewer-views">
        <nav className="toolbar__group" aria-label="Vistas da caneca">
          {VIEWS.map(({ view, label, description }) => (
            <button key={view} type="button" className="toolbar__button" title={description} onClick={() => onView(view)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="toolbar__divider" aria-hidden="true" />
        <button
          type="button"
          className="toolbar__button toolbar__button--toggle"
          onClick={onToggleGuides}
          aria-pressed={guidesVisible}
          title={guidesVisible ? 'Ocultar as guias e ver o resultado final' : 'Mostrar a área de impressão na caneca'}
        >
          <Icon name={guidesVisible ? 'eye' : 'eyeOff'} size={17} />
          <span className="toolbar__label">Guias</span>
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={onSavePhoto}
          disabled={savingPhoto}
          aria-label="Baixar foto da caneca"
          title="Baixar foto da caneca (PNG, como aparece na tela)"
        >
          {savingPhoto ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="camera" size={18} />}
        </button>
      </div>

      {showIntroHint && mode === 'orbit' && !loadingFileName && (
        <p className="viewer-hint" aria-hidden="true">
          {touch ? 'Arraste para girar · Use dois dedos para aproximar' : 'Arraste para girar · Role para aproximar'}
        </p>
      )}

      <div className="viewer-bottom">
        {hasImage ? (
          <SegmentedControl label="Modo de interação" options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
        ) : (
          <span />
        )}

        <div className="toolbar" role="group" aria-label="Zoom e enquadramento">
          <button type="button" className="toolbar__icon" onClick={() => onZoom(-1)} aria-label="Afastar" title="Afastar">
            <Icon name="zoomOut" />
          </button>
          <button type="button" className="toolbar__icon" onClick={() => onZoom(1)} aria-label="Aproximar" title="Aproximar">
            <Icon name="zoomIn" />
          </button>
          <button
            type="button"
            className="toolbar__icon"
            onClick={onResetView}
            aria-label="Voltar ao enquadramento inicial"
            title="Voltar ao enquadramento inicial"
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
