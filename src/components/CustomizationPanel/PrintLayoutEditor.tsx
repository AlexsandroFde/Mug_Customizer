import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CIRCUMFERENCE, MUG, PRINT_AREA, PRINT_CENTER_Y, PRINT_HEIGHT, PRINT_WIDTH } from '../../config/mugSpec'
import type { ChangeKind, PrintImage } from '../../hooks/useMugCustomization'
import { getPrintedSize, snapValue, type PrintTransform } from '../../lib/printMapping'

interface PrintLayoutEditorProps {
  image: PrintImage | null
  transform: PrintTransform
  onMove(offset: Pick<PrintTransform, 'offsetX' | 'offsetY'>, kind: ChangeKind): void
  onDraggingChange(dragging: boolean): void
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
}

/**
 * Coordenadas do SVG em cm: x ao longo da circunferência (0 = lado oposto à alça) e
 * y crescendo para baixo a partir do topo da caneca, como na arte de sublimação.
 */
const HALF_CIRCUMFERENCE = CIRCUMFERENCE / 2
const PADDING = 0.3
const VIEW_BOX = [-HALF_CIRCUMFERENCE - PADDING, -PADDING, CIRCUMFERENCE + PADDING * 2, MUG.height + PADDING * 2].join(' ')
const toSvgY = (heightFromTable: number) => MUG.height - heightFromTable
const AREA_TOP = toSvgY(PRINT_AREA.top)
const AREA_BOTTOM = toSvgY(PRINT_AREA.bottom)
const AREA_CENTER_Y = toSvgY(PRINT_CENTER_Y)
const HANDLE_ZONE_WIDTH = HALF_CIRCUMFERENCE - PRINT_WIDTH / 2
/** Distância de atração para o centro, em pixels de tela. */
const SNAP_PIXELS = 7
const KEY_STEP = 0.1
const KEY_STEP_LARGE = 1

