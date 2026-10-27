/**
 * Matemática do posicionamento da estampa.
 *
 * A área de impressão é tratada como um retângulo "desenrolado" da parede externa:
 * - x (cm) corre ao longo da circunferência, crescendo da esquerda para a direita
 *   para quem olha a caneca de fora, com x = 0 no lado oposto à alça;
 * - y (cm) é a altura, com y = 0 no centro vertical da área imprimível.
 *
 * As mesmas fórmulas são usadas no shader da caneca, no editor 2D e no arraste em 3D,
 * o que garante que as três visualizações concordem entre si.
 */
import {
  MUG,
  PRINT_CENTER_ANGLE,
  PRINT_CENTER_Y,
  PRINT_HEIGHT,
  PRINT_QUALITY_DPI,
  PRINT_WIDTH,
  SCALE_RANGE,
} from '../config/mugSpec'

export type FitMode = 'contain' | 'cover' | 'stretch'
export type PrintSide = 'left' | 'center' | 'right'
export type PrintQuality = 'excellent' | 'good' | 'acceptable' | 'low'

export interface PrintTransform {
  /** Deslocamento horizontal ao longo da circunferência, em cm (positivo = para a direita). */
  offsetX: number
  /** Deslocamento vertical, em cm (positivo = para cima). */
  offsetY: number
  /** Multiplicador aplicado ao tamanho de encaixe (1 = 100 %). */
  scale: number
  /** Rotação em graus, no sentido horário para quem olha a caneca de fora. */
  rotation: number
  /** Como a imagem é encaixada na área antes da escala. */
  fit: FitMode
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export const DEFAULT_TRANSFORM: Readonly<PrintTransform> = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  fit: 'contain',
}

export const PRINT_AREA_SIZE: Readonly<Size> = { width: PRINT_WIDTH, height: PRINT_HEIGHT }

const TAU = Math.PI * 2
const CM_PER_INCH = 2.54

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const degToRad = (degrees: number) => (degrees * Math.PI) / 180

/** Normaliza um ângulo em radianos para o intervalo [-π, π). */
export function wrapAngle(angle: number): number {
  return angle - TAU * Math.floor((angle + Math.PI) / TAU)
}

/** Normaliza um ângulo em graus para o intervalo (-180, 180]. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees - 360 * Math.floor((degrees + 180) / 360)
  return wrapped === -180 ? 180 : wrapped
}

/**
 * Tamanho da imagem (cm) depois do encaixe na área de impressão, antes da escala do usuário.
 * - contain: mostra a imagem inteira, mantendo as proporções;
 * - cover: cobre toda a área, mantendo as proporções (o excedente é cortado);
 * - stretch: ocupa exatamente a área, alterando as proporções.
 */
export function getFittedSize(aspect: number, fit: FitMode, area: Size = PRINT_AREA_SIZE): Size {
  if (fit === 'stretch') return { width: area.width, height: area.height }
  const areaAspect = area.width / area.height
  const limitedByWidth = fit === 'contain' ? aspect >= areaAspect : aspect < areaAspect
  return limitedByWidth
    ? { width: area.width, height: area.width / aspect }
    : { width: area.height * aspect, height: area.height }
}

/** Tamanho final impresso da estampa, em cm. */
export function getPrintedSize(aspect: number, transform: PrintTransform): Size {
  const fitted = getFittedSize(aspect, transform.fit)
  return { width: fitted.width * transform.scale, height: fitted.height * transform.scale }
}

/** Meia-largura e meia-altura da caixa que envolve a estampa já rotacionada. */
export function getRotatedHalfExtents(size: Size, rotationDegrees: number): Size {
  const angle = degToRad(rotationDegrees)
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  return {
    width: (size.width * cos + size.height * sin) / 2,
    height: (size.width * sin + size.height * cos) / 2,
  }
}

/** Mantém os parâmetros dentro dos limites: o centro da estampa nunca sai da área imprimível. */
export function clampTransform(transform: PrintTransform): PrintTransform {
  return {
    ...transform,
    offsetX: clamp(transform.offsetX, -PRINT_WIDTH / 2, PRINT_WIDTH / 2),
    offsetY: clamp(transform.offsetY, -PRINT_HEIGHT / 2, PRINT_HEIGHT / 2),
    scale: clamp(transform.scale, SCALE_RANGE.min, SCALE_RANGE.max),
    rotation: normalizeDegrees(transform.rotation),
  }
}

