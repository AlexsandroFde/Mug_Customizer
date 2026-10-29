/**
 * Exportação da estampa: a arte planificada da área de impressão, sem a caneca, a cena ou guias.
 *
 * A composição usa as mesmas funções que posicionam a estampa no shader e no editor 2D
 * (getPrintedSize, getImageCenter), então o arquivo reproduz o que o personalizador mostra.
 * A imagem vem do arquivo original, em resolução cheia, e o tamanho de saída é explícito:
 * não depende da tela (devicePixelRatio), do zoom nem do canvas 3D.
 */
import { EXPORT_LIMITS } from '../config/mugSpec'
import { setJpegResolution, setPngResolution } from './imageMetadata'
import { decodeImage, releaseCanvas, stepDown } from './imageProcessing'
import { AREA_SHAPES, type AreaMask, type PrintArea } from './printArea'
import { getImageCenter, getPrintedSize, printToImageUv, type Point, type PrintTransform, type Size } from './printMapping'

export type ExportFormat = 'png' | 'jpeg' | 'webp'
export type ExportSizeMode = 'original' | 'high' | 'print' | 'custom'

export const CM_PER_INCH = 2.54
/** "Alta resolução": o dobro da resolução original da imagem, dentro dos limites. */
export const HIGH_RESOLUTION_FACTOR = 2

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; mime: string; extension: string; transparency: boolean; defaultQuality: number | null }
> = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png', transparency: true, defaultQuality: null },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', transparency: false, defaultQuality: 0.92 },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp', transparency: true, defaultQuality: 0.9 },
}

export interface ExportLimits {
  maxSide: number
  maxPixels: number
}

export function getExportLimits(): ExportLimits {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  return {
    maxSide: EXPORT_LIMITS.maxSide,
    maxPixels: touch ? EXPORT_LIMITS.maxPixels.touch : EXPORT_LIMITS.maxPixels.default,
  }
}

// ---------------------------------------------------------------------------
// Composição (pura)
// ---------------------------------------------------------------------------

/** Geometria da arte no referencial da própria área: cm, origem no canto superior esquerdo, y para baixo. */
export interface ArtComposition {
  area: Size
  /** Centro da imagem. */
  center: Point
  /** Tamanho impresso da imagem. */
  size: Size
  /** Graus, no sentido horário (o mesmo do personalizador). */
  rotation: number
  mask: AreaMask
}

export function getArtComposition(area: PrintArea, transform: PrintTransform, pixels: Size): ArtComposition {
  const center = getImageCenter(area, transform)
  return {
    area: { width: area.width, height: area.height },
    center: { x: center.x - (area.offsetX - area.width / 2), y: area.offsetY + area.height / 2 - center.y },
    size: getPrintedSize(pixels, transform, area),
    rotation: transform.rotation,
    mask: AREA_SHAPES[area.shape].mask,
  }
}

/** Pixels da imagem original por cm de estampa. Vale o eixo mais denso, para não perder detalhe. */
export function getNativeDensity(pixels: Size, printed: Size) {
  return Math.max(pixels.width / printed.width, pixels.height / printed.height)
}

/** Indica se a imagem cobre a área inteira; se não cobrir, a arte tem regiões vazias. */
export function coversArea(area: PrintArea, transform: PrintTransform, printed: Size, tolerance = 1e-6) {
  const center = getImageCenter(area, transform)
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].every(([dx, dy]) => {
    const corner = { x: area.offsetX + (dx * area.width) / 2, y: area.offsetY + (dy * area.height) / 2 }
    const uv = printToImageUv(corner, center, transform.rotation, printed)
    return uv.x >= -tolerance && uv.x <= 1 + tolerance && uv.y >= -tolerance && uv.y <= 1 + tolerance
  })
}

// ---------------------------------------------------------------------------
// Tamanho de saída (puro)
// ---------------------------------------------------------------------------

export interface ExportSizeRequest {
  mode: ExportSizeMode
  /** Modo impressão: largura física da arte, em cm (a altura acompanha a proporção da área). */
  printWidth: number
  dpi: number
  /** Modo personalizado: largura em pixels (a altura acompanha a proporção da área). */
  customWidth: number
}