export function PrintLayoutEditor({ image, transform, onMove, onDraggingChange }: PrintLayoutEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<DragState | null>(null)
  const [snapped, setSnapped] = useState({ x: false, y: false })
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const areaClip = `${id}-area`
  const wallClip = `${id}-wall`
  const hatch = `${id}-hatch`

  const toLocal = (clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y, pixelsPerCm: Math.hypot(matrix.a, matrix.b) }
  }

  const setDragActive = (active: boolean) => {
    setDragging(active)
    onDraggingChange(active)
  }

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!image || (event.pointerType === 'mouse' && event.button !== 0)) return
    const point = toLocal(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    drag.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startOffsetX: transform.offsetX,
      startOffsetY: transform.offsetY,
    }
    setDragActive(true)
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const point = toLocal(event.clientX, event.clientY)
    if (!point) return
    const threshold = SNAP_PIXELS / point.pixelsPerCm
    const x = snapValue(state.startOffsetX + (point.x - state.startX), threshold)
    const y = snapValue(state.startOffsetY - (point.y - state.startY), threshold)
    setSnapped({ x: x.snapped, y: y.snapped })
    onMove({ offsetX: x.value, offsetY: y.value }, 'continuous')
  }

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return
    drag.current = null
    setSnapped({ x: false, y: false })
    setDragActive(false)
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!image) return
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    onMove({ offsetX: transform.offsetX + move[0], offsetY: transform.offsetY + move[1] }, 'continuous')
  }

  const size = image ? getPrintedSize(image.aspect, transform) : null
  const placement = `translate(${transform.offsetX} ${AREA_CENTER_Y - transform.offsetY}) rotate(${transform.rotation})`
  const artwork = image && size && (
    <image
      href={image.thumbnailUrl}
      x={-size.width / 2}
      y={-size.height / 2}
      width={size.width}
      height={size.height}
      preserveAspectRatio="none"
    />
  )

  return (
    <div className={`layout-editor${image ? ' layout-editor--interactive' : ''}${dragging ? ' is-dragging' : ''}`}>
      <svg
        ref={svgRef}
        className="layout-editor__svg"
        viewBox={VIEW_BOX}
        role="group"
        aria-label={
          image
            ? 'Área de impressão desenrolada. Arraste a imagem ou use as setas do teclado para posicioná-la; Shift acelera.'
            : 'Área de impressão desenrolada da caneca.'
        }
        tabIndex={image ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <defs>
          <pattern id={hatch} width={0.42} height={0.42} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={0.42} height={0.42} className="layout-editor__hatch-bg" />
            <line x1={0} y1={0} x2={0} y2={0.42} className="layout-editor__hatch-line" />
          </pattern>
          <clipPath id={areaClip}>
            <rect x={-PRINT_WIDTH / 2} y={AREA_TOP} width={PRINT_WIDTH} height={PRINT_HEIGHT} />
          </clipPath>
          <clipPath id={wallClip}>
            <rect x={-HALF_CIRCUMFERENCE} y={0} width={CIRCUMFERENCE} height={MUG.height} rx={0.3} />
          </clipPath>
        </defs>

        <rect className="layout-editor__wall" x={-HALF_CIRCUMFERENCE} y={0} width={CIRCUMFERENCE} height={MUG.height} rx={0.3} />

        {/* Regiões sem impressão: junto à alça (nas duas pontas), à borda e à base. */}
        <g fill={`url(#${hatch})`} clipPath={`url(#${wallClip})`}>
          <rect x={-HALF_CIRCUMFERENCE} y={0} width={HANDLE_ZONE_WIDTH} height={MUG.height} />
          <rect x={PRINT_WIDTH / 2} y={0} width={HANDLE_ZONE_WIDTH} height={MUG.height} />
          <rect x={-PRINT_WIDTH / 2} y={0} width={PRINT_WIDTH} height={AREA_TOP} />
          <rect x={-PRINT_WIDTH / 2} y={AREA_BOTTOM} width={PRINT_WIDTH} height={MUG.height - AREA_BOTTOM} />
        </g>

        {artwork && (
          <>
            {/* Parte cortada, esmaecida, para mostrar o que fica de fora. */}
            <g clipPath={`url(#${wallClip})`} className="layout-editor__overflow">
              <g transform={placement}>{artwork}</g>
            </g>
            <g clipPath={`url(#${areaClip})`} className="layout-editor__artwork">
              <g transform={placement}>{artwork}</g>
            </g>
            <g transform={placement}>
              <rect
                className="layout-editor__bounds"
                x={-size.width / 2}
                y={-size.height / 2}
                width={size.width}
                height={size.height}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </>
        )}

        <rect
          className="layout-editor__area"
          x={-PRINT_WIDTH / 2}
          y={AREA_TOP}
          width={PRINT_WIDTH}
          height={PRINT_HEIGHT}
          vectorEffect="non-scaling-stroke"
        />

        {snapped.x && (
          <line className="layout-editor__guide" x1={0} y1={AREA_TOP} x2={0} y2={AREA_BOTTOM} vectorEffect="non-scaling-stroke" />
        )}
        {snapped.y && (
          <line
            className="layout-editor__guide"
            x1={-PRINT_WIDTH / 2}
            y1={AREA_CENTER_Y}
            x2={PRINT_WIDTH / 2}
            y2={AREA_CENTER_Y}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {[-1, 1].map((side) => {
          const x = side * (HALF_CIRCUMFERENCE - HANDLE_ZONE_WIDTH / 2)
          return (
            <text
              key={side}
              className="layout-editor__label"
              x={x}
              y={MUG.height / 2}
              transform={`rotate(${side * 90} ${x} ${MUG.height / 2})`}
            >
              ALÇA
            </text>
          )
        })}

        {!image && (
          <text className="layout-editor__empty" x={0} y={AREA_CENTER_Y}>
            Sua imagem aparecerá aqui
          </text>
        )}
      </svg>
    </div>
  )
}
