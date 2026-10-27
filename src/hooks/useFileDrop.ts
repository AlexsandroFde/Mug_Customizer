import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * Aceita arquivos soltos em qualquer ponto da página e indica quando há um arquivo sendo arrastado.
 * Também impede que o navegador abra o arquivo solto no lugar da aplicação.
 */
export function useFileDrop(onFile: (file: File) => void) {
  const [active, setActive] = useState(false)
  const latestOnFile = useRef(onFile)
  useLayoutEffect(() => {
    latestOnFile.current = onFile
  })

  useEffect(() => {
    // dragenter/dragleave disparam a cada elemento filho; o contador evita piscadas.
    let depth = 0

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      setActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      setActive(false)
      const file = event.dataTransfer?.files[0]
      if (file) latestOnFile.current(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return active
}
