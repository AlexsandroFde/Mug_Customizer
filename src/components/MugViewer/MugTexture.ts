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
import { MUG, PRINT_CENTER_ANGLE, PRINT_CENTER_Y, PRINT_HEIGHT, PRINT_WIDTH } from '../../config/mugSpec'
import type { PrintImage } from '../../hooks/useMugCustomization'
import { releaseCanvas } from '../../lib/imageProcessing'

export interface PrintUniforms {
  uPrintMap: THREE.IUniform<THREE.Texture>
  uPrintEnabled: THREE.IUniform<number>
  uPrintCenterAngle: THREE.IUniform<number>
  uPrintRadius: THREE.IUniform<number>
  uPrintCenterY: THREE.IUniform<number>
  uPrintAreaHalf: THREE.IUniform<THREE.Vector2>
  uImageCenter: THREE.IUniform<THREE.Vector2>
  uImageHalfSize: THREE.IUniform<THREE.Vector2>
  /** Cosseno e seno da rotação (anti-horária) da imagem no plano da área de impressão. */
  uImageRotation: THREE.IUniform<THREE.Vector2>
  /** Intensidade das guias de edição (0 = ocultas). */
  uGuides: THREE.IUniform<number>
  uGuideColor: THREE.IUniform<THREE.Color>
}

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
uniform vec2 uPrintAreaHalf;
uniform vec2 uImageCenter;
uniform vec2 uImageHalfSize;
uniform vec2 uImageRotation;
uniform float uGuides;
uniform vec3 uGuideColor;

// Cobertura antisserrilhada a partir de uma distância com sinal (positiva = dentro).
float printCoverage(float signedDistance) {
  return clamp(signedDistance / max(fwidth(signedDistance), 1e-5) + 0.5, 0.0, 1.0);
}

// Linha de ~1,5 px centrada onde a distância com sinal é zero.
float printLine(float signedDistance) {
  float pixel = max(fwidth(signedDistance), 1e-5);
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

  // Distância com sinal até a borda da área imprimível.
  vec2 areaGap = uPrintAreaHalf - abs(printPoint);
  float areaDistance = min(areaGap.x, areaGap.y);
  float areaMask = printCoverage(areaDistance);

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
  float coverage = ink.a * areaMask * printCoverage(imageDistance) * uPrintEnabled;
  vec3 inkColor = printSrgbToLinear(clamp(ink.rgb / max(ink.a, 1e-4), 0.0, 1.0));

  // Na sublimação a tinta tinge o esmalte: o branco da imagem é o próprio branco da cerâmica.
  diffuseColor.rgb *= mix(vec3(1.0), inkColor, coverage);

  // Guias de edição: área não imprimível hachurada, contorno tracejado da área e contorno da imagem.
  if (uGuides > 0.001) {
    float outside = 1.0 - areaMask;
    float hatch = step(0.5, fract((printPoint.x + printPoint.y) / 0.55));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.86 - 0.08 * hatch), outside * uGuides);

    float alongEdge = areaGap.x < areaGap.y ? printPoint.y : printPoint.x;
    float dash = step(0.42, fract(alongEdge / 0.45));
    diffuseColor.rgb = mix(diffuseColor.rgb, uGuideColor, printLine(areaDistance) * dash * uGuides);

    float outline = printLine(imageDistance) * areaMask * uPrintEnabled;
    diffuseColor.rgb = mix(diffuseColor.rgb, uGuideColor, outline * 0.85 * uGuides);
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
    uPrintCenterAngle: { value: PRINT_CENTER_ANGLE },
    uPrintRadius: { value: MUG.outerRadius },
    uPrintCenterY: { value: PRINT_CENTER_Y },
    uPrintAreaHalf: { value: new THREE.Vector2(PRINT_WIDTH / 2, PRINT_HEIGHT / 2) },
    uImageCenter: { value: new THREE.Vector2() },
    uImageHalfSize: { value: new THREE.Vector2(1, 1) },
    uImageRotation: { value: new THREE.Vector2(1, 0) },
    uGuides: { value: 0 },
    uGuideColor: { value: new THREE.Color('#3f51d8') },
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
