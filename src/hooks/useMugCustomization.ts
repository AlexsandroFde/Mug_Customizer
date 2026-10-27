import { useCallback, useMemo, useReducer, useRef } from 'react'
import { DEFAULT_MUG_COLORS, MUG_COLOR_REGIONS, type MugColorRegion, type MugColorSettings } from '../config/mugColors'
import { TEXTURE_MAX_SIDE } from '../config/mugSpec'
import { parseHexColor } from '../lib/color'
import { ImageFileError, validateImageFile, type ImageFormat } from '../lib/imageFile'
import { processImageFile, releaseCanvas } from '../lib/imageProcessing'
import {
  clampArea,
  DEFAULT_PRINT_AREA,
  getAreaSideOffset,
  moveArea,
  setAreaHeight,
  setAreaScale,
  setAreaShape,
  setAreaWidth,
  type AreaShape,
  type PrintArea,
} from '../lib/printArea'
import {
  clampTransform,
  DEFAULT_TRANSFORM,
  getEffectiveDpi,
  getPrintedSize,
  getPrintQuality,
  isImageCropped,
  type FitMode,
  type PrintQuality,
  type PrintSide,
  type PrintTransform,
  type Size,
} from '../lib/printMapping'

export interface PrintImage {
  id: number
  fileName: string
  fileSize: number
  format: ImageFormat
  /** Dimensões do arquivo original. */
  originalWidth: number
  originalHeight: number
  /** Proporção largura/altura. */
  aspect: number
  /** Imagem pronta para virar textura (lado maior limitado). */
  source: HTMLCanvasElement
  thumbnailUrl: string
  hasTransparency: boolean
}

/** Dimensões em pixels do arquivo original (definem a proporção e o tamanho natural de impressão). */
export const getImagePixels = (image: Pick<PrintImage, 'originalWidth' | 'originalHeight'>): Size => ({
  width: image.originalWidth,
  height: image.originalHeight,
})

/** Mudanças contínuas (arraste, sliders) aparecem na hora; as discretas (botões) são animadas na cena 3D. */
export type ChangeKind = 'continuous' | 'discrete'

export type UploadStatus =
  | { state: 'idle' }
  | { state: 'loading'; fileName: string }
  | { state: 'error'; message: string }

export interface CustomizationState {
  image: PrintImage | null
  /** Posição, escala, rotação e encaixe da imagem, relativos à área de impressão. */
  transform: PrintTransform
  /** Região da caneca que recebe a imagem; independe da imagem e existe mesmo sem ela. */
  area: PrintArea
  changeKind: ChangeKind
  upload: UploadStatus
  /** Cor-base da cerâmica e cores próprias das partes, independentes da estampa e da área. */
  colors: MugColorSettings
}

/** O que "Redefinir" restaura (e o desfazer devolve). A imagem enviada não faz parte. */
export type CustomizationSnapshot = Pick<CustomizationState, 'transform' | 'area' | 'colors'>

export interface PrintSummary {
  printedSize: Size
  dpi: number
  quality: PrintQuality
  cropped: boolean
}

export type CustomizationAction =
  | { type: 'upload-start'; fileName: string }
  | { type: 'upload-success'; image: PrintImage }
  | { type: 'upload-error'; message: string }
  | { type: 'dismiss-error' }
  | { type: 'remove-image' }
  | { type: 'transform'; patch: Partial<PrintTransform>; kind: ChangeKind }
  | { type: 'reset-transform' }
  | { type: 'area'; area: PrintArea; kind: ChangeKind }
  | { type: 'area-shape'; shape: AreaShape }
  | { type: 'area-size'; dimension: AreaDimension; value: number }
  | { type: 'area-move'; offsetX?: number; offsetY?: number; kind: ChangeKind }
  | { type: 'area-side'; side: PrintSide }
  | { type: 'reset-area' }
  | { type: 'body-color'; color: string }
  | { type: 'reset-body-color' }
  | { type: 'part-color'; region: MugColorRegion; color: string }
  | { type: 'link-part'; region: MugColorRegion }
  | { type: 'link-all-parts' }
  | { type: 'reset-all' }
  | { type: 'restore'; snapshot: CustomizationSnapshot }

export const initialCustomizationState: CustomizationState = {
  image: null,
  transform: { ...DEFAULT_TRANSFORM },
  area: { ...DEFAULT_PRINT_AREA },
  changeKind: 'continuous',
  upload: { state: 'idle' },
  colors: DEFAULT_MUG_COLORS,
}

/** Dimensão da área ajustada por um controle: largura, altura ou escala geral (proporcional). */
export type AreaDimension = 'width' | 'height' | 'scale'

const AREA_RESIZERS: Record<AreaDimension, (area: PrintArea, value: number) => PrintArea> = {
  width: setAreaWidth,
  height: setAreaHeight,
  scale: setAreaScale,
}

