import {
  createTerrainChunkGeometry,
  DEFAULT_TERRAIN_CHUNK_RESOLUTION,
  DEFAULT_TERRAIN_CHUNK_SIZE,
  type TerrainChunkStats,
} from '@/lib/terrain/terrain-chunk'
import { createTerrainMaterial } from '@/lib/terrain/terrain-material'
import {
  getChunkAnchor,
  selectChunkWindow,
  shouldRefreshChunkWindow,
  type TerrainChunkAnchor,
  type TerrainChunkDescriptor,
} from '@/lib/terrain/terrain-streaming'
import { loadTerrainTextureSet } from '@/lib/terrain/terrain-textures'
import { TerrainChunkWorkerPool } from '@/lib/terrain/terrain-worker-pool'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'

type TerrainRendererProps = NonNullable<
  ConstructorParameters<typeof WebGPURenderer>[0]
> & {
  canvas: HTMLCanvasElement | OffscreenCanvas
  powerPreference?: GPUPowerPreference
}

export interface TerrainSceneProps {
  cameraMode: CameraMode
  onBackendChange?: (backend: string) => void
  onReadyChange?: (ready: boolean) => void
}

export type CameraMode = 'fly' | 'orbit'

interface TerrainChunkRuntime extends TerrainChunkDescriptor {
  geometry: ReturnType<typeof createTerrainChunkGeometry>
  stats: TerrainChunkStats
}

const INITIAL_FLY_CAMERA_POSITION = [10, 9, 20] as const
const INITIAL_ORBIT_CAMERA_POSITION = [96, 48, 96] as const
const TERRAIN_LOD_RESOLUTIONS = [
  DEFAULT_TERRAIN_CHUNK_RESOLUTION,
  DEFAULT_TERRAIN_CHUNK_RESOLUTION,
  DEFAULT_TERRAIN_CHUNK_RESOLUTION,
] as const
const TERRAIN_STREAM_RADIUS = TERRAIN_LOD_RESOLUTIONS.length - 1

