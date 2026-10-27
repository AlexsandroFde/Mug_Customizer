import { useThree } from '@react-three/fiber'
import { forwardRef, useImperativeHandle } from 'react'
import type * as THREE from 'three'
import type { PrintUniforms } from './MugTexture'

export interface SceneCaptureHandle {
  /** Renderiza a vista atual sem guias nem destaques e devolve um PNG com fundo transparente. */
  capture(): Promise<Blob | null>
}

const materialsOf = (object: THREE.Object3D): THREE.Material[] => {
  const material = (object as THREE.Mesh).material
  return Array.isArray(material) ? material : material ? [material] : []
}

/**
 * Exportação da imagem final. Guias de edição e destaques de seleção são desligados só durante
 * a renderização usada na captura e restaurados em seguida, sem passar pelo estado do React
 * (a tela não pisca nem perde o que o usuário estava fazendo).
 */
export const SceneCapture = forwardRef<SceneCaptureHandle>(function SceneCapture(_, ref) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useImperativeHandle(
    ref,
    () => ({
      capture() {
        const restore: Array<() => void> = []
        scene.traverse((object) => {
          for (const material of materialsOf(object)) {
            const uniforms = material.userData.printUniforms as PrintUniforms | undefined
            if (uniforms) {
              const guides = uniforms.uGuides.value
              uniforms.uGuides.value = 0
              restore.push(() => (uniforms.uGuides.value = guides))
            }
            const emissive = (material as THREE.MeshStandardMaterial).emissive
            if (emissive) {
              const previous = emissive.clone()
              emissive.setRGB(0, 0, 0)
              restore.push(() => emissive.copy(previous))
            }
          }
        })
        gl.render(scene, camera)
        // toBlob copia o conteúdo da tela no momento da chamada; a codificação segue em segundo plano.
        const blob = new Promise<Blob | null>((resolve) => gl.domElement.toBlob(resolve, 'image/png'))
        restore.forEach((undo) => undo())
        invalidate()
        return blob
      },
    }),
    [gl, scene, camera, invalidate],
  )

  return null
})
