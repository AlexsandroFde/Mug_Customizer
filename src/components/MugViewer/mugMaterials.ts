/**
 * Materiais cerâmicos da caneca (a estampa fica em MugTexture.ts).
 *
 * O corpo (base e calcanhar, além da parede externa com a estampa) usa a cor-base; alça, borda e
 * interior têm materiais próprios, que recebem a cor já resolvida de cada parte. Trocar uma cor
 * altera só o material daquela parte, sem recriar geometria nem recompilar shaders.
 */
import * as THREE from 'three'
import { MUG_COLOR_REGIONS, type MugColorRegion, type ResolvedMugColors } from '../../config/mugColors'
import { GLAZE_COLOR, MUG } from '../../config/mugSpec'
import type { CavityRegion } from './mugGeometry'

/** Esmalte cerâmico: base levemente acetinada sob uma camada vítrea brilhante. */
export const GLAZE: THREE.MeshPhysicalMaterialParameters = {
  color: GLAZE_COLOR,
  roughness: 0.34,
  metalness: 0,
  ior: 1.5,
  specularIntensity: 0.55,
  clearcoat: 1,
  clearcoatRoughness: 0.055,
}

/** Cerâmica sem esmalte do anel de apoio (fosca e levemente bege). */
const BISQUE: THREE.MeshStandardMaterialParameters = { color: '#d8d0c2', roughness: 0.92, metalness: 0 }

const CAVITY_VERTEX_PARS = /* glsl */ `
#include <common>
varying vec3 vCavityPosition;
`

const CAVITY_VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
vCavityPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const CAVITY_FRAGMENT_PARS = /* glsl */ `
#include <common>
varying vec3 vCavityPosition;
uniform float uInnerRadius;
uniform float uOpeningY;
`

/**
 * Oclusão especular da cavidade. O mapa de ambiente não sabe que a caneca é côncava: sem isto,
 * a parede interna refletiria softboxes que, na realidade, a própria parede esconderia.
 * O raio refletido é testado analiticamente contra o cilindro interno (a caneca fica na origem,
 * sem rotação): só reflete o ambiente o que sai pela abertura. Na borda (acima da abertura)
 * o fator vale 1, o que mantém o brilho contínuo na junção entre borda e interior.
 */
const CAVITY_FRAGMENT_MAIN = /* glsl */ `
#include <aomap_fragment>
{
  vec3 cavityNormal = inverseTransformDirection(normal, viewMatrix);
  vec3 cavityView = normalize(cameraPosition - vCavityPosition);
  vec3 cavityReflection = reflect(-cavityView, cavityNormal);
  float reflectionVisibility = 1.0;
  if (vCavityPosition.y < uOpeningY) {
    float tTop = (uOpeningY - vCavityPosition.y) / max(cavityReflection.y, 1e-4);
    float a = dot(cavityReflection.xz, cavityReflection.xz);
    float b = 2.0 * dot(vCavityPosition.xz, cavityReflection.xz);
    float c = dot(vCavityPosition.xz, vCavityPosition.xz) - uInnerRadius * uInnerRadius;
    float tWall = a > 1e-6 ? (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a) : 1e6;
    reflectionVisibility = cavityReflection.y > 0.0 ? smoothstep(0.8, 1.25, tWall / tTop) : 0.0;
  }
  // O que fica oculto reflete a própria cerâmica: um resíduo evita um interior "morto".
  reflectionVisibility = mix(0.12, 1.0, reflectionVisibility);
  reflectedLight.indirectSpecular *= reflectionVisibility;
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= reflectionVisibility;
  #endif
}
`

/**
 * Aproximação de múltiplos rebatimentos (Jimenez et al., 2016): superfícies claras devolvem parte
 * da luz, então o fundo de uma caneca branca escurece bem menos do que a oclusão pura sugere;
 * um interior escuro quase não rebate luz e escurece mais.
 */
