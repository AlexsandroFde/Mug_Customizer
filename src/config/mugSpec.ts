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

/** Cor original do esmalte cerâmico (sRGB). */
export const GLAZE_COLOR = '#f7f6f2'

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

/**
 * Limites físicos de impressão.
 *
 * São valores de referência para esta caneca de 325 ml em sublimação, coerentes com o modelo 3D;
 * ajuste-os conforme o fornecedor, o tamanho da caneca e o método de fabricação. Toda a interface,
 * o shader e as validações derivam deles.
 */
export const PRINT_LIMITS = {
  /** Margem de segurança abaixo do topo da borda. */
  marginTop: 0.7,
  /** Margem de segurança acima da mesa (cobre o arredondamento da base). */
  marginBottom: 0.9,
  /** Faixa livre de cada lado do centro da alça, medida ao longo da circunferência. */
  handleClearance: 2.5,
  /** Menor largura e menor altura aceitas para a área de impressão. */
  minAreaSize: 2,
} as const

/** Circunferência externa do corpo. */
export const CIRCUMFERENCE = 2 * Math.PI * MUG.outerRadius

/**
 * Região imprimível: o maior retângulo, na parede externa "desenrolada", que respeita os limites
 * físicos. A área de impressão escolhida pelo usuário sempre fica dentro dela.
 */
export const PRINTABLE = (() => {
  const top = MUG.height - PRINT_LIMITS.marginTop
  const bottom = PRINT_LIMITS.marginBottom
  return {
    /** Largura ao longo da circunferência (≈ 20,8 cm). */
    width: CIRCUMFERENCE - 2 * PRINT_LIMITS.handleClearance,
    height: top - bottom,
    /** Alturas, medidas a partir da mesa. */
    top,
    bottom,
    centerY: (top + bottom) / 2,
    /** O centro fica no lado oposto à alça (ângulo no padrão atan2(x, z)). */
    centerAngle: HANDLE.angle + Math.PI,
  }
})()

/** Resolução de referência do modo "Tamanho original": 1 pixel da imagem = 1/300 de polegada. */
export const PRINT_REFERENCE_DPI = 300

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

/**
 * Limites da arte exportada. O lado máximo é o que os navegadores aceitam num canvas; a área
 * máxima evita esgotar a memória (no Safari do iPhone, canvas acima de ~16,7 MP falham).
 */
export const EXPORT_LIMITS = {
  maxSide: 16384,
  maxPixels: { default: 40_000_000, touch: 16_000_000 },
  minSide: 16,
  dpi: { min: 72, max: 1200, default: 300 },
  /** Largura física aceita no modo de impressão, em cm. */
  printWidth: { min: 1, max: 200 },
} as const

/** Limites da escala da estampa, relativos ao tamanho de encaixe. */
export const SCALE_RANGE = { min: 0.1, max: 4 } as const

/** Resolução efetiva de impressão (pontos por polegada) usada nos avisos de qualidade. */
export const PRINT_QUALITY_DPI = { excellent: 200, good: 150, acceptable: 100 } as const
