import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PrintImage } from '../../hooks/useMugCustomization'
import { getPrintedSize, getRotationVector, normalizeDegrees, type PrintTransform } from '../../lib/printMapping'
import { createMugGeometry } from './mugGeometry'
import { createMugMaterials, GLAZE } from './mugMaterials'
import { createPrintMaterial, usePrintTexture } from './MugTexture'

/** Velocidade das transições disparadas por botões (centralizar, alinhar, redefinir). */
const TRANSITION_LAMBDA = 12
const GUIDES_LAMBDA = 10

interface DisplayedPrint {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface MugModelProps {
  image: PrintImage | null
  transform: PrintTransform
  /** Anima a mudança mais recente em vez de aplicá-la na hora. */
  animate: boolean
  guidesVisible: boolean
}

const isClose = (a: DisplayedPrint, b: DisplayedPrint) =>
  Math.abs(a.x - b.x) < 1e-3 &&
  Math.abs(a.y - b.y) < 1e-3 &&
  Math.abs(a.width - b.width) < 1e-3 &&
  Math.abs(a.height - b.height) < 1e-3 &&
  Math.abs(normalizeDegrees(a.rotation - b.rotation)) < 0.05

export function MugModel({ image, transform, animate, guidesVisible }: MugModelProps) {
  const invalidate = useThree((state) => state.invalidate)
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  // Geometria e materiais são criados uma única vez; mudanças na estampa só alteram uniforms.
  const geometry = useMemo(() => createMugGeometry(), [])
  const materials = useMemo(() => createMugMaterials(geometry.interiorAo), [geometry])
  const print = useMemo(() => createPrintMaterial(GLAZE), [])
  useEffect(
    () => () => {
      geometry.dispose()
      materials.dispose()
      print.dispose()
    },
    [geometry, materials, print],
  )

  const texture = usePrintTexture(image, anisotropy)
  useLayoutEffect(() => {
    print.setTexture(texture)
    invalidate()
  }, [print, texture, invalidate])

  const target = useMemo<DisplayedPrint>(() => {
    const size = getPrintedSize(image?.aspect ?? 1, transform)
    return { x: transform.offsetX, y: transform.offsetY, width: size.width, height: size.height, rotation: transform.rotation }
  }, [image?.aspect, transform])

  const displayed = useRef<DisplayedPrint>({ ...target })
  const transitioning = useRef(false)
  const lastImageId = useRef(image?.id)

  const applyUniforms = useCallback(
    (value: DisplayedPrint) => {
      const { uniforms } = print
      uniforms.uImageCenter.value.set(value.x, value.y)
      uniforms.uImageHalfSize.value.set(value.width / 2, value.height / 2)
      const rotation = getRotationVector(value.rotation)
      uniforms.uImageRotation.value.set(rotation.x, rotation.y)
    },
    [print],
  )

  useLayoutEffect(() => {
    const imageChanged = lastImageId.current !== image?.id
    lastImageId.current = image?.id
    if (animate && !imageChanged) {
      transitioning.current = true
    } else {
      transitioning.current = false
      displayed.current = { ...target }
      applyUniforms(target)
    }
    invalidate()
  }, [target, animate, image?.id, applyUniforms, invalidate])

  // Com renderização sob demanda, é preciso pedir um quadro para a transição das guias começar.
  useLayoutEffect(() => invalidate(), [guidesVisible, invalidate])

  useFrame((_, rawDelta) => {
    // Depois de um tempo ocioso (renderização sob demanda) o delta pode ser enorme.
    const delta = Math.min(rawDelta, 1 / 30)
    let keepRendering = false

    const guides = print.uniforms.uGuides.value
    const guidesTarget = guidesVisible ? 1 : 0
    if (guides !== guidesTarget) {
      const next = THREE.MathUtils.damp(guides, guidesTarget, GUIDES_LAMBDA, delta)
      print.setGuides(Math.abs(next - guidesTarget) < 0.01 ? guidesTarget : next)
      keepRendering = true
    }

    if (transitioning.current) {
      const current = displayed.current
      const step = 1 - Math.exp(-TRANSITION_LAMBDA * delta)
      current.x += (target.x - current.x) * step
      current.y += (target.y - current.y) * step
      current.width += (target.width - current.width) * step
      current.height += (target.height - current.height) * step
      current.rotation += normalizeDegrees(target.rotation - current.rotation) * step
      if (isClose(current, target)) {
        displayed.current = { ...target }
        transitioning.current = false
      }
      applyUniforms(displayed.current)
      keepRendering = true
    }

    if (keepRendering) invalidate()
  })

  return (
    <group>
      <mesh geometry={geometry.body.base} material={materials.glaze} castShadow receiveShadow />
      <mesh geometry={geometry.body.foot} material={materials.bisque} receiveShadow />
      <mesh geometry={geometry.body.heel} material={materials.glaze} castShadow receiveShadow />
      <mesh geometry={geometry.body.outerWall} material={print.material} castShadow receiveShadow />
      <mesh geometry={geometry.body.interior} material={materials.interior} castShadow receiveShadow />
      <mesh geometry={geometry.handle} material={materials.glaze} castShadow receiveShadow />
    </group>
  )
}