const sameArea = (a: PrintArea, b: PrintArea) =>
  a.shape === b.shape && a.width === b.width && a.height === b.height && a.offsetX === b.offsetX && a.offsetY === b.offsetY

/**
 * Aplica uma área nova. A imagem mantém escala, rotação, encaixe e deslocamento em relação ao
 * centro da área; só é reposicionada se o centro dela ficar fora da área nova.
 */
function withArea(state: CustomizationState, next: PrintArea, kind: ChangeKind): CustomizationState {
  const area = clampArea(next)
  if (sameArea(area, state.area)) return state
  const clamped = clampTransform(state.transform, area)
  const transform =
    clamped.offsetX === state.transform.offsetX && clamped.offsetY === state.transform.offsetY ? state.transform : clamped
  return { ...state, area, transform, changeKind: kind }
}

const sameColors = (a: MugColorSettings, b: MugColorSettings) =>
  a.body === b.body && MUG_COLOR_REGIONS.every((region) => a.overrides[region] === b.overrides[region])

/** Aplica novas cores; o restante do estado (imagem, área, estampa) não é tocado. */
function withColors(state: CustomizationState, colors: MugColorSettings): CustomizationState {
  return sameColors(colors, state.colors) ? state : { ...state, colors }
}

/** Muda só a cor própria de uma parte (null volta a acompanhar a cor-base). */
function withOverride(state: CustomizationState, region: MugColorRegion, color: string | null): CustomizationState {
  return withColors(state, { ...state.colors, overrides: { ...state.colors.overrides, [region]: color } })
}

const sameTransform = (a: PrintTransform, b: PrintTransform) =>
  a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale && a.rotation === b.rotation && a.fit === b.fit

/** Indica se a personalização (estampa, área e cores) ainda está no padrão. */
export const isPristine = (state: CustomizationSnapshot) =>
  sameTransform(state.transform, DEFAULT_TRANSFORM) &&
  sameArea(state.area, DEFAULT_PRINT_AREA) &&
  sameColors(state.colors, DEFAULT_MUG_COLORS)

/** Restaura um conjunto de ajustes, mantendo a imagem atual (e o centro dela dentro da área). */
function withSnapshot(state: CustomizationState, snapshot: CustomizationSnapshot): CustomizationState {
  const area = clampArea(snapshot.area)
  return { ...state, area, transform: clampTransform(snapshot.transform, area), colors: snapshot.colors, changeKind: 'discrete' }
}

export function customizationReducer(state: CustomizationState, action: CustomizationAction): CustomizationState {
  switch (action.type) {
    case 'upload-start':
      return { ...state, upload: { state: 'loading', fileName: action.fileName } }
    case 'upload-success':
      // Uma imagem nova sempre começa encaixada e centralizada.
      return { ...state, image: action.image, transform: { ...DEFAULT_TRANSFORM }, changeKind: 'continuous', upload: { state: 'idle' } }
    case 'upload-error':
      return { ...state, upload: { state: 'error', message: action.message } }
    case 'dismiss-error':
      return state.upload.state === 'error' ? { ...state, upload: { state: 'idle' } } : state
    case 'remove-image':
      return {
        ...state,
        image: null,
        transform: { ...DEFAULT_TRANSFORM },
        changeKind: 'continuous',
        // Remover também cancela um envio em andamento.
        upload: state.upload.state === 'loading' ? { state: 'idle' } : state.upload,
      }
    case 'body-color': {
      // As partes vinculadas acompanham a nova cor-base; as que têm cor própria a mantêm.
      const color = parseHexColor(action.color)
      return color ? withColors(state, { ...state.colors, body: color }) : state
    }
    case 'reset-body-color':
      return withColors(state, { ...state.colors, body: DEFAULT_MUG_COLORS.body })
    case 'part-color': {
      const color = parseHexColor(action.color)
      return color ? withOverride(state, action.region, color) : state
    }
    case 'link-part':
      return withOverride(state, action.region, null)
    case 'link-all-parts':
      // "Aplicar a todas as partes": a caneca inteira volta a ter uma só cor, a cor-base.
      return withColors(state, { ...state.colors, overrides: { ...DEFAULT_MUG_COLORS.overrides } })
    case 'reset-all':
      return withSnapshot(state, { transform: DEFAULT_TRANSFORM, area: DEFAULT_PRINT_AREA, colors: DEFAULT_MUG_COLORS })
    case 'restore':
      return withSnapshot(state, action.snapshot)
    case 'transform':
      return { ...state, transform: clampTransform({ ...state.transform, ...action.patch }, state.area), changeKind: action.kind }
    case 'reset-transform':
      return { ...state, transform: { ...DEFAULT_TRANSFORM }, changeKind: 'discrete' }
    case 'area':
      return withArea(state, action.area, action.kind)
    case 'area-shape':
      return withArea(state, setAreaShape(state.area, action.shape), 'discrete')
    case 'area-size':
      return withArea(state, AREA_RESIZERS[action.dimension](state.area, action.value), 'continuous')
    case 'area-move':
      return withArea(
        state,
        moveArea(state.area, action.offsetX ?? state.area.offsetX, action.offsetY ?? state.area.offsetY),
        action.kind,
      )
    case 'area-side':
      return withArea(state, moveArea(state.area, getAreaSideOffset(action.side, state.area), state.area.offsetY), 'discrete')
    case 'reset-area':
      return withArea(state, { ...DEFAULT_PRINT_AREA }, 'discrete')
  }
}

