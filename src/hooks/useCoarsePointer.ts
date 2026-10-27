import { useSyncExternalStore } from 'react'

const query = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null

const subscribe = (onChange: () => void) => {
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Indica se o dispositivo usa principalmente toque, para adaptar dicas de interação. */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false)
}
