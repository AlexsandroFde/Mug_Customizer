import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CIRCUMFERENCE, MUG, PRINTABLE } from '../../config/mugSpec'
import { getImagePixels, type ChangeKind, type PrintImage } from '../../hooks/useMugCustomization'
import {
  getAreaHandles,
  getAreaLimits,
  getHandlePosition,
  isInsideArea,
  moveArea,
  resizeAreaFromHandle,
  type AreaHandle,
  type PrintArea,
} from '../../lib/printArea'
import { getImageCenter, getPrintedSize, snapValue, type Point, type PrintTransform } from '../../lib/printMapping'

/** O que o arraste no editor manipula: a imagem dentro da área ou a própria área. */
export type LayoutTarget = 'image' | 'area'

interface PrintLayoutEditorProps {
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  target: LayoutTarget
  onImageMove(offset: Pick<PrintTransform, 'offsetX' | 'offsetY'>, kind: ChangeKind): void
  onAreaChange(area: PrintArea, kind: ChangeKind): void
  onDraggingChange(dragging: boolean): void
}

type DragState =
  | { kind: 'image'; pointerId: number; start: Point; startOffset: Point }
  | { kind: 'area-move'; pointerId: number; start: Point; startArea: PrintArea }
  | { kind: 'area-resize'; pointerId: number; handle: AreaHandle; startArea: PrintArea }

/**
 * Coordenadas do SVG em cm: x ao longo da circunferência (0 = centro da região imprimível, oposto
 * à alça) e y crescendo para baixo a partir do topo da caneca, como na arte de sublimação.
 */
const HALF_CIRCUMFERENCE = CIRCUMFERENCE / 2
const PADDING = 0.3
const VIEW_BOX = [-HALF_CIRCUMFERENCE - PADDING, -PADDING, CIRCUMFERENCE + PADDING * 2, MUG.height + PADDING * 2].join(' ')
/** Converte a altura do referencial de impressão (y para cima, 0 no centro) para o SVG. */
const toSvgY = (y: number) => MUG.height - PRINTABLE.centerY - y
const fromSvgY = (svgY: number) => MUG.height - PRINTABLE.centerY - svgY
const PRINTABLE_TOP = toSvgY(PRINTABLE.height / 2)
const PRINTABLE_BOTTOM = toSvgY(-PRINTABLE.height / 2)
const HANDLE_ZONE_WIDTH = HALF_CIRCUMFERENCE - PRINTABLE.width / 2
/** Distância de atração para o centro, em pixels de tela. */
const SNAP_PIXELS = 7
const KEY_STEP = 0.1
const KEY_STEP_LARGE = 1
/** Meio lado da alça visível e raio da região sensível ao toque, em cm. */
const HANDLE_SIZE = 0.3
const HANDLE_HIT_RADIUS = 0.95
/** Folga ao redor da área que ainda permite agarrá-la para mover. */
const AREA_GRAB_MARGIN = 0.3

const HANDLE_CURSORS: Record<AreaHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const HANDLE_LABELS: Record<AreaHandle, string> = {
  n: 'topo',
  s: 'base',
  e: 'direita',
  w: 'esquerda',
  ne: 'canto superior direito',
  nw: 'canto superior esquerdo',
  se: 'canto inferior direito',
  sw: 'canto inferior esquerdo',
}

