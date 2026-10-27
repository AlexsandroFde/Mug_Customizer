import { describe, expect, it } from 'vitest'
import { DEFAULT_MUG_COLORS } from '../config/mugColors'
import { PRINTABLE } from '../config/mugSpec'
import { DEFAULT_PRINT_AREA } from '../lib/printArea'
import { customizationReducer, initialCustomizationState, type CustomizationState, type PrintImage } from './useMugCustomization'

const apply = (...actions: Parameters<typeof customizationReducer>[1][]) =>
  actions.reduce<CustomizationState>(customizationReducer, initialCustomizationState)

const fakeImage = { id: 1, aspect: 1.5 } as PrintImage

describe('cores da caneca no estado', () => {
  it('começam com o esmalte original nas três regiões', () => {
    expect(initialCustomizationState.colors).toEqual(DEFAULT_MUG_COLORS)
  })

  it('alterar uma região não muda as outras', () => {
    const state = apply(
      { type: 'color', region: 'handle', color: '#0057B8' },
      { type: 'color', region: 'interior', color: '#c8102e' },
    )
    expect(state.colors).toEqual({ handle: '#0057b8', rim: DEFAULT_MUG_COLORS.rim, interior: '#c8102e' })
  })

  it('aceita a forma curta e ignora códigos inválidos', () => {
    expect(apply({ type: 'color', region: 'rim', color: 'F00' }).colors.rim).toBe('#ff0000')
    const before = apply({ type: 'color', region: 'rim', color: '#00843d' })
    expect(customizationReducer(before, { type: 'color', region: 'rim', color: 'verde' })).toBe(before)
  })

  it('restaurar uma região não redefine as outras', () => {
    const state = apply(
      { type: 'color', region: 'handle', color: '#0057b8' },
      { type: 'color', region: 'rim', color: '#f5c400' },
      { type: 'color', region: 'interior', color: '#c8102e' },
      { type: 'reset-color', region: 'rim' },
    )
    expect(state.colors).toEqual({ handle: '#0057b8', rim: DEFAULT_MUG_COLORS.rim, interior: '#c8102e' })
  })

  it('cores e estampa são independentes', () => {
    const colored = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'transform', patch: { offsetX: 2, scale: 0.8 }, kind: 'continuous' },
      { type: 'color', region: 'handle', color: '#202124' },
    )
    // Mudar a cor não toca no objeto de posicionamento (a estampa não é reaplicada).
    const recolored = customizationReducer(colored, { type: 'color', region: 'interior', color: '#78be20' })
    expect(recolored.transform).toBe(colored.transform)
    expect(recolored.image).toBe(colored.image)

    // Ajustar, redefinir, trocar ou remover a imagem preserva as cores.
    for (const action of [
      { type: 'transform', patch: { rotation: 45 }, kind: 'continuous' },
      { type: 'reset-transform' },
      { type: 'upload-success', image: { ...fakeImage, id: 2 } },
      { type: 'remove-image' },
    ] as const) {
      expect(customizationReducer(recolored, action).colors).toBe(recolored.colors)
    }
  })

  it('não cria um novo estado quando a cor escolhida já é a atual', () => {
    const state = apply({ type: 'color', region: 'handle', color: '#0057b8' })
    expect(customizationReducer(state, { type: 'color', region: 'handle', color: '#0057B8' })).toBe(state)
  })
})

describe('área de impressão no estado', () => {
  it('começa na região imprimível inteira, mesmo sem imagem', () => {
    expect(initialCustomizationState.area).toEqual(DEFAULT_PRINT_AREA)
  })

  it('alterar a área não toca nas cores nem na imagem', () => {
    const state = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'transform', patch: { scale: 0.7, rotation: 30, fit: 'cover' }, kind: 'continuous' },
      { type: 'color', region: 'rim', color: '#202124' },
    )
    const resized = customizationReducer(state, { type: 'area-shape', shape: 'square' })
    expect(resized.area.shape).toBe('square')
    expect(resized.colors).toBe(state.colors)
    expect(resized.image).toBe(state.image)
    // A imagem continua centralizada na área: o objeto de ajustes nem é recriado.
    expect(resized.transform).toBe(state.transform)
  })

  it('a imagem acompanha a área e só é reposicionada se o centro dela sair da área', () => {
    const state = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'area-shape', shape: 'custom' },
      { type: 'area-size', dimension: 'width', value: 12 },
      { type: 'transform', patch: { offsetX: 5 }, kind: 'continuous' },
    )
    expect(state.transform.offsetX).toBe(5)
    // Mover a área não muda a posição da imagem em relação a ela.
    const moved = customizationReducer(state, { type: 'area-move', offsetX: 2, kind: 'continuous' })
    expect(moved.area.offsetX).toBe(2)
    expect(moved.transform).toBe(state.transform)
    // Encolher a área deixaria o centro da imagem de fora: ele é trazido para a borda.
    const shrunk = customizationReducer(moved, { type: 'area-size', dimension: 'width', value: 6 })
    expect(shrunk.transform.offsetX).toBe(3)
    expect(shrunk.transform.scale).toBe(state.transform.scale)
  })

  it('a área nunca sai da região imprimível', () => {
    const state = apply(
      { type: 'area-shape', shape: 'custom' },
      { type: 'area-size', dimension: 'width', value: 6 },
      { type: 'area-move', offsetX: 99, offsetY: -99, kind: 'continuous' },
    )
    expect(state.area.offsetX + state.area.width / 2).toBeCloseTo(PRINTABLE.width / 2)
    expect(state.area.offsetY - state.area.height / 2).toBeCloseTo(-PRINTABLE.height / 2)
  })

  it('trocar ou remover a imagem preserva a área', () => {
    const state = apply({ type: 'area-shape', shape: 'square' }, { type: 'upload-success', image: fakeImage })
    expect(state.area.shape).toBe('square')
    expect(customizationReducer(state, { type: 'remove-image' }).area).toBe(state.area)
    expect(customizationReducer(state, { type: 'reset-transform' }).area).toBe(state.area)
  })

  it('redefinir a área restaura só a área', () => {
    const state = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'color', region: 'handle', color: '#0057b8' },
      { type: 'transform', patch: { rotation: 15 }, kind: 'continuous' },
      { type: 'area-shape', shape: 'square' },
      { type: 'reset-area' },
    )
    expect(state.area).toEqual(DEFAULT_PRINT_AREA)
    expect(state.colors.handle).toBe('#0057b8')
    expect(state.transform.rotation).toBe(15)
  })

  it('não cria um novo estado quando a área não muda', () => {
    const state = apply({ type: 'area-shape', shape: 'square' })
    expect(customizationReducer(state, { type: 'area-shape', shape: 'square' })).toBe(state)
    // A área padrão ocupa tudo: não há para onde movê-la.
    expect(customizationReducer(initialCustomizationState, { type: 'area-move', offsetX: 3, kind: 'continuous' })).toBe(
      initialCustomizationState,
    )
  })
})
