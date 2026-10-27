/**
 * Área de impressão: a região, escolhida pelo usuário, que recebe a imagem.
 *
 * Usa o mesmo referencial "desenrolado" de printMapping.ts: x (cm) ao longo da circunferência,
 * com 0 no centro da região imprimível (oposto à alça), e y (cm) para cima, com 0 no centro
 * vertical da região imprimível. A área é sempre um subconjunto da região imprimível; como essa
 * região não atravessa a alça, a área nunca dá a volta na caneca nem se sobrepõe a si mesma.
 */
import { PRINT_LIMITS, PRINTABLE } from '../config/mugSpec'
import { clamp, type AreaBox, type Point, type PrintSide, type Size } from './printMapping'

export type { AreaBox }

export type AreaShape = 'rectangle' | 'square' | 'custom'

/**
 * Máscara usada para recortar a impressão. Hoje só existe o retângulo; uma máscara nova
 * (elipse, cantos arredondados) precisa de uma entrada aqui, de um caso em areaSignedDistance
 * e do caso equivalente em printAreaDistance, no shader (MugTexture.ts).
 */
export type AreaMask = 'rect'

export interface PrintArea {
  shape: AreaShape
  /** Largura ao longo da circunferência, em cm. */
  width: number
  /** Altura, em cm. */
  height: number
  /** Centro da área em relação ao centro da região imprimível, em cm. */
  offsetX: number
  offsetY: number
}

export interface AreaShapeSpec {
  /** Proporção largura/altura imposta pelo formato; null libera as duas dimensões. */
  aspect: number | null
  mask: AreaMask
}

export const AREA_SHAPES: Record<AreaShape, AreaShapeSpec> = {
  // O retângulo padrão tem as proporções da região imprimível inteira (a faixa clássica de sublimação).
  rectangle: { aspect: PRINTABLE.width / PRINTABLE.height, mask: 'rect' },
  square: { aspect: 1, mask: 'rect' },
  custom: { aspect: null, mask: 'rect' },
}

export const DEFAULT_PRINT_AREA: Readonly<PrintArea> = {
  shape: 'rectangle',
  width: PRINTABLE.width,
  height: PRINTABLE.height,
  offsetX: 0,
  offsetY: 0,
}

const MIN = PRINT_LIMITS.minAreaSize
/** Folga para comparações em cm (evita que arredondamentos escondam um limite atingido). */
const EPSILON = 1e-3

export const getAreaAspect = (area: PrintArea) => AREA_SHAPES[area.shape].aspect ?? area.width / area.height

/** Maior retângulo com a proporção informada que cabe na região imprimível. */
function largestFit(aspect: number): Size {
  const width = Math.min(PRINTABLE.width, PRINTABLE.height * aspect)
  return { width, height: width / aspect }
}

/** Limites de largura para uma proporção travada (a altura acompanha). */
function lockedWidthRange(aspect: number) {
  return { min: Math.max(MIN, MIN * aspect), max: largestFit(aspect).width }
}

export interface Range {
  min: number
  max: number
}

/** Faixas válidas de largura e altura no formato atual (com proporção travada, uma acompanha a outra). */
export function getAreaSizeRange(area: PrintArea): { width: Range; height: Range } {
  const aspect = AREA_SHAPES[area.shape].aspect
  if (aspect === null) {
    return { width: { min: MIN, max: PRINTABLE.width }, height: { min: MIN, max: PRINTABLE.height } }
  }
  const width = lockedWidthRange(aspect)
  return { width, height: { min: width.min / aspect, max: width.max / aspect } }
}

/** Mantém o centro dentro dos limites: a área inteira continua na região imprimível. */
function clampOffsets(area: PrintArea): PrintArea {
  const range = getAreaOffsetRange(area)
  // Somar zero converte um eventual -0 em 0.
  return { ...area, offsetX: clamp(area.offsetX, -range.x, range.x) + 0, offsetY: clamp(area.offsetY, -range.y, range.y) + 0 }
}

/** Deslocamento máximo do centro, em cada eixo, para a área não sair da região imprimível. */
export function getAreaOffsetRange(area: AreaBox): Point {
  return {
    x: Math.max(0, (PRINTABLE.width - area.width) / 2),
    y: Math.max(0, (PRINTABLE.height - area.height) / 2),
  }
}