function getMaxTextureSide() {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  return touch ? TEXTURE_MAX_SIDE.touch : TEXTURE_MAX_SIDE.default
}

const UNEXPECTED_ERROR = 'Ocorreu um erro inesperado ao carregar a imagem. Tente novamente.'

/** Estado da personalização: imagem, posicionamento da estampa, cores da caneca e status do envio. */
export function useMugCustomization() {
  const [state, dispatch] = useReducer(customizationReducer, initialCustomizationState)
  const latestRequest = useRef(0)
  const nextImageId = useRef(1)

  const loadFile = useCallback(async (file: File) => {
    const request = ++latestRequest.current
    dispatch({ type: 'upload-start', fileName: file.name })
    try {
      const header = await validateImageFile(file)
      const processed = await processImageFile(file, header.format, getMaxTextureSide())
      // Um arquivo escolhido depois deste já assumiu o lugar: descarta o resultado.
      if (request !== latestRequest.current) {
        releaseCanvas(processed.source)
        return
      }
      dispatch({
        type: 'upload-success',
        image: {
          id: nextImageId.current++,
          fileName: file.name,
          fileSize: file.size,
          format: header.format,
          aspect: processed.originalWidth / processed.originalHeight,
          ...processed,
        },
      })
    } catch (error) {
      if (request !== latestRequest.current) return
      if (!(error instanceof ImageFileError)) console.error(error)
      dispatch({ type: 'upload-error', message: error instanceof ImageFileError ? error.message : UNEXPECTED_ERROR })
    }
  }, [])

  const actions = useMemo(
    () => ({
      loadFile,
      removeImage: () => {
        latestRequest.current++
        dispatch({ type: 'remove-image' })
      },
      dismissError: () => dispatch({ type: 'dismiss-error' }),
      updateTransform: (patch: Partial<PrintTransform>, kind: ChangeKind = 'continuous') =>
        dispatch({ type: 'transform', patch, kind }),
      setFit: (fit: FitMode) => dispatch({ type: 'transform', patch: { fit }, kind: 'discrete' }),
      center: () => dispatch({ type: 'transform', patch: { offsetX: 0, offsetY: 0 }, kind: 'discrete' }),
      reset: () => dispatch({ type: 'reset-transform' }),
      setArea: (area: PrintArea, kind: ChangeKind = 'continuous') => dispatch({ type: 'area', area, kind }),
      setAreaShape: (shape: AreaShape) => dispatch({ type: 'area-shape', shape }),
      setAreaSize: (dimension: AreaDimension, value: number) => dispatch({ type: 'area-size', dimension, value }),
      moveArea: (offset: { offsetX?: number; offsetY?: number }, kind: ChangeKind = 'continuous') =>
        dispatch({ type: 'area-move', ...offset, kind }),
      placeAreaOnSide: (side: PrintSide) => dispatch({ type: 'area-side', side }),
      centerArea: () => dispatch({ type: 'area-move', offsetX: 0, offsetY: 0, kind: 'discrete' }),
      resetArea: () => dispatch({ type: 'reset-area' }),
      setBodyColor: (color: string) => dispatch({ type: 'body-color', color }),
      resetBodyColor: () => dispatch({ type: 'reset-body-color' }),
      setPartColor: (region: MugColorRegion, color: string) => dispatch({ type: 'part-color', region, color }),
      linkPart: (region: MugColorRegion) => dispatch({ type: 'link-part', region }),
      linkAllParts: () => dispatch({ type: 'link-all-parts' }),
      resetAll: () => dispatch({ type: 'reset-all' }),
      restore: (snapshot: CustomizationSnapshot) => dispatch({ type: 'restore', snapshot }),
    }),
    [loadFile],
  )

  const summary = useMemo<PrintSummary | null>(() => {
    if (!state.image) return null
    const printedSize = getPrintedSize(getImagePixels(state.image), state.transform, state.area)
    const dpi = getEffectiveDpi(state.image.originalWidth, state.image.originalHeight, printedSize)
    return {
      printedSize,
      dpi,
      quality: getPrintQuality(dpi),
      cropped: isImageCropped(state.area, state.transform, printedSize),
    }
  }, [state.image, state.transform, state.area])

  return { state, summary, actions }
}

export type CustomizationActions = ReturnType<typeof useMugCustomization>['actions']
