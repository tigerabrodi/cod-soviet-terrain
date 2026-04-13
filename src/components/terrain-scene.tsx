import {
  createTerrainChunkGeometry,
  samplePlanetTerrainHeight,
  type TerrainChunkStats,
} from '@/lib/terrain/terrain-chunk'
import { createTerrainMaterial } from '@/lib/terrain/terrain-material'
import {
  PLANET_RADIUS,
  getPlanetChunkEdgeMorphs,
  selectPlanetChunkWindow,
  type PlanetChunkDescriptor,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import { loadTerrainTextureSet } from '@/lib/terrain/terrain-textures'
import { TerrainChunkWorkerPool } from '@/lib/terrain/terrain-worker-pool'
import { createSkyDomeGeometry } from '@/lib/sky/sky-dome'
import { loadSkyEnvironment } from '@/lib/sky/sky-environment'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Euler, SphereGeometry, type Mesh } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
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
  onBackendChange?: (backend: string) => void
  onReadyChange?: (ready: boolean) => void
}

export type CameraMode = 'fly' | 'orbit'

interface TerrainChunkRuntime extends PlanetChunkDescriptor {
  buildOrigin: readonly [number, number, number]
  edgeMorph: TerrainChunkEdgeMorph
  geometry: ReturnType<typeof createTerrainChunkGeometry>
  sharedArrayBufferBacked: boolean
  stats: TerrainChunkStats
}

const PLANET_LOD_RESOLUTIONS = [64, 32, 16] as const
const PLANET_CHUNK_SKIRT_DEPTH = 22
const FLOATING_ORIGIN_SHIFT_DISTANCE = 220
const FOCUS_REFRESH_DISTANCE = 56
const ZERO_EDGE_MORPH: TerrainChunkEdgeMorph = {
  east: 0,
  north: 0,
  south: 0,
  west: 0,
}

const INITIAL_FLY_WORLD_ORIGIN = {
  x: 0,
  y: PLANET_RADIUS + 18,
  z: 0,
} satisfies Vec3Like

const INITIAL_ORBIT_CAMERA_POSITION = [640, 460, 640] as const

