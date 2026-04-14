import { FlyCameraController } from '@/components/fly-camera-controller'
import { SnowParticles } from '@/components/snow-particles'
import { createInitialFlyCameraState } from '@/lib/camera/fly-camera'
import type { TerrainDebugSettings } from '@/lib/debug/terrain-debug'
import { isSharedArrayBuffer } from '@/lib/shared/shared-array-buffer'
import {
  createTerrainChunkGeometry,
  samplePlanetTerrainHeight,
  type TerrainChunkStats,
} from '@/lib/terrain/terrain-chunk'
import {
  createTerrainMaterial,
  type TerrainMaterialSettings,
} from '@/lib/terrain/terrain-material'
import {
  PLANET_RADIUS,
  getPlanetChunkEdgeMorphs,
  selectPlanetChunkWindow,
  type PlanetChunkDescriptor,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import {
  loadTerrainTextureSet,
  type TerrainTextureSet,
} from '@/lib/terrain/terrain-textures'
import { TerrainChunkWorkerPool } from '@/lib/terrain/terrain-worker-pool'
import { createTerrainGenerationSignature } from '@/lib/terrain/terrain-settings'
import { createSkyDomeGeometry } from '@/lib/sky/sky-dome'
import { loadSkyEnvironment } from '@/lib/sky/sky-environment'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Camera, Euler, Group, SphereGeometry, type Mesh } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  FogExp2,
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
  debugSettings: TerrainDebugSettings
  onBackendChange?: (backend: string) => void
  onDebugStateChange?: (debugState: TerrainSceneDebugState) => void
  onReadyChange?: (ready: boolean) => void
}

export type CameraMode = 'fly' | 'orbit'

export interface TerrainSceneDebugState {
  cameraFocusWorld: Vec3Like
  cameraMode: CameraMode
  chunkCount: number
  lodCounts: Record<number, number>
  sharedBufferChunks: number
  triangleCount: number
  worldOrigin: Vec3Like
}

interface TerrainChunkRuntime extends PlanetChunkDescriptor {
  buildOrigin: readonly [number, number, number]
  edgeMorph: TerrainChunkEdgeMorph
  geometry: ReturnType<typeof createTerrainChunkGeometry>
  sharedArrayBufferBacked: boolean
  stats: TerrainChunkStats
  terrainGenerationSignature: string
}

const PLANET_LOD_RESOLUTIONS = [64, 32, 16] as const
const PLANET_CHUNK_SKIRT_DEPTH = 22
const FOCUS_REFRESH_DISTANCE = 56
const ZERO_EDGE_MORPH: TerrainChunkEdgeMorph = {
  east: 0,
  north: 0,
  south: 0,
  west: 0,
}
const INITIAL_ORBIT_CAMERA_POSITION = [640, 460, 640] as const
const INITIAL_FLY_CAMERA_STATE = createInitialFlyCameraState()
const ZERO_VECTOR = { x: 0, y: 0, z: 0 } as const

