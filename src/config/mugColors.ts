/**
 * Regiões da caneca que podem receber cor própria e as cores sugeridas.
 * As cores são guardadas como hexadecimal sRGB minúsculo ("#rrggbb").
 */
import { GLAZE_COLOR } from './mugSpec'

export type MugColorRegion = 'handle' | 'rim' | 'interior'

export type MugColors = Record<MugColorRegion, string>

export const MUG_COLOR_REGIONS: ReadonlyArray<{
  region: MugColorRegion
  label: string
  /** Nome com a preposição e o artigo corretos, para frases como "cor da alça". */
  ofLabel: string
  description: string
}> = [
  { region: 'handle', label: 'Alça', ofLabel: 'da alça', description: 'Toda a alça, por dentro e por fora.' },
  { region: 'rim', label: 'Borda', ofLabel: 'da borda', description: 'O acabamento arredondado do topo, entre a parede externa e a interna.' },
  { region: 'interior', label: 'Interior', ofLabel: 'do interior', description: 'Paredes internas e fundo. A vista Topo mostra o interior inteiro.' },
]

/** Todas as regiões começam com o esmalte branco original. */
export const DEFAULT_MUG_COLORS: Readonly<MugColors> = {
  handle: GLAZE_COLOR,
  rim: GLAZE_COLOR,
  interior: GLAZE_COLOR,
}

/** Cores de esmalte comuns em canecas de duas cores. */
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
