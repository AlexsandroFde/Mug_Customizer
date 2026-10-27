/**
 * Validação de arquivos de imagem enviados pelo usuário.
 *
 * O formato é identificado pela assinatura binária (e não só pela extensão), e as dimensões
 * são lidas do cabeçalho antes da decodificação, para recusar imagens que ocupariam memória
 * demais sem precisar abri-las.
 */
import { IMAGE_LIMITS } from '../config/mugSpec'
import { formatFileSize, formatInteger } from './format'

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export type ImageErrorCode = 'empty' | 'type' | 'file-size' | 'too-large' | 'too-small' | 'corrupt'

export class ImageFileError extends Error {
  readonly code: ImageErrorCode

  constructor(code: ImageErrorCode, message: string) {
    super(message)
    this.name = 'ImageFileError'
    this.code = code
  }
}

export interface ImageHeaderInfo {
  format: ImageFormat
  /** Dimensões lidas do cabeçalho, quando disponíveis. */
  width?: number
  height?: number
}

export const FORMAT_LABELS: Record<ImageFormat, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' }

/** Bytes lidos do início do arquivo; cabeçalhos JPEG com metadados extensos cabem com folga. */
const HEADER_BYTES = 512 * 1024

const UNSUPPORTED_HINTS: Record<string, string> = {
  'image/heic': 'Fotos HEIC/HEIF não são suportadas. Exporte a foto como JPEG e tente novamente.',
  'image/heif': 'Fotos HEIC/HEIF não são suportadas. Exporte a foto como JPEG e tente novamente.',
  'image/gif': 'Imagens GIF não são suportadas. Use PNG, JPEG ou WebP.',
  'image/svg+xml': 'Arquivos SVG não são suportados. Exporte a arte como PNG e tente novamente.',
}

const UNSUPPORTED_TYPE_MESSAGE = 'Formato não suportado. Envie uma imagem PNG, JPEG ou WebP.'

/** Tipos não padronizados que alguns sistemas ainda informam para JPEG e PNG. */
const MIME_ALIASES = ['image/jpg', 'image/pjpeg', 'image/x-png']

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value)

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

const readUint32BE = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/** Identifica o formato pela assinatura dos primeiros bytes. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && startsWith(bytes, PNG_SIGNATURE)) return 'png'
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  return null
}

function readPngSize(bytes: Uint8Array) {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) }
}

function readJpegSize(bytes: Uint8Array) {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    // Bytes de preenchimento e marcadores sem carga útil.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    // Fim da imagem ou início dos dados comprimidos sem ter encontrado o quadro.
    if (marker === 0xd9 || marker === 0xda) return null
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      }
    }
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3]
    offset += 2 + segmentLength
  }
  return null
}

function readWebpSize(bytes: Uint8Array) {
  if (bytes.length < 30) return null
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8 ') {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null
    const b1 = bytes[22]
    const b2 = bytes[23]
    const b3 = bytes[24]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | bytes[21]),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    }
  }
  return null
}

/** Lê formato e dimensões a partir dos bytes iniciais do arquivo. */
export function parseImageHeader(bytes: Uint8Array): ImageHeaderInfo | null {
  const format = detectImageFormat(bytes)
  if (!format) return null
  const size = format === 'png' ? readPngSize(bytes) : format === 'jpeg' ? readJpegSize(bytes) : readWebpSize(bytes)
  return size && size.width > 0 && size.height > 0 ? { format, ...size } : { format }
}

/** Confere se as dimensões estão dentro dos limites da aplicação. */
export function assertImageDimensions(width: number, height: number) {
  if (width < IMAGE_LIMITS.minSide || height < IMAGE_LIMITS.minSide) {
    throw new ImageFileError(
      'too-small',
      `A imagem é muito pequena (${formatInteger(width)} × ${formatInteger(height)} px). ` +
        `Use uma imagem com pelo menos ${IMAGE_LIMITS.minSide} px em cada lado.`,
    )
  }
  if (width * height > IMAGE_LIMITS.maxPixels) {
    throw new ImageFileError(
      'too-large',
      `A imagem tem ${formatInteger(width)} × ${formatInteger(height)} px, acima do limite de ` +
        `${formatInteger(IMAGE_LIMITS.maxPixels / 1_000_000)} megapixels. Reduza a resolução e tente novamente.`,
    )
  }
}

function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase()
  return IMAGE_LIMITS.acceptedExtensions.some((extension) => lower.endsWith(extension))
}

/**
 * Valida tipo, tamanho e dimensões de um arquivo antes de decodificá-lo.
 * Lança ImageFileError com uma mensagem pronta para o usuário.
 */
export async function validateImageFile(file: File): Promise<ImageHeaderInfo> {
  if (file.size === 0) throw new ImageFileError('empty', 'O arquivo selecionado está vazio.')

  const declaredType = file.type.toLowerCase()
  if (UNSUPPORTED_HINTS[declaredType]) throw new ImageFileError('type', UNSUPPORTED_HINTS[declaredType])
  const declaredAccepted =
    (IMAGE_LIMITS.acceptedMimeTypes as readonly string[]).includes(declaredType) || MIME_ALIASES.includes(declaredType)
  // Alguns sistemas não informam o tipo; nesse caso a extensão decide e a assinatura confirma.
  const typeUnknown = declaredType === '' || declaredType === 'application/octet-stream'
  if (!declaredAccepted && !(typeUnknown && hasAcceptedExtension(file.name))) {
    throw new ImageFileError('type', UNSUPPORTED_TYPE_MESSAGE)
  }

  if (file.size > IMAGE_LIMITS.maxFileBytes) {
    throw new ImageFileError(
      'file-size',
      `O arquivo tem ${formatFileSize(file.size)} e excede o limite de ${formatFileSize(IMAGE_LIMITS.maxFileBytes)}.`,
    )
  }

  let header: ImageHeaderInfo | null
  try {
    header = parseImageHeader(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()))
  } catch {
    throw new ImageFileError('corrupt', 'Não foi possível ler o arquivo. Tente selecioná-lo novamente.')
  }
  if (!header) {
    throw new ImageFileError('type', 'O conteúdo do arquivo não é uma imagem PNG, JPEG ou WebP válida.')
  }
  if (header.width && header.height) assertImageDimensions(header.width, header.height)
  return header
}