/** Corrige dimensões, proporção e posição para que a área respeite formato e limites físicos. */
export function clampArea(area: PrintArea): PrintArea {
  const aspect = AREA_SHAPES[area.shape].aspect
  if (aspect !== null) {
    const range = lockedWidthRange(aspect)
    const width = clamp(area.width, range.min, range.max)
    return clampOffsets({ ...area, width, height: width / aspect })
  }
  return clampOffsets({
    ...area,
    width: clamp(area.width, MIN, PRINTABLE.width),
    height: clamp(area.height, MIN, PRINTABLE.height),
  })
}

/**
 * Troca o formato mantendo o centro. O retângulo preserva a altura atual (e a largura acompanha a
 * proporção); o quadrado usa o menor lado. Assim, ir e voltar entre os dois não encolhe a área.
 */
export function setAreaShape(area: PrintArea, shape: AreaShape): PrintArea {
  if (shape === area.shape) return area
  const aspect = AREA_SHAPES[shape].aspect
  if (aspect === null) return { ...area, shape }
  const width = shape === 'square' ? Math.min(area.width, area.height) : area.height * aspect
  return clampArea({ ...area, shape, width })
}

/** Com o formato travado, mudar a largura também muda a altura (e vice-versa). */
export function setAreaWidth(area: PrintArea, width: number): PrintArea {
  const aspect = AREA_SHAPES[area.shape].aspect
  return clampArea(aspect === null ? { ...area, width } : { ...area, width, height: width / aspect })
}

export function setAreaHeight(area: PrintArea, height: number): PrintArea {
  const aspect = AREA_SHAPES[area.shape].aspect
  return clampArea(aspect === null ? { ...area, height } : { ...area, height, width: height * aspect })
}

/**
 * Escala geral: 100 % é a maior área com as proporções atuais que cabe na região imprimível.
 * Redimensionar pela escala nunca altera as proporções.
 */
export function getAreaScale(area: PrintArea): number {
  return area.width / largestFit(getAreaAspect(area)).width
}

export function getAreaScaleRange(area: PrintArea) {
  const fit = largestFit(getAreaAspect(area))
  return { min: Math.min(1, Math.max(MIN / fit.width, MIN / fit.height)), max: 1 }
}

export function setAreaScale(area: PrintArea, scale: number): PrintArea {
  const aspect = getAreaAspect(area)
  const fit = largestFit(aspect)
  const range = getAreaScaleRange(area)
  const factor = clamp(scale, range.min, range.max)
  return clampOffsets({ ...area, width: fit.width * factor, height: fit.height * factor })
}

export function moveArea(area: PrintArea, offsetX: number, offsetY: number): PrintArea {
  return clampOffsets({ ...area, offsetX, offsetY })
}

export interface AreaLimits {
  /** Bordas encostadas no limite físico: esquerda e direita ficam junto à alça. */
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
  /** Dimensões no máximo ou no mínimo permitido. */
  maxWidth: boolean
  maxHeight: boolean
  minWidth: boolean
  minHeight: boolean
}

export function getAreaLimits(area: AreaBox): AreaLimits {
  return {
    left: area.offsetX - area.width / 2 <= -PRINTABLE.width / 2 + EPSILON,
    right: area.offsetX + area.width / 2 >= PRINTABLE.width / 2 - EPSILON,
    bottom: area.offsetY - area.height / 2 <= -PRINTABLE.height / 2 + EPSILON,
    top: area.offsetY + area.height / 2 >= PRINTABLE.height / 2 - EPSILON,
    maxWidth: area.width >= PRINTABLE.width - EPSILON,
    maxHeight: area.height >= PRINTABLE.height - EPSILON,
    minWidth: area.width <= MIN + EPSILON,
    minHeight: area.height <= MIN + EPSILON,
  }
}

/**
 * Posição horizontal que leva a área a um dos lados visíveis da caneca: o lado esquerdo é o que
 * aparece com a alça à esquerda de quem olha (e vice-versa). Uma área larga demais para ficar
 * centralizada naquele lado é aproximada do centro o necessário.
 */
