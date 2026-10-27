import { ContactShadows } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import type { MugColors } from '../../config/mugColors'
import type { ChangeKind, PrintImage } from '../../hooks/useMugCustomization'
import type { PrintArea } from '../../lib/printArea'
import { printOffsetToAngle, type PrintTransform } from '../../lib/printMapping'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CameraRig, type CameraRigHandle, type ViewPreset } from './CameraRig'
import { MugModel } from './MugModel'
import { PrintDragController } from './PrintDragController'
import { StudioLighting } from './StudioLighting'
import { ViewerOverlay } from './ViewerOverlay'

export type InteractionMode = 'orbit' | 'edit'

export interface MugViewerHandle {
  /** Gira a câmera até a posição horizontal informada (cm, no referencial da região imprimível). */
  focusPrint(offsetX: number): void
  setView(view: ViewPreset): void
}

interface MugViewerProps {
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  colors: MugColors
  animate: boolean
  mode: InteractionMode
  onModeChange(mode: InteractionMode): void
  /** Guias de edição (limites, área e contorno da imagem) desenhadas na caneca. */
  guidesVisible: boolean
  onToggleGuides(): void
  loadingFileName: string | null
  onPrintMove(offset: Pick<PrintTransform, 'offsetX' | 'offsetY'>, kind: ChangeKind): void
  onDraggingChange(dragging: boolean): void
  onRequestUpload(): void
}

const ROTATE_STEP = THREE.MathUtils.degToRad(15)
const TILT_STEP = THREE.MathUtils.degToRad(10)

export const MugViewer = forwardRef<MugViewerHandle, MugViewerProps>(function MugViewer(
  {
    image,
    transform,
    area,
    colors,
    animate,
    mode,
    onModeChange,
    guidesVisible,
    onToggleGuides,
    loadingFileName,
    onPrintMove,
    onDraggingChange,
    onRequestUpload,
  },
  ref,
) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const rig = useRef<CameraRigHandle>(null)
  const [canvasKey, setCanvasKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const [printHover, setPrintHover] = useState(false)
  const [printDragging, setPrintDragging] = useState(false)

  const setView = useCallback((view: ViewPreset) => rig.current?.setView(view), [])
  useImperativeHandle(
    ref,
    () => ({ focusPrint: (offsetX) => rig.current?.faceAngle(printOffsetToAngle(offsetX)), setView }),
    [setView],
  )
  const zoom = useCallback((direction: 1 | -1) => rig.current?.zoom(direction), [])

  const handleDraggingChange = useCallback(
    (dragging: boolean) => {
      setPrintDragging(dragging)
      onDraggingChange(dragging)
    },
    [onDraggingChange],
  )
  const handlePrintMove = useCallback(
    (offset: Pick<PrintTransform, 'offsetX' | 'offsetY'>) => onPrintMove(offset, 'continuous'),
    [onPrintMove],
  )

  const editing = mode === 'edit' && !!image
  /** Vista para a qual o botão de "vista inicial" retorna. */
  const homeView: ViewPreset = image ? 'print' : 'initial'

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rig.current?.rotateBy(ROTATE_STEP, 0),
      ArrowRight: () => rig.current?.rotateBy(-ROTATE_STEP, 0),
      ArrowUp: () => rig.current?.rotateBy(0, TILT_STEP),
      ArrowDown: () => rig.current?.rotateBy(0, -TILT_STEP),
      '+': () => zoom(1),
      '=': () => zoom(1),
      '-': () => zoom(-1),
      Home: () => setView(homeView),
      '0': () => setView(homeView),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  return (
    <div
      ref={setContainer}
      className="viewer"
      data-mode={editing ? 'edit' : 'orbit'}
      data-print-hover={editing && printHover ? 'true' : undefined}
      data-dragging={printDragging ? 'true' : undefined}
      tabIndex={0}
      role="group"
      aria-roledescription="visualização 3D"
      aria-label="Caneca em 3D. Arraste para girar e use a rolagem ou o gesto de pinça para aproximar. Pelo teclado: setas giram, + e - aproximam e Home volta à vista inicial."
      onKeyDown={onKeyDown}
    >
      <ErrorBoundary
        fallback={
          <div className="viewer__fallback" role="alert">
            <p className="viewer__fallback-title">Não foi possível exibir a caneca em 3D.</p>
            <p>Verifique se o navegador é compatível com WebGL 2 e se a aceleração por hardware está ativada.</p>
          </div>
        }
      >
        <Canvas
          key={canvasKey}
          className="viewer__canvas"
          shadows="percentage"
          frameloop="demand"
          dpr={[1, 2]}
          // Lente longa, como em fotografia de produto: menos distorção de perspectiva.
          camera={{ fov: 24, near: 1, far: 400, position: [0, 14, 38] }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.NeutralToneMapping,
            toneMappingExposure: 1,
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault()
              setContextLost(true)
            })
          }}
        >
          <StudioLighting />
          <MugModel
            image={image}
            transform={transform}
            area={area}
            animate={animate}
            guidesVisible={guidesVisible}
            colors={colors}
          />
          <ContactShadows position={[0, 0.001, 0]} scale={26} resolution={1024} far={7} blur={2.4} opacity={0.5} color="#1f2633" frames={1} />
          <CameraRig ref={rig} printOffsetX={area.offsetX} />
          <PrintDragController
            enabled={editing}
            container={container}
            transform={transform}
            area={area}
            onMove={handlePrintMove}
            onDraggingChange={handleDraggingChange}
            onHoverChange={setPrintHover}
          />
        </Canvas>
      </ErrorBoundary>

      <ViewerOverlay
        hasImage={!!image}
        mode={editing ? 'edit' : 'orbit'}
        onModeChange={onModeChange}
        onView={setView}
        onResetView={() => setView(homeView)}
        onZoom={zoom}
        guidesVisible={guidesVisible}
        onToggleGuides={onToggleGuides}
        loadingFileName={loadingFileName}
        onRequestUpload={onRequestUpload}
        contextLost={contextLost}
        onRestore={() => {
          setContextLost(false)
          setCanvasKey((key) => key + 1)
        }}
      />
    </div>
  )
})