export interface ExportPlan {
  width: number
  height: number
  /** Medida física de referência da arte, em cm. */
  physical: Size
  /** Resolução resultante nessa medida, em pontos por polegada. */
  dpi: number
  /** Quantas vezes a imagem original é ampliada (acima de 1) ou reduzida (abaixo de 1). */
  sourceScale: number
  /** O tamanho pedido passava dos limites do dispositivo e foi reduzido. */
  limited: boolean
}

/**
 * Calcula as dimensões em pixels. A proporção é sempre a da área de impressão, para que a arte
 * nunca seja distorcida nem receba margens; o limite do dispositivo reduz o tamanho, se preciso.
 *
 * @param nativeDensity pixels da imagem original por cm de estampa (getNativeDensity)
 */
export function planExport(request: ExportSizeRequest, area: Size, nativeDensity: number, limits: ExportLimits): ExportPlan {
  const aspect = area.width / area.height
  const desiredWidth = {
    original: area.width * nativeDensity,
    high: area.width * nativeDensity * HIGH_RESOLUTION_FACTOR,
    print: (request.printWidth / CM_PER_INCH) * request.dpi,
    custom: request.customWidth,
  }[request.mode]

  const fits = (width: number, height: number) =>
    width <= limits.maxSide && height <= limits.maxSide && width * height <= limits.maxPixels

  let width = Math.max(1, Math.round(desiredWidth))
  let height = Math.max(1, Math.round(width / aspect))
  const limited = !fits(width, height)
  if (limited) {
    const factor = Math.min(limits.maxSide / width, limits.maxSide / height, Math.sqrt(limits.maxPixels / (width * height)))
    width = Math.max(1, Math.floor(width * factor))
    height = Math.max(1, Math.round(width / aspect))
    // O arredondamento da altura pode passar do limite por um pixel: recua até caber.
    while (width > 1 && !fits(width, height)) {
      width -= 1
      height = Math.max(1, Math.round(width / aspect))
    }
  }

  const physical =
    request.mode === 'print' ? { width: request.printWidth, height: request.printWidth / aspect } : { ...area }
  return {
    width,
    height,
    physical,
    dpi: width / (physical.width / CM_PER_INCH),
    sourceScale: width / area.width / nativeDensity,
    limited,
  }
}

export const getExportFileName = (plan: Pick<ExportPlan, 'width' | 'height'>, format: ExportFormat) =>
  `estampa-caneca-${plan.width}x${plan.height}.${EXPORT_FORMATS[format].extension}`

// ---------------------------------------------------------------------------
// Desenho e codificação (navegador)
// ---------------------------------------------------------------------------

type ExportErrorReason = 'decode' | 'memory' | 'encode' | 'format'

const ERROR_MESSAGES: Record<ExportErrorReason, string> = {
  decode: 'Não foi possível ler o arquivo original da imagem. Envie a imagem de novo e tente outra vez.',
  memory: 'O navegador não conseguiu reservar memória para uma imagem deste tamanho. Escolha uma resolução menor.',
  encode: 'O navegador não conseguiu gerar o arquivo. Tente uma resolução menor ou outro formato.',
  format: 'Este navegador não gera arquivos neste formato. Escolha PNG ou JPEG.',
}

export class ExportError extends Error {
  readonly reason: ExportErrorReason

  constructor(reason: ExportErrorReason) {
    super(ERROR_MESSAGES[reason])
    this.reason = reason
  }
}

/** Quantos pixels são desenhados por vez antes de devolver o controle à interface. */
const BAND_PIXELS = 4_000_000

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError')
}

/** Recorta o desenho pela máscara da área. A área retangular é o próprio canvas; formatos novos entram aqui. */
function clipToMask(mask: AreaMask) {
  switch (mask) {
    case 'rect':
      return
  }
}

export interface DrawArtOptions {
  /** Cor de fundo (CSS); null mantém a transparência. */
  background: string | null
  signal?: AbortSignal
}

