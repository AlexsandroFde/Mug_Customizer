/**
 * Preparação da textura da estampa e do material que a aplica na parede externa.
 *
 * A estampa não é um adesivo nem uma malha à parte: o shader do MeshPhysicalMaterial calcula,
 * para cada fragmento da parede externa, a posição dele na área de impressão "desenrolada"
 * (comprimento de arco e altura, em cm) e amostra a imagem a partir daí. Assim a estampa segue
 * a curvatura da caneca, recebe a mesma iluminação e o mesmo verniz do esmalte, e mover,
 * girar ou redimensionar a imagem atualiza apenas uniforms, sem recriar geometria nem textura.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MUG, PRINTABLE } from '../../config/mugSpec'
import type { PrintImage } from '../../hooks/useMugCustomization'
import { releaseCanvas } from '../../lib/imageProcessing'

export interface PrintUniforms {
  uPrintMap: THREE.IUniform<THREE.Texture>
  uPrintEnabled: THREE.IUniform<number>
  /** Referencial da região imprimível: ângulo do centro, raio da parede e altura do centro. */
  uPrintCenterAngle: THREE.IUniform<number>
  uPrintRadius: THREE.IUniform<number>
  uPrintCenterY: THREE.IUniform<number>
  /** Meia-largura e meia-altura da região imprimível (limite físico). */
  uPrintableHalf: THREE.IUniform<THREE.Vector2>
  /** Área de impressão escolhida pelo usuário. */
  uAreaCenter: THREE.IUniform<THREE.Vector2>
  uAreaHalf: THREE.IUniform<THREE.Vector2>
  /** Bordas da área encostadas no limite físico (1 = sim): esquerda, direita, base, topo. */
  uAreaLimits: THREE.IUniform<THREE.Vector4>
  uImageCenter: THREE.IUniform<THREE.Vector2>
  uImageHalfSize: THREE.IUniform<THREE.Vector2>
  /** Cosseno e seno da rotação (anti-horária) da imagem no plano da área de impressão. */
  uImageRotation: THREE.IUniform<THREE.Vector2>
  /** Intensidade das guias de edição (0 = ocultas). */
  uGuides: THREE.IUniform<number>
  uAreaGuideColor: THREE.IUniform<THREE.Color>
  uLimitGuideColor: THREE.IUniform<THREE.Color>
  uImageGuideColor: THREE.IUniform<THREE.Color>
}

/** Cores das guias, as mesmas do editor 2D (styles.css). */
export const GUIDE_COLORS = { area: '#3f51d8', limit: '#d97706', image: '#c2255c' } as const

/** Textura transparente de 1×1 usada enquanto não há imagem (evita recompilar o shader). */
function createEmptyTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  texture.needsUpdate = true
  return texture
}

/**
 * Cria a textura da estampa a partir do canvas já redimensionado.
 * - Alfa pré-multiplicado: a filtragem não cria franjas escuras nas bordas transparentes.
 * - Sem conversão de espaço de cor na GPU: o shader decodifica o sRGB depois de desfazer
 *   a pré-multiplicação, o que mantém corretas as cores semitransparentes.
 * - Mipmaps e filtragem anisotrópica mantêm a nitidez quando a superfície é vista de lado.
 */
export function createPrintTexture(source: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(source)
  texture.colorSpace = THREE.NoColorSpace
  texture.premultiplyAlpha = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = anisotropy
  return texture
}

/**
 * Mantém a textura sincronizada com a imagem atual e libera os recursos da anterior:
 * a textura sai da GPU e o canvas de origem é zerado quando a imagem é substituída ou removida.
 */
export function usePrintTexture(image: PrintImage | null, anisotropy: number) {
  const latestImage = useRef(image)
  useLayoutEffect(() => {
    latestImage.current = image
  })

  const texture = useMemo(() => (image ? createPrintTexture(image.source, anisotropy) : null), [image, anisotropy])

  useEffect(() => {
    if (!texture || !image) return
    return () => {
      texture.dispose()
      // Só libera o canvas se a imagem saiu de cena (e não numa simples remontagem do componente).
      if (latestImage.current !== image) releaseCanvas(image.source)
    }
  }, [texture, image])

  return texture
}

