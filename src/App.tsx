import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CustomizationPanel, type PanelActions, type PanelTab } from './components/CustomizationPanel/CustomizationPanel'
import { ExportDialog } from './components/ExportDialog/ExportDialog'
import { ImageFileInput, type ImageFileInputHandle } from './components/ImageUploader/ImageUploader'
import type { PartHighlight } from './components/MugViewer/MugModel'
import { MugViewer, type InteractionMode, type MugViewerHandle } from './components/MugViewer/MugViewer'
import { Icon } from './components/ui/Icon'
import { Toast, type ToastMessage } from './components/ui/Toast'
import { resolveMugColors, type MugPart } from './config/mugColors'
import { useFileDrop } from './hooks/useFileDrop'
import { downloadBlob } from './lib/download'
import { formatFileSize } from './lib/format'
import { isPristine, useMugCustomization, type AreaDimension, type ChangeKind } from './hooks/useMugCustomization'
import { getAreaSideOffset, type AreaShape, type PrintArea } from './lib/printArea'
import type { FitMode, PrintSide, PrintTransform } from './lib/printMapping'

/** Tempo que as guias continuam visíveis na caneca depois do último ajuste da estampa. */
const GUIDES_LINGER_MS = 1200
const PHOTO_FILE_NAME = 'foto-caneca.png'

export default function App() {
  const { state, summary, actions } = useMugCustomization()
  const viewer = useRef<MugViewerHandle>(null)
  const filePicker = useRef<ImageFileInputHandle>(null)
  const [mode, setMode] = useState<InteractionMode>('orbit')
  const [tab, setTab] = useState<PanelTab>('image')
  const [selectedPart, setSelectedPart] = useState<MugPart>('body')
  const [highlight, setHighlight] = useState<PartHighlight | null>(null)
  const [draggingIn3d, setDraggingIn3d] = useState(false)
  const [draggingIn2d, setDraggingIn2d] = useState(false)
  const [recentlyAdjusted, setRecentlyAdjusted] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const toastId = useRef(0)

  const colors = useMemo(() => resolveMugColors(state.colors), [state.colors])

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
  const panelActions = useMemo<PanelActions>(
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

  /** Seleciona uma parte (pela lista ou clicando na caneca) e a destaca brevemente no 3D. */
  const selectPart = useCallback((part: MugPart) => {
    setSelectedPart(part)
    setTab('colors')
    setHighlight({ part, key: Date.now() })
  }, [])

  const resetAll = () => {
    const snapshot = { transform: state.transform, area: state.area, colors: state.colors }
    actions.resetAll()
    setToast({
      id: ++toastId.current,
      text: 'Estampa, área e cores voltaram ao padrão.',
      action: { label: 'Desfazer', run: () => actions.restore(snapshot) },
    })
  }

  /** Foto da caneca como aparece na tela (a estampa planificada sai pelo diálogo de exportação). */
  const savePhoto = async () => {
    setSavingPhoto(true)
    try {
      const blob = await viewer.current?.capture()
      if (!blob) throw new Error('captura vazia')
      downloadBlob(blob, PHOTO_FILE_NAME)
    } catch (error) {
      console.error(error)
      setToast({ id: ++toastId.current, text: 'Não foi possível gerar a foto. Tente novamente.' })
    } finally {
      setSavingPhoto(false)
    }
  }

  // Uma imagem nova abre a aba da estampa e enquadra a área de impressão.
  const imageId = state.image?.id
  const [seenImageId, setSeenImageId] = useState(imageId)
  if (seenImageId !== imageId) {
    setSeenImageId(imageId)
    if (imageId !== undefined) setTab('image')
  }
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

  return (
    <div className="app">
      <main className="app__viewer">
        <MugViewer
          ref={viewer}
          image={state.image}
          transform={state.transform}
          area={state.area}
          colors={colors}
          animate={state.changeKind === 'discrete'}
          mode={mode}
          onModeChange={setMode}
          guidesVisible={guidesVisible}
          onToggleGuides={toggleGuides}
          onSavePhoto={savePhoto}
          savingPhoto={savingPhoto}
          loadingFileName={state.upload.state === 'loading' ? state.upload.fileName : null}
          onPrintMove={handleTransformChange}
          onDraggingChange={setDraggingIn3d}
          pickable={tab === 'colors'}
          highlight={highlight}
          onPartSelect={selectPart}
        />
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </main>

      <aside className="app__panel" aria-label="Personalização">
        <CustomizationPanel
          state={state}
          summary={summary}
          actions={panelActions}
          tab={tab}
          onTabChange={setTab}
          selectedPart={selectedPart}
          onSelectPart={selectPart}
          onTransformChange={handleTransformChange}
          onAreaSideChange={handleAreaSideChange}
          onOpenFilePicker={() => filePicker.current?.open()}
          onLayoutDraggingChange={setDraggingIn2d}
          pristine={isPristine(state)}
          onResetAll={resetAll}
          onOpenExport={() => setExportOpen(true)}
        />
      </aside>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        image={state.image}
        transform={state.transform}
        area={state.area}
        bodyColor={colors.body}
        onRequestUpload={() => filePicker.current?.open()}
        onExported={({ fileName, bytes }) =>
          setToast({ id: ++toastId.current, text: `Estampa exportada: ${fileName} (${formatFileSize(bytes)}).` })
        }
      />

      <ImageFileInput ref={filePicker} onFile={actions.loadFile} />

      {dropActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__card">
            <Icon name="image" size={28} />
            <p>Solte a imagem para aplicá-la na caneca</p>
          </div>
        </div>
      )}
    </div>
  )
}
