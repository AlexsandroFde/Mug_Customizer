import { describe, expect, it } from 'vitest'
import { DEFAULT_MUG_COLORS } from '../config/mugColors'
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