export function TerrainScene({
  cameraMode,
  debugSettings,
  onBackendChange,
  onDebugStateChange,
  onReadyChange,
}: TerrainSceneProps) {
  return (
    <Canvas
      camera={{
        far: 3200,
        fov: 38,
        near: 0.1,
        position: [...INITIAL_ORBIT_CAMERA_POSITION],
      }}
      className="absolute inset-0 h-full w-full"
      dpr={[1, 2]}
      gl={createTerrainRenderer}
      shadows
    >
      <color attach="background" args={['#081018']} />
      <TerrainWorld
        cameraMode={cameraMode}
        debugSettings={debugSettings}
        onBackendChange={onBackendChange}
        onDebugStateChange={onDebugStateChange}
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
    logarithmicDepthBuffer: true,
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
  debugSettings,
  onBackendChange,
  onDebugStateChange,
  onReadyChange,
}: TerrainSceneProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const getThreeState = useThree((state) => state.get)

  const [terrainChunks, setTerrainChunks] = useState<
    Record<string, TerrainChunkRuntime>
  >({})
  const [terrainTextures, setTerrainTextures] =
    useState<TerrainTextureSet | null>(null)
  const [skyEnvironment, setSkyEnvironment] = useState<Awaited<
    ReturnType<typeof loadSkyEnvironment>
  > | null>(null)
  const [worldOriginSnapshot, setWorldOriginSnapshot] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).worldOrigin
  )
  const [cameraFocusWorld, setCameraFocusWorld] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).cameraFocusWorld
  )
  const terrainGenerationSignature = useMemo(
    () => createTerrainGenerationSignature(debugSettings.terrainGeneration),
    [debugSettings.terrainGeneration]
  )
  const skyDomeGeometry = useMemo(() => createSkyDomeGeometry(), [])
  const terrainMaterial = useMemo(
    () =>
      terrainTextures
        ? createTerrainMaterial(
            terrainTextures,
            debugSettings.terrainMaterial as TerrainMaterialSettings
          )
        : null,
    [debugSettings.terrainMaterial, terrainTextures]
  )
  const planetBackdropGeometry = useMemo(
    () => createPlanetBackdropGeometry(debugSettings.terrainGeneration),
    [debugSettings.terrainGeneration]
  )
  const isMaterialReady = terrainMaterial !== null
  const isSkyReady = skyEnvironment !== null

  const desiredChunkDescriptors = useMemo(
    () =>
      selectPlanetChunkWindow(
        cameraFocusWorld,
        PLANET_LOD_RESOLUTIONS,
        PLANET_RADIUS
      ),
    [cameraFocusWorld]
  )
  const desiredEdgeMorphs = useMemo(
    () => getPlanetChunkEdgeMorphs(desiredChunkDescriptors),
    [desiredChunkDescriptors]
  )
  const desiredChunkLookupRef = useRef(new Map<string, PlanetChunkDescriptor>())
  const desiredEdgeMorphLookupRef = useRef(
    new Map<string, TerrainChunkEdgeMorph>()
  )
  const inflightChunkLookupRef = useRef(new Map<string, string>())
  const previousCameraModeRef = useRef<CameraMode | null>(null)
  const terrainChunksRef = useRef<Record<string, TerrainChunkRuntime>>({})
  const workerPoolRef = useRef<TerrainChunkWorkerPool | null>(null)
  const worldOriginRef = useRef<Vec3Like>(getModeSetup(cameraMode).worldOrigin)
  const isTerrainWindowReady = desiredChunkDescriptors.every((terrainChunk) => {
    const activeChunk = terrainChunks[terrainChunk.key]
    const desiredEdgeMorph =
      desiredEdgeMorphs.get(terrainChunk.key) ?? ZERO_EDGE_MORPH

    return (
      activeChunk?.resolution === terrainChunk.resolution &&
      edgeMorphEquals(activeChunk.edgeMorph, desiredEdgeMorph) &&
      activeChunk.terrainGenerationSignature === terrainGenerationSignature
    )
  })
  const isSceneReady = isMaterialReady && isSkyReady && isTerrainWindowReady

  useEffect(() => {
    const previousCameraMode = previousCameraModeRef.current
    previousCameraModeRef.current = cameraMode

    if (previousCameraMode === cameraMode) {
      return
    }

    const setup = getModeSetup(cameraMode)

    worldOriginRef.current = setup.worldOrigin
    const resetId = window.requestAnimationFrame(() => {
      setWorldOriginSnapshot(setup.worldOrigin)
      setCameraFocusWorld(setup.cameraFocusWorld)
      applyCameraSetup(camera, setup)
    })

    return () => {
      window.cancelAnimationFrame(resetId)
    }
  }, [camera, cameraMode])

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

        setTerrainTextures(textures)
      })
      .catch((error: unknown) => {
        console.error('Failed to load terrain textures.', error)
      })

    return () => {
      isMounted = false
    }
  }, [gl])

  useEffect(() => {
    return () => {
      terrainMaterial?.dispose()
    }
  }, [terrainMaterial])

  useEffect(() => {
    let isMounted = true

    loadSkyEnvironment(
      gl as unknown as Parameters<typeof loadSkyEnvironment>[0]
    )
      .then((nextSkyEnvironment) => {
        if (!isMounted) {
          return
        }

        setSkyEnvironment(nextSkyEnvironment)
      })
      .catch((error: unknown) => {
        console.error('Failed to load sky environment.', error)
      })

    return () => {
      isMounted = false
    }
  }, [gl])

  useEffect(() => {
    const currentScene = getThreeState().scene
    const previousBackground = currentScene.background
    const previousEnvironment = currentScene.environment
    const previousFog = currentScene.fog
    const previousBackgroundIntensity = currentScene.backgroundIntensity
    const previousBackgroundBlurriness = currentScene.backgroundBlurriness
    const previousEnvironmentIntensity = currentScene.environmentIntensity
    const previousEnvironmentRotation = currentScene.environmentRotation.clone()

    currentScene.background = new Color('#8a9298')
    currentScene.backgroundIntensity = 1
    currentScene.backgroundBlurriness = 0
    currentScene.environment = skyEnvironment?.environment ?? null
    currentScene.environmentIntensity =
      0.78 * debugSettings.lighting.environmentIntensity
    currentScene.environmentRotation.copy(new Euler(-0.24, Math.PI * 0.58, 0))
    currentScene.fog = new FogExp2(
      '#95a1ab',
      0.00048 * debugSettings.lighting.fogDensity
    )

    return () => {
      currentScene.background = previousBackground
      currentScene.environment = previousEnvironment
      currentScene.fog = previousFog
      currentScene.backgroundIntensity = previousBackgroundIntensity
      currentScene.backgroundBlurriness = previousBackgroundBlurriness
      currentScene.environmentIntensity = previousEnvironmentIntensity
      currentScene.environmentRotation.copy(previousEnvironmentRotation)
    }
  }, [debugSettings.lighting, getThreeState, skyEnvironment])

  useEffect(() => {
    terrainChunksRef.current = terrainChunks
  }, [terrainChunks])

  useEffect(() => {
    onReadyChange?.(isSceneReady)
  }, [isSceneReady, onReadyChange])

  useEffect(() => {
    const lodCounts = Object.values(terrainChunks).reduce<
      Record<number, number>
    >((counts, terrainChunk) => {
      counts[terrainChunk.lodLevel] = (counts[terrainChunk.lodLevel] ?? 0) + 1
      return counts
    }, {})
    const debugState: TerrainSceneDebugState = {
      cameraFocusWorld,
      cameraMode,
      chunkCount: Object.keys(terrainChunks).length,
      lodCounts,
      sharedBufferChunks: Object.values(terrainChunks).filter(
        (terrainChunk) => terrainChunk.sharedArrayBufferBacked
      ).length,
      triangleCount: Object.values(terrainChunks).reduce(
        (triangleTotal, terrainChunk) =>
          triangleTotal + (terrainChunk.geometry.index?.count ?? 0) / 3,
        0
      ),
      worldOrigin: worldOriginSnapshot,
    }

    ;(
      window as Window & {
        __terrainDebug?: typeof debugState
      }
    ).__terrainDebug = debugState
    onDebugStateChange?.(debugState)

    return () => {
      delete (
        window as Window & {
          __terrainDebug?: typeof debugState
        }
      ).__terrainDebug
    }
  }, [
    cameraFocusWorld,
    cameraMode,
    onDebugStateChange,
    terrainChunks,
    worldOriginSnapshot,
  ])

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
    desiredEdgeMorphLookupRef.current = new Map(
      desiredChunkDescriptors.map((terrainChunk) => [
        terrainChunk.key,
        desiredEdgeMorphs.get(terrainChunk.key) ?? ZERO_EDGE_MORPH,
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

        return (
          getDistance(cameraFocusWorld, left.sphereCenter) -
          getDistance(cameraFocusWorld, right.sphereCenter)
        )
      }
    )

    for (const terrainChunk of prioritizedChunks) {
      const edgeMorph =
        desiredEdgeMorphLookupRef.current.get(terrainChunk.key) ??
        ZERO_EDGE_MORPH
      const activeChunk = terrainChunksRef.current[terrainChunk.key]
      const requestSignature = getChunkRequestSignature(
        terrainChunk.resolution,
        edgeMorph,
        terrainGenerationSignature
      )
      const inflightSignature = inflightChunkLookupRef.current.get(
        terrainChunk.key
      )

      if (
        activeChunk?.resolution === terrainChunk.resolution &&
        edgeMorphEquals(activeChunk.edgeMorph, edgeMorph) &&
        activeChunk.terrainGenerationSignature === terrainGenerationSignature
      ) {
        continue
      }

      if (inflightSignature === requestSignature) {
        continue
      }

      inflightChunkLookupRef.current.set(terrainChunk.key, requestSignature)

      const buildOrigin = toOriginTuple(worldOriginRef.current)

      workerPool
        .requestChunk({
          centerX: terrainChunk.centerX,
          centerY: terrainChunk.centerY,
          edgeMorph,
          face: terrainChunk.face,
          mode: 'planet',
          origin: buildOrigin,
          planetRadius: PLANET_RADIUS,
          resolution: terrainChunk.resolution,
          size: terrainChunk.size,
          skirtDepth: PLANET_CHUNK_SKIRT_DEPTH,
          terrainSettings: debugSettings.terrainGeneration,
        })
        .then((chunkBuffers) => {
          if (
            inflightChunkLookupRef.current.get(terrainChunk.key) !==
            requestSignature
          ) {
            return
          }

          inflightChunkLookupRef.current.delete(terrainChunk.key)

          const desiredChunk = desiredChunkLookupRef.current.get(
            terrainChunk.key
          )
          const desiredEdgeMorph =
            desiredEdgeMorphLookupRef.current.get(terrainChunk.key) ??
            ZERO_EDGE_MORPH

          if (
            !desiredChunk ||
            desiredChunk.resolution !== terrainChunk.resolution ||
            !edgeMorphEquals(desiredEdgeMorph, edgeMorph)
          ) {
            return
          }

          const geometry = createTerrainChunkGeometry(chunkBuffers)

          setTerrainChunks((currentTerrainChunks) => {
            const currentChunk = currentTerrainChunks[terrainChunk.key]

            if (
              currentChunk?.resolution === desiredChunk.resolution &&
              edgeMorphEquals(currentChunk.edgeMorph, desiredEdgeMorph) &&
              currentChunk.terrainGenerationSignature ===
                terrainGenerationSignature
            ) {
              geometry.dispose()
              return currentTerrainChunks
            }

            currentChunk?.geometry.dispose()

            const nextTerrainChunks = {
              ...currentTerrainChunks,
              [terrainChunk.key]: {
                ...desiredChunk,
                buildOrigin,
                edgeMorph: desiredEdgeMorph,
                geometry,
                sharedArrayBufferBacked: isSharedArrayBuffer(
                  chunkBuffers.positions.buffer
                ),
                stats: chunkBuffers.stats,
                terrainGenerationSignature,
              },
            }

            terrainChunksRef.current = nextTerrainChunks
            return nextTerrainChunks
          })
        })
        .catch((error: unknown) => {
          if (
            inflightChunkLookupRef.current.get(terrainChunk.key) ===
            requestSignature
          ) {
            inflightChunkLookupRef.current.delete(terrainChunk.key)
          }
          console.error('Failed to build terrain chunk in worker.', error)
        })
    }
  }, [
    cameraFocusWorld,
    debugSettings.terrainGeneration,
    desiredChunkDescriptors,
    desiredEdgeMorphs,
    terrainGenerationSignature,
  ])

  useEffect(() => {
    return () => {
      skyDomeGeometry.dispose()
    }
  }, [skyDomeGeometry])

  useEffect(() => {
    return () => {
      planetBackdropGeometry.dispose()
    }
  }, [planetBackdropGeometry])

  return (
    <>
      <SkyDome geometry={skyDomeGeometry} />
      <SnowParticles
        density={debugSettings.weather.snowDensity}
        driftStrength={debugSettings.weather.driftStrength}
        enabled={debugSettings.weather.snowEnabled}
        fallSpeed={debugSettings.weather.fallSpeed}
      />
      <ambientLight
        intensity={0.08 * debugSettings.lighting.environmentIntensity}
      />
      <hemisphereLight
        args={[
          '#bfd0df',
          '#342821',
          0.7 * debugSettings.lighting.environmentIntensity,
        ]}
        groundColor="#342821"
      />
      <directionalLight
        castShadow
        color="#ffd7b1"
        intensity={2.15 * debugSettings.lighting.sunIntensity}
        position={[-540, 260, 420]}
        shadow-bias={-0.00008}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <WorldOriginAnchor originRef={worldOriginRef}>
        <mesh geometry={planetBackdropGeometry} receiveShadow>
          <meshStandardMaterial color="#544c45" roughness={1} />
        </mesh>
        <mesh receiveShadow>
          <sphereGeometry args={[PLANET_RADIUS - 24, 48, 28]} />
          <meshStandardMaterial color="#0e151c" roughness={1} />
        </mesh>
        {Object.values(terrainChunks).map((terrainChunk) => (
          <mesh
            geometry={terrainChunk.geometry}
            key={terrainChunk.key}
            material={terrainMaterial ?? undefined}
            position={terrainChunk.buildOrigin}
            receiveShadow
          >
            {terrainMaterial ? null : (
              <meshStandardMaterial
                color="#616971"
                metalness={0.02}
                roughness={0.95}
              />
            )}
          </mesh>
        ))}
      </WorldOriginAnchor>
      {cameraMode === 'orbit' ? (
        <>
          <FloatingOriginTracker
            cameraFocusWorld={cameraFocusWorld}
            onCameraFocusWorldChange={setCameraFocusWorld}
          />
          <OrbitCamera />
        </>
      ) : (
        <FlyCameraController
          focusRefreshDistance={FOCUS_REFRESH_DISTANCE}
          onCameraFocusWorldChange={setCameraFocusWorld}
          onWorldOriginSnapshotChange={setWorldOriginSnapshot}
          terrainSettings={debugSettings.terrainGeneration}
          worldOriginRef={worldOriginRef}
        />
      )}
      {isSceneReady ? null : (
        <mesh position={[0, PLANET_RADIUS * 0.45, 0]}>
          <sphereGeometry args={[42, 20, 12]} />
          <meshBasicMaterial color="#0c1117" opacity={0.22} transparent />
        </mesh>
      )}
    </>
  )
}

