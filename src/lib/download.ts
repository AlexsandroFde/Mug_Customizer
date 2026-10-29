/** Baixa um arquivo gerado no navegador e libera o endereço temporário em seguida. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // O download já começou; o endereço temporário pode ser liberado logo depois.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