export function TerrainScene({
  cameraMode,
  onBackendChange,
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
  onBackendChange,
  onReadyChange,
}: TerrainSceneProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const getThreeState = useThree((state) => state.get)

  const [isMaterialReady, setIsMaterialReady] = useState(false)
  const [isSkyReady, setIsSkyReady] = useState(false)
  const [terrainChunks, setTerrainChunks] = useState<
    Record<string, TerrainChunkRuntime>
  >({})
  const [terrainMaterial, setTerrainMaterial] = useState<ReturnType<
    typeof createTerrainMaterial
  > | null>(null)
  const [worldOrigin, setWorldOrigin] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).worldOrigin
  )
  const [cameraFocusWorld, setCameraFocusWorld] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).cameraFocusWorld
  )
  const skyDomeGeometry = useMemo(() => createSkyDomeGeometry(), [])
  const planetBackdropGeometry = useMemo(
    () => createPlanetBackdropGeometry(),
    []
  )

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
  const terrainChunksRef = useRef<Record<string, TerrainChunkRuntime>>({})
  const workerPoolRef = useRef<TerrainChunkWorkerPool | null>(null)
  const isTerrainWindowReady = desiredChunkDescriptors.every((terrainChunk) => {
    const activeChunk = terrainChunks[terrainChunk.key]
    const desiredEdgeMorph =
      desiredEdgeMorphs.get(terrainChunk.key) ?? ZERO_EDGE_MORPH

    return (
      activeChunk?.resolution === terrainChunk.resolution &&
      edgeMorphEquals(activeChunk.edgeMorph, desiredEdgeMorph)
    )
  })
  const isSceneReady = isMaterialReady && isSkyReady && isTerrainWindowReady

  useEffect(() => {
    const setup = getModeSetup(cameraMode)
    const resetId = window.requestAnimationFrame(() => {
      setWorldOrigin(setup.worldOrigin)
      setCameraFocusWorld(setup.cameraFocusWorld)
    })

    camera.position.set(
      setup.localCameraPosition[0],
      setup.localCameraPosition[1],
      setup.localCameraPosition[2]
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(
      setup.localLookAt[0],
      setup.localLookAt[1],
      setup.localLookAt[2]
    )

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
  }, [gl])

  useEffect(() => {
    let isMounted = true
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
    currentScene.environmentIntensity = 0.6
    currentScene.fog = new FogExp2('#95a1ab', 0.00048)

    loadSkyEnvironment(
      gl as unknown as Parameters<typeof loadSkyEnvironment>[0]
    )
      .then((skyEnvironment) => {
        if (!isMounted) {
          return
        }

        currentScene.background = new Color('#8a9298')
        currentScene.backgroundIntensity = 1
        currentScene.backgroundBlurriness = 0
        currentScene.environment = skyEnvironment.environment
        currentScene.environmentIntensity = 0.78
        currentScene.environmentRotation.copy(
          new Euler(-0.24, Math.PI * 0.58, 0)
        )
        currentScene.fog = new FogExp2('#95a1ab', 0.00048)
        setIsSkyReady(true)
      })
      .catch((error: unknown) => {
        console.error('Failed to load sky environment.', error)
      })

    return () => {
      isMounted = false
      currentScene.background = previousBackground
      currentScene.environment = previousEnvironment
      currentScene.fog = previousFog
      currentScene.backgroundIntensity = previousBackgroundIntensity
      currentScene.backgroundBlurriness = previousBackgroundBlurriness
      currentScene.environmentIntensity = previousEnvironmentIntensity
      currentScene.environmentRotation.copy(previousEnvironmentRotation)
    }
  }, [getThreeState, gl])

  useEffect(() => {
    terrainChunksRef.current = terrainChunks
  }, [terrainChunks])

  useEffect(() => {
    onReadyChange?.(isSceneReady)
  }, [isSceneReady, onReadyChange])

  useEffect(() => {
    const debugState = {
      cameraMode,
      chunkCount: Object.keys(terrainChunks).length,
      sharedBufferChunks: Object.values(terrainChunks).filter(
        (terrainChunk) => terrainChunk.sharedArrayBufferBacked
      ).length,
      worldOrigin,
    }

    ;(
      window as Window & {
        __terrainDebug?: typeof debugState
      }
    ).__terrainDebug = debugState

    return () => {
      delete (
        window as Window & {
          __terrainDebug?: typeof debugState
        }
      ).__terrainDebug
    }
  }, [cameraMode, terrainChunks, worldOrigin])

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
        edgeMorph
      )
      const inflightSignature = inflightChunkLookupRef.current.get(
        terrainChunk.key
      )

      if (
        activeChunk?.resolution === terrainChunk.resolution &&
        edgeMorphEquals(activeChunk.edgeMorph, edgeMorph)
      ) {
        continue
      }

      if (inflightSignature === requestSignature) {
        continue
      }

      inflightChunkLookupRef.current.set(terrainChunk.key, requestSignature)

      const buildOrigin = toOriginTuple(worldOrigin)

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
        })
        .then((chunkBuffers) => {
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
              edgeMorphEquals(currentChunk.edgeMorph, desiredEdgeMorph)
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
                sharedArrayBufferBacked:
                  chunkBuffers.positions.buffer instanceof SharedArrayBuffer,
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
  }, [
    cameraFocusWorld,
    desiredChunkDescriptors,
    desiredEdgeMorphs,
    worldOrigin,
  ])

  useEffect(() => {
    return () => {
      skyDomeGeometry.dispose()
      planetBackdropGeometry.dispose()
      terrainMaterial?.dispose()
    }
  }, [planetBackdropGeometry, skyDomeGeometry, terrainMaterial])

  return (
    <>
      <SkyDome geometry={skyDomeGeometry} />
      <ambientLight intensity={0.08} />
      <hemisphereLight
        args={['#bfd0df', '#342821', 0.7]}
        groundColor="#342821"
      />
      <directionalLight
        castShadow
        color="#ffd7b1"
        intensity={2.15}
        position={[-540, 260, 420]}
        shadow-bias={-0.00008}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <mesh
        geometry={planetBackdropGeometry}
        position={[-worldOrigin.x, -worldOrigin.y, -worldOrigin.z]}
        receiveShadow
      >
        <meshStandardMaterial color="#544c45" roughness={1} />
      </mesh>
      <mesh
        position={[-worldOrigin.x, -worldOrigin.y, -worldOrigin.z]}
        receiveShadow
      >
        <sphereGeometry args={[PLANET_RADIUS - 24, 48, 28]} />
        <meshStandardMaterial color="#0e151c" roughness={1} />
      </mesh>
      {Object.values(terrainChunks).map((terrainChunk) => (
        <mesh
          geometry={terrainChunk.geometry}
          key={terrainChunk.key}
          material={terrainMaterial ?? undefined}
          position={[
            terrainChunk.buildOrigin[0] - worldOrigin.x,
            terrainChunk.buildOrigin[1] - worldOrigin.y,
            terrainChunk.buildOrigin[2] - worldOrigin.z,
          ]}
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
      <FloatingOriginTracker
        cameraFocusWorld={cameraFocusWorld}
        cameraMode={cameraMode}
        onCameraFocusWorldChange={setCameraFocusWorld}
        onWorldOriginChange={setWorldOrigin}
        worldOrigin={worldOrigin}
      />
      {cameraMode === 'fly' ? <FlyCamera /> : <OrbitCamera />}
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
  cameraMode,
  onCameraFocusWorldChange,
  onWorldOriginChange,
  worldOrigin,
}: {
  cameraFocusWorld: Vec3Like
  cameraMode: CameraMode
  onCameraFocusWorldChange: (cameraFocusWorld: Vec3Like) => void
  onWorldOriginChange: (worldOrigin: Vec3Like) => void
  worldOrigin: Vec3Like
}) {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    let nextWorldCameraPosition = {
      x: worldOrigin.x + camera.position.x,
      y: worldOrigin.y + camera.position.y,
      z: worldOrigin.z + camera.position.z,
    }

    if (
      cameraMode === 'fly' &&
      camera.position.length() >= FLOATING_ORIGIN_SHIFT_DISTANCE
    ) {
      onWorldOriginChange(nextWorldCameraPosition)
      camera.position.set(0, 0, 0)
      nextWorldCameraPosition = {
        ...nextWorldCameraPosition,
      }
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

function FlyCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const keyState = useRef<Record<string, boolean>>({})

  const controls = useMemo(() => {
    const nextControls = new PointerLockControls(camera, gl.domElement)
    nextControls.pointerSpeed = 0.72
    nextControls.minPolarAngle = Math.PI * 0.04
    nextControls.maxPolarAngle = Math.PI * 0.96

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
    const moveSpeed = (isBoosting ? 42 : 18) * delta
    const verticalSpeed = (isBoosting ? 36 : 14) * delta

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
  edgeMorph: TerrainChunkEdgeMorph
) {
  return `${resolution}:${edgeMorph.east}:${edgeMorph.north}:${edgeMorph.south}:${edgeMorph.west}`
}

function getModeSetup(cameraMode: CameraMode) {
  if (cameraMode === 'fly') {
    return {
      cameraFocusWorld: INITIAL_FLY_WORLD_ORIGIN,
      localCameraPosition: [0, 0, 0] as const,
      localLookAt: [64, -10, 84] as const,
      worldOrigin: INITIAL_FLY_WORLD_ORIGIN,
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
    worldOrigin: { x: 0, y: 0, z: 0 },
  }
}

function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

function toOriginTuple(vector: Vec3Like): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function createPlanetBackdropGeometry() {
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
      up.z * PLANET_RADIUS
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
