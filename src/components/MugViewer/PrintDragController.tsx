import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { MUG } from '../../config/mugSpec'
import { isInsideArea, type PrintArea } from '../../lib/printArea'
import { snapValue, surfaceToPrint, wrapAngle, type PrintTransform } from '../../lib/printMapping'

interface PrintDragControllerProps {
  enabled: boolean
  /** Elemento que envolve o canvas; recebe os eventos na fase de captura. */
  container: HTMLElement | null
  transform: PrintTransform
  area: PrintArea
  onMove(offset: Pick<PrintTransform, 'offsetX' | 'offsetY'>): void
  onDraggingChange(dragging: boolean): void
  onHoverChange(hovering: boolean): void
}

interface DragState {
  pointerId: number
  lastAngle: number
  /** Ângulo percorrido desde o início, acumulado sem saltos na costura de ±π. */
  travelledAngle: number
  startY: number
  startOffsetX: number
  startOffsetY: number
}

/** Folga (cm) ao redor da área de impressão que ainda inicia o arraste. */
const GRAB_MARGIN = 0.4
/** Distância (cm) em que a estampa é atraída para o centro. */
const SNAP_DISTANCE = 0.3

/**
 * Arraste da estampa diretamente sobre a caneca.
 *
 * No modo de ajuste, um gesto que começa sobre a área de impressão move a estampa e é interrompido
 * na fase de captura, antes de chegar aos controles de câmera. Gestos que começam fora dela
 * continuam girando a caneca. A interseção é calculada analiticamente com o cilindro da parede,
 * o que é exato e barato, e continua funcionando quando o ponteiro passa da silhueta.
 */
export function PrintDragController({
  enabled,
  container,
  transform,
  area,
  onMove,
  onDraggingChange,
  onHoverChange,
}: PrintDragControllerProps) {
  const camera = useThree((state) => state.camera)
  const latest = useRef({ transform, area, onMove, onDraggingChange, onHoverChange })
  useLayoutEffect(() => {
    latest.current = { transform, area, onMove, onDraggingChange, onHoverChange }
  })

  useEffect(() => {
    if (!enabled || !container) return
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const point = new THREE.Vector3()
    let drag: DragState | null = null
    let hovering = false

    const setHovering = (value: boolean) => {
      if (value === hovering) return
      hovering = value
      latest.current.onHoverChange(value)
    }

    const castRay = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      return raycaster.ray
    }

    /** Ponto da parede externa sob o ponteiro (a caneca está na origem, sem rotação). */
    const intersectWall = (ray: THREE.Ray, followSilhouette: boolean) => {
      const { origin, direction } = ray
      const a = direction.x * direction.x + direction.z * direction.z
      if (a < 1e-9) return null
      const b = 2 * (origin.x * direction.x + origin.z * direction.z)
      const c = origin.x * origin.x + origin.z * origin.z - MUG.outerRadius * MUG.outerRadius
      const discriminant = b * b - 4 * a * c
      if (discriminant >= 0) {
        const t = (-b - Math.sqrt(discriminant)) / (2 * a)
        if (t > 0) return point.copy(origin).addScaledVector(direction, t)
      }
      if (!followSilhouette) return null
      // Fora da silhueta: usa o ponto do raio mais próximo do eixo, projetado na parede.
      point.copy(origin).addScaledVector(direction, -(origin.x * direction.x + origin.z * direction.z) / a)
      const radius = Math.hypot(point.x, point.z) || 1
      point.x *= MUG.outerRadius / radius
      point.z *= MUG.outerRadius / radius
      return point
    }

    const isOverPrintArea = (event: PointerEvent) => {
      const hit = intersectWall(castRay(event), false)
      return !!hit && isInsideArea(latest.current.area, surfaceToPrint(hit.x, hit.y, hit.z), GRAB_MARGIN)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (drag) {
        // Um segundo dedo durante o arraste não deve iniciar giro ou zoom da câmera.
        event.stopPropagation()
        return
      }
      // Botões sobrepostos à cena continuam funcionando mesmo quando estão sobre a estampa.
      if (!(event.target instanceof HTMLCanvasElement)) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!isOverPrintArea(event)) return
      event.stopPropagation()
      event.preventDefault()
      container.setPointerCapture(event.pointerId)
      const { transform: current } = latest.current
      drag = {
        pointerId: event.pointerId,
        lastAngle: Math.atan2(point.x, point.z),
        travelledAngle: 0,
        startY: point.y,
        startOffsetX: current.offsetX,
        startOffsetY: current.offsetY,
      }
      setHovering(true)
      latest.current.onDraggingChange(true)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) {
        if (event.pointerType === 'mouse' && event.buttons === 0) {
          setHovering(event.target instanceof HTMLCanvasElement && isOverPrintArea(event))
        }
        return
      }
      if (event.pointerId !== drag.pointerId) return
      const hit = intersectWall(castRay(event), true)
      if (!hit) return
      const angle = Math.atan2(hit.x, hit.z)
      drag.travelledAngle += wrapAngle(angle - drag.lastAngle)
      drag.lastAngle = angle
      latest.current.onMove({
        offsetX: snapValue(drag.startOffsetX + drag.travelledAngle * MUG.outerRadius, SNAP_DISTANCE).value,
        offsetY: snapValue(drag.startOffsetY + (hit.y - drag.startY), SNAP_DISTANCE).value,
      })
    }

    const endDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId)
      drag = null
      latest.current.onDraggingChange(false)
    }

    const onPointerLeave = () => {
      if (!drag) setHovering(false)
    }

    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', endDrag)
    container.addEventListener('pointercancel', endDrag)
    container.addEventListener('lostpointercapture', endDrag)
    container.addEventListener('pointerleave', onPointerLeave)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true })
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', endDrag)
      container.removeEventListener('pointercancel', endDrag)
      container.removeEventListener('lostpointercapture', endDrag)
      container.removeEventListener('pointerleave', onPointerLeave)
      if (drag) latest.current.onDraggingChange(false)
      if (hovering) latest.current.onHoverChange(false)
    }
  }, [enabled, container, camera])

  return null
}