function FloatingOriginTracker({
  cameraFocusWorld,
  onCameraFocusWorldChange,
}: {
  cameraFocusWorld: Vec3Like
  onCameraFocusWorldChange: (cameraFocusWorld: Vec3Like) => void
}) {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const nextWorldCameraPosition = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }

    if (
      getDistance(nextWorldCameraPosition, cameraFocusWorld) >=
      FOCUS_REFRESH_DISTANCE
    ) {
      onCameraFocusWorldChange(nextWorldCameraPosition)
    }
  })

  return null
}

function WorldOriginAnchor({
  children,
  originRef,
}: {
  children: ReactNode
  originRef: MutableRefObject<Vec3Like>
}) {
  const groupRef = useRef<Group>(null)

  useFrame(() => {
    const origin = originRef.current

    groupRef.current?.position.set(-origin.x, -origin.y, -origin.z)
  })

  return <group ref={groupRef}>{children}</group>
}

function SkyDome({
  geometry,
}: {
  geometry: ReturnType<typeof createSkyDomeGeometry>
}) {
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<Mesh>(null)

  useFrame(() => {
    meshRef.current?.position.copy(camera.position)
  })

  return (
    <mesh frustumCulled={false} geometry={geometry} ref={meshRef}>
      <meshBasicMaterial
        fog={false}
        side={BackSide}
        toneMapped={false}
        vertexColors
      />
    </mesh>
  )
}

function OrbitCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const controls = useMemo(() => {
    const nextControls = new OrbitControls(camera, gl.domElement)
    nextControls.enableDamping = true
    nextControls.dampingFactor = 0.06
    nextControls.enablePan = false
    nextControls.maxDistance = 1600
    nextControls.maxPolarAngle = Math.PI * 0.94
    nextControls.minDistance = 220
    nextControls.minPolarAngle = Math.PI * 0.06
    nextControls.target.set(0, 0, 0)

    return nextControls
  }, [camera, gl.domElement])

  useEffect(() => {
    controls.target.set(0, 0, 0)

    return () => {
      controls.dispose()
    }
  }, [controls])

  useFrame(() => {
    controls.update()
  })

  return null
}

function edgeMorphEquals(
  left: TerrainChunkEdgeMorph,
  right: TerrainChunkEdgeMorph
) {
  return (
    left.east === right.east &&
    left.north === right.north &&
    left.south === right.south &&
    left.west === right.west
  )
}

function getChunkRequestSignature(
  resolution: number,
  edgeMorph: TerrainChunkEdgeMorph,
  terrainGenerationSignature: string
) {
  return `${resolution}:${edgeMorph.east}:${edgeMorph.north}:${edgeMorph.south}:${edgeMorph.west}:${terrainGenerationSignature}`
}

