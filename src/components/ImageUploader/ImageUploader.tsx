import { forwardRef, useImperativeHandle, useRef } from 'react'
import { IMAGE_LIMITS } from '../../config/mugSpec'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import type { PrintImage, UploadStatus } from '../../hooks/useMugCustomization'
import { formatFileSize, formatInteger } from '../../lib/format'
import { FORMAT_LABELS } from '../../lib/imageFile'
import { Icon } from '../ui/Icon'

export interface ImageUploaderHandle {
  /** Abre o seletor de arquivos do dispositivo. */
  open(): void
}

interface ImageUploaderProps {
  image: PrintImage | null
  status: UploadStatus
  onFile(file: File): void
  onRemove(): void
  onDismissError(): void
}

const ACCEPT = [...IMAGE_LIMITS.acceptedMimeTypes, ...IMAGE_LIMITS.acceptedExtensions].join(',')
const LIMIT_HINT = `PNG, JPEG ou WebP, até ${formatFileSize(IMAGE_LIMITS.maxFileBytes)}`

export const ImageUploader = forwardRef<ImageUploaderHandle, ImageUploaderProps>(function ImageUploader(
  { image, status, onFile, onRemove, onDismissError },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const open = () => inputRef.current?.click()
  useImperativeHandle(ref, () => ({ open }), [])
  const touch = useCoarsePointer()

  const loading = status.state === 'loading'

  return (
    <div className="uploader">
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

      {image ? (
        <div className="image-card">
          <div className={`image-card__thumb${image.hasTransparency ? ' image-card__thumb--transparent' : ''}`}>
            <img src={image.thumbnailUrl} alt={`Miniatura de ${image.fileName}`} />
          </div>
          <div className="image-card__body">
            <p className="image-card__name" title={image.fileName}>
              {image.fileName}
            </p>
            <p className="image-card__meta">
              {FORMAT_LABELS[image.format]} · {formatInteger(image.originalWidth)} × {formatInteger(image.originalHeight)} px
              · {formatFileSize(image.fileSize)}
            </p>
            <div className="image-card__actions">
              <button type="button" className="button button--secondary button--small" onClick={open} disabled={loading}>
                <Icon name="replace" size={16} />
                Substituir
              </button>
              <button type="button" className="button button--ghost-danger button--small" onClick={onRemove}>
                <Icon name="trash" size={16} />
                Remover
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="dropzone" onClick={open} disabled={loading} aria-describedby="upload-hint">
          <span className="dropzone__icon">
            <Icon name="upload" size={22} />
          </span>
          <span className="dropzone__title">Adicionar imagem</span>
          <span className="dropzone__hint" id="upload-hint">
            {touch ? 'Toque para escolher um arquivo' : 'Clique ou arraste um arquivo'} · {LIMIT_HINT}
          </span>
        </button>
      )}

      {loading && (
        <p className="upload-status" role="status">
          <span className="spinner spinner--small" aria-hidden="true" />
          Processando <strong>{status.fileName}</strong>…
        </p>
      )}

      {status.state === 'error' && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} className="alert__icon" />
          <p className="alert__text">{status.message}</p>
          <button type="button" className="icon-button icon-button--small" onClick={onDismissError} aria-label="Fechar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
})
