import { describe, expect, it } from 'vitest'
import { PRINT_LIMITS, PRINTABLE } from '../config/mugSpec'
import {
  AREA_SHAPES,
  areaSignedDistance,
  clampArea,
  DEFAULT_PRINT_AREA,
  getAreaHandles,
  getAreaLimits,
  getAreaOffsetRange,
  getAreaScale,
  getAreaScaleRange,
  getAreaSideOffset,
  getHandlePosition,
  moveArea,
  resizeAreaFromHandle,
  setAreaHeight,
  setAreaScale,
  setAreaShape,
  setAreaWidth,
  type PrintArea,
} from './printArea'

const area = (patch: Partial<PrintArea> = {}): PrintArea => ({ ...DEFAULT_PRINT_AREA, ...patch })
const MIN = PRINT_LIMITS.minAreaSize
const RECT_ASPECT = AREA_SHAPES.rectangle.aspect!

/** A área inteira fica dentro da região imprimível. */
function expectInsidePrintable(value: PrintArea) {
  expect(value.offsetX - value.width / 2).toBeGreaterThanOrEqual(-PRINTABLE.width / 2 - 1e-9)
  expect(value.offsetX + value.width / 2).toBeLessThanOrEqual(PRINTABLE.width / 2 + 1e-9)
  expect(value.offsetY - value.height / 2).toBeGreaterThanOrEqual(-PRINTABLE.height / 2 - 1e-9)
  expect(value.offsetY + value.height / 2).toBeLessThanOrEqual(PRINTABLE.height / 2 + 1e-9)
}

describe('região imprimível', () => {
  it('deriva dos limites físicos configurados', () => {
    expect(PRINTABLE.width).toBeCloseTo(2 * Math.PI * 4.1 - 2 * PRINT_LIMITS.handleClearance)
    expect(PRINTABLE.height).toBeCloseTo(9.6 - PRINT_LIMITS.marginTop - PRINT_LIMITS.marginBottom)
  })

  it('a área padrão é a região imprimível inteira, em formato retangular', () => {
    expect(DEFAULT_PRINT_AREA).toMatchObject({ shape: 'rectangle', width: PRINTABLE.width, height: PRINTABLE.height })
    expect(getAreaScale(DEFAULT_PRINT_AREA)).toBeCloseTo(1)
  })
})

describe('dimensões', () => {
  it('no formato personalizado, largura e altura são independentes', () => {
    const custom = area({ shape: 'custom' })
    const narrower = setAreaWidth(custom, 10)
    expect(narrower.width).toBe(10)
    expect(narrower.height).toBe(custom.height)
    const shorter = setAreaHeight(narrower, 4)
    expect(shorter.height).toBe(4)
    expect(shorter.width).toBe(10)
  })

  it('nos formatos travados, mudar uma dimensão mantém a proporção', () => {
    const rect = setAreaWidth(area(), 10)
    expect(rect.width / rect.height).toBeCloseTo(RECT_ASPECT)
    const square = setAreaHeight(area({ shape: 'square', width: 8, height: 8 }), 5)
    expect(square).toMatchObject({ width: 5, height: 5 })
  })

  it('não ultrapassa a região imprimível nem fica menor que o mínimo', () => {
    const custom = area({ shape: 'custom' })
    expect(setAreaWidth(custom, 99).width).toBeCloseTo(PRINTABLE.width)
    expect(setAreaHeight(custom, 99).height).toBeCloseTo(PRINTABLE.height)
    expect(setAreaWidth(custom, 0.1).width).toBe(MIN)
    // Quadrado: o lado máximo é a altura imprimível.
    expect(setAreaWidth(area({ shape: 'square', width: 5, height: 5 }), 99).width).toBeCloseTo(PRINTABLE.height)
  })

  it('crescer perto de um limite empurra o centro para dentro', () => {
    const atRight = moveArea(area({ shape: 'custom', width: 6 }), 99, 0)
    expect(atRight.offsetX + atRight.width / 2).toBeCloseTo(PRINTABLE.width / 2)
    const grown = setAreaWidth(atRight, 12)
    expectInsidePrintable(grown)
    expect(grown.offsetX + grown.width / 2).toBeCloseTo(PRINTABLE.width / 2)
  })
})

describe('escala geral', () => {
  it('redimensiona proporcionalmente; 100% é a maior área com as proporções atuais', () => {
    const custom = area({ shape: 'custom', width: 10, height: 4 })
    const half = setAreaScale(custom, getAreaScale(custom) / 2)
    expect(half.width / half.height).toBeCloseTo(10 / 4)
    expect(half.width).toBeCloseTo(5)

    const full = setAreaScale(custom, 1)
    expect(full.width / full.height).toBeCloseTo(10 / 4)
    expect(Math.max(full.width / PRINTABLE.width, full.height / PRINTABLE.height)).toBeCloseTo(1)
  })

  it('a escala mínima respeita o tamanho mínimo nas duas dimensões', () => {
    const custom = area({ shape: 'custom', width: 16, height: 4 })
    const smallest = setAreaScale(custom, 0)
    expect(Math.min(smallest.width, smallest.height)).toBeCloseTo(MIN)
    expect(getAreaScaleRange(custom).min).toBeGreaterThan(0)
  })
})

