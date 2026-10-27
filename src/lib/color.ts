/** Conversões e validação de cores em hexadecimal sRGB. */

export interface Rgb {
  /** Canais de 0 a 255. */
  r: number
  g: number
  b: number
}

export interface Hsv {
  /** Matiz em graus, de 0 a 360. */
  h: number
  /** Saturação e valor, de 0 a 1. */
  s: number
  v: number
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Normaliza um código hexadecimal para "#rrggbb" minúsculo.
 * Aceita 3 ou 6 dígitos, com ou sem "#"; devolve null se o código for inválido.
 */
export function parseHexColor(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim())
  if (!match) return null
  const digits = match[1].toLowerCase()
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`
}

/** Aceita apenas a forma completa de 6 dígitos (usada enquanto o usuário ainda digita). */
export const isCompleteHexColor = (input: string) => /^#?[0-9a-f]{6}$/i.test(input.trim())

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const delta = max - Math.min(red, green, blue)
  let h = 0
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6
    else if (max === green) h = (blue - red) / delta + 2
    else h = (red - green) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = (((h % 360) + 360) % 360) / 60
  const chroma = v * s
  const x = chroma * (1 - Math.abs((hue % 2) - 1))
  const [red, green, blue] =
    hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x]
  const m = v - chroma
  return { r: (red + m) * 255, g: (green + m) * 255, b: (blue + m) * 255 }
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex))
export const hsvToHex = (hsv: Hsv) => rgbToHex(hsvToRgb(hsv))

const srgbToLinear = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/**
 * Indica se texto ou ícones sobre a cor devem ser escuros para manter o contraste.
 * Acima de ~0,18 de luminância, o preto contrasta mais que o branco.
 */
export const prefersDarkForeground = (hex: string) => relativeLuminance(hex) > 0.18
