/**
 * Geometria procedural da caneca.
 *
 * O corpo é uma superfície de revolução gerada a partir de um perfil contínuo (com normais
 * analíticas) e dividida em regiões, cada uma com sua malha e seu material:
 * base, anel de apoio, calcanhar, parede externa (única região que recebe a estampa),
 * borda (o acabamento arredondado do topo) e interior (parede interna e fundo).
 * A alça é uma varredura de uma seção de superelipse ao longo de uma curva suave,
 * com as pontas embutidas na parede.
 */
import * as THREE from 'three'
import { HANDLE, MUG } from '../../config/mugSpec'

export interface ProfilePoint {
  /** Distância ao eixo vertical. */
  r: number
  y: number
  /** Normal no plano do perfil (aponta para fora do sólido). */
  nr: number
  ny: number
}

export type BodyRegion = 'base' | 'foot' | 'heel' | 'outerWall' | 'rim' | 'interior'

/** Regiões voltadas para a cavidade, que recebem oclusão ambiente. */
export type CavityRegion = 'rim' | 'interior'

export interface MugGeometry {
  body: Record<BodyRegion, THREE.BufferGeometry>
  handle: THREE.BufferGeometry
  /**
   * Fração do hemisfério que enxerga o exterior em cada ponto do perfil, na ordem das linhas
   * da malha (a coordenada v aponta para o valor correspondente).
   */
  cavityVisibility: Record<CavityRegion, number[]>
  dispose(): void
}

/** Segmentos ao redor do eixo; todas as regiões usam o mesmo valor para que as junções coincidam. */
export const RADIAL_SEGMENTS = 256

export const HANDLE_RINGS = 160
export const HANDLE_SIDES = 48
const AO_SAMPLES = 1536

const INNER_RADIUS = MUG.outerRadius - MUG.wallThickness
const RIM_RADIUS = MUG.wallThickness / 2
/** Altura em que a borda arredondada começa: abaixo dela fica a cavidade cilíndrica. */
const OPENING_Y = MUG.height - RIM_RADIUS

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/** Normal à esquerda do sentido de percurso: (ty, -tx). */
function normalFromTangent(tr: number, ty: number) {
  const length = Math.hypot(tr, ty)
  return { nr: ty / length, ny: -tr / length }
}

function line(r0: number, y0: number, r1: number, y1: number, steps: number): ProfilePoint[] {
  const { nr, ny } = normalFromTangent(r1 - r0, y1 - y0)
  return Array.from({ length: steps + 1 }, (_, index) => {
    const k = index / steps
    return { r: r0 + (r1 - r0) * k, y: y0 + (y1 - y0) * k, nr, ny }
  })
}

function arc(centerR: number, centerY: number, radius: number, from: number, to: number, steps: number): ProfilePoint[] {
  const direction = Math.sign(to - from)
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / steps
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return { r: centerR + radius * cos, y: centerY + radius * sin, ...normalFromTangent(-sin * direction, cos * direction) }
  })
}

/** Transição em "S" com tangentes horizontais nas duas pontas (rebaixo da base até o anel de apoio). */
function easeCurve(r0: number, y0: number, r1: number, y1: number, steps: number): ProfilePoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const k = index / steps
    const tangentR = r1 - r0
    const tangentY = (y1 - y0) * (Math.PI / 2) * Math.sin(Math.PI * k)
    return {
      r: r0 + tangentR * k,
      y: y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * k))) / 2,
      ...normalFromTangent(tangentR, tangentY),
    }
  })
}

/** Junta trechos consecutivos removendo o ponto repetido em cada emenda. */
const join = (...parts: ProfilePoint[][]) => parts.flatMap((part, index) => (index === 0 ? part : part.slice(1)))

