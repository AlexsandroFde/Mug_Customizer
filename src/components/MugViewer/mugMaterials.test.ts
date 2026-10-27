import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MUG_COLORS, type MugColors } from '../../config/mugColors'
import { createMugMaterials, multiBounceAo } from './mugMaterials'

const visibility = {
  rim: [1, 0.9, 0.7, 0.5],
  interior: [0.5, 0.35, 0.2, 0.12, 0.15],
}

const aoBytes = (texture: THREE.DataTexture) => Array.from(texture.image.data as Uint8Array)
const hexOf = (material: THREE.MeshPhysicalMaterial) => `#${material.color.getHexString()}`

describe('materiais por região', () => {
  it('alça, borda e interior têm materiais próprios, separados do esmalte do corpo', () => {
    const materials = createMugMaterials(visibility)
    const all = [materials.glaze, materials.regions.handle, materials.regions.rim, materials.regions.interior]
    expect(new Set(all).size).toBe(all.length)
  })

  it('cada cor afeta apenas a sua região', () => {
    const materials = createMugMaterials(visibility)
    const glazeBefore = hexOf(materials.glaze)
    const colors: MugColors = { handle: '#0057b8', rim: '#f7f6f2', interior: '#c8102e' }
    materials.setColors(colors)
    expect(hexOf(materials.regions.handle)).toBe('#0057b8')
    expect(hexOf(materials.regions.rim)).toBe('#f7f6f2')
    expect(hexOf(materials.regions.interior)).toBe('#c8102e')
    expect(hexOf(materials.glaze)).toBe(glazeBefore)
  })

  it('a oclusão acompanha a cor do interior, e não a da alça', () => {
    const materials = createMugMaterials(visibility)
    materials.setColors({ ...DEFAULT_MUG_COLORS })
    const whiteInterior = aoBytes(materials.ao.interior)

    materials.setColors({ ...DEFAULT_MUG_COLORS, handle: '#202124' })
    expect(aoBytes(materials.ao.interior)).toEqual(whiteInterior)

    materials.setColors({ ...DEFAULT_MUG_COLORS, interior: '#202124' })
    const darkInterior = aoBytes(materials.ao.interior)
    // Interior escuro rebate menos luz: os pontos ocultos ficam mais escuros, nunca mais claros.
    expect(darkInterior.some((value, index) => value < whiteInterior[index])).toBe(true)
    expect(darkInterior.every((value, index) => value <= whiteInterior[index])).toBe(true)
  })

  it('a borda e o interior têm a mesma oclusão no ponto em que se encontram', () => {
    const materials = createMugMaterials(visibility)
    for (const interior of ['#f7f6f2', '#202124', '#c8102e']) {
      materials.setColors({ ...DEFAULT_MUG_COLORS, interior })
      const rim = aoBytes(materials.ao.rim)
      const inner = aoBytes(materials.ao.interior)
      expect(rim.slice(-4)).toEqual(inner.slice(0, 4))
    }
  })
})

describe('múltiplos rebatimentos', () => {
  it('não altera pontos totalmente visíveis e clareia mais as superfícies claras', () => {
    expect(multiBounceAo(1, 0.85)).toBeCloseTo(1, 2)
    for (const value of [0.1, 0.3, 0.6]) {
      expect(multiBounceAo(value, 0.85)).toBeGreaterThan(multiBounceAo(value, 0.05))
      expect(multiBounceAo(value, 0.05)).toBeGreaterThanOrEqual(value)
    }
  })
})