export function TerrainScene({
  cameraMode,
  onBackendChange,
  onReadyChange,
}: TerrainSceneProps) {
  return (
    <Canvas
      camera={{
        far: 900,
        fov: 42,
        near: 0.1,
        position: [...INITIAL_ORBIT_CAMERA_POSITION],
      }}
      className="absolute inset-0 h-full w-full"
      dpr={[1, 2]}
      gl={createTerrainRenderer}
      shadows
    >
      <color attach="background" args={['#0b1015']} />
      <fog attach="fog" args={['#95a3af', 150, 520]} />
      <TerrainWorld
        cameraMode={cameraMode}
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

function TerrainWorld({
  cameraMode,
  onBackendChange,
  onReadyChange,
}: TerrainSceneProps) {
  const gl = useThree((state) => state.gl)

  const [isMaterialReady, setIsMaterialReady] = useState(false)
  const [chunkAnchor, setChunkAnchor] = useState<TerrainChunkAnchor>(() =>
    getChunkAnchor(
      INITIAL_ORBIT_CAMERA_POSITION[0],
      INITIAL_ORBIT_CAMERA_POSITION[2],
      DEFAULT_TERRAIN_CHUNK_SIZE
    )
  )
  const [terrainChunks, setTerrainChunks] = useState<
    Record<string, TerrainChunkRuntime>
  >({})
  const [terrainMaterial, setTerrainMaterial] = useState<ReturnType<
    typeof createTerrainMaterial
  > | null>(null)
  const desiredChunkDescriptors = useMemo(
    () =>
      selectChunkWindow(
        chunkAnchor,
        DEFAULT_TERRAIN_CHUNK_SIZE,
        TERRAIN_STREAM_RADIUS,
        TERRAIN_LOD_RESOLUTIONS
      ),
    [chunkAnchor]
  )
  const desiredChunkLookupRef = useRef(
    new Map<string, TerrainChunkDescriptor>()
  )
  const inflightChunkLookupRef = useRef(new Map<string, number>())
  const terrainChunksRef = useRef<Record<string, TerrainChunkRuntime>>({})
  const workerPoolRef = useRef<TerrainChunkWorkerPool | null>(null)
  const isTerrainWindowReady = desiredChunkDescriptors.every((terrainChunk) => {
    const loadedChunk = terrainChunks[terrainChunk.key]
    return loadedChunk?.resolution === terrainChunk.resolution
  })
  const isSceneReady = isMaterialReady && isTerrainWindowReady

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
      })
      .catch((error: unknown) => {
        console.error('Failed to load terrain textures.', error)
      })

    return () => {
      isMounted = false
    }
  }, [gl, onReadyChange])

  useEffect(() => {
    terrainChunksRef.current = terrainChunks
  }, [terrainChunks])

  useEffect(() => {
    onReadyChange?.(isSceneReady)
  }, [isSceneReady, onReadyChange])

  useEffect(() => {
    const workerPool = new TerrainChunkWorkerPool()
    workerPoolRef.current = workerPool

    return () => {
      workerPoolRef.current = null
      workerPool.destroy()

      for (const terrainChunk of Object.values(terrainChunksRef.current)) {
        terrainChunk.geometry.dispose()
      }
    }
  }, [])

  useEffect(() => {
    desiredChunkLookupRef.current = new Map(
      desiredChunkDescriptors.map((terrainChunk) => [
        terrainChunk.key,
        terrainChunk,
      ])
    )

    setTerrainChunks((currentTerrainChunks) => {
      const nextTerrainChunks = { ...currentTerrainChunks }

      for (const terrainChunkKey of Object.keys(nextTerrainChunks)) {
        if (desiredChunkLookupRef.current.has(terrainChunkKey)) {
          continue
        }

        nextTerrainChunks[terrainChunkKey]?.geometry.dispose()
        delete nextTerrainChunks[terrainChunkKey]
        inflightChunkLookupRef.current.delete(terrainChunkKey)
      }

      terrainChunksRef.current = nextTerrainChunks
      return nextTerrainChunks
    })

    const workerPool = workerPoolRef.current

    if (!workerPool) {
      return
    }

    const prioritizedChunks = [...desiredChunkDescriptors].sort(
      (left, right) => {
        if (left.lodLevel !== right.lodLevel) {
          return left.lodLevel - right.lodLevel
        }

        if (left.gridDistance !== right.gridDistance) {
          return left.gridDistance - right.gridDistance
        }

        if (left.gridZ !== right.gridZ) {
          return left.gridZ - right.gridZ
        }

        return left.gridX - right.gridX
      }
    )

    for (const terrainChunk of prioritizedChunks) {
      const loadedChunk = terrainChunksRef.current[terrainChunk.key]
      const inflightResolution = inflightChunkLookupRef.current.get(
        terrainChunk.key
      )

      if (loadedChunk?.resolution === terrainChunk.resolution) {
        continue
      }

      if (inflightResolution === terrainChunk.resolution) {
        continue
      }

      inflightChunkLookupRef.current.set(
        terrainChunk.key,
        terrainChunk.resolution
      )

      workerPool
        .requestChunk({
          offsetX: terrainChunk.worldX,
          offsetZ: terrainChunk.worldZ,
          resolution: terrainChunk.resolution,
          size: DEFAULT_TERRAIN_CHUNK_SIZE,
        })
        .then((chunkBuffers) => {
          inflightChunkLookupRef.current.delete(terrainChunk.key)

          const desiredChunk = desiredChunkLookupRef.current.get(
            terrainChunk.key
          )

          if (
            !desiredChunk ||
            desiredChunk.resolution !== terrainChunk.resolution
          ) {
            return
          }

          const geometry = createTerrainChunkGeometry(chunkBuffers)

          setTerrainChunks((currentTerrainChunks) => {
            const activeChunk = currentTerrainChunks[terrainChunk.key]

            if (activeChunk?.resolution === desiredChunk.resolution) {
              geometry.dispose()
              return currentTerrainChunks
            }

            if (activeChunk) {
              activeChunk.geometry.dispose()
            }

            const nextTerrainChunks = {
              ...currentTerrainChunks,
              [terrainChunk.key]: {
                ...desiredChunk,
                geometry,
                stats: chunkBuffers.stats,
              },
            }

            terrainChunksRef.current = nextTerrainChunks
            return nextTerrainChunks
          })
        })
        .catch((error: unknown) => {
          inflightChunkLookupRef.current.delete(terrainChunk.key)
          console.error('Failed to build terrain chunk in worker.', error)
        })
    }
  }, [desiredChunkDescriptors])

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
      {Object.values(terrainChunks).map((terrainChunk) => (
        <mesh
          geometry={terrainChunk.geometry}
          key={terrainChunk.key}
          position={[terrainChunk.worldX, 0, terrainChunk.worldZ]}
          receiveShadow
        >
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
      ))}
      <mesh
        position={[
          chunkAnchor.gridX * DEFAULT_TERRAIN_CHUNK_SIZE,
          -0.35,
          chunkAnchor.gridZ * DEFAULT_TERRAIN_CHUNK_SIZE,
        ]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry
          args={[
            DEFAULT_TERRAIN_CHUNK_SIZE * (TERRAIN_STREAM_RADIUS + 1.85),
            64,
          ]}
        />
        <meshStandardMaterial color="#14191f" roughness={1} />
      </mesh>
      <ChunkStreamTracker
        chunkAnchor={chunkAnchor}
        onChunkAnchorChange={setChunkAnchor}
      />
      {cameraMode === 'fly' ? <FlyCamera /> : <OrbitCamera />}
      {isSceneReady ? null : (
        <mesh position={[0, 26, -46]}>
          <planeGeometry args={[26, 6]} />
          <meshBasicMaterial color="#10161d" opacity={0.35} transparent />
        </mesh>
      )}
    </>
  )
}