/** Converte um ponto da parede externa (espaço local da caneca) para coordenadas da área de impressão. */
export function surfaceToPrint(x: number, y: number, z: number): Point {
  return {
    x: wrapAngle(Math.atan2(x, z) - PRINT_CENTER_ANGLE) * MUG.outerRadius,
    y: y - PRINT_CENTER_Y,
  }
}

/** Ângulo em torno do eixo vertical (padrão atan2(x, z)) correspondente a um deslocamento horizontal. */
export function printOffsetToAngle(offsetX: number): number {
  return wrapAngle(PRINT_CENTER_ANGLE + offsetX / MUG.outerRadius)
}

export function isInsidePrintArea(point: Point, margin = 0): boolean {
  return Math.abs(point.x) <= PRINT_WIDTH / 2 + margin && Math.abs(point.y) <= PRINT_HEIGHT / 2 + margin
}

/** Cosseno e seno da rotação da estampa no referencial da área (y para cima, anti-horário positivo). */
export function getRotationVector(rotationDegrees: number): Point {
  const angle = -degToRad(rotationDegrees)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/** Coordenadas UV da imagem (de 0 a 1, v para cima) em um ponto da área de impressão. Espelha o shader. */
export function printToImageUv(point: Point, transform: PrintTransform, size: Size): Point {
  const rotation = getRotationVector(transform.rotation)
  const dx = point.x - transform.offsetX
  const dy = point.y - transform.offsetY
  const localX = dx * rotation.x + dy * rotation.y
  const localY = -dx * rotation.y + dy * rotation.x
  return { x: localX / size.width + 0.5, y: localY / size.height + 0.5 }
}

/** Cantos da estampa posicionada (inferior esquerdo, inferior direito, superior direito, superior esquerdo). */
export function getImageCorners(transform: PrintTransform, size: Size): Point[] {
  const rotation = getRotationVector(transform.rotation)
  const halfW = size.width / 2
  const halfH = size.height / 2
  const local: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ]
  return local.map(({ x, y }) => ({
    x: transform.offsetX + x * rotation.x - y * rotation.y,
    y: transform.offsetY + x * rotation.y + y * rotation.x,
  }))
}

/** Indica se alguma parte da estampa ultrapassa a área imprimível (e será cortada). */
export function isImageCropped(transform: PrintTransform, size: Size, tolerance = 0.02): boolean {
  return getImageCorners(transform, size).some(
    (corner) => Math.abs(corner.x) > PRINT_WIDTH / 2 + tolerance || Math.abs(corner.y) > PRINT_HEIGHT / 2 + tolerance,
  )
}

/**
 * Deslocamento horizontal que centraliza a estampa em um dos lados visíveis da caneca.
 * O lado esquerdo é o que aparece quando a alça fica à esquerda de quem olha (e vice-versa).
 * Se a estampa não couber inteira naquele lado, ela é aproximada do centro o necessário.
 */
export function getSideOffset(side: PrintSide, rotation: number, size: Size): number {
  if (side === 'center') return 0
  const halfWidth = getRotatedHalfExtents(size, rotation).width
  const limit = Math.max(0, PRINT_WIDTH / 2 - halfWidth)
  const target = side === 'left' ? -PRINT_WIDTH / 4 : PRINT_WIDTH / 4
  // Somar zero converte um eventual -0 em 0.
  return clamp(target, -limit, limit) + 0
}

/** Atrai o valor para o alvo mais próximo quando a distância for menor que o limite. */
export function snapValue(value: number, threshold: number, targets: readonly number[] = [0]) {
  for (const target of targets) {
    if (Math.abs(value - target) <= threshold) return { value: target, snapped: true }
  }
  return { value, snapped: false }
}

/** Resolução efetiva (pontos por polegada) da imagem original no tamanho em que será impressa. */
export function getEffectiveDpi(pixelWidth: number, pixelHeight: number, printed: Size): number {
  const dpiX = pixelWidth / (printed.width / CM_PER_INCH)
  const dpiY = pixelHeight / (printed.height / CM_PER_INCH)
  return Math.min(dpiX, dpiY)
}

export function getPrintQuality(dpi: number): PrintQuality {
  if (dpi >= PRINT_QUALITY_DPI.excellent) return 'excellent'
  if (dpi >= PRINT_QUALITY_DPI.good) return 'good'
  if (dpi >= PRINT_QUALITY_DPI.acceptable) return 'acceptable'
  return 'low'
}
