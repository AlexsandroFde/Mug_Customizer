import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MugPart, ResolvedMugColors } from '../../config/mugColors'
import { getImagePixels, type PrintImage } from '../../hooks/useMugCustomization'
import { relativeLuminance } from '../../lib/color'
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
/** Destaque das partes: brilho ao passar o ponteiro e pulso ao selecionar, que se apaga sozinho. */
const HOVER_GLOW = 0.16
const SELECT_PULSE = 0.55
const PULSE_LAMBDA = 4.5
const HOVER_LAMBDA = 18
/** Partes claras recebem um tom de destaque; partes escuras ou médias, um brilho claro (contraste nos dois casos). */
const HIGHLIGHT_TINT = new THREE.Color('#3f51d8')
const HIGHLIGHT_LIGHT = new THREE.Color('#ffffff')
const LIGHT_PART_LUMINANCE = 0.35
/** Até quantos pixels o ponteiro pode andar para um toque ainda contar como clique (e não como giro). */
const CLICK_TOLERANCE = 5

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

/** Pedido de destaque de uma parte; a chave muda a cada pedido para repetir o pulso. */
export interface PartHighlight {
  part: MugPart
  key: number
}

interface MugModelProps {
  image: PrintImage | null
  transform: PrintTransform
  area: PrintArea
  /** Anima a mudança mais recente em vez de aplicá-la na hora. */
  animate: boolean
  guidesVisible: boolean
  colors: ResolvedMugColors
  /** Com a seleção ativa, passar o ponteiro destaca uma parte e clicar a seleciona. */
  pickable: boolean
  highlight: PartHighlight | null
  onPartHover(part: MugPart | null): void
  onPartSelect(part: MugPart): void
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

const PARTS: readonly MugPart[] = ['body', 'handle', 'rim', 'interior']
const partOf = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.object.userData.part as MugPart | undefined

export function MugModel({
  image,
  transform,
  area,
  animate,
  guidesVisible,
  colors,
  pickable,
  highlight,
  onPartHover,
  onPartSelect,
}: MugModelProps) {
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

  /** Materiais de cada parte (o anel de apoio, sem esmalte, nunca é destacado nem recolorido). */
  const partMaterials = useMemo<Record<MugPart, THREE.MeshPhysicalMaterial[]>>(
    () => ({
      body: [materials.glaze, print.material],
      handle: [materials.regions.handle],
      rim: [materials.regions.rim],
      interior: [materials.regions.interior],
    }),
    [materials, print],
  )

  /** Cor do destaque de cada parte, escolhida pelo contraste com a cor atual dela. */
  const highlightColors = useMemo(
    () =>
      Object.fromEntries(
        PARTS.map((part) => [part, relativeLuminance(colors[part]) > LIGHT_PART_LUMINANCE ? HIGHLIGHT_TINT : HIGHLIGHT_LIGHT]),
      ) as Record<MugPart, THREE.Color>,
    [colors],
  )

  const texture = usePrintTexture(image, anisotropy)
  useLayoutEffect(() => {
    print.setTexture(texture)
    invalidate()
  }, [print, texture, invalidate])

  // O objeto de cores só muda quando alguma cor muda; cada cor vai para o material da sua parte.
  useLayoutEffect(() => {
    materials.setColors(colors)
    print.setBodyColor(colors.body)
    invalidate()
  }, [materials, print, colors, invalidate])

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

  // Com renderização sob demanda, é preciso pedir um quadro para as transições começarem.
  useLayoutEffect(() => invalidate(), [guidesVisible, invalidate])

  // --------------------------------------------------------------- destaque das partes
  const hovered = useRef<MugPart | null>(null)
  const glow = useRef<Record<MugPart, { hover: number; pulse: number }>>({
    body: { hover: 0, pulse: 0 },
    handle: { hover: 0, pulse: 0 },
    rim: { hover: 0, pulse: 0 },
    interior: { hover: 0, pulse: 0 },
  })

  useEffect(() => {
    if (!highlight) return
    glow.current[highlight.part].pulse = SELECT_PULSE
    invalidate()
  }, [highlight, invalidate])

  const setHovered = useCallback(
    (part: MugPart | null) => {
      if (hovered.current === part) return
      hovered.current = part
      onPartHover(part)
      invalidate()
    },
    [onPartHover, invalidate],
  )

  // Ao desligar a seleção (outra aba, modo de ajuste), nenhuma parte fica destacada.
  useEffect(() => {
    if (!pickable) setHovered(null)
  }, [pickable, setHovered])

  const pointerHandlers = useMemo(
    () =>
      pickable
        ? {
            onPointerMove: (event: ThreeEvent<PointerEvent>) => {
              // Só a superfície mais próxima conta (o raio também atravessa o interior e a alça).
              event.stopPropagation()
              setHovered(partOf(event) ?? null)
            },
            onPointerLeave: () => setHovered(null),
            onClick: (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              const part = partOf(event)
              // Arrastar para girar também termina com um clique: só vale se o ponteiro quase não andou.
              if (part && event.delta <= CLICK_TOLERANCE) onPartSelect(part)
            },
          }
        : {},
    [pickable, setHovered, onPartSelect],
  )

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

    for (const part of PARTS) {
      const state = glow.current[part]
      const hoverTarget = pickable && hovered.current === part ? HOVER_GLOW : 0
      const previous = Math.max(state.hover, state.pulse)
      state.hover = THREE.MathUtils.damp(state.hover, hoverTarget, HOVER_LAMBDA, delta)
      state.pulse = THREE.MathUtils.damp(state.pulse, 0, PULSE_LAMBDA, delta)
      if (Math.abs(state.hover - hoverTarget) < 0.002) state.hover = hoverTarget
      if (state.pulse < 0.002) state.pulse = 0
      const intensity = Math.max(state.hover, state.pulse)
      if (intensity !== previous || intensity > 0) {
        for (const material of partMaterials[part]) material.emissive.copy(highlightColors[part]).multiplyScalar(intensity)
      }
      if (intensity !== hoverTarget) keepRendering = true
    }

    if (keepRendering) invalidate()
  })

  return (
    <group {...pointerHandlers}>
      <mesh geometry={geometry.body.base} material={materials.glaze} userData={{ part: 'body' }} castShadow receiveShadow />
      <mesh geometry={geometry.body.foot} material={materials.bisque} userData={{ part: 'body' }} receiveShadow />
      <mesh geometry={geometry.body.heel} material={materials.glaze} userData={{ part: 'body' }} castShadow receiveShadow />
      <mesh geometry={geometry.body.outerWall} material={print.material} userData={{ part: 'body' }} castShadow receiveShadow />
      <mesh geometry={geometry.body.rim} material={materials.regions.rim} userData={{ part: 'rim' }} castShadow receiveShadow />
      <mesh
        geometry={geometry.body.interior}
        material={materials.regions.interior}
        userData={{ part: 'interior' }}
        castShadow
        receiveShadow
      />
      <mesh geometry={geometry.handle} material={materials.regions.handle} userData={{ part: 'handle' }} castShadow receiveShadow />
    </group>
  )
}
