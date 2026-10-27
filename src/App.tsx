import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CustomizationPanel } from './components/CustomizationPanel/CustomizationPanel'
import type { ImageUploaderHandle } from './components/ImageUploader/ImageUploader'
import { MugViewer, type InteractionMode, type MugViewerHandle } from './components/MugViewer/MugViewer'
import { Icon } from './components/ui/Icon'
import { useFileDrop } from './hooks/useFileDrop'
import { useMugCustomization, type ChangeKind } from './hooks/useMugCustomization'
import { getPrintedSize, getSideOffset, type FitMode, type PrintSide, type PrintTransform } from './lib/printMapping'

/** Tempo que as guias continuam visíveis na caneca depois do último ajuste. */
const GUIDES_LINGER_MS = 1200

export default function App() {
  const { state, summary, actions } = useMugCustomization()
  const viewer = useRef<MugViewerHandle>(null)
  const uploader = useRef<ImageUploaderHandle>(null)
  const [mode, setMode] = useState<InteractionMode>('orbit')
  const [draggingIn3d, setDraggingIn3d] = useState(false)
  const [draggingIn2d, setDraggingIn2d] = useState(false)
  const [recentlyAdjusted, setRecentlyAdjusted] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)

  /** Mostra as guias de impressão na caneca por alguns instantes após um ajuste. */
  const pulseGuides = useCallback(() => {
    setRecentlyAdjusted(true)
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = window.setTimeout(() => setRecentlyAdjusted(false), GUIDES_LINGER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(lingerTimer.current), [])

  const handleTransformChange = useCallback(
    (patch: Partial<PrintTransform>, kind: ChangeKind) => {
      actions.updateTransform(patch, kind)
      pulseGuides()
    },
    [actions, pulseGuides],
  )

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
    }),
    [actions, pulseGuides],
  )

  const handleSideChange = (side: PrintSide) => {
    if (!state.image) return
    const size = getPrintedSize(state.image.aspect, state.transform)
    actions.placeOnSide(side)
    // Leva a câmera até o lado escolhido para que a estampa continue à vista.
    viewer.current?.focusPrint(getSideOffset(side, state.transform.rotation, size))
    pulseGuides()
  }

  // Ao aplicar uma imagem nova, enquadra a estampa (que sempre começa centralizada).
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
  const hasImage = !!state.image
  const guidesVisible = hasImage && (mode === 'edit' || draggingIn3d || draggingIn2d || recentlyAdjusted)

  return (
    <div className="app">
      <main className="app__viewer">
        <MugViewer
          ref={viewer}
          image={state.image}
          transform={state.transform}
          animate={state.changeKind === 'discrete'}
          mode={mode}
          onModeChange={setMode}
          guidesVisible={guidesVisible}
          loadingFileName={state.upload.state === 'loading' ? state.upload.fileName : null}
          onPrintMove={handleTransformChange}
          onDraggingChange={setDraggingIn3d}
          onRequestUpload={() => uploader.current?.open()}
        />
      </main>

      <aside className="app__panel" aria-label="Personalização">
        <CustomizationPanel
          state={state}
          summary={summary}
          actions={panelActions}
          uploaderRef={uploader}
          onTransformChange={handleTransformChange}
          onSideChange={handleSideChange}
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
