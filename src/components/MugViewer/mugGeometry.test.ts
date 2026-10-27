import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { HANDLE, MUG, PRINT_AREA, PRINT_HEIGHT, PRINT_WIDTH } from '../../config/mugSpec'
import {
  cavityVisibility,
  createHandleCurve,
  createHandleGeometry,
  createLathe,
  createProfile,
  HANDLE_RINGS,
  HANDLE_SIDES,
  type BodyRegion,
} from './mugGeometry'

const REGION_ORDER: BodyRegion[] = ['base', 'foot', 'heel', 'outerWall', 'rim', 'interior']
const INNER_RADIUS = MUG.outerRadius - MUG.wallThickness
const OPENING_Y = MUG.height - MUG.wallThickness / 2

function triangleNormalsAgreeWithVertexNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const index = geometry.getIndex()!
  const [a, b, c, n, ab, ac] = Array.from({ length: 6 }, () => new THREE.Vector3())
  let disagreements = 0
  for (let i = 0; i < index.count; i += 3) {
    const [ia, ib, ic] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    a.fromBufferAttribute(position, ia)
    b.fromBufferAttribute(position, ib)
    c.fromBufferAttribute(position, ic)
    const face = ab.subVectors(b, a).cross(ac.subVectors(c, a))
    if (face.lengthSq() < 1e-14) continue
    n.fromBufferAttribute(normal, ia).add(new THREE.Vector3().fromBufferAttribute(normal, ib)).add(new THREE.Vector3().fromBufferAttribute(normal, ic))
    if (face.dot(n) <= 0) disagreements++
  }
  return disagreements
}

describe('perfil da caneca', () => {
  const profile = createProfile()

  it('é contínuo: cada região começa onde a anterior termina, com a mesma normal', () => {
    for (let i = 1; i < REGION_ORDER.length; i++) {
      const previous = profile[REGION_ORDER[i - 1]].at(-1)!
      const current = profile[REGION_ORDER[i]][0]
      expect(current.r).toBeCloseTo(previous.r, 6)
      expect(current.y).toBeCloseTo(previous.y, 6)
      expect(current.nr).toBeCloseTo(previous.nr, 6)
      expect(current.ny).toBeCloseTo(previous.ny, 6)
    }
  })

  it('tem normais unitárias e respeita as dimensões especificadas', () => {
    const points = REGION_ORDER.flatMap((region) => profile[region])
    for (const point of points) expect(Math.hypot(point.nr, point.ny)).toBeCloseTo(1, 6)
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(MUG.height, 6)
    expect(Math.max(...points.map((point) => point.r))).toBeCloseTo(MUG.outerRadius, 6)
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(0, 6)
  })

  it('a área de impressão fica inteira na parede externa reta', () => {
    const wall = profile.outerWall
    expect(wall[0].y).toBeLessThanOrEqual(PRINT_AREA.bottom)
    expect(wall.at(-1)!.y).toBeGreaterThanOrEqual(PRINT_AREA.top)
    for (const point of wall) expect(point.r).toBeCloseTo(MUG.outerRadius, 6)
  })

  it('a borda é só o acabamento arredondado: vai da tangente externa à interna, acima das paredes', () => {
    const rim = profile.rim
    expect(rim[0]).toMatchObject({ r: expect.closeTo(MUG.outerRadius, 6), y: expect.closeTo(OPENING_Y, 6) })
    expect(rim.at(-1)!).toMatchObject({ r: expect.closeTo(INNER_RADIUS, 6), y: expect.closeTo(OPENING_Y, 6) })
    for (const point of rim) {
      expect(point.y).toBeGreaterThanOrEqual(OPENING_Y - 1e-9)
      expect(point.r).toBeGreaterThanOrEqual(INNER_RADIUS - 1e-9)
      expect(point.r).toBeLessThanOrEqual(MUG.outerRadius + 1e-9)
    }
    expect(Math.max(...rim.map((point) => point.y))).toBeCloseTo(MUG.height, 6)
  })

  it('o interior fica inteiro dentro da cavidade, abaixo da borda', () => {
    for (const point of profile.interior) {
      expect(point.r).toBeLessThanOrEqual(INNER_RADIUS + 1e-9)
      expect(point.y).toBeLessThanOrEqual(OPENING_Y + 1e-9)
    }
  })
})

