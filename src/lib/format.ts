/** Formatação de números no padrão brasileiro. */

const integerFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const formatInteger = (value: number) => integerFormat.format(value)

/** Uma casa decimal, sem "-0,0" para valores muito próximos de zero. */
export const formatDecimal = (value: number) => decimalFormat.format(Math.abs(value) < 0.05 ? 0 : value)

export const formatCm = (value: number) => `${formatDecimal(value)} cm`

/** Deslocamento com sinal explícito, como "+1,5 cm". */
export const formatSignedCm = (value: number) => {
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${formatDecimal(rounded)} cm`
}

export const formatPercent = (ratio: number) => `${integerFormat.format(Math.round(ratio * 100))}%`

export const formatDegrees = (value: number) => `${integerFormat.format(Math.round(value))}°`

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${integerFormat.format(Math.max(1, Math.round(bytes / 1024)))} KB`
  const megabytes = bytes / (1024 * 1024)
  return `${Number.isInteger(megabytes) ? integerFormat.format(megabytes) : decimalFormat.format(megabytes)} MB`
}