const VERTEX_PARS = /* glsl */ `
#include <common>
varying vec3 vPrintPosition;
`

const VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
vPrintPosition = transformed;
`

const FRAGMENT_PARS = /* glsl */ `
#include <common>
varying vec3 vPrintPosition;
uniform sampler2D uPrintMap;
uniform float uPrintEnabled;
uniform float uPrintCenterAngle;
uniform float uPrintRadius;
uniform float uPrintCenterY;
uniform vec2 uPrintableHalf;
uniform vec2 uAreaCenter;
uniform vec2 uAreaHalf;
uniform vec4 uAreaLimits;
uniform vec2 uImageCenter;
uniform vec2 uImageHalfSize;
uniform vec2 uImageRotation;
uniform float uGuides;
uniform vec3 uAreaGuideColor;
uniform vec3 uLimitGuideColor;
uniform vec3 uImageGuideColor;

// Distância com sinal (cm, positiva dentro) até a borda da área de impressão, a partir do centro dela.
// Para outra máscara (elipse, cantos arredondados), troque esta função e areaSignedDistance (printArea.ts).
float printAreaDistance(vec2 local) {
  vec2 gap = uAreaHalf - abs(local);
  return min(gap.x, gap.y);
}

// Cobertura antisserrilhada a partir de uma distância com sinal (positiva = dentro).
// "pixel" é o tamanho de um pixel na superfície, em cm.
float printCoverage(float signedDistance, float pixel) {
  return clamp(signedDistance / pixel + 0.5, 0.0, 1.0);
}

// Linha de ~1,5 px centrada onde a distância com sinal é zero.
float printLine(float signedDistance, float pixel) {
  return 1.0 - smoothstep(0.75 * pixel, 1.75 * pixel, abs(signedDistance));
}