function getModeSetup(cameraMode: CameraMode) {
  if (cameraMode === 'fly') {
    const up = normalizeVec3(INITIAL_FLY_CAMERA_STATE.position)

    return {
      cameraFocusWorld: INITIAL_FLY_CAMERA_STATE.position,
      localCameraPosition: [0, 0, 0] as const,
      localLookAt: [
        INITIAL_FLY_CAMERA_STATE.forward.x,
        INITIAL_FLY_CAMERA_STATE.forward.y,
        INITIAL_FLY_CAMERA_STATE.forward.z,
      ] as const,
      localUp: [up.x, up.y, up.z] as const,
      worldOrigin: INITIAL_FLY_CAMERA_STATE.position,
    }
  }

  return {
    cameraFocusWorld: {
      x: INITIAL_ORBIT_CAMERA_POSITION[0],
      y: INITIAL_ORBIT_CAMERA_POSITION[1],
      z: INITIAL_ORBIT_CAMERA_POSITION[2],
    },
    localCameraPosition: INITIAL_ORBIT_CAMERA_POSITION,
    localLookAt: [0, 0, 0] as const,
    localUp: [0, 1, 0] as const,
    worldOrigin: ZERO_VECTOR,
  }
}

function applyCameraSetup(
  camera: Camera,
  setup: ReturnType<typeof getModeSetup>
) {
  camera.position.set(
    setup.localCameraPosition[0],
    setup.localCameraPosition[1],
    setup.localCameraPosition[2]
  )
  camera.up.set(setup.localUp[0], setup.localUp[1], setup.localUp[2])
  camera.lookAt(
    setup.localLookAt[0],
    setup.localLookAt[1],
    setup.localLookAt[2]
  )
}

function normalizeVec3(vector: Vec3Like) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

function toOriginTuple(vector: Vec3Like): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function createPlanetBackdropGeometry(
  terrainSettings: TerrainSceneProps['debugSettings']['terrainGeneration']
) {
  const geometry = new SphereGeometry(PLANET_RADIUS - 8, 72, 44)
  const positions = geometry.getAttribute('position')

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    const length = Math.hypot(x, y, z) || 1
    const up = {
      x: x / length,
      y: y / length,
      z: z / length,
    }
    const height = samplePlanetTerrainHeight(
      up.x * PLANET_RADIUS,
      up.y * PLANET_RADIUS,
      up.z * PLANET_RADIUS,
      terrainSettings
    )
    const radius = PLANET_RADIUS + height - 10

    positions.setXYZ(index, up.x * radius, up.y * radius, up.z * radius)
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return geometry
}
