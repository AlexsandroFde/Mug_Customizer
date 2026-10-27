import { describe, expect, it } from 'vitest'
import { IMAGE_LIMITS } from '../config/mugSpec'
import { detectImageFormat, ImageFileError, parseImageHeader, validateImageFile } from './imageFile'

const uint32BE = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0))

function pngHeader(width: number, height: number) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...uint32BE(13), ...ascii('IHDR'), ...uint32BE(width), ...uint32BE(height),
    8, 6, 0, 0, 0,
  ])
}

function jpegHeader(width: number, height: number) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xda])
}

function webpHeader(chunk: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number) {
  const bytes = new Uint8Array(40)
  bytes.set(ascii('RIFF'), 0)
  bytes.set(ascii('WEBP'), 8)
  bytes.set(ascii(chunk), 12)
  if (chunk === 'VP8 ') {
    bytes.set([0x9d, 0x01, 0x2a], 23)
    bytes.set([width & 255, (width >> 8) & 0x3f, height & 255, (height >> 8) & 0x3f], 26)
  } else if (chunk === 'VP8L') {
    const w = width - 1
    const h = height - 1
    bytes.set([0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 0x0f], 20)
  } else {
    const w = width - 1
    const h = height - 1
    bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24)
  }
  return bytes
}

const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string) => new File([bytes], name, { type })

async function expectError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ImageFileError)
  expect((error as ImageFileError).code).toBe(code)
  return error as ImageFileError
}

describe('identificação do formato', () => {
  it('reconhece as assinaturas de PNG, JPEG e WebP', () => {
    expect(detectImageFormat(pngHeader(10, 10))).toBe('png')
    expect(detectImageFormat(jpegHeader(10, 10))).toBe('jpeg')
    expect(detectImageFormat(webpHeader('VP8 ', 10, 10))).toBe('webp')
    expect(detectImageFormat(new Uint8Array(ascii('GIF89a......')))).toBeNull()
  })

  it('lê as dimensões do cabeçalho de cada formato', () => {
    expect(parseImageHeader(pngHeader(1920, 1080))).toEqual({ format: 'png', width: 1920, height: 1080 })
    expect(parseImageHeader(jpegHeader(4032, 3024))).toEqual({ format: 'jpeg', width: 4032, height: 3024 })
    expect(parseImageHeader(webpHeader('VP8 ', 1200, 800))).toEqual({ format: 'webp', width: 1200, height: 800 })
    expect(parseImageHeader(webpHeader('VP8L', 1000, 750))).toEqual({ format: 'webp', width: 1000, height: 750 })
    expect(parseImageHeader(webpHeader('VP8X', 5000, 3000))).toEqual({ format: 'webp', width: 5000, height: 3000 })
  })
})

describe('validação de arquivos', () => {
  it('aceita imagens válidas', async () => {
    await expect(validateImageFile(file(pngHeader(800, 600), 'arte.png', 'image/png'))).resolves.toMatchObject({
      format: 'png',
      width: 800,
    })
  })

  it('aceita arquivos sem tipo informado quando a extensão é conhecida', async () => {
    await expect(validateImageFile(file(jpegHeader(800, 600), 'foto.JPG', ''))).resolves.toMatchObject({ format: 'jpeg' })
  })

  it('recusa arquivos vazios', async () => {
    await expectError(validateImageFile(file(new Uint8Array(), 'vazio.png', 'image/png')), 'empty')
  })

  it('recusa formatos não suportados com uma orientação específica', async () => {
    const error = await expectError(validateImageFile(file(new Uint8Array(ascii('GIF89a')), 'a.gif', 'image/gif')), 'type')
    expect(error.message).toContain('GIF')
    await expectError(validateImageFile(file(pngHeader(10, 10), 'foto.heic', 'image/heic')), 'type')
  })

  it('recusa conteúdo que não corresponde a uma imagem, mesmo com extensão válida', async () => {
    await expectError(validateImageFile(file(new Uint8Array(ascii('não sou uma imagem')), 'falsa.png', 'image/png')), 'type')
  })

  it('recusa arquivos acima do limite de tamanho', async () => {
    const big = new Uint8Array(IMAGE_LIMITS.maxFileBytes + 1)
    big.set(pngHeader(800, 600))
    await expectError(validateImageFile(file(big, 'grande.png', 'image/png')), 'file-size')
  })

  it('recusa dimensões grandes demais antes de decodificar', async () => {
    await expectError(validateImageFile(file(pngHeader(12000, 9000), 'enorme.png', 'image/png')), 'too-large')
  })

  it('recusa imagens pequenas demais', async () => {
    await expectError(validateImageFile(file(pngHeader(40, 40), 'icone.png', 'image/png')), 'too-small')
  })
})