vec3 printSrgbToLinear(vec3 color) {
  return mix(color * 0.0773993808, pow(color * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, color));
}
`

const FRAGMENT_MAIN = /* glsl */ `
#include <color_fragment>
{
  // Posição na área de impressão desenrolada, em cm: x ao longo da circunferência, y na vertical.
  float printAngle = atan(vPrintPosition.x, vPrintPosition.z) - uPrintCenterAngle;
  printAngle -= 6.283185307 * floor((printAngle + 3.141592654) / 6.283185307);
  vec2 printPoint = vec2(printAngle * uPrintRadius, vPrintPosition.y - uPrintCenterY);

  // Tamanho do pixel na superfície, tirado da posição 3D (contínua). Derivar a coordenada
  // desenrolada daria um salto na costura atrás da alça, onde o ângulo volta de +π para -π.
  float printPixel = max(max(length(dFdx(vPrintPosition)), length(dFdy(vPrintPosition))), 1e-5);

  // Limite físico (região imprimível) e área escolhida pelo usuário, que fica dentro dele.
  vec2 printableGap = uPrintableHalf - abs(printPoint);
  float printableDistance = min(printableGap.x, printableGap.y);
  vec2 areaLocal = printPoint - uAreaCenter;
  float areaDistance = printAreaDistance(areaLocal);
  float areaMask = printCoverage(min(areaDistance, printableDistance), printPixel);

  // Referencial da imagem: translada e desfaz a rotação.
  vec2 imagePoint = printPoint - uImageCenter;
  imagePoint = vec2(
    imagePoint.x * uImageRotation.x + imagePoint.y * uImageRotation.y,
    -imagePoint.x * uImageRotation.y + imagePoint.y * uImageRotation.x
  );
  vec2 imageGap = uImageHalfSize - abs(imagePoint);
  float imageDistance = min(imageGap.x, imageGap.y);
  vec2 imageUv = imagePoint / (2.0 * uImageHalfSize) + 0.5;

  // RGB pré-multiplicado e codificado em sRGB.
  vec4 ink = texture2D(uPrintMap, imageUv);
  float coverage = ink.a * areaMask * printCoverage(imageDistance, printPixel) * uPrintEnabled;
  vec3 inkColor = printSrgbToLinear(clamp(ink.rgb / max(ink.a, 1e-4), 0.0, 1.0));

  // Na sublimação a tinta tinge o esmalte: o branco da imagem é o próprio branco da cerâmica.
  diffuseColor.rgb *= mix(vec3(1.0), inkColor, coverage);

  // Guias de edição (nunca fazem parte da impressão): limite físico hachurado, área de impressão
  // tracejada (em âmbar e contínua onde encosta no limite) e contorno da imagem.
  if (uGuides > 0.001) {
    float outsidePrintable = 1.0 - printCoverage(printableDistance, printPixel);
    float hatch = step(0.5, fract((printPoint.x + printPoint.y) / 0.55));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.86 - 0.08 * hatch), outsidePrintable * uGuides);

    // Dentro do limite físico, mas fora da área escolhida: só um leve esmaecimento.
    float outsideArea = (1.0 - printCoverage(areaDistance, printPixel)) * (1.0 - outsidePrintable);
    diffuseColor.rgb *= 1.0 - 0.07 * outsideArea * uGuides;

    vec2 areaGap = uAreaHalf - abs(areaLocal);
    bool verticalEdge = areaGap.x < areaGap.y;
    float atLimit = verticalEdge
      ? (areaLocal.x < 0.0 ? uAreaLimits.x : uAreaLimits.y)
      : (areaLocal.y < 0.0 ? uAreaLimits.z : uAreaLimits.w);
    float dash = max(step(0.42, fract((verticalEdge ? printPoint.y : printPoint.x) / 0.45)), atLimit);
    vec3 edgeColor = mix(uAreaGuideColor, uLimitGuideColor, atLimit);
    diffuseColor.rgb = mix(diffuseColor.rgb, edgeColor, printLine(areaDistance, printPixel) * dash * uGuides);

    // O contorno da imagem também aparece fora da área, para mostrar o que será cortado.
    float outline = printLine(imageDistance, printPixel) * uPrintEnabled * (1.0 - outsidePrintable);
    diffuseColor.rgb = mix(diffuseColor.rgb, uImageGuideColor, outline * 0.8 * uGuides);
  }
}
`

/** Material da parede externa: esmalte cerâmico com a estampa aplicada no shader. */
export function createPrintMaterial(parameters: THREE.MeshPhysicalMaterialParameters) {
  const material = new THREE.MeshPhysicalMaterial(parameters)
  const emptyTexture = createEmptyTexture()
  const uniforms: PrintUniforms = {
    uPrintMap: { value: emptyTexture },
    uPrintEnabled: { value: 0 },
    uPrintCenterAngle: { value: PRINTABLE.centerAngle },
    uPrintRadius: { value: MUG.outerRadius },
    uPrintCenterY: { value: PRINTABLE.centerY },
    uPrintableHalf: { value: new THREE.Vector2(PRINTABLE.width / 2, PRINTABLE.height / 2) },
    uAreaCenter: { value: new THREE.Vector2() },
    uAreaHalf: { value: new THREE.Vector2(PRINTABLE.width / 2, PRINTABLE.height / 2) },
    uAreaLimits: { value: new THREE.Vector4() },
    uImageCenter: { value: new THREE.Vector2() },
    uImageHalfSize: { value: new THREE.Vector2(1, 1) },
    uImageRotation: { value: new THREE.Vector2(1, 0) },
    uGuides: { value: 0 },
    uAreaGuideColor: { value: new THREE.Color(GUIDE_COLORS.area) },
    uLimitGuideColor: { value: new THREE.Color(GUIDE_COLORS.limit) },
    uImageGuideColor: { value: new THREE.Color(GUIDE_COLORS.image) },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_PARS)
      .replace('#include <begin_vertex>', VERTEX_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_PARS)
      .replace('#include <color_fragment>', FRAGMENT_MAIN)
  }
  material.customProgramCacheKey = () => 'mug-print'

  return {
    material,
    uniforms,
    /** Troca a imagem da estampa (null remove). */
    setTexture(texture: THREE.Texture | null) {
      uniforms.uPrintMap.value = texture ?? emptyTexture
      uniforms.uPrintEnabled.value = texture ? 1 : 0
    },
    /** Intensidade das guias de edição desenhadas sobre a parede (0 a 1). */
    setGuides(intensity: number) {
      uniforms.uGuides.value = intensity
    },
    dispose() {
      material.dispose()
      emptyTexture.dispose()
    },
  }
}

export type PrintMaterial = ReturnType<typeof createPrintMaterial>