/** Perfil completo, percorrido do centro da base até o centro do fundo interno. */
export function createProfile(): Record<BodyRegion, ProfilePoint[]> {
  const R = MUG.outerRadius
  const heel = MUG.heelRadius
  const fillet = MUG.innerFilletRadius
  const floor = MUG.floorHeight
  return {
    base: line(0, MUG.baseRecess, MUG.footInnerRadius, MUG.baseRecess, 6),
    foot: join(
      easeCurve(MUG.footInnerRadius, MUG.baseRecess, MUG.footContactRadius, 0, 8),
      line(MUG.footContactRadius, 0, R - heel, 0, 2),
    ),
    heel: arc(R - heel, heel, heel, -Math.PI / 2, 0, 12),
    outerWall: line(R, heel, R, OPENING_Y, 12),
    // A borda vai de uma tangente à outra: termina exatamente onde começam as paredes retas.
    rim: arc(R - RIM_RADIUS, OPENING_Y, RIM_RADIUS, 0, Math.PI, 20),
    interior: join(
      line(INNER_RADIUS, OPENING_Y, INNER_RADIUS, floor + fillet, 28),
      arc(INNER_RADIUS - fillet, floor + fillet, fillet, 0, -Math.PI / 2, 16),
      line(INNER_RADIUS - fillet, floor, 0, floor, 16),
    ),
  }
}

// ---------------------------------------------------------------------------
// Superfície de revolução
// ---------------------------------------------------------------------------

/**
 * Gera a malha de revolução de um trecho do perfil. A costura fica na direção da alça,
 * escondida atrás dela. A coordenada v aponta para o texel de oclusão de cada ponto do perfil.
 */