export function multiBounceAo(visibility: number, albedo: number) {
  const a = 2.0404 * albedo - 0.3324
  const b = -4.7951 * albedo + 0.6417
  const c = 2.7552 * albedo + 0.6903
  return Math.max(visibility, ((visibility * a + b) * visibility + c) * visibility)
}

/** Refletância difusa aproximada de um esmalte: o verniz devolve parte da luz antes da cor. */
export const glazeAlbedo = (color: THREE.Color) => 0.92 * (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b)

function createAoTexture(rows: number) {
  const texture = new THREE.DataTexture(new Uint8Array(rows * 4), 1, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  return texture
}

function writeAo(texture: THREE.DataTexture, visibility: number[], albedo: number) {
  const data = texture.image.data as Uint8Array
  visibility.forEach((value, index) => {
    const byte = Math.round(THREE.MathUtils.clamp(multiBounceAo(value, albedo), 0, 1) * 255)
    data.set([byte, byte, byte, 255], index * 4)
  })
  texture.needsUpdate = true
}

function createCavityMaterial(ao: THREE.Texture) {
  const material = new THREE.MeshPhysicalMaterial({ ...GLAZE, aoMap: ao, aoMapIntensity: 0.92 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uInnerRadius = { value: MUG.outerRadius - MUG.wallThickness }
    shader.uniforms.uOpeningY = { value: MUG.height - MUG.wallThickness / 2 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', CAVITY_VERTEX_PARS)
      .replace('#include <begin_vertex>', CAVITY_VERTEX_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', CAVITY_FRAGMENT_PARS)
      .replace('#include <aomap_fragment>', CAVITY_FRAGMENT_MAIN)
  }
  // Borda e interior usam o mesmo código: compartilham o programa compilado.
  material.customProgramCacheKey = () => 'mug-cavity'
  return material
}

/**
 * @param cavityVisibility visibilidade de cada linha das malhas da borda e do interior,
 *   usada para gerar a oclusão ambiente conforme a cor do interior.
 */
export function createMugMaterials(cavityVisibility: Record<CavityRegion, number[]>) {
  const ao: Record<CavityRegion, THREE.DataTexture> = {
    rim: createAoTexture(cavityVisibility.rim.length),
    interior: createAoTexture(cavityVisibility.interior.length),
  }
  const regions: Record<MugColorRegion, THREE.MeshPhysicalMaterial> = {
    handle: new THREE.MeshPhysicalMaterial(GLAZE),
    rim: createCavityMaterial(ao.rim),
    interior: createCavityMaterial(ao.interior),
  }
  const glaze = new THREE.MeshPhysicalMaterial(GLAZE)
  const bisque = new THREE.MeshStandardMaterial(BISQUE)

  // A luz rebatida dentro da caneca vem das paredes internas: a oclusão da borda e do interior
  // acompanha a cor do interior. Só é recalculada quando essa cor muda.
  let cavityAlbedo = Number.NaN
  const updateCavityAo = () => {
    const albedo = glazeAlbedo(regions.interior.color)
    if (albedo === cavityAlbedo) return
    cavityAlbedo = albedo
    writeAo(ao.rim, cavityVisibility.rim, albedo)
    writeAo(ao.interior, cavityVisibility.interior, albedo)
  }
  updateCavityAo()

  return {
    glaze,
    bisque,
    regions,
    ao,
    /** Aplica a cor de cada parte ao material dela (o anel de apoio, sem esmalte, não muda). */
    setColors(colors: ResolvedMugColors) {
      glaze.color.set(colors.body)
      for (const region of MUG_COLOR_REGIONS) regions[region].color.set(colors[region])
      updateCavityAo()
    },
    dispose() {
      Object.values(regions).forEach((material) => material.dispose())
      Object.values(ao).forEach((texture) => texture.dispose())
      glaze.dispose()
      bisque.dispose()
    },
  }
}

export type MugMaterials = ReturnType<typeof createMugMaterials>