/**
 * Desenha a arte no canvas, que já deve ter as dimensões finais. É a mesma função para a prévia
 * e para o arquivo: só a fonte e o tamanho mudam. Saídas grandes são desenhadas em faixas, com
 * pausas entre elas, para a interface continuar respondendo.
 */
export async function drawArt(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceSize: Size,
  composition: ArtComposition,
  { background, signal }: DrawArtOptions,
) {
  const context = canvas.getContext('2d')
  if (!context) throw new ExportError('memory')
  const { width, height } = canvas
  const scaleX = width / composition.area.width
  const scaleY = height / composition.area.height

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, height)
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
  }

  // Reduções grandes são feitas em etapas (média 2×2), como no envio; o restante, no desenho final.
  const stepped = stepDown(
    source,
    sourceSize.width,
    sourceSize.height,
    composition.size.width * scaleX,
    composition.size.height * scaleY,
  )
  try {
    const rows = Math.max(1, Math.floor(BAND_PIXELS / width))
    for (let top = 0; top < height; top += rows) {
      throwIfAborted(signal)
      context.save()
      // Faixas em pixels inteiros: cada pixel é desenhado uma única vez, sem emendas.
      context.beginPath()
      context.rect(0, top, width, Math.min(rows, height - top))
      context.clip()
      clipToMask(composition.mask)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0)
      context.translate(composition.center.x, composition.center.y)
      context.rotate((composition.rotation * Math.PI) / 180)
      context.drawImage(
        stepped.image,
        -composition.size.width / 2,
        -composition.size.height / 2,
        composition.size.width,
        composition.size.height,
      )
      context.restore()
      if (top + rows < height) await nextTask()
    }
  } finally {
    stepped.release()
  }
}

let webpEncoding: boolean | undefined

/** Indica se o navegador gera o formato (o Safari, por exemplo, não gera WebP pelo canvas). */
export function canEncode(format: ExportFormat) {
  if (format !== 'webp') return true
  if (webpEncoding === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpEncoding = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpEncoding
}

async function encode(canvas: HTMLCanvasElement, format: ExportFormat, quality: number | null) {
  const { mime } = EXPORT_FORMATS[format]
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality ?? undefined))
  if (!blob) throw new ExportError('encode')
  // Sem suporte ao formato, o navegador devolve PNG em silêncio.
  if (blob.type !== mime) throw new ExportError('format')
  return blob
}

/** Grava a resolução física (dpi) nos metadados; os pixels não mudam. WebP não tem campo padrão. */
async function withResolution(blob: Blob, format: ExportFormat, dpi: number) {
  if (format === 'webp') return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const output = format === 'png' ? setPngResolution(bytes, dpi) : setJpegResolution(bytes, dpi)
  return new Blob([output], { type: blob.type })
}

export interface ExportRequest {
  /** Arquivo original enviado pelo usuário. */
  file: Blob
  composition: ArtComposition
  plan: ExportPlan
  format: ExportFormat
  quality: number | null
  /** Cor de fundo; null mantém a transparência (o JPEG, que não tem transparência, usa branco). */
  background: string | null
  signal?: AbortSignal
}

export async function exportArt({ file, composition, plan, format, quality, background, signal }: ExportRequest) {
  let decoded: Awaited<ReturnType<typeof decodeImage>>
  try {
    decoded = await decodeImage(file)
  } catch {
    throw new ExportError('decode')
  }
  const canvas = document.createElement('canvas')
  try {
    throwIfAborted(signal)
    canvas.width = plan.width
    canvas.height = plan.height
    const { image } = decoded
    await drawArt(canvas, image, { width: image.naturalWidth, height: image.naturalHeight }, composition, {
      background: EXPORT_FORMATS[format].transparency ? background : (background ?? '#ffffff'),
      signal,
    })
    throwIfAborted(signal)
    const blob = await withResolution(await encode(canvas, format, quality), format, plan.dpi)
    return { blob, fileName: getExportFileName(plan, format) }
  } finally {
    releaseCanvas(canvas)
    decoded.release()
  }
}
