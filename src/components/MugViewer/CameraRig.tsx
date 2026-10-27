import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HANDLE, MUG, PRINT_CENTER_ANGLE } from '../../config/mugSpec'
import { wrapAngle } from '../../lib/printMapping'

export type ViewPreset = 'initial' | 'print' | 'front' | 'handle' | 'back' | 'top'

export interface CameraRigHandle {
  setView(view: ViewPreset): void
  /** Gira a câmera até ficar de frente para um ponto da parede (ângulo no padrão atan2(x, z)). */
  faceAngle(angle: number): void
  rotateBy(azimuth: number, polar: number): void
  zoom(direction: 1 | -1): void
}

const { ACTION } = CameraControlsImpl
const deg = THREE.MathUtils.degToRad

/** Ponto para onde a câmera olha: o eixo da caneca, um pouco abaixo do meio. */
const TARGET_Y = MUG.height * 0.47

/** Azimute 0 = câmera em +Z; o azimute de uma vista é o ângulo da parede que fica de frente para ela. */
const VIEWS: Record<Exclude<ViewPreset, 'top'>, { azimuth: number; polar: number }> = {
  // Três quartos com a alça visível à direita: apresenta o produto enquanto não há estampa.
  initial: { azimuth: PRINT_CENTER_ANGLE + deg(50), polar: deg(70) },
  // Com estampa, a vista inicial fica quase de frente para ela, levemente girada para dar volume.
  print: { azimuth: PRINT_CENTER_ANGLE + deg(20), polar: deg(73) },
  front: { azimuth: PRINT_CENTER_ANGLE, polar: deg(78) },
  // Alça de perfil, apontando para a direita.
  handle: { azimuth: HANDLE.angle - Math.PI / 2, polar: deg(80) },
  back: { azimuth: HANDLE.angle, polar: deg(72) },
}
const TOP_POLAR = deg(8)
/** De cima, a alça se estende para um dos lados: a vista precisa de um pouco mais de distância. */
const TOP_DISTANCE_FACTOR = 1.12

/** Maior distância ocupada a partir do eixo (ponta da alça). */
const HANDLE_REACH = Math.max(...HANDLE.path.map(([distance]) => distance)) + HANDLE.halfThickness

/** Distância que enquadra a caneca inteira com folga, inclusive a alça em qualquer ângulo. */
function getFitDistance(fov: number, aspect: number) {
  const tanHalf = Math.tan(deg(fov) / 2)
  // O corpo ocupa pouco mais da metade da altura da tela (a perspectiva acrescenta as elipses da borda e da base).
  const vertical = MUG.height / 0.56 / 2 / tanHalf
  const horizontal = (HANDLE_REACH + 1) / (tanHalf * aspect)
  return Math.max(vertical, horizontal)
}

function moveTo(controls: CameraControlsImpl, azimuth: number, polar: number, distance: number, animate: boolean) {
  controls.normalizeRotations()
  // Gira pelo caminho mais curto até o azimute desejado.
  const nearestAzimuth = controls.azimuthAngle + wrapAngle(azimuth - controls.azimuthAngle)
  void controls.setTarget(0, TARGET_Y, 0, animate)
  void controls.rotateTo(nearestAzimuth, polar, animate)
  void controls.dollyTo(distance, animate)
}

export const CameraRig = forwardRef<CameraRigHandle>(function CameraRig(_, ref) {
  const controls = useRef<CameraControlsImpl>(null)
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera)
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height))
  const fitDistance = useMemo(() => getFitDistance(camera.fov, aspect), [camera.fov, aspect])
  const placed = useRef(false)

  useLayoutEffect(() => {
    const instance = controls.current
    if (!instance) return
    instance.minDistance = fitDistance * 0.4
    instance.maxDistance = fitDistance * 1.7
    if (!placed.current) {
      placed.current = true
      moveTo(instance, VIEWS.initial.azimuth, VIEWS.initial.polar, fitDistance, false)
    }
  }, [fitDistance])

  useImperativeHandle(
    ref,
    () => ({
      setView(view) {
        const instance = controls.current
        if (!instance) return
        if (view === 'top') {
          moveTo(instance, instance.azimuthAngle, TOP_POLAR, fitDistance * TOP_DISTANCE_FACTOR, true)
          return
        }
        moveTo(instance, VIEWS[view].azimuth, VIEWS[view].polar, fitDistance, true)
      },
      faceAngle(angle) {
        const instance = controls.current
        if (!instance) return
        instance.normalizeRotations()
        void instance.rotateAzimuthTo(instance.azimuthAngle + wrapAngle(angle - instance.azimuthAngle), true)
      },
      rotateBy(azimuth, polar) {
        void controls.current?.rotate(azimuth, polar, true)
      },
      zoom(direction) {
        const instance = controls.current
        if (instance) void instance.dolly(direction * instance.distance * 0.22, true)
      },
    }),
    [fitDistance],
  )

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={0.32}
      draggingSmoothTime={0.12}
      minPolarAngle={deg(4)}
      maxPolarAngle={deg(106)}
      azimuthRotateSpeed={0.85}
      polarRotateSpeed={0.85}
      dollySpeed={0.45}
      dollyToCursor={false}
      mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.ROTATE, wheel: ACTION.DOLLY }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
    />
  )
})
