import { describe, expect, it } from 'vitest'
import { MUG, PRINT_REFERENCE_DPI, PRINTABLE, SCALE_RANGE } from '../config/mugSpec'
import {
  clampTransform,
  DEFAULT_TRANSFORM,
  getEffectiveDpi,
  getFittedSize,
  getImageCenter,
  getImageCorners,
  getOriginalPrintSize,
  getPrintedSize,
  getPrintQuality,
  isImageCropped,
  normalizeDegrees,
  printOffsetToAngle,
  printToImageUv,
  snapValue,
  surfaceToPrint,
  wrapAngle,
  type AreaBox,
  type PrintTransform,
} from './printMapping'

const transform = (patch: Partial<PrintTransform> = {}): PrintTransform => ({ ...DEFAULT_TRANSFORM, ...patch })
const FULL_AREA: AreaBox = { width: PRINTABLE.width, height: PRINTABLE.height, offsetX: 0, offsetY: 0 }

/** Imagem com a proporção informada (as dimensões em pixels só importam no modo original). */
const pixels = (aspect: number) => ({ width: 1000 * aspect, height: 1000 })

/** Ponto da parede externa no ângulo (padrão atan2(x, z)) e altura informados. */
const wallPoint = (angle: number, y: number) => [MUG.outerRadius * Math.sin(angle), y, MUG.outerRadius * Math.cos(angle)] as const

describe('encaixe da imagem na área', () => {
  const areaAspect = PRINTABLE.width / PRINTABLE.height

  it('conter mantém a proporção e cabe inteira na área', () => {
    const square = getFittedSize(pixels(1), 'contain', FULL_AREA)
    expect(square.height).toBeCloseTo(PRINTABLE.height)
    expect(square.width).toBeCloseTo(PRINTABLE.height)

    const panorama = getFittedSize(pixels(areaAspect * 2), 'contain', FULL_AREA)
    expect(panorama.width).toBeCloseTo(PRINTABLE.width)
    expect(panorama.width / panorama.height).toBeCloseTo(areaAspect * 2)
  })

  it('cobrir mantém a proporção e cobre a área inteira', () => {
    const square = getFittedSize(pixels(1), 'cover', FULL_AREA)
    expect(square.width).toBeCloseTo(PRINTABLE.width)
    expect(square.height).toBeCloseTo(PRINTABLE.width)

    const panorama = getFittedSize(pixels(areaAspect * 2), 'cover', FULL_AREA)
    expect(panorama.height).toBeCloseTo(PRINTABLE.height)
    expect(panorama.width).toBeGreaterThan(PRINTABLE.width)
  })

  it('preencher ocupa exatamente a área, alterando a proporção', () => {
    expect(getFittedSize(pixels(0.5), 'stretch', { width: 7, height: 3 })).toEqual({ width: 7, height: 3 })
  })

  it('o encaixe acompanha as dimensões da área configurada', () => {
    const area = { width: 6, height: 6 }
    expect(getFittedSize(pixels(2), 'contain', area)).toEqual({ width: 6, height: 3 })
    expect(getFittedSize(pixels(2), 'cover', area)).toEqual({ width: 12, height: 6 })
  })

  it('tamanho original imprime cada pixel na resolução de referência, sem depender da área', () => {
    const image = { width: PRINT_REFERENCE_DPI * 2, height: PRINT_REFERENCE_DPI }
    expect(getOriginalPrintSize(image).width).toBeCloseTo(2 * 2.54)
    expect(getFittedSize(image, 'original', FULL_AREA)).toEqual(getFittedSize(image, 'original', { width: 3, height: 3 }))
    const printed = getPrintedSize(image, transform({ fit: 'original' }), FULL_AREA)
    expect(getEffectiveDpi(image.width, image.height, printed)).toBeCloseTo(PRINT_REFERENCE_DPI)
  })

  it('a escala multiplica as duas dimensões igualmente', () => {
    const size = getPrintedSize(pixels(4 / 3), transform({ scale: 0.5 }), FULL_AREA)
    expect(size.width / size.height).toBeCloseTo(4 / 3)
    expect(size.height).toBeCloseTo(PRINTABLE.height / 2)
  })
})

