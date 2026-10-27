import { useCallback, useMemo, useReducer, useRef } from 'react'
import { TEXTURE_MAX_SIDE } from '../config/mugSpec'
import { ImageFileError, validateImageFile, type ImageFormat } from '../lib/imageFile'
import { processImageFile, releaseCanvas } from '../lib/imageProcessing'
import {
  clampTransform,
  DEFAULT_TRANSFORM,
  getEffectiveDpi,
  getPrintedSize,
  getPrintQuality,
  getSideOffset,
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

/** Mudanças contínuas (arraste, sliders) aparecem na hora; as discretas (botões) são animadas na cena 3D. */
export type ChangeKind = 'continuous' | 'discrete'

export type UploadStatus =
  | { state: 'idle' }
  | { state: 'loading'; fileName: string }
  | { state: 'error'; message: string }

export interface CustomizationState {
  image: PrintImage | null
  transform: PrintTransform
  changeKind: ChangeKind
  upload: UploadStatus
}

export interface PrintSummary {
  printedSize: Size
  dpi: number
  quality: PrintQuality
  cropped: boolean
}

type Action =
  | { type: 'upload-start'; fileName: string }
  | { type: 'upload-success'; image: PrintImage }
  | { type: 'upload-error'; message: string }
  | { type: 'dismiss-error' }
  | { type: 'remove-image' }
  | { type: 'transform'; patch: Partial<PrintTransform>; kind: ChangeKind }
  | { type: 'place-side'; side: PrintSide }
  | { type: 'reset-transform' }

const initialState: CustomizationState = {
  image: null,
  transform: { ...DEFAULT_TRANSFORM },
  changeKind: 'continuous',
  upload: { state: 'idle' },
}

function reducer(state: CustomizationState, action: Action): CustomizationState {
  switch (action.type) {
    case 'upload-start':
      return { ...state, upload: { state: 'loading', fileName: action.fileName } }
    case 'upload-success':
      // Uma imagem nova sempre começa encaixada e centralizada.
      return { image: action.image, transform: { ...DEFAULT_TRANSFORM }, changeKind: 'continuous', upload: { state: 'idle' } }
    case 'upload-error':
      return { ...state, upload: { state: 'error', message: action.message } }
    case 'dismiss-error':
      return state.upload.state === 'error' ? { ...state, upload: { state: 'idle' } } : state
    case 'remove-image':
      return {
        image: null,
        transform: { ...DEFAULT_TRANSFORM },
        changeKind: 'continuous',
        // Remover também cancela um envio em andamento.
        upload: state.upload.state === 'loading' ? { state: 'idle' } : state.upload,
      }
    case 'transform':
      return { ...state, transform: clampTransform({ ...state.transform, ...action.patch }), changeKind: action.kind }
    case 'place-side': {
      if (!state.image) return state
      const size = getPrintedSize(state.image.aspect, state.transform)
      const offsetX = getSideOffset(action.side, state.transform.rotation, size)
      return { ...state, transform: clampTransform({ ...state.transform, offsetX }), changeKind: 'discrete' }
    }
    case 'reset-transform':
      return { ...state, transform: { ...DEFAULT_TRANSFORM }, changeKind: 'discrete' }
  }
}

function getMaxTextureSide() {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  return touch ? TEXTURE_MAX_SIDE.touch : TEXTURE_MAX_SIDE.default
}

const UNEXPECTED_ERROR = 'Ocorreu um erro inesperado ao carregar a imagem. Tente novamente.'

/** Estado da personalização: imagem escolhida, posicionamento da estampa e status do envio. */
export function useMugCustomization() {
  const [state, dispatch] = useReducer(reducer, initialState)
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
      placeOnSide: (side: PrintSide) => dispatch({ type: 'place-side', side }),
      center: () => dispatch({ type: 'transform', patch: { offsetX: 0, offsetY: 0 }, kind: 'discrete' }),
      reset: () => dispatch({ type: 'reset-transform' }),
    }),
    [loadFile],
  )

  const summary = useMemo<PrintSummary | null>(() => {
    if (!state.image) return null
    const printedSize = getPrintedSize(state.image.aspect, state.transform)
    const dpi = getEffectiveDpi(state.image.originalWidth, state.image.originalHeight, printedSize)
    return { printedSize, dpi, quality: getPrintQuality(dpi), cropped: isImageCropped(state.transform, printedSize) }
  }, [state.image, state.transform])

  return { state, summary, actions }
}

export type CustomizationActions = ReturnType<typeof useMugCustomization>['actions']
