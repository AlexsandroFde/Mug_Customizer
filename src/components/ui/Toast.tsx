import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

export interface ToastMessage {
  /** Muda a cada aviso, para reiniciar o tempo de exibição. */
  id: number
  text: string
  action?: { label: string; run(): void }
}

interface ToastProps {
  message: ToastMessage | null
  onDismiss(): void
  /** Tempo de exibição; pausa enquanto o ponteiro ou o foco estiverem no aviso. */
  duration?: number
}

/** Aviso breve e não bloqueante, com uma ação opcional (como desfazer). */
export function Toast({ message, onDismiss, duration = 7000 }: ToastProps) {
  const timer = useRef<number | undefined>(undefined)
  const latestDismiss = useRef(onDismiss)
  useEffect(() => {
    latestDismiss.current = onDismiss
  })

  const start = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => latestDismiss.current(), duration)
  }
  const pause = () => window.clearTimeout(timer.current)

  useEffect(() => {
    if (!message) return
    timer.current = window.setTimeout(() => latestDismiss.current(), duration)
    return () => window.clearTimeout(timer.current)
  }, [message, duration])

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast" onPointerEnter={pause} onPointerLeave={start} onFocus={pause} onBlur={start}>
          <span className="toast__text">{message.text}</span>
          {message.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                message.action!.run()
                onDismiss()
              }}
            >
              {message.action.label}
            </button>
          )}
          <button type="button" className="toast__close" onClick={onDismiss} aria-label="Fechar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