describe('limites dos parâmetros', () => {
  it('mantém o centro dentro da área e a escala dentro da faixa', () => {
    const area = { width: 6, height: 4 }
    const clamped = clampTransform(transform({ offsetX: 99, offsetY: -99, scale: 50, rotation: 270 }), area)
    expect(clamped.offsetX).toBe(3)
    expect(clamped.offsetY).toBe(-2)
    expect(clamped.scale).toBe(SCALE_RANGE.max)
    expect(clamped.rotation).toBe(-90)
  })

  it('normaliza ângulos', () => {
    expect(normalizeDegrees(-180)).toBe(180)
    expect(normalizeDegrees(540)).toBe(180)
    expect(normalizeDegrees(-190)).toBe(170)
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI)
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5)
  })
})

describe('coordenadas da superfície', () => {
  it('o centro da região imprimível fica no lado oposto à alça', () => {
    const point = surfaceToPrint(...wallPoint(PRINTABLE.centerAngle, 5))
    expect(point.x).toBeCloseTo(0)
  })

  it('x cresce da esquerda para a direita para quem olha de fora', () => {
    // Câmera em +Z olhando a origem: a direita da tela é +X, ou seja, ângulos maiores.
    const left = surfaceToPrint(...wallPoint(-0.2, 5))
    const right = surfaceToPrint(...wallPoint(0.2, 5))
    expect(right.x).toBeGreaterThan(left.x)
    expect(right.x - left.x).toBeCloseTo(0.4 * MUG.outerRadius)
  })

  it('converte posições horizontais em ângulos e de volta', () => {
    for (const offset of [-9, -3.2, 0, 4.4, 10]) {
      const angle = printOffsetToAngle(offset)
      expect(surfaceToPrint(...wallPoint(angle, 1)).x).toBeCloseTo(offset)
    }
  })
})

describe('mapeamento da imagem (espelho do shader)', () => {
  const size = { width: 6, height: 4 }

  it('a imagem é posicionada a partir do centro da área', () => {
    const area = { width: 8, height: 5, offsetX: 4, offsetY: -1 }
    expect(getImageCenter(area, transform({ offsetX: 1, offsetY: 0.5 }))).toEqual({ x: 5, y: -0.5 })
  })

  it('os cantos da estampa correspondem aos cantos da imagem em qualquer posição e rotação', () => {
    const expected = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const center = { x: 2.5, y: -1 }
    for (const rotation of [0, 33, 90, -135, 180]) {
      getImageCorners(center, rotation, size).forEach((corner, index) => {
        const uv = printToImageUv(corner, center, rotation, size)
        expect(uv.x).toBeCloseTo(expected[index].x)
        expect(uv.y).toBeCloseTo(expected[index].y)
      })
    }
  })

  it('rotação positiva gira no sentido horário: o topo da imagem passa a apontar para a direita', () => {
    const topCenter = printToImageUv({ x: size.height / 2 - 0.01, y: 0 }, { x: 0, y: 0 }, 90, size)
    expect(topCenter.y).toBeGreaterThan(0.99)
    expect(topCenter.x).toBeCloseTo(0.5)
  })

  it('detecta quando a estampa ultrapassa a área de impressão', () => {
    const area = { width: 10, height: 6, offsetX: 3, offsetY: 0 }
    expect(isImageCropped(area, transform(), size)).toBe(false)
    expect(isImageCropped(area, transform({ offsetX: 5 }), size)).toBe(true)
    expect(isImageCropped(area, transform({ rotation: 45 }), { width: 6, height: 6 })).toBe(true)
  })

  it('atrai valores próximos do alvo', () => {
    expect(snapValue(0.12, 0.2)).toEqual({ value: 0, snapped: true })
    expect(snapValue(0.5, 0.2)).toEqual({ value: 0.5, snapped: false })
  })
})

describe('qualidade de impressão', () => {
  it('calcula a resolução efetiva pelo lado mais limitante', () => {
    // 2,54 cm = 1 polegada.
    expect(getEffectiveDpi(600, 300, { width: 2.54, height: 2.54 })).toBeCloseTo(300)
  })

  it('classifica a qualidade pelos limites configurados', () => {
    expect(getPrintQuality(320)).toBe('excellent')
    expect(getPrintQuality(170)).toBe('good')
    expect(getPrintQuality(120)).toBe('acceptable')
    expect(getPrintQuality(60)).toBe('low')
  })
})
