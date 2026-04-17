import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three'
import {
  computeSplatWeights,
  samplePlanetTerrainHeight,
} from '@/lib/terrain/terrain-chunk'
import { smoothstep } from '@/lib/terrain/terrain-sampling'
import {
  PLANET_MAX_HEIGHT,
  PLANET_MIN_HEIGHT,
  PLANET_RADIUS,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'
import type { TerrainGenerationSettings } from '@/lib/terrain/terrain-settings'

export function edgeMorphEquals(
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

export function getChunkRequestSignature(
  resolution: number,
  edgeMorph: TerrainChunkEdgeMorph,
  terrainGenerationSignature: string
) {
  return `${resolution}:${edgeMorph.east}:${edgeMorph.north}:${edgeMorph.south}:${edgeMorph.west}:${terrainGenerationSignature}`
}

export function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

export function toOriginTuple(
  vector: Vec3Like
): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

export function createPlanetBackdropGeometry(
  terrainSettings: TerrainGenerationSettings
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

export function createPlanetOverviewGeometry(
  terrainSettings: TerrainGenerationSettings,
  options?: {
    heightBias?: number
    heightSegments?: number
    snowCoverageScale?: number
    widthSegments?: number
  }
) {
  const heightBias = options?.heightBias ?? 0
  const heightSegments = options?.heightSegments ?? 72
  const snowCoverageScale = options?.snowCoverageScale ?? 0.4
  const widthSegments = options?.widthSegments ?? 128
  const geometry = new SphereGeometry(PLANET_RADIUS, widthSegments, heightSegments)
  const positions = geometry.getAttribute('position')
  const vertexCount = positions.count
  const terrainCoords = new Float32Array(vertexCount * 3)
  const terrainHeights = new Float32Array(vertexCount)
  const terrainUps = new Float32Array(vertexCount * 3)
  const snowCoverage = new Float32Array(vertexCount)
  const splatWeights = new Float32Array(vertexCount * 4)
  const chunkReveal = new Float32Array(vertexCount).fill(1)

  for (let index = 0; index < vertexCount; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    const length = Math.hypot(x, y, z) || 1
    const up = {
      x: x / length,
      y: y / length,
      z: z / length,
    }
    const terrainSamplePosition = {
      x: up.x * PLANET_RADIUS,
      y: up.y * PLANET_RADIUS,
      z: up.z * PLANET_RADIUS,
    }
    const height = samplePlanetTerrainHeight(
      terrainSamplePosition.x,
      terrainSamplePosition.y,
      terrainSamplePosition.z,
      terrainSettings
    )
    const radius = PLANET_RADIUS + height + heightBias

    positions.setXYZ(index, up.x * radius, up.y * radius, up.z * radius)
    setVec3Array(terrainCoords, index, terrainSamplePosition)
    setVec3Array(terrainUps, index, up)
    terrainHeights[index] = height
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()

  const normals = geometry.getAttribute('normal')

  for (let index = 0; index < vertexCount; index += 1) {
    const flatness = clamp(
      normals.getX(index) * terrainUps[index * 3] +
        normals.getY(index) * terrainUps[index * 3 + 1] +
        normals.getZ(index) * terrainUps[index * 3 + 2],
      0,
      1
    )
    const height01 = inverseLerp(
      PLANET_MIN_HEIGHT,
      PLANET_MAX_HEIGHT,
      terrainHeights[index]
    )
    const weights = computeSplatWeights(height01, flatness)

    splatWeights[index * 4] = weights[0]
    splatWeights[index * 4 + 1] = weights[1]
    splatWeights[index * 4 + 2] = weights[2]
    splatWeights[index * 4 + 3] = weights[3]
    snowCoverage[index] =
      smoothstep(0.62, 0.9, height01) *
      smoothstep(0.55, 0.96, flatness) *
      snowCoverageScale
  }

  geometry.setAttribute(
    'terrainCoords',
    new Float32BufferAttribute(terrainCoords, 3)
  )
  geometry.setAttribute(
    'terrainHeight',
    new Float32BufferAttribute(terrainHeights, 1)
  )
  geometry.setAttribute('terrainUp', new Float32BufferAttribute(terrainUps, 3))
  geometry.setAttribute(
    'snowCoverage',
    new Float32BufferAttribute(snowCoverage, 1)
  )
  geometry.setAttribute(
    'splatWeights',
    new Float32BufferAttribute(splatWeights, 4)
  )
  geometry.setAttribute(
    'chunkReveal',
    new Float32BufferAttribute(chunkReveal, 1)
  )
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return geometry as BufferGeometry
}

export function applyCameraSetup(
  camera: Camera,
  setup: {
    localCameraPosition: readonly [number, number, number]
    localLookAt: readonly [number, number, number]
    localUp: readonly [number, number, number]
  }
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

function setVec3Array(
  target: Float32Array,
  index: number,
  value: Vec3Like
) {
  const baseIndex = index * 3
  target[baseIndex] = value.x
  target[baseIndex + 1] = value.y
  target[baseIndex + 2] = value.z
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function inverseLerp(min: number, max: number, value: number) {
  if (Math.abs(max - min) <= Number.EPSILON) {
    return 0
  }

  return clamp((value - min) / (max - min), 0, 1)
}
