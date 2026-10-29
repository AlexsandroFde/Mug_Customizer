import { describe, expect, it } from 'vitest'
import { crc32, readPngChunks, readResolution, setJpegResolution, setPngResolution } from './imageMetadata'

const bytesOf = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)))

function chunk(type: string, data: number[]) {
  const bytes = new Uint8Array(12 + data.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  bytes.set(bytesOf(type), 4)
  bytes.set(data, 8)
  view.setUint32(8 + data.length, crc32(bytes, 4, 8 + data.length))
  return bytes
}

/** PNG mínimo: assinatura, IHDR (1 × 1), IDAT vazio e IEND. */
function minimalPng(...extra: Uint8Array[]) {
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...extra,
    chunk('IDAT', []),
    chunk('IEND', []),
  ]
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

describe('CRC-32', () => {
  it('confere com os valores de referência', () => {
    expect(crc32(bytesOf('123456789'))).toBe(0xcbf43926)
    expect(crc32(bytesOf('IEND'))).toBe(0xae426082)
  })
})

describe('resolução no PNG', () => {
  it('insere o pHYs logo depois do IHDR, com CRC válido', () => {
    const output = setPngResolution(minimalPng(), 300)
    const chunks = readPngChunks(output)
    expect(chunks.map((item) => item.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    const phys = chunks[1]
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength)
    expect(view.getUint32(phys.end - 4)).toBe(crc32(output, phys.start + 4, phys.end - 4))
    expect(readResolution(output)).toBeCloseTo(300, 1)
  })

  it('substitui um pHYs existente em vez de duplicar', () => {
    const output = setPngResolution(setPngResolution(minimalPng(), 150), 600)
    expect(readPngChunks(output).filter((item) => item.type === 'pHYs')).toHaveLength(1)
    expect(readResolution(output)).toBeCloseTo(600, 1)
  })

  it('recusa arquivos que não são PNG', () => {
    expect(() => setPngResolution(bytesOf('não é png'), 300)).toThrow()
  })
})

describe('resolução no JPEG', () => {
  it('ajusta a densidade do cabeçalho JFIF sem mudar o tamanho do arquivo', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xd9,
    ])
    const output = setJpegResolution(jpeg, 300)
    expect(output).toHaveLength(jpeg.length)
    expect(readResolution(output)).toBe(300)
    expect(output.subarray(18)).toEqual(jpeg.subarray(18))
  })

  it('insere um cabeçalho JFIF quando o arquivo não tem um', () => {
    const exifFirst = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9])
    const output = setJpegResolution(exifFirst, 254)
    expect(output).toHaveLength(exifFirst.length + 18)
    expect(readResolution(output)).toBe(254)
    expect(output.subarray(20)).toEqual(exifFirst.subarray(2))
  })
})
