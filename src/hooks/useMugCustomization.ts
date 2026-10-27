import { useCallback, useMemo, useReducer, useRef } from 'react'
import { DEFAULT_MUG_COLORS, type MugColorRegion, type MugColors } from '../config/mugColors'
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
  /** Cores da alça, da borda e do interior, independentes entre si e da estampa. */
  colors: MugColors
}

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
  | { type: 'color'; region: MugColorRegion; color: string }
  | { type: 'reset-color'; region: MugColorRegion }

export const initialCustomizationState: CustomizationState = {
  image: null,
  transform: { ...DEFAULT_TRANSFORM },
  area: { ...DEFAULT_PRINT_AREA },
  changeKind: 'continuous',
  upload: { state: 'idle' },
  colors: { ...DEFAULT_MUG_COLORS },
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

function withColor(state: CustomizationState, region: MugColorRegion, color: string): CustomizationState {
  // Só a região indicada muda; as outras cores e o restante do estado ficam como estão.
  return state.colors[region] === color ? state : { ...state, colors: { ...state.colors, [region]: color } }
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
    case 'color': {
      const color = parseHexColor(action.color)
      return color ? withColor(state, action.region, color) : state
    }
    case 'reset-color':
      return withColor(state, action.region, DEFAULT_MUG_COLORS[action.region])
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
      setColor: (region: MugColorRegion, color: string) => dispatch({ type: 'color', region, color }),
      resetColor: (region: MugColorRegion) => dispatch({ type: 'reset-color', region }),
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
