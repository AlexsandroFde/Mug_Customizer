import { describe, expect, it } from 'vitest'
import { COLOR_PALETTE } from '../config/mugColors'
import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isCompleteHexColor,
  parseHexColor,
  prefersDarkForeground,
  relativeLuminance,
  rgbToHex,
} from './color'

describe('códigos hexadecimais', () => {
  it('normaliza 3 ou 6 dígitos, com ou sem #, para "#rrggbb" minúsculo', () => {
    expect(parseHexColor('#FF0000')).toBe('#ff0000')
    expect(parseHexColor('ff0000')).toBe('#ff0000')
    expect(parseHexColor('#F00')).toBe('#ff0000')
    expect(parseHexColor(' 0a7 ')).toBe('#00aa77')
  })

  it('recusa códigos inválidos', () => {
    for (const input of ['', '#', '#ff00', 'ff00000', 'red', '#gg0000', 'rgb(0,0,0)']) {
      expect(parseHexColor(input)).toBeNull()
    }
  })

  it('distingue a forma completa da curta enquanto o usuário digita', () => {
    expect(isCompleteHexColor('F00')).toBe(false)
    expect(isCompleteHexColor('#F00000')).toBe(true)
  })
})

describe('conversões', () => {
  it('converte entre hexadecimal e RGB', () => {
    expect(hexToRgb('#0057b8')).toEqual({ r: 0, g: 87, b: 184 })
    expect(rgbToHex({ r: 0, g: 87, b: 184 })).toBe('#0057b8')
    expect(rgbToHex({ r: 300, g: -4, b: 127.6 })).toBe('#ff0080')
  })

  it('calcula matiz, saturação e valor de cores conhecidas', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00').h).toBeCloseTo(120)
    expect(hexToHsv('#0000ff').h).toBeCloseTo(240)
    expect(hexToHsv('#808080')).toMatchObject({ h: 0, s: 0 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('ida e volta entre hexadecimal e HSV preserva a cor', () => {
    const samples = [...COLOR_PALETTE.map((swatch) => swatch.hex), '#123456', '#fedcba', '#00ffff', '#ff00ff', '#7f7f80']
    for (const hex of samples) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })
})

describe('contraste', () => {
  it('mede a luminância relativa', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1)
    expect(relativeLuminance('#000000')).toBeCloseTo(0)
  })

  it('escolhe um ícone escuro sobre cores claras e claro sobre cores escuras', () => {
    expect(prefersDarkForeground('#f7f6f2')).toBe(true)
    expect(prefersDarkForeground('#f5c400')).toBe(true)
    expect(prefersDarkForeground('#1d2b4f')).toBe(false)
    expect(prefersDarkForeground('#c8102e')).toBe(false)
  })
})
