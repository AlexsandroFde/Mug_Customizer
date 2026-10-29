import { describe, expect, it } from 'vitest'
import { EXPORT_LIMITS, PRINTABLE } from '../config/mugSpec'
import {
  coversArea,
  getArtComposition,
  getExportFileName,
  getNativeDensity,
  HIGH_RESOLUTION_FACTOR,
  planExport,
  type ExportLimits,
  type ExportSizeRequest,
} from './exportArt'
import { DEFAULT_PRINT_AREA, type PrintArea } from './printArea'
import { DEFAULT_TRANSFORM, getPrintedSize, type PrintTransform } from './printMapping'

const DESKTOP: ExportLimits = { maxSide: EXPORT_LIMITS.maxSide, maxPixels: EXPORT_LIMITS.maxPixels.default }
const PHOTO = { width: 2400, height: 1600 }
const transform = (patch: Partial<PrintTransform> = {}): PrintTransform => ({ ...DEFAULT_TRANSFORM, ...patch })
const area = (patch: Partial<PrintArea> = {}): PrintArea => ({ ...DEFAULT_PRINT_AREA, ...patch })
const request = (patch: Partial<ExportSizeRequest> = {}): ExportSizeRequest => ({
  mode: 'original',
  printWidth: 20,
  dpi: 300,
  customWidth: 1000,
  ...patch,
})

describe('composição da arte', () => {
  it('usa o tamanho impresso do personalizador e centraliza a imagem na área', () => {
    const composition = getArtComposition(DEFAULT_PRINT_AREA, DEFAULT_TRANSFORM, PHOTO)
    expect(composition.area).toEqual({ width: PRINTABLE.width, height: PRINTABLE.height })
    expect(composition.size).toEqual(getPrintedSize(PHOTO, DEFAULT_TRANSFORM, DEFAULT_PRINT_AREA))
    expect(composition.center.x).toBeCloseTo(PRINTABLE.width / 2)
    expect(composition.center.y).toBeCloseTo(PRINTABLE.height / 2)
  })

  it('converte a posição para o referencial da área, com y para baixo', () => {
    const moved = area({ shape: 'custom', width: 10, height: 6, offsetX: 3, offsetY: -1 })
    // Centro da imagem no referencial da caneca: (3 + 2, -1 + 1) = (5, 0).
    // Canto superior esquerdo da área: x = 3 - 5 = -2, y = -1 + 3 = 2.
    const composition = getArtComposition(moved, transform({ offsetX: 2, offsetY: 1, rotation: 30 }), PHOTO)
    expect(composition.center.x).toBeCloseTo(7)
    expect(composition.center.y).toBeCloseTo(2)
    expect(composition.rotation).toBe(30)
  })
})

describe('resolução da imagem de origem', () => {
  it('é medida em pixels originais por cm impresso', () => {
    expect(getNativeDensity(PHOTO, { width: 12, height: 8 })).toBeCloseTo(200)
  })

  it('quando a imagem é esticada, vale o eixo mais denso, para não perder detalhe', () => {
    expect(getNativeDensity(PHOTO, { width: 20, height: 8 })).toBeCloseTo(200)
  })
})

describe('cobertura da área', () => {
  it('conter deixa sobras; cobrir e preencher cobrem a área inteira', () => {
    const contain = transform()
    const cover = transform({ fit: 'cover' })
    const stretch = transform({ fit: 'stretch' })
    for (const [value, expected] of [
      [contain, false],
      [cover, true],
      [stretch, true],
    ] as const) {
      expect(coversArea(DEFAULT_PRINT_AREA, value, getPrintedSize(PHOTO, value, DEFAULT_PRINT_AREA))).toBe(expected)
    }
  })

  it('girar uma imagem que só preenche a área deixa os cantos vazios', () => {
    const rotated = transform({ fit: 'stretch', rotation: 5 })
    expect(coversArea(DEFAULT_PRINT_AREA, rotated, getPrintedSize(PHOTO, rotated, DEFAULT_PRINT_AREA))).toBe(false)
  })
})

