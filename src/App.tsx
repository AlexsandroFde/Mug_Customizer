import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CustomizationPanel, type PanelTab } from './components/CustomizationPanel/CustomizationPanel'
import type { ImageUploaderHandle } from './components/ImageUploader/ImageUploader'
import { MugViewer, type InteractionMode, type MugViewerHandle } from './components/MugViewer/MugViewer'
import { Icon } from './components/ui/Icon'
import { useFileDrop } from './hooks/useFileDrop'
import { useMugCustomization, type AreaDimension, type ChangeKind } from './hooks/useMugCustomization'
import { getAreaSideOffset, type AreaShape, type PrintArea } from './lib/printArea'
import type { FitMode, PrintSide, PrintTransform } from './lib/printMapping'

/** Tempo que as guias continuam visíveis na caneca depois do último ajuste da estampa. */
const GUIDES_LINGER_MS = 1200

export default function App() {
  const { state, summary, actions } = useMugCustomization()
  const viewer = useRef<MugViewerHandle>(null)
  const uploader = useRef<ImageUploaderHandle>(null)
  const [mode, setMode] = useState<InteractionMode>('orbit')
  const [tab, setTab] = useState<PanelTab>('image')
  const [draggingIn3d, setDraggingIn3d] = useState(false)
  const [draggingIn2d, setDraggingIn2d] = useState(false)
  const [recentlyAdjusted, setRecentlyAdjusted] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)

  /**
   * Guias de edição na caneca. Aparecem sozinhas enquanto o usuário configura a área (aba Área)
   * ou move a estampa (modo de ajuste) e somem ao sair desses contextos. O botão de guias, na
   * cena, permite ocultá-las a qualquer momento para ver o resultado final, ou mostrá-las.
   */
  const editingContext = tab === 'area' || mode === 'edit'
  const [guides, setGuides] = useState({ context: editingContext, visible: editingContext })
  if (guides.context !== editingContext) setGuides({ context: editingContext, visible: editingContext })
  const showGuides = useCallback(() => setGuides((current) => (current.visible ? current : { ...current, visible: true })), [])

  /** Mostra as guias por alguns instantes após um ajuste da estampa. */
  const pulseGuides = useCallback(() => {
    setRecentlyAdjusted(true)
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = window.setTimeout(() => setRecentlyAdjusted(false), GUIDES_LINGER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(lingerTimer.current), [])

  const guidesVisible = guides.visible || draggingIn3d || draggingIn2d || recentlyAdjusted
  const toggleGuides = () => {
    window.clearTimeout(lingerTimer.current)
    setRecentlyAdjusted(false)
    setGuides((current) => ({ ...current, visible: !guidesVisible }))
  }

  const handleTransformChange = useCallback(
    (patch: Partial<PrintTransform>, kind: ChangeKind) => {
      actions.updateTransform(patch, kind)
      pulseGuides()
    },
    [actions, pulseGuides],
  )

  // Ajustar a área é configurá-la: as guias voltam a aparecer, mesmo que tenham sido ocultadas.
  const panelActions = useMemo(
    () => ({
      ...actions,
      setFit: (fit: FitMode) => {
        actions.setFit(fit)
        pulseGuides()
      },
      center: () => {
        actions.center()
        pulseGuides()
      },
      reset: () => {
        actions.reset()
        pulseGuides()
      },
      setArea: (area: PrintArea, kind?: ChangeKind) => {
        actions.setArea(area, kind)
        showGuides()
      },
      setAreaShape: (shape: AreaShape) => {
        actions.setAreaShape(shape)
        showGuides()
      },
      setAreaSize: (dimension: AreaDimension, value: number) => {
        actions.setAreaSize(dimension, value)
        showGuides()
      },
      moveArea: (offset: { offsetX?: number; offsetY?: number }, kind?: ChangeKind) => {
        actions.moveArea(offset, kind)
        showGuides()
      },
      centerArea: () => {
        actions.centerArea()
        viewer.current?.focusPrint(0)
        showGuides()
      },
      resetArea: () => {
        actions.resetArea()
        showGuides()
      },
    }),
    [actions, pulseGuides, showGuides],
  )

  const handleAreaSideChange = (side: PrintSide) => {
    actions.placeAreaOnSide(side)
    // Leva a câmera até o lado escolhido para que a área continue à vista.
    viewer.current?.focusPrint(getAreaSideOffset(side, state.area))
    showGuides()
  }

  // Ao aplicar uma imagem nova, enquadra a área de impressão, onde a estampa começa centralizada.
  const imageId = state.image?.id
  useEffect(() => {
    if (imageId !== undefined) viewer.current?.setView('print')
  }, [imageId])

  // Esc encerra o modo de ajuste da estampa.
  useEffect(() => {
    if (mode !== 'edit') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('orbit')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  const dropActive = useFileDrop(actions.loadFile)
  const requestUpload = () => uploader.current?.open()

  return (
    <div className="app">
      <main className="app__viewer">
        <MugViewer
          ref={viewer}
          image={state.image}
          transform={state.transform}
          area={state.area}
          colors={state.colors}
          animate={state.changeKind === 'discrete'}
          mode={mode}
          onModeChange={setMode}
          guidesVisible={guidesVisible}
          onToggleGuides={toggleGuides}
          loadingFileName={state.upload.state === 'loading' ? state.upload.fileName : null}
          onPrintMove={handleTransformChange}
          onDraggingChange={setDraggingIn3d}
          onRequestUpload={requestUpload}
        />
      </main>

      <aside className="app__panel" aria-label="Personalização">
        <CustomizationPanel
          state={state}
          summary={summary}
          actions={panelActions}
          uploaderRef={uploader}
          tab={tab}
          onTabChange={setTab}
          onTransformChange={handleTransformChange}
          onAreaSideChange={handleAreaSideChange}
          onRequestUpload={requestUpload}
          onLayoutDraggingChange={setDraggingIn2d}
        />
      </aside>

      {dropActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__card">
            <Icon name="image" size={32} />
            <p>Solte a imagem para aplicá-la na caneca</p>
          </div>
        </div>
      )}
    </div>
  )
}
