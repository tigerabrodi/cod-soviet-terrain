import {
  edgeMorphEquals,
  getChunkRequestSignature,
  getDistance,
  toOriginTuple,
} from '@/components/terrain-scene-utils'
import { isSharedArrayBuffer } from '@/lib/shared/shared-array-buffer'
import {
  createTerrainChunkGeometry,
  type TerrainChunkStats,
} from '@/lib/terrain/terrain-chunk'
import {
  PLANET_RADIUS,
  type PlanetChunkDescriptor,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import { TerrainChunkWorkerPool } from '@/lib/terrain/terrain-worker-pool'
import {
  getChunkRequestBudget,
  takeCyclicWindow,
} from '@/lib/terrain/terrain-runtime-scheduling'
import type { TerrainGenerationSettings } from '@/lib/terrain/terrain-settings'
import {
  createSnowAccumulationRuntimeState,
  type SnowAccumulationRuntimeState,
} from '@/lib/weather/snow-accumulation'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { Float32BufferAttribute } from 'three'

export interface TerrainChunkRuntime extends PlanetChunkDescriptor {
  buildOrigin: readonly [number, number, number]
  edgeMorph: TerrainChunkEdgeMorph
  geometry: ReturnType<typeof createTerrainChunkGeometry>
  lastSeenGeneration: number
  revealStartedAtSeconds: number
  sharedArrayBufferBacked: boolean
  stats: TerrainChunkStats
  terrainGenerationSignature: string
}

interface PendingTerrainChunkCommit {
  buildOrigin: readonly [number, number, number]
  chunk: Pick<PlanetChunkDescriptor, 'face' | 'key' | 'resolution'>
  chunkBuffers: Parameters<typeof createTerrainChunkGeometry>[0]
  edgeMorph: TerrainChunkEdgeMorph
  terrainGenerationSignature: string
}

interface UseTerrainChunkStreamingParams {
  cameraFocusWorld: Vec3Like
  desiredChunkDescriptors: Array<PlanetChunkDescriptor>
  desiredEdgeMorphs: Map<string, TerrainChunkEdgeMorph>
  snowSimulationTimeRef: MutableRefObject<number>
  snowStateLookupRef: MutableRefObject<Map<string, SnowAccumulationRuntimeState>>
  terrainGeneration: TerrainGenerationSettings
  terrainGenerationSignature: string
  worldOriginRef: MutableRefObject<Vec3Like>
}

export interface TerrainChunkStreamingRuntimeStats {
  inflightChunkCount: number
  pendingChunkCommitCount: number
}

const MAX_CHUNK_COMMITS_PER_FLUSH = 6
const MAX_INFLIGHT_CHUNK_REQUESTS = 12
const MAX_NEW_REQUESTS_PER_PASS = 6
const MAX_RETAINED_GENERATION_LAG = 2
const ZERO_EDGE_MORPH: TerrainChunkEdgeMorph = {
  east: 0,
  north: 0,
  south: 0,
  west: 0,
}

export function useTerrainChunkStreaming({
  cameraFocusWorld,
  desiredChunkDescriptors,
  desiredEdgeMorphs,
  snowSimulationTimeRef,
  snowStateLookupRef,
  terrainGeneration,
  terrainGenerationSignature,
  worldOriginRef,
}: UseTerrainChunkStreamingParams) {
  const [terrainChunks, setTerrainChunks] = useState<
    Record<string, TerrainChunkRuntime>
  >({})
  const desiredChunkLookupRef = useRef(new Map<string, PlanetChunkDescriptor>())
  const desiredEdgeMorphLookupRef = useRef(
    new Map<string, TerrainChunkEdgeMorph>()
  )
  const inflightChunkLookupRef = useRef(new Map<string, string>())
  const pendingChunkCommitLookupRef = useRef(
    new Map<string, PendingTerrainChunkCommit>()
  )
  const terrainChunksRef = useRef<Record<string, TerrainChunkRuntime>>({})
  const runtimeStatsRef = useRef<TerrainChunkStreamingRuntimeStats>({
    inflightChunkCount: 0,
    pendingChunkCommitCount: 0,
  })
  const desiredGenerationRef = useRef(0)
  const chunkCommitFlushFrameRef = useRef<number | null>(null)
  const flushPendingChunkCommitsRef = useRef<() => void>(() => {})
  const workerPoolRef = useRef<TerrainChunkWorkerPool | null>(null)

  const scheduleChunkCommitFlush = useCallback(() => {
    if (chunkCommitFlushFrameRef.current !== null) {
      return
    }

    chunkCommitFlushFrameRef.current = window.requestAnimationFrame(() => {
      chunkCommitFlushFrameRef.current = null
      flushPendingChunkCommitsRef.current()
    })
  }, [])

  const syncRuntimeStats = useCallback(() => {
    runtimeStatsRef.current = {
      inflightChunkCount: inflightChunkLookupRef.current.size,
      pendingChunkCommitCount: pendingChunkCommitLookupRef.current.size,
    }
  }, [])

  const pruneRetainedTerrainChunks = useCallback(() => {
    const desiredGeneration = desiredGenerationRef.current

    setTerrainChunks((currentTerrainChunks) => {
      let nextTerrainChunks = currentTerrainChunks
      const isDesiredWindowReadyNow = isDesiredWindowReady(
        currentTerrainChunks,
        desiredChunkLookupRef.current,
        desiredEdgeMorphLookupRef.current,
        terrainGenerationSignature
      )

      for (const [terrainChunkKey, terrainChunk] of Object.entries(
        currentTerrainChunks
      )) {
        const isCurrentGenerationChunk =
          terrainChunk.lastSeenGeneration >= desiredGeneration

        if (isCurrentGenerationChunk) {
          continue
        }

        const shouldPrune =
          isDesiredWindowReadyNow ||
          terrainChunk.lastSeenGeneration <
            desiredGeneration - MAX_RETAINED_GENERATION_LAG

        if (!shouldPrune) {
          continue
        }

        if (nextTerrainChunks === currentTerrainChunks) {
          nextTerrainChunks = { ...currentTerrainChunks }
        }

        nextTerrainChunks[terrainChunkKey]?.geometry.dispose()
        delete nextTerrainChunks[terrainChunkKey]
        inflightChunkLookupRef.current.delete(terrainChunkKey)
        pendingChunkCommitLookupRef.current.delete(terrainChunkKey)
        snowStateLookupRef.current.delete(terrainChunkKey)
      }

      terrainChunksRef.current = nextTerrainChunks
      return nextTerrainChunks
    })

    syncRuntimeStats()
  }, [snowStateLookupRef, syncRuntimeStats, terrainGenerationSignature])

  const flushPendingChunkCommits = useCallback(() => {
    const pendingEntries = Array.from(
      pendingChunkCommitLookupRef.current.entries()
    ).slice(0, MAX_CHUNK_COMMITS_PER_FLUSH)

    if (pendingEntries.length === 0) {
      return
    }

    for (const [terrainChunkKey] of pendingEntries) {
      pendingChunkCommitLookupRef.current.delete(terrainChunkKey)
    }
    syncRuntimeStats()

    setTerrainChunks((currentTerrainChunks) => {
      let nextTerrainChunks = currentTerrainChunks

      for (const [terrainChunkKey, pendingChunkCommit] of pendingEntries) {
        const desiredChunk =
          desiredChunkLookupRef.current.get(terrainChunkKey) ?? null
        const desiredEdgeMorph =
          desiredEdgeMorphLookupRef.current.get(terrainChunkKey) ??
          ZERO_EDGE_MORPH

        if (
          !desiredChunk ||
          desiredChunk.resolution !== pendingChunkCommit.chunk.resolution ||
          desiredChunk.face !== pendingChunkCommit.chunk.face ||
          !edgeMorphEquals(desiredEdgeMorph, pendingChunkCommit.edgeMorph)
        ) {
          continue
        }

        const currentChunk = nextTerrainChunks[terrainChunkKey]

        if (
          currentChunk?.resolution === desiredChunk.resolution &&
          currentChunk.terrainGenerationSignature ===
            pendingChunkCommit.terrainGenerationSignature &&
          edgeMorphEquals(currentChunk.edgeMorph, desiredEdgeMorph)
        ) {
          continue
        }

        const geometry = createTerrainChunkGeometry(pendingChunkCommit.chunkBuffers)
        const snowState = createSnowAccumulationRuntimeState({
          accumulation: pendingChunkCommit.chunkBuffers.snowCoverage,
          key: terrainChunkKey,
          settingsVersion: pendingChunkCommit.terrainGenerationSignature,
          support: pendingChunkCommit.chunkBuffers.snowSupport,
          terrainCoords: pendingChunkCommit.chunkBuffers.terrainCoords,
          terrainHeights: pendingChunkCommit.chunkBuffers.terrainHeights,
          vertexCount: pendingChunkCommit.chunkBuffers.terrainHeights.length,
        })

        snowState.lastUpdateTime = snowSimulationTimeRef.current
        geometry.setAttribute('snowCoverage', snowState.accumulationAttribute)
        geometry.setAttribute(
          'chunkReveal',
          new Float32BufferAttribute(
            new Float32Array(pendingChunkCommit.chunkBuffers.terrainHeights.length),
            1
          )
        )

        if (nextTerrainChunks === currentTerrainChunks) {
          nextTerrainChunks = { ...currentTerrainChunks }
        }

        currentChunk?.geometry.dispose()
        snowStateLookupRef.current.delete(terrainChunkKey)
        snowStateLookupRef.current.set(terrainChunkKey, snowState)

        nextTerrainChunks[terrainChunkKey] = {
          ...desiredChunk,
          buildOrigin: pendingChunkCommit.buildOrigin,
          edgeMorph: desiredEdgeMorph,
          geometry,
          lastSeenGeneration: desiredGenerationRef.current,
          revealStartedAtSeconds: performance.now() * 0.001,
          sharedArrayBufferBacked: isSharedArrayBuffer(
            pendingChunkCommit.chunkBuffers.positions.buffer
          ),
          stats: pendingChunkCommit.chunkBuffers.stats,
          terrainGenerationSignature:
            pendingChunkCommit.terrainGenerationSignature,
        }
      }

      terrainChunksRef.current = nextTerrainChunks
      return nextTerrainChunks
    })

    pruneRetainedTerrainChunks()

    if (pendingChunkCommitLookupRef.current.size > 0) {
      scheduleChunkCommitFlush()
    }
  }, [
    pruneRetainedTerrainChunks,
    scheduleChunkCommitFlush,
    snowSimulationTimeRef,
    snowStateLookupRef,
    syncRuntimeStats,
  ])

  useEffect(() => {
    flushPendingChunkCommitsRef.current = flushPendingChunkCommits
  }, [flushPendingChunkCommits])

  useEffect(() => {
    const snowStates = snowStateLookupRef.current
    const pendingChunkCommits = pendingChunkCommitLookupRef.current
    const workerPool = new TerrainChunkWorkerPool(getTerrainWorkerCount())

    workerPoolRef.current = workerPool

    return () => {
      workerPoolRef.current = null
      workerPool.destroy()

      if (chunkCommitFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(chunkCommitFlushFrameRef.current)
        chunkCommitFlushFrameRef.current = null
      }

      for (const terrainChunk of Object.values(terrainChunksRef.current)) {
        terrainChunk.geometry.dispose()
      }

      pendingChunkCommits.clear()
      snowStates.clear()
      syncRuntimeStats()
    }
  }, [snowStateLookupRef, syncRuntimeStats])

  useEffect(() => {
    desiredGenerationRef.current += 1
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
      let nextTerrainChunks = currentTerrainChunks
      const desiredGeneration = desiredGenerationRef.current

      for (const [terrainChunkKey, terrainChunk] of Object.entries(
        currentTerrainChunks
      )) {
        const desiredChunk = desiredChunkLookupRef.current.get(terrainChunkKey)
        const desiredEdgeMorph =
          desiredEdgeMorphLookupRef.current.get(terrainChunkKey) ??
          ZERO_EDGE_MORPH

        if (
          !desiredChunk ||
          desiredChunk.resolution !== terrainChunk.resolution ||
          !edgeMorphEquals(desiredEdgeMorph, terrainChunk.edgeMorph) ||
          terrainChunk.terrainGenerationSignature !== terrainGenerationSignature
        ) {
          continue
        }

        if (nextTerrainChunks === currentTerrainChunks) {
          nextTerrainChunks = { ...currentTerrainChunks }
        }

        nextTerrainChunks[terrainChunkKey] = {
          ...terrainChunk,
          lastSeenGeneration: desiredGeneration,
        }
      }

      terrainChunksRef.current = nextTerrainChunks
      return nextTerrainChunks
    })
    syncRuntimeStats()
    pruneRetainedTerrainChunks()

    const workerPool = workerPoolRef.current

    if (!workerPool) {
      return
    }

    const requestBudget = getChunkRequestBudget({
      inflightCount: inflightChunkLookupRef.current.size,
      maxInflightRequests: MAX_INFLIGHT_CHUNK_REQUESTS,
      maxNewRequestsPerPass: MAX_NEW_REQUESTS_PER_PASS,
    })

    if (requestBudget <= 0) {
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
    let requestedChunks = 0

    for (const terrainChunk of prioritizedChunks) {
      if (requestedChunks >= requestBudget) {
        break
      }

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
      syncRuntimeStats()
      requestedChunks += 1

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
          skirtDepth: 22,
          terrainSettings: terrainGeneration,
        })
        .then((chunkBuffers) => {
          if (
            inflightChunkLookupRef.current.get(terrainChunk.key) !==
            requestSignature
          ) {
            return
          }

          inflightChunkLookupRef.current.delete(terrainChunk.key)
          syncRuntimeStats()

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

          pendingChunkCommitLookupRef.current.set(terrainChunk.key, {
            buildOrigin,
            chunk: {
              face: terrainChunk.face,
              key: terrainChunk.key,
              resolution: terrainChunk.resolution,
            },
            chunkBuffers,
            edgeMorph: desiredEdgeMorph,
            terrainGenerationSignature,
          })
          syncRuntimeStats()
          scheduleChunkCommitFlush()
        })
        .catch((error: unknown) => {
          if (
            inflightChunkLookupRef.current.get(terrainChunk.key) ===
            requestSignature
          ) {
            inflightChunkLookupRef.current.delete(terrainChunk.key)
            syncRuntimeStats()
          }
          console.error('Failed to build terrain chunk in worker.', error)
        })
    }
  }, [
    cameraFocusWorld,
    desiredChunkDescriptors,
    desiredEdgeMorphs,
    scheduleChunkCommitFlush,
    syncRuntimeStats,
    snowStateLookupRef,
    terrainGeneration,
    terrainGenerationSignature,
    worldOriginRef,
    pruneRetainedTerrainChunks,
  ])

  return {
    runtimeStatsRef,
    terrainChunks,
    terrainChunksRef,
  }
}

