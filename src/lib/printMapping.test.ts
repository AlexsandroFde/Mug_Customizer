import { describe, expect, it } from 'vitest'
import { MUG, PRINT_CENTER_ANGLE, PRINT_HEIGHT, PRINT_WIDTH, SCALE_RANGE } from '../config/mugSpec'
import {
  clampTransform,
  DEFAULT_TRANSFORM,
  getEffectiveDpi,
  getFittedSize,
  getImageCorners,
  getPrintedSize,
  getPrintQuality,
  getSideOffset,
  isImageCropped,
  normalizeDegrees,
  printOffsetToAngle,
  printToImageUv,
  snapValue,
  surfaceToPrint,
  wrapAngle,
  type PrintTransform,
} from './printMapping'

const transform = (patch: Partial<PrintTransform> = {}): PrintTransform => ({ ...DEFAULT_TRANSFORM, ...patch })

/** Ponto da parede externa no ângulo (padrão atan2(x, z)) e altura informados. */
const wallPoint = (angle: number, y: number) => [MUG.outerRadius * Math.sin(angle), y, MUG.outerRadius * Math.cos(angle)] as const

describe('encaixe da imagem', () => {
  const areaAspect = PRINT_WIDTH / PRINT_HEIGHT

  it('contain mantém a proporção e cabe inteira na área', () => {
    const square = getFittedSize(1, 'contain')
    expect(square.height).toBeCloseTo(PRINT_HEIGHT)
    expect(square.width).toBeCloseTo(PRINT_HEIGHT)

    const panorama = getFittedSize(areaAspect * 2, 'contain')
    expect(panorama.width).toBeCloseTo(PRINT_WIDTH)
    expect(panorama.width / panorama.height).toBeCloseTo(areaAspect * 2)
  })

  it('cover mantém a proporção e cobre a área inteira', () => {
    const square = getFittedSize(1, 'cover')
    expect(square.width).toBeCloseTo(PRINT_WIDTH)
    expect(square.height).toBeCloseTo(PRINT_WIDTH)

    const panorama = getFittedSize(areaAspect * 2, 'cover')
    expect(panorama.height).toBeCloseTo(PRINT_HEIGHT)
    expect(panorama.width).toBeGreaterThan(PRINT_WIDTH)
  })

  it('stretch ocupa exatamente a área, alterando a proporção', () => {
    expect(getFittedSize(0.5, 'stretch')).toEqual({ width: PRINT_WIDTH, height: PRINT_HEIGHT })
  })

  it('a escala multiplica as duas dimensões igualmente', () => {
    const size = getPrintedSize(4 / 3, transform({ scale: 0.5 }))
    expect(size.width / size.height).toBeCloseTo(4 / 3)
    expect(size.height).toBeCloseTo(PRINT_HEIGHT / 2)
  })
})

describe('limites dos parâmetros', () => {
  it('mantém o centro dentro da área e a escala dentro da faixa', () => {
    const clamped = clampTransform(transform({ offsetX: 99, offsetY: -99, scale: 50, rotation: 270 }))
    expect(clamped.offsetX).toBe(PRINT_WIDTH / 2)
    expect(clamped.offsetY).toBe(-PRINT_HEIGHT / 2)
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
  it('o centro da área de impressão fica no lado oposto à alça', () => {
    const point = surfaceToPrint(...wallPoint(PRINT_CENTER_ANGLE, 5))
    expect(point.x).toBeCloseTo(0)
  })

  it('x cresce da esquerda para a direita para quem olha de fora', () => {
    // Câmera em +Z olhando a origem: a direita da tela é +X, ou seja, ângulos maiores.
    const left = surfaceToPrint(...wallPoint(-0.2, 5))
    const right = surfaceToPrint(...wallPoint(0.2, 5))
    expect(right.x).toBeGreaterThan(left.x)
    expect(right.x - left.x).toBeCloseTo(0.4 * MUG.outerRadius)
  })

  it('converte deslocamentos horizontais em ângulos e de volta', () => {
    for (const offset of [-9, -3.2, 0, 4.4, 10]) {
      const angle = printOffsetToAngle(offset)
      expect(surfaceToPrint(...wallPoint(angle, 1)).x).toBeCloseTo(offset)
    }
  })
})

describe('mapeamento da imagem (espelho do shader)', () => {
  const size = { width: 6, height: 4 }

  it('os cantos da estampa correspondem aos cantos da imagem em qualquer posição e rotação', () => {
    const expected = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    for (const rotation of [0, 33, 90, -135, 180]) {
      const placed = transform({ offsetX: 2.5, offsetY: -1, rotation })
      getImageCorners(placed, size).forEach((corner, index) => {
        const uv = printToImageUv(corner, placed, size)
        expect(uv.x).toBeCloseTo(expected[index].x)
        expect(uv.y).toBeCloseTo(expected[index].y)
      })
    }
  })

  it('rotação positiva gira no sentido horário: o topo da imagem passa a apontar para a direita', () => {
    const placed = transform({ rotation: 90 })
    const topCenter = printToImageUv({ x: size.height / 2 - 0.01, y: 0 }, placed, size)
    expect(topCenter.y).toBeGreaterThan(0.99)
    expect(topCenter.x).toBeCloseTo(0.5)
  })

  it('detecta quando a estampa ultrapassa a área imprimível', () => {
    expect(isImageCropped(transform(), size)).toBe(false)
    expect(isImageCropped(transform({ offsetX: PRINT_WIDTH / 2 }), size)).toBe(true)
    expect(isImageCropped(transform({ rotation: 45 }), { width: PRINT_HEIGHT, height: PRINT_HEIGHT })).toBe(true)
  })
})

describe('posicionamento rápido', () => {
  it('centraliza a estampa em cada lado quando ela cabe', () => {
    const size = { width: 6, height: 6 }
    expect(getSideOffset('left', 0, size)).toBeCloseTo(-PRINT_WIDTH / 4)
    expect(getSideOffset('right', 0, size)).toBeCloseTo(PRINT_WIDTH / 4)
    expect(getSideOffset('center', 0, size)).toBe(0)
  })

  it('aproxima do centro uma estampa larga demais para o lado', () => {
    const size = { width: 16, height: 6 }
    expect(getSideOffset('right', 0, size)).toBeCloseTo(PRINT_WIDTH / 2 - 8)
    expect(getSideOffset('left', 0, { width: 30, height: 6 })).toBe(0)
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
