import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'
import { buildTerrainChunk } from '@/lib/terrain/terrain-chunk'
import { createTerrainMaterial } from '@/lib/terrain/terrain-material'
import { loadTerrainTextureSet } from '@/lib/terrain/terrain-textures'

type TerrainRendererProps = NonNullable<
  ConstructorParameters<typeof WebGPURenderer>[0]
> & {
  canvas: HTMLCanvasElement | OffscreenCanvas
  powerPreference?: GPUPowerPreference
}

export interface TerrainSceneProps {
  onBackendChange?: (backend: string) => void
  onReadyChange?: (ready: boolean) => void
}

export function TerrainScene({
  onBackendChange,
  onReadyChange,
}: TerrainSceneProps) {
  return (
    <Canvas
      camera={{ far: 500, fov: 42, near: 0.1, position: [86, 64, 104] }}
      className="absolute inset-0 h-full w-full"
      dpr={[1, 2]}
      gl={createTerrainRenderer}
      shadows
    >
      <color attach="background" args={['#0b1015']} />
      <fog attach="fog" args={['#95a3af', 125, 285]} />
      <TerrainWorld
        onBackendChange={onBackendChange}
        onReadyChange={onReadyChange}
      />
    </Canvas>
  )
}

async function createTerrainRenderer(defaultProps: unknown) {
  const rendererProps = defaultProps as TerrainRendererProps
  const renderer = new WebGPURenderer({
    ...rendererProps,
    antialias: true,
  })

  await renderer.init()

  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  return renderer
}

function TerrainWorld({ onBackendChange, onReadyChange }: TerrainSceneProps) {
  const gl = useThree((state) => state.gl)

  const terrainChunk = useMemo(() => buildTerrainChunk(), [])
  const [isMaterialReady, setIsMaterialReady] = useState(false)
  const [terrainMaterial, setTerrainMaterial] = useState<ReturnType<
    typeof createTerrainMaterial
  > | null>(null)

  useEffect(() => {
    const backend =
      'backend' in gl &&
      (gl as { backend?: { isWebGPUBackend?: boolean } }).backend
        ?.isWebGPUBackend
        ? 'WebGPU'
        : 'WebGL2 fallback'

    onBackendChange?.(backend)
  }, [gl, onBackendChange])

  useEffect(() => {
    let isMounted = true

    loadTerrainTextureSet(gl as Parameters<typeof loadTerrainTextureSet>[0])
      .then((textures) => {
        if (!isMounted) {
          return
        }

        const nextMaterial = createTerrainMaterial(textures)
        setTerrainMaterial(nextMaterial)
        setIsMaterialReady(true)
        onReadyChange?.(true)
      })
      .catch((error: unknown) => {
        console.error('Failed to load terrain textures.', error)
      })

    return () => {
      isMounted = false
      onReadyChange?.(false)
    }
  }, [gl, onReadyChange])

  useEffect(() => {
    return () => {
      terrainChunk.geometry.dispose()
    }
  }, [terrainChunk.geometry])

  useEffect(() => {
    return () => {
      terrainMaterial?.dispose()
    }
  }, [terrainMaterial])

  return (
    <>
      <ambientLight intensity={0.28} />
      <hemisphereLight
        args={['#d4def0', '#231a15', 1.15]}
        groundColor="#30251f"
      />
      <directionalLight
        castShadow
        color="#ffe4bf"
        intensity={2.8}
        position={[56, 82, 42]}
        shadow-bias={-0.00008}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <mesh geometry={terrainChunk.geometry} receiveShadow>
        {terrainMaterial ? (
          <primitive attach="material" object={terrainMaterial} />
        ) : (
          <meshStandardMaterial
            color="#616971"
            metalness={0.02}
            roughness={0.95}
          />
        )}
      </mesh>
      <mesh
        position={[0, -0.35, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[160, 64]} />
        <meshStandardMaterial color="#14191f" roughness={1} />
      </mesh>
      <OrbitCamera />
      {isMaterialReady ? null : (
        <mesh position={[0, 26, -46]}>
          <planeGeometry args={[26, 6]} />
          <meshBasicMaterial color="#10161d" opacity={0.35} transparent />
        </mesh>
      )}
    </>
  )
}

function OrbitCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const controls = useMemo(() => {
    const nextControls = new OrbitControls(camera, gl.domElement)
    nextControls.enableDamping = true
    nextControls.dampingFactor = 0.06
    nextControls.maxDistance = 220
    nextControls.maxPolarAngle = Math.PI * 0.46
    nextControls.minDistance = 36
    nextControls.minPolarAngle = Math.PI * 0.12
    nextControls.target.set(0, 12, 0)

    return nextControls
  }, [camera, gl.domElement])

  useEffect(() => {
    return () => {
      controls.dispose()
    }
  }, [controls])

  useFrame(() => {
    controls.update()
  })

  return null
}
