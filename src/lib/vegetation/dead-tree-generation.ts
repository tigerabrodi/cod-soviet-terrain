import {
  PLANET_RADIUS,
  getPlanetPointOnFace,
  type PlanetChunkDescriptor,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import {
  samplePlanetTerrainHeight,
  type TerrainChunkBuildOptions,
} from '@/lib/terrain/terrain-chunk'
import type { TerrainGenerationSettings } from '@/lib/terrain/terrain-settings'

export interface DeadTreeSettings {
  density: number
  enabled: boolean
  heightScale: number
  maxLodLevel: number
}

export interface DeadTreeChunkInstances {
  count: number
  positions: Float32Array
  scales: Float32Array
  ups: Float32Array
  yaws: Float32Array
}

export interface DeadTreeChunkBuildInput {
  buildOrigin: TerrainChunkBuildOptions['origin']
  chunk: Pick<
    PlanetChunkDescriptor,
    'centerX' | 'centerY' | 'face' | 'key' | 'lodLevel' | 'size'
  >
  terrainSettings: TerrainGenerationSettings
  vegetationSettings: DeadTreeSettings
}

export const DEFAULT_DEAD_TREE_SETTINGS: DeadTreeSettings = {
  density: 1,
  enabled: true,
  heightScale: 1,
  maxLodLevel: 1,
}

export function buildDeadTreeChunkInstances({
  buildOrigin,
  chunk,
  terrainSettings,
  vegetationSettings,
}: DeadTreeChunkBuildInput): DeadTreeChunkInstances {
  if (
    !vegetationSettings.enabled ||
    vegetationSettings.density <= 0 ||
    chunk.lodLevel > vegetationSettings.maxLodLevel
  ) {
    return createEmptyDeadTreeChunkInstances()
  }

  const halfSize = chunk.size * 0.5
  const edgeMargin = chunk.size * 0.08
  const usableSize = chunk.size - edgeMargin * 2
  const lodDensityScale = chunk.lodLevel === 0 ? 1 : 0.72
  const gridSize = Math.max(
    2,
    Math.round(3 + vegetationSettings.density * 2.5 * lodDensityScale)
  )
  const origin = {
    x: buildOrigin?.[0] ?? 0,
    y: buildOrigin?.[1] ?? 0,
    z: buildOrigin?.[2] ?? 0,
  }
  const positions: Array<number> = []
  const scales: Array<number> = []
  const ups: Array<number> = []
  const yaws: Array<number> = []

  for (let yIndex = 0; yIndex < gridSize; yIndex += 1) {
    for (let xIndex = 0; xIndex < gridSize; xIndex += 1) {
      const random = createMulberry32(
        hashString(`${chunk.key}:${xIndex}:${yIndex}:dead-tree`)
      )
      const placementChance =
        0.18 + vegetationSettings.density * 0.24 * lodDensityScale

      if (random() > placementChance) {
        continue
      }

      const patchX =
        chunk.centerX -
        halfSize +
        edgeMargin +
        ((xIndex + random()) / gridSize) * usableSize
      const patchY =
        chunk.centerY -
        halfSize +
        edgeMargin +
        ((yIndex + random()) / gridSize) * usableSize
      const surface = samplePlanetSurface(
        chunk.face,
        patchX,
        patchY,
        chunk.size,
        origin,
        terrainSettings
      )
      const cluster = computeTreeClusterMask(surface.worldPosition)

      if (
        surface.support < 0.84 ||
        surface.height < -1.5 ||
        surface.height > 13 ||
        cluster < 0.45
      ) {
        continue
      }

      const heightScale =
        vegetationSettings.heightScale * mix(14, 24, random())
      const widthScale = mix(2, 3.2, random())

      positions.push(
        surface.localPosition.x,
        surface.localPosition.y,
        surface.localPosition.z
      )
      scales.push(widthScale, heightScale, widthScale)
      ups.push(surface.up.x, surface.up.y, surface.up.z)
      yaws.push(random() * Math.PI * 2)
    }
  }

  return {
    count: yaws.length,
    positions: new Float32Array(positions),
    scales: new Float32Array(scales),
    ups: new Float32Array(ups),
    yaws: new Float32Array(yaws),
  }
}

export function createDeadTreeSettingsSignature(settings: DeadTreeSettings) {
  return [
    settings.enabled ? 1 : 0,
    settings.density,
    settings.heightScale,
    settings.maxLodLevel,
  ]
    .map((value) => value.toFixed(3))
    .join('|')
}

function createEmptyDeadTreeChunkInstances(): DeadTreeChunkInstances {
  return {
    count: 0,
    positions: new Float32Array(0),
    scales: new Float32Array(0),
    ups: new Float32Array(0),
    yaws: new Float32Array(0),
  }
}

function samplePlanetSurface(
  face: DeadTreeChunkBuildInput['chunk']['face'],
  patchX: number,
  patchY: number,
  chunkSize: number,
  origin: Vec3Like,
  terrainSettings: TerrainGenerationSettings
) {
  const delta = Math.max(4, chunkSize / 28)
  const center = sampleSurfacePoint(face, patchX, patchY, origin, terrainSettings)
  const east = sampleSurfacePoint(
    face,
    patchX + delta,
    patchY,
    origin,
    terrainSettings
  )
  const west = sampleSurfacePoint(
    face,
    patchX - delta,
    patchY,
    origin,
    terrainSettings
  )
  const north = sampleSurfacePoint(
    face,
    patchX,
    patchY - delta,
    origin,
    terrainSettings
  )
  const south = sampleSurfacePoint(
    face,
    patchX,
    patchY + delta,
    origin,
    terrainSettings
  )
  const tangentX = subtractVec3(east.worldPosition, west.worldPosition)
  const tangentY = subtractVec3(south.worldPosition, north.worldPosition)
  let normal = normalizeVec3(crossVec3(tangentX, tangentY))

  if (dotVec3(normal, center.up) < 0) {
    normal = scaleVec3(normal, -1)
  }

  return {
    ...center,
    support: clamp(dotVec3(normal, center.up), 0, 1),
  }
}

function sampleSurfacePoint(
  face: DeadTreeChunkBuildInput['chunk']['face'],
  patchX: number,
  patchY: number,
  origin: Vec3Like,
  terrainSettings: TerrainGenerationSettings
) {
  const basePoint = getPlanetPointOnFace(face, patchX, patchY, PLANET_RADIUS)
  const up = normalizeVec3(basePoint)
  const height = samplePlanetTerrainHeight(
    basePoint.x,
    basePoint.y,
    basePoint.z,
    terrainSettings
  )
  const worldPosition = {
    x: basePoint.x + up.x * height,
    y: basePoint.y + up.y * height,
    z: basePoint.z + up.z * height,
  }

  return {
    height,
    localPosition: subtractVec3(worldPosition, origin),
    up,
    worldPosition,
  }
}

function computeTreeClusterMask(worldPosition: Vec3Like) {
  const lowFrequency =
    Math.sin(worldPosition.x * 0.012 + 0.4) *
    Math.cos(worldPosition.z * 0.011 - 0.18)
  const midFrequency =
    Math.sin(worldPosition.y * 0.02 + worldPosition.x * 0.007) *
    0.5

  return clamp(lowFrequency * 0.35 + midFrequency * 0.25 + 0.5, 0, 1)
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function createMulberry32(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5

    let next = Math.imul(state ^ (state >>> 15), 1 | state)

    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function subtractVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function crossVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  }
}

function normalizeVec3(value: Vec3Like) {
  const length = Math.hypot(value.x, value.y, value.z) || 1

  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  }
}

function dotVec3(left: Vec3Like, right: Vec3Like) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function scaleVec3(value: Vec3Like, scale: number) {
  return {
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale,
  }
}

function mix(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