export function PrintLayoutEditor({
  image,
  transform,
  area,
  target,
  onImageMove,
  onAreaChange,
  onDraggingChange,
}: PrintLayoutEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<DragState | null>(null)
  const [snapped, setSnapped] = useState({ x: false, y: false })
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const areaClip = `${id}-area`
  const wallClip = `${id}-wall`
  const hatch = `${id}-hatch`
  const interactive = target === 'area' || !!image

  /** Ponto do ponteiro no referencial de impressão (y para cima). */
  const toPrint = (clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: fromSvgY(point.y), pixelsPerCm: Math.hypot(matrix.a, matrix.b) }
  }

  const setDragActive = (active: boolean) => {
    setDragging(active)
    onDraggingChange(active)
  }

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || (event.pointerType === 'mouse' && event.button !== 0)) return
    const point = toPrint(event.clientX, event.clientY)
    if (!point) return

    if (target === 'area') {
      const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle') as AreaHandle | null
      if (handle) {
        drag.current = { kind: 'area-resize', pointerId: event.pointerId, handle, startArea: area }
      } else if (isInsideArea(area, point, AREA_GRAB_MARGIN)) {
        drag.current = { kind: 'area-move', pointerId: event.pointerId, start: point, startArea: area }
      } else {
        return
      }
    } else {
      drag.current = {
        kind: 'image',
        pointerId: event.pointerId,
        start: point,
        startOffset: { x: transform.offsetX, y: transform.offsetY },
      }
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    setDragActive(true)
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const point = toPrint(event.clientX, event.clientY)
    if (!point) return
    const threshold = SNAP_PIXELS / point.pixelsPerCm

    if (state.kind === 'area-resize') {
      onAreaChange(resizeAreaFromHandle(state.startArea, state.handle, point), 'continuous')
      return
    }
    const startX = state.kind === 'image' ? state.startOffset.x : state.startArea.offsetX
    const startY = state.kind === 'image' ? state.startOffset.y : state.startArea.offsetY
    const x = snapValue(startX + (point.x - state.start.x), threshold)
    const y = snapValue(startY + (point.y - state.start.y), threshold)
    setSnapped({ x: x.snapped, y: y.snapped })
    if (state.kind === 'image') onImageMove({ offsetX: x.value, offsetY: y.value }, 'continuous')
    else onAreaChange(moveArea(state.startArea, x.value, y.value), 'continuous')
  }

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return
    drag.current = null
    setSnapped({ x: false, y: false })
    setDragActive(false)
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive) return
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
    if (target === 'area') onAreaChange(moveArea(area, area.offsetX + move[0], area.offsetY + move[1]), 'continuous')
    else onImageMove({ offsetX: transform.offsetX + move[0], offsetY: transform.offsetY + move[1] }, 'continuous')
  }

  const size = image ? getPrintedSize(getImagePixels(image), transform, area) : null
  const imageCenter = getImageCenter(area, transform)
  const placement = `translate(${imageCenter.x} ${toSvgY(imageCenter.y)}) rotate(${transform.rotation})`
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

  const left = area.offsetX - area.width / 2
  const right = area.offsetX + area.width / 2
  const top = toSvgY(area.offsetY + area.height / 2)
  const bottom = toSvgY(area.offsetY - area.height / 2)
  const limits = getAreaLimits(area)
  const edges = [
    { key: 'top', x1: left, y1: top, x2: right, y2: top, limit: limits.top },
    { key: 'right', x1: right, y1: top, x2: right, y2: bottom, limit: limits.right },
    { key: 'bottom', x1: left, y1: bottom, x2: right, y2: bottom, limit: limits.bottom },
    { key: 'left', x1: left, y1: top, x2: left, y2: bottom, limit: limits.left },
  ]

  return (
    <div
      className={`layout-editor layout-editor--${target}${interactive ? ' layout-editor--interactive' : ''}${dragging ? ' is-dragging' : ''}`}
    >
      <svg
        ref={svgRef}
        className="layout-editor__svg"
        viewBox={VIEW_BOX}
        role="group"
        aria-label={
          target === 'area'
            ? 'Área de impressão sobre a caneca desenrolada. Arraste a área para movê-la ou puxe as alças para redimensioná-la; setas do teclado movem, Shift acelera.'
            : image
              ? 'Caneca desenrolada. Arraste a imagem ou use as setas do teclado para posicioná-la dentro da área; Shift acelera.'
              : 'Caneca desenrolada com a área de impressão.'
        }
        tabIndex={interactive ? 0 : -1}
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
            <rect x={left} y={top} width={area.width} height={area.height} />
          </clipPath>
          <clipPath id={wallClip}>
            <rect x={-HALF_CIRCUMFERENCE} y={0} width={CIRCUMFERENCE} height={MUG.height} rx={0.3} />
          </clipPath>
        </defs>

        <rect className="layout-editor__wall" x={-HALF_CIRCUMFERENCE} y={0} width={CIRCUMFERENCE} height={MUG.height} rx={0.3} />

        {/* Fora da região imprimível: junto à alça (nas duas pontas), à borda e à base. */}
        <g fill={`url(#${hatch})`} clipPath={`url(#${wallClip})`}>
          <rect x={-HALF_CIRCUMFERENCE} y={0} width={HANDLE_ZONE_WIDTH} height={MUG.height} />
          <rect x={PRINTABLE.width / 2} y={0} width={HANDLE_ZONE_WIDTH} height={MUG.height} />
          <rect x={-PRINTABLE.width / 2} y={0} width={PRINTABLE.width} height={PRINTABLE_TOP} />
          <rect x={-PRINTABLE.width / 2} y={PRINTABLE_BOTTOM} width={PRINTABLE.width} height={MUG.height - PRINTABLE_BOTTOM} />
        </g>

        {/* Dentro do limite físico, mas fora da área escolhida. */}
        <path
          className="layout-editor__outside-area"
          fillRule="evenodd"
          d={`M${-PRINTABLE.width / 2} ${PRINTABLE_TOP}h${PRINTABLE.width}V${PRINTABLE_BOTTOM}h${-PRINTABLE.width}z M${left} ${top}h${area.width}V${bottom}h${-area.width}z`}
        />

        {artwork && (
          <>
            {/* Parte cortada, esmaecida, para mostrar o que fica de fora da área. */}
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

        {edges.map((edge) => (
          <line
            key={edge.key}
            className={`layout-editor__area-edge${edge.limit ? ' is-limit' : ''}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {snapped.x && (
          <line
            className="layout-editor__guide"
            x1={target === 'area' ? 0 : area.offsetX}
            y1={target === 'area' ? PRINTABLE_TOP : top}
            x2={target === 'area' ? 0 : area.offsetX}
            y2={target === 'area' ? PRINTABLE_BOTTOM : bottom}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {snapped.y && (
          <line
            className="layout-editor__guide"
            x1={target === 'area' ? -PRINTABLE.width / 2 : left}
            y1={toSvgY(target === 'area' ? 0 : area.offsetY)}
            x2={target === 'area' ? PRINTABLE.width / 2 : right}
            y2={toSvgY(target === 'area' ? 0 : area.offsetY)}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {target === 'area' && (
          <rect className="layout-editor__area-body" x={left} y={top} width={area.width} height={area.height} />
        )}

        {target === 'area' &&
          getAreaHandles(area).map((handle) => {
            const position = getHandlePosition(area, handle)
            const y = toSvgY(position.y)
            return (
              <g key={handle} data-handle={handle} className="layout-editor__handle" style={{ cursor: HANDLE_CURSORS[handle] }}>
                <title>{`Redimensionar pelo ${HANDLE_LABELS[handle]}`}</title>
                <circle cx={position.x} cy={y} r={HANDLE_HIT_RADIUS} className="layout-editor__handle-hit" />
                <rect
                  x={position.x - HANDLE_SIZE}
                  y={y - HANDLE_SIZE}
                  width={HANDLE_SIZE * 2}
                  height={HANDLE_SIZE * 2}
                  rx={0.06}
                  className="layout-editor__handle-knob"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}

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

        {!image && area.width >= 9 && area.height >= 2.5 && (
          <text className="layout-editor__empty" x={area.offsetX} y={toSvgY(area.offsetY)}>
            Sua imagem aparecerá aqui
          </text>
        )}
      </svg>
    </div>
  )
}
