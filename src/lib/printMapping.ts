/**
 * Matemática do posicionamento da estampa.
 *
 * A parede externa é tratada como um plano "desenrolado":
 * - x (cm) corre ao longo da circunferência, crescendo da esquerda para a direita
 *   para quem olha a caneca de fora, com x = 0 no centro da região imprimível (oposto à alça);
 * - y (cm) é a altura, com y = 0 no centro vertical da região imprimível.
 *
 * A imagem é posicionada em relação à área de impressão escolhida pelo usuário (printArea.ts):
 * o encaixe usa as dimensões da área e o deslocamento é medido a partir do centro dela.
 * As mesmas fórmulas são usadas no shader da caneca, no editor 2D e no arraste em 3D,
 * o que garante que as três visualizações concordem entre si.
 */
import { MUG, PRINT_QUALITY_DPI, PRINT_REFERENCE_DPI, PRINTABLE, SCALE_RANGE } from '../config/mugSpec'

export type FitMode = 'contain' | 'cover' | 'stretch' | 'original'
export type PrintSide = 'left' | 'center' | 'right'
export type PrintQuality = 'excellent' | 'good' | 'acceptable' | 'low'

export interface PrintTransform {
  /** Deslocamento horizontal a partir do centro da área de impressão, em cm (positivo = para a direita). */
  offsetX: number
  /** Deslocamento vertical a partir do centro da área de impressão, em cm (positivo = para cima). */
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

/** Dimensões e posição de uma área de impressão (cm, no referencial da região imprimível). */
export interface AreaBox {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_TRANSFORM: Readonly<PrintTransform> = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  fit: 'contain',
}

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

/** Tamanho natural da imagem impressa na resolução de referência, em cm. */
export function getOriginalPrintSize(pixels: Size): Size {
  return { width: (pixels.width / PRINT_REFERENCE_DPI) * CM_PER_INCH, height: (pixels.height / PRINT_REFERENCE_DPI) * CM_PER_INCH }
}

/**
 * Tamanho da imagem (cm) depois do encaixe na área de impressão, antes da escala do usuário.
 * - contain (Conter): mostra a imagem inteira, mantendo as proporções;
 * - cover (Cobrir): cobre toda a área, mantendo as proporções (o excedente é cortado);
 * - stretch (Preencher): ocupa exatamente a área, alterando as proporções;
 * - original (Tamanho original): tamanho natural do arquivo na resolução de referência,
 *   independente da área (o que não couber é cortado).
 *
 * @param pixels dimensões da imagem original em pixels (definem a proporção e o tamanho natural)
 */
export function getFittedSize(pixels: Size, fit: FitMode, area: Size): Size {
  if (fit === 'stretch') return { width: area.width, height: area.height }
  if (fit === 'original') return getOriginalPrintSize(pixels)
  const aspect = pixels.width / pixels.height
  const areaAspect = area.width / area.height
  const limitedByWidth = fit === 'contain' ? aspect >= areaAspect : aspect < areaAspect
  return limitedByWidth
    ? { width: area.width, height: area.width / aspect }
    : { width: area.height * aspect, height: area.height }
}

/** Tamanho final impresso da estampa, em cm. */
export function getPrintedSize(pixels: Size, transform: PrintTransform, area: Size): Size {
  const fitted = getFittedSize(pixels, transform.fit, area)
  return { width: fitted.width * transform.scale, height: fitted.height * transform.scale }
}

/** Mantém os parâmetros dentro dos limites: o centro da estampa nunca sai da área de impressão. */
export function clampTransform(transform: PrintTransform, area: Size): PrintTransform {
  return {
    ...transform,
    // Somar zero converte um eventual -0 em 0.
    offsetX: clamp(transform.offsetX, -area.width / 2, area.width / 2) + 0,
    offsetY: clamp(transform.offsetY, -area.height / 2, area.height / 2) + 0,
    scale: clamp(transform.scale, SCALE_RANGE.min, SCALE_RANGE.max),
    rotation: normalizeDegrees(transform.rotation),
  }
}

/** Centro da estampa no referencial da região imprimível. */
export function getImageCenter(area: AreaBox, transform: PrintTransform): Point {
  return { x: area.offsetX + transform.offsetX, y: area.offsetY + transform.offsetY }
}

/** Converte um ponto da parede externa (espaço local da caneca) para o referencial da região imprimível. */
export function surfaceToPrint(x: number, y: number, z: number): Point {
  return {
    x: wrapAngle(Math.atan2(x, z) - PRINTABLE.centerAngle) * MUG.outerRadius,
    y: y - PRINTABLE.centerY,
  }
}

/** Ângulo em torno do eixo vertical (padrão atan2(x, z)) correspondente a uma posição horizontal. */
export function printOffsetToAngle(offsetX: number): number {
  return wrapAngle(PRINTABLE.centerAngle + offsetX / MUG.outerRadius)
}

/** Cosseno e seno da rotação da estampa no referencial da área (y para cima, anti-horário positivo). */
export function getRotationVector(rotationDegrees: number): Point {
  const angle = -degToRad(rotationDegrees)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/** Coordenadas UV da imagem (de 0 a 1, v para cima) em um ponto da parede. Espelha o shader. */
export function printToImageUv(point: Point, center: Point, rotationDegrees: number, size: Size): Point {
  const rotation = getRotationVector(rotationDegrees)
  const dx = point.x - center.x
  const dy = point.y - center.y
  const localX = dx * rotation.x + dy * rotation.y
  const localY = -dx * rotation.y + dy * rotation.x
  return { x: localX / size.width + 0.5, y: localY / size.height + 0.5 }
}

/** Cantos da estampa posicionada (inferior esquerdo, inferior direito, superior direito, superior esquerdo). */
export function getImageCorners(center: Point, rotationDegrees: number, size: Size): Point[] {
  const rotation = getRotationVector(rotationDegrees)
  const halfW = size.width / 2
  const halfH = size.height / 2
  const local: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ]
  return local.map(({ x, y }) => ({
    x: center.x + x * rotation.x - y * rotation.y,
    y: center.y + x * rotation.y + y * rotation.x,
  }))
}

/** Indica se alguma parte da estampa ultrapassa a área de impressão (e será cortada). */
export function isImageCropped(area: AreaBox, transform: PrintTransform, size: Size, tolerance = 0.02): boolean {
  return getImageCorners(getImageCenter(area, transform), transform.rotation, size).some(
    (corner) =>
      Math.abs(corner.x - area.offsetX) > area.width / 2 + tolerance ||
      Math.abs(corner.y - area.offsetY) > area.height / 2 + tolerance,
  )
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