export function getAreaSideOffset(side: PrintSide, area: AreaBox): number {
  if (side === 'center') return 0
  const limit = getAreaOffsetRange(area).x
  const target = side === 'left' ? -PRINTABLE.width / 4 : PRINTABLE.width / 4
  return clamp(target, -limit, limit) + 0
}

/** Distância com sinal (cm) até a borda da área; positiva dentro. Espelha printAreaDistance no shader. */
export function areaSignedDistance(area: PrintArea, point: Point): number {
  switch (AREA_SHAPES[area.shape].mask) {
    case 'rect':
      return Math.min(area.width / 2 - Math.abs(point.x - area.offsetX), area.height / 2 - Math.abs(point.y - area.offsetY))
  }
}

export const isInsideArea = (area: PrintArea, point: Point, margin = 0) => areaSignedDistance(area, point) >= -margin

// ---------------------------------------------------------------------------
// Redimensionamento pelas alças do editor 2D
// ---------------------------------------------------------------------------

/** Alças nas bordas (n, s, e, w) e nos cantos; n = topo, e = direita. */
export type AreaHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const CORNER_HANDLES: readonly AreaHandle[] = ['nw', 'ne', 'se', 'sw']
export const EDGE_HANDLES: readonly AreaHandle[] = ['n', 'e', 's', 'w']

/** Com o formato travado, só os cantos redimensionam (sempre proporcionalmente). */
export const getAreaHandles = (area: PrintArea): readonly AreaHandle[] =>
  AREA_SHAPES[area.shape].aspect === null ? [...CORNER_HANDLES, ...EDGE_HANDLES] : CORNER_HANDLES

/** Posição de uma alça no referencial da área de impressão. */
export function getHandlePosition(area: AreaBox, handle: AreaHandle): Point {
  const dx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const dy = handle.includes('n') ? 1 : handle.includes('s') ? -1 : 0
  return { x: area.offsetX + (dx * area.width) / 2, y: area.offsetY + (dy * area.height) / 2 }
}

/**
 * Redimensiona a partir de uma alça, mantendo fixa a borda (ou o canto) oposta, como em editores
 * gráficos. O resultado respeita o tamanho mínimo, a proporção do formato e a região imprimível.
 */
export function resizeAreaFromHandle(start: PrintArea, handle: AreaHandle, pointer: Point): PrintArea {
  const dirX = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const dirY = handle.includes('n') ? 1 : handle.includes('s') ? -1 : 0
  // Âncora: o lado oposto ao que está sendo puxado.
  const anchorX = start.offsetX - (dirX * start.width) / 2
  const anchorY = start.offsetY - (dirY * start.height) / 2
  // Espaço disponível entre a âncora e o limite físico, no sentido do movimento.
  const roomX = dirX > 0 ? PRINTABLE.width / 2 - anchorX : anchorX + PRINTABLE.width / 2
  const roomY = dirY > 0 ? PRINTABLE.height / 2 - anchorY : anchorY + PRINTABLE.height / 2

  let width = dirX ? (pointer.x - anchorX) * dirX : start.width
  let height = dirY ? (pointer.y - anchorY) * dirY : start.height
  const aspect = AREA_SHAPES[start.shape].aspect

  if (aspect !== null) {
    // Proporcional: vale o eixo que o usuário puxou mais em relação ao tamanho inicial.
    const factor = Math.max(width / start.width, height / start.height)
    const minFactor = Math.max(MIN / start.width, MIN / start.height)
    const maxFactor = Math.min(roomX / start.width, roomY / start.height)
    const clamped = clamp(factor, minFactor, Math.max(minFactor, maxFactor))
    width = start.width * clamped
    height = start.height * clamped
  } else {
    if (dirX) width = clamp(width, MIN, Math.max(MIN, roomX))
    if (dirY) height = clamp(height, MIN, Math.max(MIN, roomY))
  }

  return clampArea({
    ...start,
    width,
    height,
    offsetX: dirX ? anchorX + (dirX * width) / 2 : start.offsetX,
    offsetY: dirY ? anchorY + (dirY * height) / 2 : start.offsetY,
  })
}