function ChunkStreamTracker({
  chunkAnchor,
  onChunkAnchorChange,
}: {
  chunkAnchor: TerrainChunkAnchor
  onChunkAnchorChange: (anchor: TerrainChunkAnchor) => void
}) {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    if (
      shouldRefreshChunkWindow(
        chunkAnchor,
        camera.position.x,
        camera.position.z,
        DEFAULT_TERRAIN_CHUNK_SIZE
      )
    ) {
      onChunkAnchorChange(
        getChunkAnchor(
          camera.position.x,
          camera.position.z,
          DEFAULT_TERRAIN_CHUNK_SIZE
        )
      )
    }
  })

  return null
}

function OrbitCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const controls = useMemo(() => {
    const nextControls = new OrbitControls(camera, gl.domElement)
    camera.position.set(...INITIAL_ORBIT_CAMERA_POSITION)
    camera.lookAt(0, 10, 0)
    nextControls.enableDamping = true
    nextControls.dampingFactor = 0.06
    nextControls.maxDistance = 360
    nextControls.maxPolarAngle = Math.PI * 0.46
    nextControls.minDistance = 22
    nextControls.minPolarAngle = Math.PI * 0.12
    nextControls.target.set(0, 10, 0)

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

function FlyCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const keyState = useRef<Record<string, boolean>>({})

  const controls = useMemo(() => {
    camera.position.set(...INITIAL_FLY_CAMERA_POSITION)
    camera.lookAt(0, 9, 0)

    const nextControls = new PointerLockControls(camera, gl.domElement)
    nextControls.pointerSpeed = 0.75
    nextControls.minPolarAngle = Math.PI * 0.08
    nextControls.maxPolarAngle = Math.PI * 0.92

    return nextControls
  }, [camera, gl.domElement])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keyState.current[event.code] = true
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      keyState.current[event.code] = false
    }

    const handleCanvasClick = () => {
      if (!controls.isLocked) {
        controls.lock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    gl.domElement.addEventListener('click', handleCanvasClick)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      gl.domElement.removeEventListener('click', handleCanvasClick)
      if (controls.isLocked) {
        controls.unlock()
      }
      controls.dispose()
    }
  }, [controls, gl.domElement])

  useFrame((_, delta) => {
    const isBoosting = keyState.current.ShiftLeft || keyState.current.ShiftRight
    const moveSpeed = (isBoosting ? 34 : 16) * delta
    const verticalSpeed = (isBoosting ? 22 : 10) * delta

    if (keyState.current.KeyW) {
      controls.moveForward(moveSpeed)
    }
    if (keyState.current.KeyS) {
      controls.moveForward(-moveSpeed)
    }
    if (keyState.current.KeyA) {
      controls.moveRight(-moveSpeed)
    }
    if (keyState.current.KeyD) {
      controls.moveRight(moveSpeed)
    }
    if (keyState.current.KeyE) {
      camera.position.setY(camera.position.y + verticalSpeed)
    }
    if (keyState.current.KeyQ) {
      camera.position.setY(camera.position.y - verticalSpeed)
    }

    camera.position.setY(Math.max(camera.position.y, 3))
  })

  return null
}
