import { FlyCameraController } from '@/components/fly-camera-controller'
import {
  takeSnowChunksForSimulation,
  useTerrainChunkStreaming,
  type TerrainChunkRuntime,
} from '@/components/terrain-scene-streaming'
import {
  INITIAL_ORBIT_CAMERA_POSITION,
  getModeSetup,
  type CameraMode,
} from '@/components/terrain-scene-camera'
import { SnowParticles } from '@/components/snow-particles'
import {
  FloatingOriginTracker,
  OrbitCamera,
  SkyDome,
  WorldOriginAnchor,
} from '@/components/terrain-scene-runtime'
import {
  applyCameraSetup,
  createPlanetOverviewGeometry,
  edgeMorphEquals,
} from '@/components/terrain-scene-utils'
import type { TerrainDebugSettings } from '@/lib/debug/terrain-debug'
import {
  createTerrainMaterial,
  type TerrainMaterialSettings,
} from '@/lib/terrain/terrain-material'
import {
  PLANET_RADIUS,
  getPlanetChunkEdgeMorphs,
  selectPlanetChunkWindow,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import {
  loadTerrainTextureSet,
  type TerrainTextureSet,
} from '@/lib/terrain/terrain-textures'
import { createTerrainGenerationSignature } from '@/lib/terrain/terrain-settings'
import {
  updateSnowAccumulationRuntimeState,
  type SnowAccumulationRuntimeState,
  type SnowAccumulationSettings,
} from '@/lib/weather/snow-accumulation'
import { getTerrainChunkRevealFactor } from '@/lib/terrain/terrain-chunk-transition'
import { createSkyDomeGeometry } from '@/lib/sky/sky-dome'
import { loadSkyEnvironment } from '@/lib/sky/sky-environment'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Euler, type Float32BufferAttribute } from 'three'
import {
  ACESFilmicToneMapping,
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

export interface TerrainSceneDebugState {
  cameraFocusWorld: Vec3Like
  cameraMode: CameraMode
  chunkCount: number
  drawCalls: number
  fps: number
  frameMs: number
  geometries: number
  inflightChunkRequests: number
  lodCounts: Record<number, number>
  pendingChunkCommits: number
  sharedBufferChunks: number
  snowChunkCount: number
  textureCount: number
  triangleCount: number
  worldOrigin: Vec3Like
}

interface PerformanceSnapshot {
  drawCalls: number
  fps: number
  frameMs: number
  geometries: number
  textureCount: number
}

const PLANET_LOD_RESOLUTIONS = [64, 32, 16] as const
const FLY_FOCUS_REFRESH_DISTANCE = 12
const ORBIT_FOCUS_REFRESH_DISTANCE = 32
const MAX_SNOW_CHUNKS_PER_STEP = 8
const SNOW_SIMULATION_INTERVAL_SECONDS = 0.18

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
      dpr={getCanvasDpr(debugSettings.performance.renderScale)}
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

  const [terrainTextures, setTerrainTextures] =
    useState<TerrainTextureSet | null>(null)
  const [skyEnvironment, setSkyEnvironment] = useState<Awaited<
    ReturnType<typeof loadSkyEnvironment>
  > | null>(null)
  const [performanceSnapshot, setPerformanceSnapshot] =
    useState<PerformanceSnapshot>({
      drawCalls: 0,
      fps: 0,
      frameMs: 0,
      geometries: 0,
      textureCount: 0,
    })
  const [worldOriginSnapshot, setWorldOriginSnapshot] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).worldOrigin
  )
  const [cameraFocusWorld, setCameraFocusWorld] = useState<Vec3Like>(
    () => getModeSetup(cameraMode).cameraFocusWorld
  )
  const isPlanetOverviewVisible = cameraMode === 'orbit'

  const previousCameraModeRef = useRef<CameraMode | null>(null)
  const performanceSampleAccumulatorRef = useRef(0)
  const performanceSampleCountRef = useRef(0)
  const performanceSampleFrameTimeRef = useRef(0)
  const snowStateLookupRef = useRef(new Map<string, SnowAccumulationRuntimeState>())
  const snowSimulationAccumulatorRef = useRef(0)
  const snowSimulationCursorRef = useRef(0)
  const snowSimulationTimeRef = useRef(0)
  const worldOriginRef = useRef<Vec3Like>(getModeSetup(cameraMode).worldOrigin)

  const snowAccumulationSettings = useMemo<SnowAccumulationSettings>(
    () => ({
      accumulationRate: debugSettings.weather.accumulationRate,
      meltRate: debugSettings.weather.meltRate,
      visualStrength: debugSettings.weather.coverageStrength,
      windStrength: debugSettings.weather.windStrength,
    }),
    [debugSettings.weather]
  )
  const snowfallIntensity = useMemo(
    () =>
      debugSettings.weather.snowEnabled
        ? Math.min(1, debugSettings.weather.snowDensity * 0.55)
        : 0,
    [debugSettings.weather.snowDensity, debugSettings.weather.snowEnabled]
  )
  const terrainGenerationSignature = useMemo(
    () => createTerrainGenerationSignature(debugSettings.terrainGeneration),
    [debugSettings.terrainGeneration]
  )
  const skyDomeGeometry = useMemo(() => createSkyDomeGeometry(), [])
  const terrainMaterial = useMemo(
    () =>
      terrainTextures
        ? createTerrainMaterial(terrainTextures, {
            ...(debugSettings.terrainMaterial as TerrainMaterialSettings),
            snowAccumulationStrength: snowAccumulationSettings.visualStrength,
            wireframe: debugSettings.performance.showWireframe,
          })
        : null,
    [
      debugSettings.performance.showWireframe,
      debugSettings.terrainMaterial,
      snowAccumulationSettings,
      terrainTextures,
    ]
  )
  const planetOverviewGeometry = useMemo(
    () => createPlanetOverviewGeometry(debugSettings.terrainGeneration),
    [debugSettings.terrainGeneration]
  )
  const planetFlyUnderlayGeometry = useMemo(
    () =>
      createPlanetOverviewGeometry(debugSettings.terrainGeneration, {
        heightBias: -4,
        heightSegments: 56,
        snowCoverageScale: 0.34,
        widthSegments: 96,
      }),
    [debugSettings.terrainGeneration]
  )
  const desiredChunkDescriptors = useMemo(
    () =>
      cameraMode === 'orbit'
        ? []
        : selectPlanetChunkWindow(
            cameraFocusWorld,
            PLANET_LOD_RESOLUTIONS,
            PLANET_RADIUS
          ),
    [cameraFocusWorld, cameraMode]
  )
  const desiredEdgeMorphs = useMemo(
    () => getPlanetChunkEdgeMorphs(desiredChunkDescriptors),
    [desiredChunkDescriptors]
  )

  const { runtimeStatsRef, terrainChunks, terrainChunksRef } =
    useTerrainChunkStreaming({
    cameraFocusWorld,
    desiredChunkDescriptors,
    desiredEdgeMorphs,
    snowSimulationTimeRef,
    snowStateLookupRef,
    terrainGeneration: debugSettings.terrainGeneration,
    terrainGenerationSignature,
    worldOriginRef,
  })
  const activeTerrainChunks = useMemo(
    () => Object.values(terrainChunks),
    [terrainChunks]
  )
  const isTerrainWindowReady = desiredChunkDescriptors.every((terrainChunk) => {
    const activeChunk = terrainChunks[terrainChunk.key]
    const desiredEdgeMorph = desiredEdgeMorphs.get(terrainChunk.key)

    return (
      activeChunk?.resolution === terrainChunk.resolution &&
      edgeMorphEquals(activeChunk.edgeMorph, desiredEdgeMorph ?? activeChunk.edgeMorph) &&
      activeChunk.terrainGenerationSignature === terrainGenerationSignature
    )
  })
  const isSceneReady =
    terrainMaterial !== null &&
    skyEnvironment !== null &&
    (cameraMode === 'orbit' || isTerrainWindowReady)

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
        if (isMounted) {
          setTerrainTextures(textures)
        }
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
        if (isMounted) {
          setSkyEnvironment(nextSkyEnvironment)
        }
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
    onReadyChange?.(isSceneReady)
  }, [isSceneReady, onReadyChange])

  useEffect(() => {
    const lodCounts = activeTerrainChunks.reduce<Record<number, number>>(
      (counts, terrainChunk) => {
        counts[terrainChunk.lodLevel] = (counts[terrainChunk.lodLevel] ?? 0) + 1
        return counts
      },
      {}
    )
    const debugState: TerrainSceneDebugState = {
      cameraFocusWorld,
      cameraMode,
      chunkCount: activeTerrainChunks.length,
      drawCalls: performanceSnapshot.drawCalls,
      fps: performanceSnapshot.fps,
      frameMs: performanceSnapshot.frameMs,
      geometries: performanceSnapshot.geometries,
      inflightChunkRequests: runtimeStatsRef.current.inflightChunkCount,
      lodCounts,
      pendingChunkCommits: runtimeStatsRef.current.pendingChunkCommitCount,
      sharedBufferChunks: activeTerrainChunks.filter(
        (terrainChunk) => terrainChunk.sharedArrayBufferBacked
      ).length,
      snowChunkCount: snowStateLookupRef.current.size,
      textureCount: performanceSnapshot.textureCount,
      triangleCount: activeTerrainChunks.reduce(
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
    activeTerrainChunks,
    cameraFocusWorld,
    cameraMode,
    onDebugStateChange,
    performanceSnapshot,
    runtimeStatsRef,
    worldOriginSnapshot,
  ])

  useFrame((_, deltaTimeSeconds) => {
    performanceSampleAccumulatorRef.current += deltaTimeSeconds
    performanceSampleCountRef.current += 1
    performanceSampleFrameTimeRef.current += deltaTimeSeconds * 1000

    if (performanceSampleAccumulatorRef.current >= 0.3) {
      const rendererStats = readRendererStats(gl)

      setPerformanceSnapshot({
        drawCalls: rendererStats.drawCalls,
        fps:
          performanceSampleCountRef.current /
          performanceSampleAccumulatorRef.current,
        frameMs:
          performanceSampleFrameTimeRef.current /
          performanceSampleCountRef.current,
        geometries: rendererStats.geometries,
        textureCount: rendererStats.textureCount,
      })

      performanceSampleAccumulatorRef.current = 0
      performanceSampleCountRef.current = 0
      performanceSampleFrameTimeRef.current = 0
    }

    const snowStates = snowStateLookupRef.current

    if (snowStates.size === 0) {
      snowSimulationAccumulatorRef.current = 0
      return
    }

    snowSimulationAccumulatorRef.current += deltaTimeSeconds

    if (snowSimulationAccumulatorRef.current < SNOW_SIMULATION_INTERVAL_SECONDS) {
      return
    }

    const simulationDeltaSeconds = Math.min(
      snowSimulationAccumulatorRef.current,
      0.42
    )
    const renderer = gl as unknown as WebGPURenderer

    snowSimulationAccumulatorRef.current = 0
    snowSimulationTimeRef.current += simulationDeltaSeconds

    const selectedSnowChunks = takeSnowChunksForSimulation(
      snowStates,
      snowSimulationCursorRef.current,
      MAX_SNOW_CHUNKS_PER_STEP
    )

    snowSimulationCursorRef.current = selectedSnowChunks.nextIndex

    for (const [terrainChunkKey, snowState] of selectedSnowChunks.items) {
      const terrainChunk = terrainChunksRef.current[terrainChunkKey]

      if (
        !terrainChunk ||
        terrainChunk.terrainGenerationSignature !== snowState.settingsVersion
      ) {
        snowStates.delete(terrainChunkKey)
        continue
      }

      const chunkDeltaSeconds = Math.min(
        Math.max(0, snowSimulationTimeRef.current - snowState.lastUpdateTime),
        1.5
      )

      if (chunkDeltaSeconds <= 0) {
        continue
      }

      updateSnowAccumulationRuntimeState(
        renderer,
        snowState,
        chunkDeltaSeconds,
        snowfallIntensity,
        snowAccumulationSettings
      )
    }
  })

  useEffect(() => {
    return () => {
      skyDomeGeometry.dispose()
    }
  }, [skyDomeGeometry])

  useEffect(() => {
    return () => {
      planetOverviewGeometry.dispose()
    }
  }, [planetOverviewGeometry])

  useEffect(() => {
    return () => {
      planetFlyUnderlayGeometry.dispose()
    }
  }, [planetFlyUnderlayGeometry])

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
        <mesh
          geometry={planetOverviewGeometry}
          material={terrainMaterial ?? undefined}
          receiveShadow
          visible={isPlanetOverviewVisible}
        />
        <mesh
          geometry={planetFlyUnderlayGeometry}
          material={terrainMaterial ?? undefined}
          receiveShadow
          visible={!isPlanetOverviewVisible}
        />
        {isPlanetOverviewVisible
          ? null
          : activeTerrainChunks.map((terrainChunk) => (
          <TerrainChunkMesh
            fallbackWireframe={debugSettings.performance.showWireframe}
            key={terrainChunk.key}
            terrainChunk={terrainChunk}
            terrainMaterial={terrainMaterial}
          />
        ))}
      </WorldOriginAnchor>
      {cameraMode === 'orbit' ? (
        <>
          <FloatingOriginTracker
            cameraFocusWorld={cameraFocusWorld}
            focusRefreshDistance={ORBIT_FOCUS_REFRESH_DISTANCE}
            onCameraFocusWorldChange={setCameraFocusWorld}
          />
          <OrbitCamera />
        </>
      ) : (
        <FlyCameraController
          focusRefreshDistance={FLY_FOCUS_REFRESH_DISTANCE}
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

function TerrainChunkMesh({
  fallbackWireframe,
  terrainChunk,
  terrainMaterial,
}: {
  fallbackWireframe: boolean
  terrainChunk: TerrainChunkRuntime
  terrainMaterial: ReturnType<typeof createTerrainMaterial> | null
}) {
  const revealAttributeRef = useRef<Float32BufferAttribute | null>(null)
  const lastRevealRef = useRef(-1)

  useFrame(() => {
    const revealAttribute = revealAttributeRef.current

    if (!revealAttribute || lastRevealRef.current >= 1) {
      return
    }

    const revealFactor = getTerrainChunkRevealFactor(
      performance.now() * 0.001 - terrainChunk.revealStartedAtSeconds
    )

    if (revealFactor === lastRevealRef.current) {
      return
    }

    ;(revealAttribute.array as Float32Array).fill(revealFactor)
    revealAttribute.needsUpdate = true
    lastRevealRef.current = revealFactor
  })

  useEffect(() => {
    const revealAttribute = terrainChunk.geometry.getAttribute(
      'chunkReveal'
    ) as Float32BufferAttribute | null

    revealAttributeRef.current = revealAttribute

    if (!revealAttribute) {
      return
    }

    ;(revealAttribute.array as Float32Array).fill(0)
    revealAttribute.needsUpdate = true
    lastRevealRef.current = 0
  }, [terrainChunk.geometry, terrainChunk.revealStartedAtSeconds])

  return (
    <mesh
      geometry={terrainChunk.geometry}
      material={terrainMaterial ?? undefined}
      position={terrainChunk.buildOrigin}
      receiveShadow
    >
      {terrainMaterial ? null : (
        <meshStandardMaterial
          color="#616971"
          metalness={0.02}
          roughness={0.95}
          wireframe={fallbackWireframe}
        />
      )}
    </mesh>
  )
}

function getCanvasDpr(renderScale: number) {
  if (typeof window === 'undefined') {
    return 1
  }

  return Math.min(2, Math.max(0.6, window.devicePixelRatio * renderScale))
}

function readRendererStats(renderer: unknown) {
  const info = (
    renderer as {
      info?: {
        memory?: {
          geometries?: number
          textures?: number
        }
        render?: {
          calls?: number
        }
      }
    }
  ).info

  return {
    drawCalls: info?.render?.calls ?? 0,
    geometries: info?.memory?.geometries ?? 0,
    textureCount: info?.memory?.textures ?? 0,
  }
}
