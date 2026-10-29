/**
 * Resolução física (dpi) gravada no arquivo exportado, para que editores de imagem e softwares de
 * impressão abram a arte no tamanho certo. O canvas do navegador não grava essa informação:
 * - PNG: bloco pHYs (pixels por metro), inserido logo após o IHDR;
 * - JPEG: densidade do cabeçalho JFIF (APP0), em pontos por polegada.
 * Os pixels não são tocados: só os metadados mudam.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (o mesmo do PNG e do ZIP). */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length) {
  let crc = 0xffffffff
  for (let index = start; index < end; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const INCHES_PER_METER = 1 / 0.0254

export interface PngChunk {
  type: string
  /** Início do bloco (campo de tamanho) e fim (depois do CRC), no arquivo. */
  start: number
  end: number
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))

export function readPngChunks(png: Uint8Array): PngChunk[] {
  if (png.length < 8 || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) throw new Error('Não é um PNG válido.')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks: PngChunk[] = []
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > png.length) throw new Error('PNG truncado.')
    chunks.push({ type: ascii(png, offset + 4, 4), start: offset, end })
    offset = end
  }
  return chunks
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

/** Grava a resolução no PNG (substitui um pHYs existente). */
export function setPngResolution(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const chunks = readPngChunks(png)
  if (chunks[0]?.type !== 'IHDR') throw new Error('PNG sem cabeçalho IHDR.')
  const pixelsPerMeter = Math.max(1, Math.round(dpi * INCHES_PER_METER))

  const phys = new Uint8Array(4 + 4 + 9 + 4)
  const view = new DataView(phys.buffer)
  view.setUint32(0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  view.setUint32(8, pixelsPerMeter)
  view.setUint32(12, pixelsPerMeter)
  phys[16] = 1 // unidade: metro
  view.setUint32(17, crc32(phys, 4, 17))

  const parts = [png.subarray(0, chunks[0].end), phys]
  for (const chunk of chunks.slice(1)) {
    if (chunk.type !== 'pHYs') parts.push(png.subarray(chunk.start, chunk.end))
  }
  return concat(parts)
}

/** Grava a resolução no cabeçalho JFIF do JPEG (insere o cabeçalho se ele não existir). */
export function setJpegResolution(jpeg: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Não é um JPEG válido.')
  const density = Math.min(65535, Math.max(1, Math.round(dpi)))
  const hi = density >> 8
  const lo = density & 0xff

  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && ascii(jpeg, 6, 5) === 'JFIF\0') {
    const output = new Uint8Array(jpeg)
    output[13] = 1 // unidade: pontos por polegada
    output.set([hi, lo, hi, lo], 14)
    return output
  }

  const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x01, hi, lo, hi, lo, 0x00, 0x00])
  return concat([jpeg.subarray(0, 2), app0, jpeg.subarray(2)])
}

/** Lê a resolução gravada (para testes e verificações): dpi ou null se não houver. */
export function readResolution(bytes: Uint8Array): number | null {
  if (bytes[0] === 0x89) {
    const chunk = readPngChunks(bytes).find((item) => item.type === 'pHYs')
    if (!chunk) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return bytes[chunk.start + 16] === 1 ? view.getUint32(chunk.start + 8) / INCHES_PER_METER : null
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && ascii(bytes, 6, 5) === 'JFIF\0' && bytes[13] === 1) {
    return (bytes[14] << 8) | bytes[15]
  }
  return null
}
