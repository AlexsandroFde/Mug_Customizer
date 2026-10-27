import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MugColors } from '../../config/mugColors'
import { getImagePixels, type PrintImage } from '../../hooks/useMugCustomization'
import { getAreaLimits, type PrintArea } from '../../lib/printArea'
import {
  getImageCenter,
  getPrintedSize,
  getRotationVector,
  normalizeDegrees,
  type AreaBox,
  type PrintTransform,
} from '../../lib/printMapping'
import { createMugGeometry } from './mugGeometry'
import { createMugMaterials, GLAZE } from './mugMaterials'
import { createPrintMaterial, usePrintTexture } from './MugTexture'

/** Velocidade das transições disparadas por botões (centralizar, alinhar, redefinir). */
const TRANSITION_LAMBDA = 12
const GUIDES_LAMBDA = 10

/** Valores exibidos na parede (em cm, no referencial da região imprimível), animáveis. */
interface DisplayedPrint {
  area: AreaBox
  /** Centro da imagem. */
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface MugModelProps {
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  /** Anima a mudança mais recente em vez de aplicá-la na hora. */
  animate: boolean
  guidesVisible: boolean
  colors: MugColors
}

const TOLERANCE = 1e-3
const near = (a: number, b: number) => Math.abs(a - b) < TOLERANCE

const isClose = (a: DisplayedPrint, b: DisplayedPrint) =>
  near(a.x, b.x) &&
  near(a.y, b.y) &&
  near(a.width, b.width) &&
  near(a.height, b.height) &&
  Math.abs(normalizeDegrees(a.rotation - b.rotation)) < 0.05 &&
  near(a.area.width, b.area.width) &&
  near(a.area.height, b.area.height) &&
  near(a.area.offsetX, b.area.offsetX) &&
  near(a.area.offsetY, b.area.offsetY)

const copyDisplayed = (value: DisplayedPrint): DisplayedPrint => ({ ...value, area: { ...value.area } })

export function MugModel({ image, transform, area, animate, guidesVisible, colors }: MugModelProps) {
  const invalidate = useThree((state) => state.invalidate)
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  // Geometria e materiais são criados uma única vez; estampa e cores só alteram parâmetros.
  const geometry = useMemo(() => createMugGeometry(), [])
  const materials = useMemo(() => createMugMaterials(geometry.cavityVisibility), [geometry])
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

  // O objeto de cores só muda quando alguma cor muda; cada cor vai para o material da sua região.
  useLayoutEffect(() => {
    materials.setColors(colors)
    invalidate()
  }, [materials, colors, invalidate])

  const target = useMemo<DisplayedPrint>(() => {
    const size = image ? getPrintedSize(getImagePixels(image), transform, area) : { width: 1, height: 1 }
    const center = getImageCenter(area, transform)
    return {
      area: { width: area.width, height: area.height, offsetX: area.offsetX, offsetY: area.offsetY },
      x: center.x,
      y: center.y,
      width: size.width,
      height: size.height,
      rotation: transform.rotation,
    }
  }, [image, transform, area])

  const displayed = useRef<DisplayedPrint>(copyDisplayed(target))
  const transitioning = useRef(false)
  const lastImageId = useRef(image?.id)

  const applyUniforms = useCallback(
    (value: DisplayedPrint) => {
      const { uniforms } = print
      uniforms.uAreaCenter.value.set(value.area.offsetX, value.area.offsetY)
      uniforms.uAreaHalf.value.set(value.area.width / 2, value.area.height / 2)
      const limits = getAreaLimits(value.area)
      uniforms.uAreaLimits.value.set(+limits.left, +limits.right, +limits.bottom, +limits.top)
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
      displayed.current = copyDisplayed(target)
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
      const approach = (from: number, to: number) => from + (to - from) * step
      current.x = approach(current.x, target.x)
      current.y = approach(current.y, target.y)
      current.width = approach(current.width, target.width)
      current.height = approach(current.height, target.height)
      current.rotation += normalizeDegrees(target.rotation - current.rotation) * step
      current.area.width = approach(current.area.width, target.area.width)
      current.area.height = approach(current.area.height, target.area.height)
      current.area.offsetX = approach(current.area.offsetX, target.area.offsetX)
      current.area.offsetY = approach(current.area.offsetY, target.area.offsetY)
      if (isClose(current, target)) {
        displayed.current = copyDisplayed(target)
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
      <mesh geometry={geometry.body.rim} material={materials.regions.rim} castShadow receiveShadow />
      <mesh geometry={geometry.body.interior} material={materials.regions.interior} castShadow receiveShadow />
      <mesh geometry={geometry.handle} material={materials.regions.handle} castShadow receiveShadow />
    </group>
  )
}
