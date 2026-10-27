import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentProps } from 'react'
import * as THREE from 'three'
import { MUG } from '../../config/mugSpec'

/** Fração de cada lado do softbox ocupada pela transição suave da borda. */
const SOFT_EDGE = 0.2

/**
 * Textura de alfa com bordas esfumadas, como o difusor de um softbox. Além de mais realista,
 * evita o serrilhado das bordas no reflexo do verniz, que é liso o bastante para revelá-lo.
 */
function createSoftEdgeTexture(size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const image = context.createImageData(size, size)
  const fade = (t: number) => {
    const x = THREE.MathUtils.clamp(t / SOFT_EDGE, 0, 1)
    return x * x * (3 - 2 * x)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const index = (y * size + x) * 4
      image.data.set([255, 255, 255, Math.round(255 * fade(Math.min(u, 1 - u)) * fade(Math.min(v, 1 - v)))], index)
    }
  }
  context.putImageData(image, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

type SoftboxProps = Omit<ComponentProps<typeof Lightformer>, 'form' | 'map' | 'children'> & {
  texture: THREE.Texture
  intensity: number
}

function Softbox({ texture, intensity, color = '#ffffff', ...props }: SoftboxProps) {
  const emission = useMemo(() => new THREE.Color(color as THREE.ColorRepresentation).multiplyScalar(intensity), [color, intensity])
  return (
    <Lightformer form="rect" {...props}>
      <meshBasicMaterial
        color={emission}
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </Lightformer>
  )
}

/**
 * Iluminação de estúdio.
 *
 * O ambiente é gerado localmente a partir de "softboxes" (Lightformers), sem baixar mapas HDR.
 * Luzes e reflexos acompanham o giro horizontal da câmera, como num estúdio em que o produto
 * gira sobre uma base: a face voltada para o usuário fica sempre bem iluminada e os reflexos
 * não passam por cima da estampa de forma imprevisível.
 */
export function StudioLighting() {
  const rig = useRef<THREE.Group>(null)
  const keyLight = useRef<THREE.DirectionalLight>(null)
  const lightTarget = useRef<THREE.Object3D>(null)
  const softEdge = useMemo(() => createSoftEdgeTexture(), [])
  useEffect(() => () => softEdge.dispose(), [softEdge])

  useLayoutEffect(() => {
    if (keyLight.current && lightTarget.current) keyLight.current.target = lightTarget.current
  }, [])

  useFrame(({ camera, scene }) => {
    const yaw = Math.atan2(camera.position.x, camera.position.z)
    if (rig.current) rig.current.rotation.y = yaw
    scene.environmentRotation.y = yaw
  })

  return (
    <>
      {/* O estúdio é desenhado para uma câmera em +Z olhando para a origem. */}
      {/* Renderizado uma única vez; a resolução maior deixa nítidos os reflexos no esmalte. */}
      <Environment resolution={512} frames={1}>
        {/* Luz ambiente do estúdio, refletida onde não há softbox. */}
        <color attach="background" args={['#6f6f70']} />
        {/* Softbox principal, à esquerda e acima. */}
        <Softbox texture={softEdge} intensity={4} position={[-7, 6, 5]} scale={[5, 7]} />
        {/* Rebatedor à direita, que suaviza o lado oposto à luz principal. */}
        <Softbox texture={softEdge} intensity={2.4} position={[8, 2, 4]} scale={[4, 8]} />
        {/* Luz de topo: ilumina a borda e o interior. */}
        <Softbox texture={softEdge} intensity={2.6} position={[0, 10, 1]} scale={[10, 8]} />
        {/* Faixas de contorno atrás do produto, que desenham a silhueta. */}
        <Softbox texture={softEdge} intensity={3} position={[-6, 3, -7]} scale={[1.4, 12]} />
        <Softbox texture={softEdge} intensity={3} position={[6, 3, -7]} scale={[1.4, 12]} />
        {/* Parede frontal discreta e rebatimento quente da mesa. */}
        <Softbox texture={softEdge} intensity={0.6} position={[0, 3, 10]} scale={[16, 10]} />
        <Softbox texture={softEdge} intensity={0.9} color="#f3eee7" position={[0, -8, 0]} scale={[18, 18]} />
      </Environment>

      <group ref={rig}>
        {/* Intensidades em unidades físicas: a parcela difusa é dividida por π. */}
        <directionalLight
          ref={keyLight}
          castShadow
          position={[-7, 13, 9]}
          intensity={2.6}
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.035}
          shadow-radius={8}
        >
          <orthographicCamera attach="shadow-camera" args={[-9, 9, 9, -9, 1, 60]} />
        </directionalLight>
        <object3D ref={lightTarget} position={[0, MUG.height / 2, 0]} />
      </group>
    </>
  )
}