export function takeSnowChunksForSimulation(
  snowStates: Map<string, SnowAccumulationRuntimeState>,
  cursor: number,
  maxChunksPerStep: number
) {
  return takeCyclicWindow(Array.from(snowStates.entries()), maxChunksPerStep, cursor)
}

function isDesiredWindowReady(
  terrainChunks: Record<string, TerrainChunkRuntime>,
  desiredChunkLookup: Map<string, PlanetChunkDescriptor>,
  desiredEdgeMorphLookup: Map<string, TerrainChunkEdgeMorph>,
  terrainGenerationSignature: string
) {
  for (const [terrainChunkKey, desiredChunk] of desiredChunkLookup.entries()) {
    const activeChunk = terrainChunks[terrainChunkKey]
    const desiredEdgeMorph =
      desiredEdgeMorphLookup.get(terrainChunkKey) ?? ZERO_EDGE_MORPH

    if (
      !activeChunk ||
      activeChunk.resolution !== desiredChunk.resolution ||
      activeChunk.face !== desiredChunk.face ||
      activeChunk.terrainGenerationSignature !== terrainGenerationSignature ||
      !edgeMorphEquals(activeChunk.edgeMorph, desiredEdgeMorph)
    ) {
      return false
    }
  }

  return true
}

function getTerrainWorkerCount() {
  if (typeof navigator === 'undefined') {
    return 6
  }

  const hardwareThreads = navigator.hardwareConcurrency ?? 8

  return Math.min(8, Math.max(6, Math.floor(hardwareThreads * 0.5)))
}