export function createLathe(points: ProfilePoint[], segments = RADIAL_SEGMENTS, startAngle = HANDLE.angle) {
  const rows = points.length
  const columns = segments + 1
  const positions = new Float32Array(columns * rows * 3)
  const normals = new Float32Array(columns * rows * 3)
  const uvs = new Float32Array(columns * rows * 2)

  for (let column = 0; column < columns; column++) {
    const u = column / segments
    const angle = startAngle + u * Math.PI * 2
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    for (let row = 0; row < rows; row++) {
      const point = points[row]
      const vertex = column * rows + row
      positions.set([point.r * sin, point.y, point.r * cos], vertex * 3)
      normals.set([point.nr * sin, point.ny, point.nr * cos], vertex * 3)
      uvs.set([u, (row + 0.5) / rows], vertex * 2)
    }
  }

  const indices: number[] = []
  for (let column = 0; column < segments; column++) {
    for (let row = 0; row < rows - 1; row++) {
      const a = column * rows + row
      const b = a + rows
      const c = a + 1
      const d = b + 1
      // Triângulos que encostam no eixo (raio zero) degeneram e são descartados.
      if (points[row].r > 0) indices.push(a, b, c)
      if (points[row + 1].r > 0) indices.push(b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

// ---------------------------------------------------------------------------
// Alça
// ---------------------------------------------------------------------------

/** Ponto da superelipse unitária: entre a elipse e um retângulo de cantos arredondados. */
function superellipse(theta: number, exponent: number) {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const power = 2 / exponent
  return [Math.sign(cos) * Math.abs(cos) ** power, Math.sign(sin) * Math.abs(sin) ** power] as const
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function createHandleCurve() {
  const points = HANDLE.path.map(([distance, height]) => new THREE.Vector3(distance, height, 0))
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}

/**
 * Varre a seção da alça ao longo da curva. O plano da alça é XY (alça na direção +X);
 * a binormal é fixa em +Z, o que evita as torções do referencial de Frenet.
 */
export function createHandleGeometry() {
  const curve = createHandleCurve()
  const binormal = new THREE.Vector3(0, 0, 1)
  const normal = new THREE.Vector3()
  const center = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const positions = new Float32Array(HANDLE_RINGS * HANDLE_SIDES * 3)
  const section = Array.from({ length: HANDLE_SIDES }, (_, side) =>
    superellipse((side / HANDLE_SIDES) * Math.PI * 2, HANDLE.sectionExponent),
  )

  for (let ring = 0; ring < HANDLE_RINGS; ring++) {
    const t = ring / (HANDLE_RINGS - 1)
    curve.getPointAt(t, center)
    curve.getTangentAt(t, tangent)
    normal.crossVectors(binormal, tangent).normalize()
    // Alarga a seção perto do corpo, como o filete de cerâmica que une a alça à parede.
    // O quadrado da transição faz o alargamento crescer rápido junto à parede, como um arredondamento.
    const distanceFromWall = center.x - MUG.outerRadius
    const blend = (1 - smoothstep(0, HANDLE.junction.length, distanceFromWall)) ** 2
    const thickness = HANDLE.halfThickness * (1 + HANDLE.junction.thickness * blend)
    const width = HANDLE.halfWidth * (1 + HANDLE.junction.width * blend)
    for (let side = 0; side < HANDLE_SIDES; side++) {
      const [alongNormal, alongBinormal] = section[side]
      const offsetNormal = alongNormal * thickness
      const offsetBinormal = alongBinormal * width
      positions.set(
        [
          center.x + normal.x * offsetNormal + binormal.x * offsetBinormal,
          center.y + normal.y * offsetNormal + binormal.y * offsetBinormal,
          center.z + normal.z * offsetNormal + binormal.z * offsetBinormal,
        ],
        (ring * HANDLE_SIDES + side) * 3,
      )
    }
  }

  // Os anéis fecham sobre si mesmos (sem vértices duplicados) para que as normais suavizadas
  // não mostrem costura; as pontas ficam abertas porque estão escondidas dentro da parede.
  const indices: number[] = []
  for (let ring = 0; ring < HANDLE_RINGS - 1; ring++) {
    for (let side = 0; side < HANDLE_SIDES; side++) {
      const next = (side + 1) % HANDLE_SIDES
      const a = ring * HANDLE_SIDES + side
      const b = (ring + 1) * HANDLE_SIDES + side
      const c = ring * HANDLE_SIDES + next
      const d = (ring + 1) * HANDLE_SIDES + next
      indices.push(a, c, b, c, d, b)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

// ---------------------------------------------------------------------------
// Oclusão ambiente do interior
// ---------------------------------------------------------------------------

/** Sequência de van der Corput (base 2), usada para amostragem bem distribuída. */
function radicalInverse(index: number) {
  let bits = index
  bits = ((bits << 16) | (bits >>> 16)) >>> 0
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0
  return bits / 4294967296
}

/** Verifica se um raio que parte do interior sai pela abertura sem atingir a parede ou o fundo. */
function rayEscapes(origin: THREE.Vector3, direction: THREE.Vector3) {
  const radiusSq = INNER_RADIUS * INNER_RADIUS
  if (origin.y >= OPENING_Y) {
    // Acima da abertura (na borda): só fica oculto se descer para dentro da cavidade.
    if (direction.y >= 0) return true
    const t = (OPENING_Y - origin.y) / direction.y
    const x = origin.x + direction.x * t
    const z = origin.z + direction.z * t
    return x * x + z * z > radiusSq
  }
  if (direction.y <= 0) return false
  const tTop = (OPENING_Y - origin.y) / direction.y
  const a = direction.x * direction.x + direction.z * direction.z
  if (a < 1e-12) return true
  const b = 2 * (origin.x * direction.x + origin.z * direction.z)
  const c = origin.x * origin.x + origin.z * origin.z - radiusSq
  const tWall = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)
  return tTop <= tWall
}

/** Fração do hemisfério (ponderada pelo cosseno) que enxerga o exterior pela abertura. */
export function cavityVisibility(point: ProfilePoint, samples = AO_SAMPLES) {
  const normal = new THREE.Vector3(point.nr, point.ny, 0)
  const tangent = new THREE.Vector3(0, 0, 1)
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent)
  const origin = new THREE.Vector3(point.r, point.y, 0).addScaledVector(normal, 1e-3)
  const direction = new THREE.Vector3()
  let visible = 0
  for (let index = 0; index < samples; index++) {
    const u1 = (index + 0.5) / samples
    const angle = 2 * Math.PI * radicalInverse(index)
    const radius = Math.sqrt(u1)
    direction
      .copy(normal)
      .multiplyScalar(Math.sqrt(1 - u1))
      .addScaledVector(tangent, radius * Math.cos(angle))
      .addScaledVector(bitangent, radius * Math.sin(angle))
    if (rayEscapes(origin, direction)) visible++
  }
  return visible / samples
}

// ---------------------------------------------------------------------------

export function createMugGeometry(): MugGeometry {
  const profile = createProfile()
  const body = Object.fromEntries(
    (Object.keys(profile) as BodyRegion[]).map((region) => [region, createLathe(profile[region])]),
  ) as Record<BodyRegion, THREE.BufferGeometry>
  const handle = createHandleGeometry()

  return {
    body,
    handle,
    cavityVisibility: {
      rim: profile.rim.map((point) => cavityVisibility(point)),
      interior: profile.interior.map((point) => cavityVisibility(point)),
    },
    dispose() {
      Object.values(body).forEach((geometry) => geometry.dispose())
      handle.dispose()
    },
  }
}