describe('malhas de revolução', () => {
  const profile = createProfile()

  it.each(REGION_ORDER)('a orientação dos triângulos de "%s" concorda com as normais', (region) => {
    expect(triangleNormalsAgreeWithVertexNormals(createLathe(profile[region]))).toBe(0)
  })
})

describe('alça', () => {
  const geometry = createHandleGeometry()
  const curve = createHandleCurve()
  const centers = curve.getSpacedPoints(400)
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')

  it('tem normais apontando para fora do tubo', () => {
    const vertex = new THREE.Vector3()
    const vertexNormal = new THREE.Vector3()
    let inward = 0
    for (let i = 0; i < position.count; i += 7) {
      vertex.fromBufferAttribute(position, i)
      vertexNormal.fromBufferAttribute(normal, i)
      const nearest = centers.reduce((best, center) => (center.distanceToSquared(vertex) < best.distanceToSquared(vertex) ? center : best))
      if (vertexNormal.dot(vertex.clone().sub(nearest)) <= 0) inward++
    }
    expect(inward).toBe(0)
  })

  it('tem as pontas embutidas na parede, sem aparecer dentro da caneca', () => {
    for (const ring of [0, HANDLE_RINGS - 1]) {
      for (let side = 0; side < HANDLE_SIDES; side++) {
        const index = ring * HANDLE_SIDES + side
        const radius = Math.hypot(position.getX(index), position.getZ(index))
        expect(radius).toBeGreaterThan(INNER_RADIUS)
        expect(radius).toBeLessThan(MUG.outerRadius)
      }
    }
  })

  it('não invade a área de impressão', () => {
    const halfGap = Math.PI - PRINT_WIDTH / 2 / MUG.outerRadius
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const z = position.getZ(i)
      if (Math.hypot(x, z) > MUG.outerRadius + 0.2) continue
      const angleFromHandle = Math.abs(Math.atan2(x, z) - HANDLE.angle)
      expect(angleFromHandle).toBeLessThan(halfGap)
    }
  })
})

describe('oclusão ambiente do interior', () => {
  const profile = createProfile()

  it('o centro do fundo enxerga a abertura conforme o fator de forma analítico', () => {
    const floorCenter = profile.interior.at(-1)!
    const depth = OPENING_Y - floorCenter.y
    const expected = INNER_RADIUS ** 2 / (INNER_RADIUS ** 2 + depth ** 2)
    expect(cavityVisibility(floorCenter, 4096)).toBeCloseTo(expected, 1)
  })

  it('um ponto da parede interna segue o fator de forma de um anel até o disco da abertura', () => {
    const y = OPENING_Y - 3
    const X = 3 / INNER_RADIUS
    const expected = (X * X + 2) / (2 * Math.sqrt(X * X + 4)) - X / 2
    expect(cavityVisibility({ r: INNER_RADIUS, y, nr: -1, ny: 0 }, 4096)).toBeCloseTo(expected, 1)
  })

  it('escurece de forma monótona à medida que a parede interna desce', () => {
    const wall = profile.interior.filter((point) => point.nr < -0.999 && point.y < OPENING_Y)
    const visibility = wall.map((point) => cavityVisibility(point, 2048))
    for (let i = 1; i < visibility.length; i++) expect(visibility[i]).toBeLessThanOrEqual(visibility[i - 1] + 0.02)
    expect(visibility.at(-1)!).toBeLessThan(visibility[0])
  })

  it('é contínua nas junções da borda, sem degrau de sombreamento quando as cores são iguais', () => {
    // Do lado de fora, a borda encontra a parede externa (que não tem oclusão): visibilidade total.
    expect(cavityVisibility(profile.rim[0])).toBeCloseTo(1, 2)
    // Do lado de dentro, borda e interior compartilham o mesmo ponto e a mesma normal.
    expect(cavityVisibility(profile.rim.at(-1)!)).toBe(cavityVisibility(profile.interior[0]))
  })

  it('a área imprimível tem a altura especificada', () => {
    expect(PRINT_HEIGHT).toBeCloseTo(PRINT_AREA.top - PRINT_AREA.bottom)
  })
})
