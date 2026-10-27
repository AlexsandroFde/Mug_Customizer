import { forwardRef, useImperativeHandle, useRef } from 'react'
import { IMAGE_LIMITS } from '../../config/mugSpec'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import type { PrintImage, UploadStatus } from '../../hooks/useMugCustomization'
import { formatFileSize, formatInteger } from '../../lib/format'
import { FORMAT_LABELS } from '../../lib/imageFile'
import { Icon } from '../ui/Icon'

export interface ImageFileInputHandle {
  /** Abre o seletor de arquivos do dispositivo. */
  open(): void
}

const ACCEPT = [...IMAGE_LIMITS.acceptedMimeTypes, ...IMAGE_LIMITS.acceptedExtensions].join(',')
const LIMIT_HINT = `PNG, JPEG ou WebP, até ${formatFileSize(IMAGE_LIMITS.maxFileBytes)}`

/** Campo de arquivo invisível, montado uma única vez e aberto por qualquer botão da interface. */
export const ImageFileInput = forwardRef<ImageFileInputHandle, { onFile(file: File): void }>(function ImageFileInput(
  { onFile },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), [])
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        // Limpa o valor para permitir escolher o mesmo arquivo de novo.
        event.target.value = ''
        if (file) onFile(file)
      }}
    />
  )
})

interface ImageUploaderProps {
  image: PrintImage | null
  status: UploadStatus
  onOpen(): void
  onRemove(): void
  onDismissError(): void
}

/** Imagem atual (com substituir e remover) ou, sem imagem, a área para adicionar uma. */
export function ImageUploader({ image, status, onOpen, onRemove, onDismissError }: ImageUploaderProps) {
  const touch = useCoarsePointer()
  const loading = status.state === 'loading'

  return (
    <div className="uploader">
      {image ? (
        <div className="image-row">
          <div className={`image-row__thumb${image.hasTransparency ? ' checkerboard' : ''}`}>
            <img src={image.thumbnailUrl} alt="" />
          </div>
          <div className="image-row__body">
            <p className="image-row__name" title={image.fileName}>
              {image.fileName}
            </p>
            <p className="image-row__meta">
              {FORMAT_LABELS[image.format]} · {formatInteger(image.originalWidth)} × {formatInteger(image.originalHeight)} px ·{' '}
              {formatFileSize(image.fileSize)}
            </p>
          </div>
          <div className="image-row__actions">
            <button type="button" className="button button--ghost button--sm" onClick={onOpen} disabled={loading}>
              Substituir
            </button>
            <button
              type="button"
              className="icon-button icon-button--danger"
              onClick={onRemove}
              aria-label={`Remover a imagem ${image.fileName}`}
              title="Remover imagem"
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dropzone" onClick={onOpen} disabled={loading} aria-describedby="upload-hint">
          <span className="dropzone__icon">
            <Icon name="upload" size={20} />
          </span>
          <span className="dropzone__title">Adicionar imagem</span>
          <span className="dropzone__hint" id="upload-hint">
            {touch ? 'Toque para escolher um arquivo' : 'Clique ou arraste um arquivo para a página'} · {LIMIT_HINT}
          </span>
        </button>
      )}

      {loading && (
        <p className="inline-status" role="status">
          <span className="spinner spinner--sm" aria-hidden="true" />
          Processando {status.fileName}…
        </p>
      )}

      {status.state === 'error' && (
        <div className="alert" role="alert">
          <Icon name="alert" size={18} className="alert__icon" />
          <p className="alert__text">{status.message}</p>
          <button type="button" className="icon-button icon-button--sm" onClick={onDismissError} aria-label="Fechar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