describe('formatos', () => {
  it('quadrado usa o menor lado e retângulo restaura a faixa sem encolher', () => {
    const square = setAreaShape(area(), 'square')
    expect(square.width).toBeCloseTo(PRINTABLE.height)
    expect(square.height).toBeCloseTo(PRINTABLE.height)
    const back = setAreaShape(square, 'rectangle')
    expect(back.width).toBeCloseTo(PRINTABLE.width)
    expect(back.height).toBeCloseTo(PRINTABLE.height)
  })

  it('personalizado mantém as dimensões atuais e só libera as proporções', () => {
    const square = setAreaShape(area(), 'square')
    expect(setAreaShape(square, 'custom')).toMatchObject({ shape: 'custom', width: square.width, height: square.height })
  })

  it('trocar o formato mantém o centro sempre que possível', () => {
    const moved = moveArea(area({ shape: 'square', width: 5, height: 5 }), 3, 1)
    const custom = setAreaShape(moved, 'custom')
    expect(custom).toMatchObject({ offsetX: 3, offsetY: 1 })
  })
})

describe('posição e limites', () => {
  it('a faixa de deslocamento encolhe conforme a área cresce', () => {
    expect(getAreaOffsetRange(DEFAULT_PRINT_AREA)).toEqual({ x: 0, y: 0 })
    const small = area({ shape: 'custom', width: 8, height: 4 })
    expect(getAreaOffsetRange(small).x).toBeCloseTo((PRINTABLE.width - 8) / 2)
    expect(getAreaOffsetRange(small).y).toBeCloseTo((PRINTABLE.height - 4) / 2)
  })

  it('nunca deixa a área sair da região imprimível', () => {
    const moved = moveArea(area({ shape: 'custom', width: 8, height: 4 }), -99, 99)
    expectInsidePrintable(moved)
    expect(getAreaLimits(moved)).toMatchObject({ left: true, top: true, right: false, bottom: false })
  })

  it('informa os limites atingidos pela área padrão', () => {
    expect(getAreaLimits(DEFAULT_PRINT_AREA)).toMatchObject({
      left: true,
      right: true,
      top: true,
      bottom: true,
      maxWidth: true,
      maxHeight: true,
      minWidth: false,
    })
  })

  it('leva a área aos lados visíveis da caneca', () => {
    const small = area({ shape: 'square', width: 6, height: 6 })
    expect(getAreaSideOffset('left', small)).toBeCloseTo(-PRINTABLE.width / 4)
    expect(getAreaSideOffset('right', small)).toBeCloseTo(PRINTABLE.width / 4)
    expect(getAreaSideOffset('center', small)).toBe(0)
    // Larga demais para centralizar no lado: encosta no limite.
    const wide = area({ shape: 'custom', width: 16, height: 6 })
    expect(getAreaSideOffset('right', wide)).toBeCloseTo((PRINTABLE.width - 16) / 2)
    expect(getAreaSideOffset('left', DEFAULT_PRINT_AREA)).toBe(0)
  })

  it('clampArea corrige áreas inválidas', () => {
    const fixed = clampArea({ shape: 'square', width: 30, height: 2, offsetX: 50, offsetY: -50 })
    expect(fixed.width).toBeCloseTo(fixed.height)
    expectInsidePrintable(fixed)
  })

  it('a distância com sinal é positiva dentro e negativa fora', () => {
    const box = area({ shape: 'custom', width: 6, height: 4, offsetX: 2, offsetY: 1 })
    expect(areaSignedDistance(box, { x: 2, y: 1 })).toBeCloseTo(2)
    expect(areaSignedDistance(box, { x: 5, y: 1 })).toBeCloseTo(0)
    expect(areaSignedDistance(box, { x: 6, y: 1 })).toBeLessThan(0)
  })
})

describe('alças do editor 2D', () => {
  const box = area({ shape: 'custom', width: 8, height: 4, offsetX: 0, offsetY: 0 })

  it('formatos travados só oferecem os cantos', () => {
    expect(getAreaHandles(area())).toHaveLength(4)
    expect(getAreaHandles(box)).toHaveLength(8)
  })

  it('puxar a borda direita mantém a esquerda no lugar', () => {
    const resized = resizeAreaFromHandle(box, 'e', { x: 6, y: 0 })
    expect(resized.offsetX - resized.width / 2).toBeCloseTo(-4)
    expect(resized.width).toBeCloseTo(10)
    expect(resized.height).toBe(4)
  })

  it('puxar um canto no formato travado mantém a proporção e o canto oposto', () => {
    const square = area({ shape: 'square', width: 4, height: 4 })
    const resized = resizeAreaFromHandle(square, 'ne', { x: 5, y: 3 })
    expect(resized.width).toBeCloseTo(resized.height)
    expect(resized.offsetX - resized.width / 2).toBeCloseTo(-2)
    expect(resized.offsetY - resized.height / 2).toBeCloseTo(-2)
  })

  it('não atravessa a âncora nem passa do limite físico', () => {
    const collapsed = resizeAreaFromHandle(box, 'e', { x: -50, y: 0 })
    expect(collapsed.width).toBe(MIN)
    expect(collapsed.offsetX - collapsed.width / 2).toBeCloseTo(-4)
    const huge = resizeAreaFromHandle(box, 'nw', { x: -99, y: 99 })
    expectInsidePrintable(huge)
    expect(huge.offsetX + huge.width / 2).toBeCloseTo(4)
    expect(huge.offsetY - huge.height / 2).toBeCloseTo(-2)
  })

  it('as alças ficam nas bordas e nos cantos da área', () => {
    expect(getHandlePosition(box, 'ne')).toEqual({ x: 4, y: 2 })
    expect(getHandlePosition(box, 'w')).toEqual({ x: -4, y: 0 })
  })
})
