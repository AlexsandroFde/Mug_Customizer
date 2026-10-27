/**
 * Especificação física da caneca e da área de impressão.
 *
 * Todas as medidas estão em centímetros e 1 unidade da cena 3D equivale a 1 cm.
 * Os valores seguem uma caneca cerâmica padrão de 325 ml (11 oz) para sublimação.
 */

export const MUG = {
  /** Altura total, da mesa até o topo da borda. */
  height: 9.6,
  /** Raio externo do corpo (diâmetro de 8,2 cm). */
  outerRadius: 4.1,
  /** Espessura da parede de cerâmica. */
  wallThickness: 0.42,
  /** Altura do fundo interno em relação à mesa. */
  floorHeight: 0.75,
  /** Raio do arredondamento externo entre a base e a parede. */
  heelRadius: 0.55,
  /** Raio da concordância entre a parede interna e o fundo. */
  innerFilletRadius: 0.8,
  /** Profundidade do rebaixo sob a base (a caneca se apoia em um anel). */
  baseRecess: 0.14,
  /** Raio onde o rebaixo começa a descer em direção ao anel de apoio. */
  footInnerRadius: 3.0,
  /** Raio onde o anel de apoio passa a tocar a mesa. */
  footContactRadius: 3.3,
} as const

export const HANDLE = {
  /** Direção da alça em torno do eixo vertical (0 = +Z, π/2 = +X), no padrão atan2(x, z). */
  angle: Math.PI / 2,
  /** Meia-espessura da seção transversal no plano da alça. */
  halfThickness: 0.46,
  /** Meia-largura da seção transversal, perpendicular ao plano da alça. */
  halfWidth: 0.68,
  /** Expoente da superelipse da seção (2 = elipse; valores maiores deixam a seção mais "quadrada"). */
  sectionExponent: 2.6,
  /**
   * Alargamento da seção junto ao corpo, imitando o filete de cerâmica da junção:
   * cresce sobretudo no plano da alça e se dissolve ao longo de `length` cm a partir da parede.
   */
  junction: { thickness: 0.5, width: 0.12, length: 1.7 },
  /**
   * Eixo central da alça no plano da alça: [distância ao eixo da caneca, altura].
   * As extremidades ficam embutidas na parede (entre os raios interno e externo).
   */
  path: [
    [3.86, 8.2],
    [4.6, 8.3],
    [5.75, 8.18],
    [6.7, 7.55],
    [7.18, 6.45],
    [7.22, 5.15],
    [6.9, 3.95],
    [6.18, 2.98],
    [5.2, 2.4],
    [4.4, 2.2],
    [3.86, 2.16],
  ] as ReadonlyArray<readonly [number, number]>,
} as const

export const PRINT_AREA = {
  /** Abertura angular imprimível; o restante da volta fica reservado à região da alça. */
  arcDegrees: 290,
  /** Limite inferior da impressão, medido a partir da mesa. */
  bottom: 0.9,
  /** Limite superior da impressão (0,7 cm abaixo do topo da borda). */
  top: 8.9,
} as const

/** Largura da área imprimível ao longo da circunferência (≈ 20,8 cm). */
export const PRINT_WIDTH = (MUG.outerRadius * PRINT_AREA.arcDegrees * Math.PI) / 180
/** Altura da área imprimível. */
export const PRINT_HEIGHT = PRINT_AREA.top - PRINT_AREA.bottom
/** Altura do centro da área imprimível. */
export const PRINT_CENTER_Y = (PRINT_AREA.top + PRINT_AREA.bottom) / 2
/** O centro da área imprimível fica no lado oposto à alça. */
export const PRINT_CENTER_ANGLE = HANDLE.angle + Math.PI
/** Circunferência externa do corpo. */
export const CIRCUMFERENCE = 2 * Math.PI * MUG.outerRadius

/** Limites aplicados aos arquivos enviados pelo usuário. */
export const IMAGE_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  /** Protege contra imagens que ocupariam memória demais ao serem decodificadas. */
  maxPixels: 64_000_000,
  minSide: 64,
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  acceptedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
} as const

/** Maior lado da textura enviada à GPU (dispositivos de toque costumam ter menos memória). */
export const TEXTURE_MAX_SIDE = { default: 4096, touch: 2048 } as const

/** Limites da escala da estampa, relativos ao tamanho de encaixe. */
export const SCALE_RANGE = { min: 0.1, max: 4 } as const

/** Resolução efetiva de impressão (pontos por polegada) usada nos avisos de qualidade. */
export const PRINT_QUALITY_DPI = { excellent: 200, good: 150, acceptable: 100 } as const
