/**
 * Materiais cerâmicos da caneca (a estampa fica em MugTexture.ts).
 */
import * as THREE from 'three'
import { MUG } from '../../config/mugSpec'

/** Esmalte cerâmico: base levemente acetinada sob uma camada vítrea brilhante. */
export const GLAZE: THREE.MeshPhysicalMaterialParameters = {
  color: '#f7f6f2',
  roughness: 0.34,
  metalness: 0,
  ior: 1.5,
  specularIntensity: 0.55,
  clearcoat: 1,
  clearcoatRoughness: 0.055,
}

/** Cerâmica sem esmalte do anel de apoio (fosca e levemente bege). */
const BISQUE: THREE.MeshStandardMaterialParameters = { color: '#d8d0c2', roughness: 0.92, metalness: 0 }

const INTERIOR_VERTEX_PARS = /* glsl */ `
#include <common>
varying vec3 vInteriorPosition;
`

const INTERIOR_VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
vInteriorPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const INTERIOR_FRAGMENT_PARS = /* glsl */ `
#include <common>
varying vec3 vInteriorPosition;
uniform float uInnerRadius;
uniform float uOpeningY;
`

/**
 * Oclusão especular do interior. O mapa de ambiente não sabe que a caneca é côncava: sem isto,
 * a parede interna refletiria softboxes que, na realidade, a própria parede esconderia.
 * O raio refletido é testado analiticamente contra o cilindro interno (a caneca fica na origem,
 * sem rotação): só reflete o ambiente o que sai pela abertura.
 */
const INTERIOR_FRAGMENT_MAIN = /* glsl */ `
#include <aomap_fragment>
{
  vec3 interiorNormal = inverseTransformDirection(normal, viewMatrix);
  vec3 interiorView = normalize(cameraPosition - vInteriorPosition);
  vec3 interiorReflection = reflect(-interiorView, interiorNormal);
  float reflectionVisibility = 1.0;
  if (vInteriorPosition.y < uOpeningY) {
    float tTop = (uOpeningY - vInteriorPosition.y) / max(interiorReflection.y, 1e-4);
    float a = dot(interiorReflection.xz, interiorReflection.xz);
    float b = 2.0 * dot(vInteriorPosition.xz, interiorReflection.xz);
    float c = dot(vInteriorPosition.xz, vInteriorPosition.xz) - uInnerRadius * uInnerRadius;
    float tWall = a > 1e-6 ? (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a) : 1e6;
    reflectionVisibility = interiorReflection.y > 0.0 ? smoothstep(0.8, 1.25, tWall / tTop) : 0.0;
  }
  // O que fica oculto reflete a própria cerâmica clara: um resíduo evita um interior "morto".
  reflectionVisibility = mix(0.12, 1.0, reflectionVisibility);
  reflectedLight.indirectSpecular *= reflectionVisibility;
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= reflectionVisibility;
  #endif
}
`

function createInteriorMaterial(interiorAo: THREE.Texture) {
  const material = new THREE.MeshPhysicalMaterial({ ...GLAZE, aoMap: interiorAo, aoMapIntensity: 0.92 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uInnerRadius = { value: MUG.outerRadius - MUG.wallThickness }
    shader.uniforms.uOpeningY = { value: MUG.height - MUG.wallThickness / 2 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', INTERIOR_VERTEX_PARS)
      .replace('#include <begin_vertex>', INTERIOR_VERTEX_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', INTERIOR_FRAGMENT_PARS)
      .replace('#include <aomap_fragment>', INTERIOR_FRAGMENT_MAIN)
  }
  material.customProgramCacheKey = () => 'mug-interior'
  return material
}

export function createMugMaterials(interiorAo: THREE.Texture) {
  const glaze = new THREE.MeshPhysicalMaterial(GLAZE)
  const interior = createInteriorMaterial(interiorAo)
  const bisque = new THREE.MeshStandardMaterial(BISQUE)
  return {
    glaze,
    interior,
    bisque,
    dispose() {
      glaze.dispose()
      interior.dispose()
      bisque.dispose()
    },
  }
}