describe('tamanho de saída', () => {
  const area20x8 = { width: 20, height: 8 }

  it('original reproduz a resolução da imagem, sem ampliar nem reduzir', () => {
    const plan = planExport(request(), area20x8, 200, DESKTOP)
    expect(plan).toMatchObject({ width: 4000, height: 1600, limited: false })
    expect(plan.sourceScale).toBeCloseTo(1)
    expect(plan.physical).toEqual(area20x8)
    expect(plan.dpi).toBeCloseTo(508)
  })

  it('alta resolução dobra a original', () => {
    const plan = planExport(request({ mode: 'high' }), area20x8, 200, DESKTOP)
    expect(plan).toMatchObject({ width: 4000 * HIGH_RESOLUTION_FACTOR, height: 1600 * HIGH_RESOLUTION_FACTOR })
    expect(plan.sourceScale).toBeCloseTo(HIGH_RESOLUTION_FACTOR)
  })

  it('impressão: 20 × 8 cm a 300 dpi resultam em 2362 × 945 px', () => {
    const plan = planExport(request({ mode: 'print', printWidth: 20, dpi: 300 }), area20x8, 200, DESKTOP)
    expect(plan).toMatchObject({ width: 2362, height: 945 })
    expect(plan.physical.height).toBeCloseTo(8)
    expect(plan.dpi).toBeCloseTo(300, 0)
    // A 300 dpi, uma imagem de 508 dpi é reduzida.
    expect(plan.sourceScale).toBeLessThan(1)
  })

  it('personalizada: a altura acompanha a proporção da área', () => {
    expect(planExport(request({ mode: 'custom', customWidth: 1000 }), area20x8, 200, DESKTOP)).toMatchObject({
      width: 1000,
      height: 400,
    })
  })

  it('mantém a proporção da área em qualquer formato e resolução', () => {
    for (const size of [
      { width: PRINTABLE.width, height: PRINTABLE.height },
      { width: 8, height: 8 },
      { width: 3, height: 7.5 },
    ]) {
      for (const mode of ['original', 'high', 'print', 'custom'] as const) {
        const plan = planExport(request({ mode, customWidth: 1234 }), size, 137, DESKTOP)
        expect(Math.abs(plan.width / plan.height - size.width / size.height)).toBeLessThan(2 / plan.height)
      }
    }
  })

  it('respeita os limites do dispositivo e avisa quando reduz', () => {
    const plan = planExport(request({ mode: 'high' }), area20x8, 2000, DESKTOP)
    expect(plan.limited).toBe(true)
    expect(plan.width).toBeLessThanOrEqual(DESKTOP.maxSide)
    expect(plan.height).toBeLessThanOrEqual(DESKTOP.maxSide)
    expect(plan.width * plan.height).toBeLessThanOrEqual(DESKTOP.maxPixels)
    expect(Math.abs(plan.width / plan.height - 2.5)).toBeLessThan(2 / plan.height)

    const touch = { ...DESKTOP, maxPixels: EXPORT_LIMITS.maxPixels.touch }
    const phone = planExport(request({ mode: 'custom', customWidth: 12000 }), area20x8, 200, touch)
    expect(phone.width * phone.height).toBeLessThanOrEqual(touch.maxPixels)
  })

  it('nomeia o arquivo com as dimensões e a extensão do formato', () => {
    expect(getExportFileName({ width: 4000, height: 1600 }, 'png')).toBe('estampa-caneca-4000x1600.png')
    expect(getExportFileName({ width: 2362, height: 945 }, 'jpeg')).toBe('estampa-caneca-2362x945.jpg')
    expect(getExportFileName({ width: 10, height: 4 }, 'webp')).toBe('estampa-caneca-10x4.webp')
  })
})
