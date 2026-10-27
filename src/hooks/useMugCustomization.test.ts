import { describe, expect, it } from 'vitest'
import { DEFAULT_MUG_COLORS, resolveMugColors } from '../config/mugColors'
import { PRINTABLE } from '../config/mugSpec'
import { DEFAULT_PRINT_AREA } from '../lib/printArea'
import {
  customizationReducer,
  initialCustomizationState,
  isPristine,
  type CustomizationState,
  type PrintImage,
} from './useMugCustomization'

const apply = (...actions: Parameters<typeof customizationReducer>[1][]) =>
  actions.reduce<CustomizationState>(customizationReducer, initialCustomizationState)

const fakeImage = { id: 1, aspect: 1.5 } as PrintImage
const colorsOf = (state: CustomizationState) => resolveMugColors(state.colors)

describe('cores da caneca no estado', () => {
  it('começam brancas, com as três partes acompanhando a cor-base', () => {
    expect(initialCustomizationState.colors).toEqual(DEFAULT_MUG_COLORS)
    expect(Object.values(colorsOf(initialCustomizationState)).every((color) => color === DEFAULT_MUG_COLORS.body)).toBe(true)
  })

  it('a cor-base pinta as partes vinculadas', () => {
    const state = apply({ type: 'body-color', color: '#0057B8' })
    expect(colorsOf(state)).toEqual({ body: '#0057b8', handle: '#0057b8', rim: '#0057b8', interior: '#0057b8' })
  })

  it('uma parte com cor própria deixa de acompanhar a cor-base, e as outras não mudam', () => {
    const state = apply({ type: 'body-color', color: '#0057b8' }, { type: 'part-color', region: 'handle', color: '#c8102e' })
    expect(colorsOf(state)).toEqual({ body: '#0057b8', handle: '#c8102e', rim: '#0057b8', interior: '#0057b8' })
  })

  it('mudar a cor-base preserva as cores próprias escolhidas antes', () => {
    const state = apply(
      { type: 'part-color', region: 'interior', color: '#f5c400' },
      { type: 'body-color', color: '#202124' },
      { type: 'body-color', color: '#00843d' },
    )
    expect(colorsOf(state)).toEqual({ body: '#00843d', handle: '#00843d', rim: '#00843d', interior: '#f5c400' })
  })

  it('aplicar a todas as partes volta a vincular tudo à cor-base', () => {
    const state = apply(
      { type: 'body-color', color: '#1d2b4f' },
      { type: 'part-color', region: 'handle', color: '#c8102e' },
      { type: 'part-color', region: 'rim', color: '#f5c400' },
      { type: 'link-all-parts' },
    )
    expect(state.colors.overrides).toEqual({ handle: null, rim: null, interior: null })
    expect(new Set(Object.values(colorsOf(state)))).toEqual(new Set(['#1d2b4f']))
  })

  it('restaurar a cor-base e vincular uma parte são ações independentes', () => {
    const custom = apply(
      { type: 'body-color', color: '#1d2b4f' },
      { type: 'part-color', region: 'handle', color: '#c8102e' },
      { type: 'part-color', region: 'rim', color: '#f5c400' },
    )
    // Restaurar a cor-base não mexe nas cores próprias.
    const baseReset = customizationReducer(custom, { type: 'reset-body-color' })
    expect(baseReset.colors).toEqual({ body: DEFAULT_MUG_COLORS.body, overrides: custom.colors.overrides })
    // Vincular uma parte não mexe na cor-base nem nas outras partes.
    const linked = customizationReducer(custom, { type: 'link-part', region: 'rim' })
    expect(linked.colors).toEqual({ body: '#1d2b4f', overrides: { handle: '#c8102e', rim: null, interior: null } })
  })

  it('aceita a forma curta e ignora códigos inválidos', () => {
    expect(apply({ type: 'part-color', region: 'rim', color: 'F00' }).colors.overrides.rim).toBe('#ff0000')
    const before = apply({ type: 'body-color', color: '#00843d' })
    expect(customizationReducer(before, { type: 'body-color', color: 'verde' })).toBe(before)
    expect(customizationReducer(before, { type: 'part-color', region: 'rim', color: '#12' })).toBe(before)
  })

  it('cores, estampa e área são independentes', () => {
    const colored = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'transform', patch: { offsetX: 2, scale: 0.8 }, kind: 'continuous' },
      { type: 'area-shape', shape: 'square' },
      { type: 'part-color', region: 'handle', color: '#202124' },
    )
    // Mudar cores não recria os objetos da estampa nem da área.
    for (const action of [
      { type: 'body-color', color: '#78be20' },
      { type: 'part-color', region: 'interior', color: '#78be20' },
      { type: 'link-all-parts' },
      { type: 'reset-body-color' },
    ] as const) {
      const next = customizationReducer(colored, action)
      expect(next.transform).toBe(colored.transform)
      expect(next.area).toBe(colored.area)
      expect(next.image).toBe(colored.image)
    }

    // Ajustar ou trocar a estampa e a área preserva as cores.
    for (const action of [
      { type: 'transform', patch: { rotation: 45 }, kind: 'continuous' },
      { type: 'reset-transform' },
      { type: 'area-shape', shape: 'custom' },
      { type: 'reset-area' },
      { type: 'upload-success', image: { ...fakeImage, id: 2 } },
      { type: 'remove-image' },
    ] as const) {
      expect(customizationReducer(colored, action).colors).toBe(colored.colors)
    }
  })

  it('não cria um novo estado quando nada muda', () => {
    const state = apply({ type: 'part-color', region: 'handle', color: '#0057b8' })
    expect(customizationReducer(state, { type: 'part-color', region: 'handle', color: '#0057B8' })).toBe(state)
    expect(customizationReducer(state, { type: 'link-part', region: 'rim' })).toBe(state)
  })
})

describe('redefinir e desfazer', () => {
  it('redefinir restaura estampa, área e cores, mas mantém a imagem', () => {
    const state = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'transform', patch: { scale: 0.6, rotation: 20 }, kind: 'continuous' },
      { type: 'area-shape', shape: 'square' },
      { type: 'body-color', color: '#202124' },
      { type: 'part-color', region: 'handle', color: '#c8102e' },
    )
    expect(isPristine(state)).toBe(false)
    const reset = customizationReducer(state, { type: 'reset-all' })
    expect(isPristine(reset)).toBe(true)
    expect(reset.image).toBe(state.image)
  })

  it('desfazer devolve exatamente os ajustes anteriores', () => {
    const state = apply(
      { type: 'upload-success', image: fakeImage },
      { type: 'area-shape', shape: 'custom' },
      { type: 'area-size', dimension: 'width', value: 9 },
      { type: 'transform', patch: { offsetX: 3, rotation: -15 }, kind: 'continuous' },
      { type: 'body-color', color: '#1d2b4f' },
    )
    const snapshot = { transform: state.transform, area: state.area, colors: state.colors }
    const restored = customizationReducer(customizationReducer(state, { type: 'reset-all' }), { type: 'restore', snapshot })
    expect(restored.transform).toEqual(state.transform)
    expect(restored.area).toEqual(state.area)
    expect(restored.colors).toEqual(state.colors)
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
      { type: 'part-color', region: 'rim', color: '#202124' },
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
      { type: 'part-color', region: 'handle', color: '#0057b8' },
      { type: 'transform', patch: { rotation: 15 }, kind: 'continuous' },
      { type: 'area-shape', shape: 'square' },
      { type: 'reset-area' },
    )
    expect(state.area).toEqual(DEFAULT_PRINT_AREA)
    expect(state.colors.overrides.handle).toBe('#0057b8')
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
