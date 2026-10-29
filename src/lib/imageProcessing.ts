/**
 * Decodificação e preparação da imagem para uso como textura.
 * Usa apenas APIs de canvas do navegador e não depende de three.js.
 */
import { assertImageDimensions, ImageFileError, type ImageFormat } from './imageFile'

export interface ProcessedImage {
  /** Imagem redimensionada para a GPU (lado maior limitado a maxTextureSide). */
  source: HTMLCanvasElement
  /** Dimensões do arquivo original, usadas no cálculo da resolução de impressão. */
  originalWidth: number
  originalHeight: number
  /** Miniatura leve para a interface (data URL, dispensa liberação manual). */
  thumbnailUrl: string
  hasTransparency: boolean
}

const THUMBNAIL_MAX_SIDE = 512
const ALPHA_SAMPLE_SIDE = 128
/** Pixels com alfa abaixo deste valor contam como transparentes. */
const ALPHA_OPAQUE_THRESHOLD = 250

const corruptError = () =>
  new ImageFileError('corrupt', 'Não foi possível ler a imagem. O arquivo pode estar corrompido ou incompleto.')

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings) {
  const context = canvas.getContext('2d', settings)
  if (!context) throw new ImageFileError('corrupt', 'Seu navegador não conseguiu processar a imagem.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return context
}

/** Zerar as dimensões libera a memória do canvas na hora, inclusive no Safari. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface SteppedImage {
  image: CanvasImageSource
  width: number
  height: number
  /** Libera o canvas intermediário, se algum foi criado. */
  release(): void
}

/**
 * Reduz em etapas de metade do tamanho enquanto a imagem tiver pelo menos o dobro do alvo.
 * Cada etapa equivale a uma média 2×2, o que evita o serrilhado de uma redução grande feita
 * de uma só vez; a última redução (menos de 2×) fica para quem desenha a imagem.
 */
export function stepDown(source: CanvasImageSource, width: number, height: number, targetWidth: number, targetHeight: number): SteppedImage {
  let current: CanvasImageSource = source
  let currentWidth = width
  let currentHeight = height
  let intermediate: HTMLCanvasElement | null = null

  while (currentWidth / 2 >= targetWidth && currentHeight / 2 >= targetHeight) {
    const next = createCanvas(Math.round(currentWidth / 2), Math.round(currentHeight / 2))
    getContext(next).drawImage(current, 0, 0, next.width, next.height)
    if (intermediate) releaseCanvas(intermediate)
    intermediate = next
    current = next
    currentWidth = next.width
    currentHeight = next.height
  }

  const created = intermediate
  return { image: current, width: currentWidth, height: currentHeight, release: () => created && releaseCanvas(created) }
}

function resize(source: CanvasImageSource, width: number, height: number, targetWidth: number, targetHeight: number) {
  const stepped = stepDown(source, width, height, targetWidth, targetHeight)
  const output = createCanvas(targetWidth, targetHeight)
  getContext(output).drawImage(stepped.image, 0, 0, targetWidth, targetHeight)
  stepped.release()
  return output
}

function detectTransparency(source: HTMLCanvasElement) {
  const sample = fitWithin(source.width, source.height, ALPHA_SAMPLE_SIDE)
  const canvas = createCanvas(sample.width, sample.height)
  const context = getContext(canvas, { willReadFrequently: true })
  context.drawImage(source, 0, 0, sample.width, sample.height)
  const { data } = context.getImageData(0, 0, sample.width, sample.height)
  releaseCanvas(canvas)
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < ALPHA_OPAQUE_THRESHOLD) return true
  }
  return false
}

/** Decodifica o arquivo em resolução cheia, com a orientação EXIF aplicada (como no envio). */
export async function decodeImage(file: Blob) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw corruptError()
  }
  return { image, release: () => URL.revokeObjectURL(url) }
}

/**
 * Decodifica o arquivo (respeitando a orientação EXIF), gera a textura redimensionada,
 * a miniatura e detecta transparência.
 */
export async function processImageFile(file: File, format: ImageFormat, maxTextureSide: number): Promise<ProcessedImage> {
  const { image, release } = await decodeImage(file)
  try {
    const { naturalWidth: width, naturalHeight: height } = image
    if (!width || !height) throw corruptError()
    assertImageDimensions(width, height)

    const target = fitWithin(width, height, maxTextureSide)
    const source = resize(image, width, height, target.width, target.height)
    const hasTransparency = format !== 'jpeg' && detectTransparency(source)

    const thumbnailSize = fitWithin(source.width, source.height, THUMBNAIL_MAX_SIDE)
    const thumbnail = resize(source, source.width, source.height, thumbnailSize.width, thumbnailSize.height)
    const thumbnailUrl = hasTransparency ? thumbnail.toDataURL('image/png') : thumbnail.toDataURL('image/jpeg', 0.88)
    releaseCanvas(thumbnail)

    return { source, originalWidth: width, originalHeight: height, thumbnailUrl, hasTransparency }
  } finally {
    release()
  }
}
