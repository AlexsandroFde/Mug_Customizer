/**
 * Cores da caneca: uma cor-base, aplicada à cerâmica inteira, e cores próprias opcionais para a
 * alça, a borda e o interior. As cores são guardadas como hexadecimal sRGB minúsculo ("#rrggbb").
 */
import { GLAZE_COLOR } from './mugSpec'

/** Partes que podem acompanhar a cor-base ou receber cor própria. */
export type MugColorRegion = 'handle' | 'rim' | 'interior'

/** Todas as partes coloríveis: o corpo (que define a cor-base) e as regiões. */
export type MugPart = 'body' | MugColorRegion

export interface MugColorSettings {
  /** Cor-base: corpo externo e base, e todas as partes que estiverem vinculadas a ela. */
  body: string
  /** Cor própria de cada parte; null significa que a parte acompanha a cor-base. */
  overrides: Record<MugColorRegion, string | null>
}

/** Cor efetiva de cada parte, já resolvido o vínculo com a cor-base. */
export type ResolvedMugColors = Record<MugPart, string>

export const MUG_COLOR_REGIONS: readonly MugColorRegion[] = ['handle', 'rim', 'interior']

/** Por padrão a caneca é toda branca, com as três partes vinculadas à cor-base. */
export const DEFAULT_MUG_COLORS: Readonly<MugColorSettings> = {
  body: GLAZE_COLOR,
  overrides: { handle: null, rim: null, interior: null },
}

export const MUG_PARTS: ReadonlyArray<{
  part: MugPart
  label: string
  /** Nome com a preposição e o artigo corretos, para frases como "cor da alça". */
  ofLabel: string
}> = [
  { part: 'body', label: 'Caneca', ofLabel: 'da caneca' },
  { part: 'handle', label: 'Alça', ofLabel: 'da alça' },
  { part: 'rim', label: 'Borda', ofLabel: 'da borda' },
  { part: 'interior', label: 'Interior', ofLabel: 'do interior' },
]

export const getPartInfo = (part: MugPart) => MUG_PARTS.find((item) => item.part === part)!

export function resolveMugColors(settings: MugColorSettings): ResolvedMugColors {
  return {
    body: settings.body,
    handle: settings.overrides.handle ?? settings.body,
    rim: settings.overrides.rim ?? settings.body,
    interior: settings.overrides.interior ?? settings.body,
  }
}

/** Cores de esmalte comuns em canecas. */
export const COLOR_PALETTE: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Branco', hex: GLAZE_COLOR },
  { name: 'Preto', hex: '#202124' },
  { name: 'Cinza', hex: '#8a8f98' },
  { name: 'Vermelho', hex: '#c8102e' },
  { name: 'Vinho', hex: '#7a1f3d' },
  { name: 'Rosa', hex: '#f08bb4' },
  { name: 'Laranja', hex: '#f07c1b' },
  { name: 'Amarelo', hex: '#f5c400' },
  { name: 'Verde-claro', hex: '#78be20' },
  { name: 'Verde', hex: '#00843d' },
  { name: 'Azul-claro', hex: '#5bc2e7' },
  { name: 'Azul', hex: '#0057b8' },
  { name: 'Azul-marinho', hex: '#1d2b4f' },
  { name: 'Roxo', hex: '#6d3fa0' },
]

export const getPaletteName = (hex: string) => COLOR_PALETTE.find((swatch) => swatch.hex === hex)?.name ?? null
