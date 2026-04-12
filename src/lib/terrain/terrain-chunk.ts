import { Float32BufferAttribute, PlaneGeometry } from 'three'
import { NoiseGenerator } from './noise'

export const DEFAULT_TERRAIN_CHUNK_SIZE = 180
export const DEFAULT_TERRAIN_CHUNK_RESOLUTION = 64

export interface TerrainChunkBuildOptions {
  resolution?: number
  size?: number
}

export interface TerrainChunkStats {
  averageHeight: number
  maxHeight: number
  minHeight: number
  resolution: number
  size: number
}

export interface TerrainChunkData {
  geometry: PlaneGeometry
  stats: TerrainChunkStats
}

const broadNoise = new NoiseGenerator({
  exponentiation: 1.85,
  height: 28,
  lacunarity: 2.15,
  octaves: 6,
  persistence: 0.52,
  scale: 180,
  seed: 'soviet-terrain-broad',
})

const detailNoise = new NoiseGenerator({
  exponentiation: 1.3,
  height: 10,
  lacunarity: 2.4,
  octaves: 4,
  persistence: 0.58,
  scale: 70,
  seed: 'soviet-terrain-detail',
})

const ridgeNoise = new NoiseGenerator({
  exponentiation: 1.1,
  height: 8,
  lacunarity: 2.75,
  octaves: 3,
  persistence: 0.5,
  scale: 38,
  seed: 'soviet-terrain-ridge',
})

const craterNoise = new NoiseGenerator({
  exponentiation: 2.4,
  height: 12,
  lacunarity: 2.05,
  octaves: 3,
  persistence: 0.64,
  scale: 54,
  seed: 'soviet-terrain-crater',
})

export function buildTerrainChunk(
  options: TerrainChunkBuildOptions = {}
): TerrainChunkData {
  const size = options.size ?? DEFAULT_TERRAIN_CHUNK_SIZE
  const resolution = options.resolution ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION

  const geometry = new PlaneGeometry(size, size, resolution, resolution)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.getAttribute('position') as Float32BufferAttribute

  let minHeight = Number.POSITIVE_INFINITY
  let maxHeight = Number.NEGATIVE_INFINITY
  let heightTotal = 0

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const height = sampleTerrainHeight(x, z)

    positions.setY(index, height)
    minHeight = Math.min(minHeight, height)
    maxHeight = Math.max(maxHeight, height)
    heightTotal += height
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()

  const normals = geometry.getAttribute('normal') as Float32BufferAttribute
  const splatWeights = new Float32Array(positions.count * 4)

  for (let index = 0; index < positions.count; index += 1) {
    const height = positions.getY(index)
    const flatness = clamp(normals.getY(index), 0, 1)
    const height01 = inverseLerp(minHeight, maxHeight, height)

    const weights = computeSplatWeights(height01, flatness)
    const offset = index * 4

    splatWeights[offset] = weights[0]
    splatWeights[offset + 1] = weights[1]
    splatWeights[offset + 2] = weights[2]
    splatWeights[offset + 3] = weights[3]
  }

  geometry.setAttribute(
    'splatWeights',
    new Float32BufferAttribute(splatWeights, 4)
  )
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return {
    geometry,
    stats: {
      averageHeight: heightTotal / positions.count,
      maxHeight,
      minHeight,
      resolution,
      size,
    },
  }
}

function sampleTerrainHeight(x: number, z: number) {
  const broad = broadNoise.get(x, 17.3, z) - 10.5
  const detail = (detailNoise.get(x * 1.15, 61.4, z * 1.15) - 4.8) * 0.85
  const ridge = (ridgeNoise.get(x * 1.35, 109.7, z * 1.35) - 4.1) * 0.45
  const craterField = craterNoise.get(x * 0.85, 177.2, z * 0.85)
  const craterMask = smoothstep(6.2, 9.3, craterField)
  const craterDepth = craterMask * craterMask * 7.5

  return 12 + broad + detail + ridge - craterDepth
}

function computeSplatWeights(height01: number, flatness: number) {
  const steepness = 1 - flatness
  const rockWeight = smoothstep(0.18, 0.42, steepness)
  const flatShare = 1 - rockWeight

  const scorchedWeight = flatShare * (1 - smoothstep(0.2, 0.42, height01))
  const frozenWeight =
    flatShare *
    smoothstep(0.24, 0.5, height01) *
    (1 - smoothstep(0.56, 0.78, height01))
  const frostWeight = flatShare * smoothstep(0.6, 0.88, height01)

  return normalizeWeights([
    scorchedWeight,
    frozenWeight,
    frostWeight,
    rockWeight,
  ])
}

function normalizeWeights(weights: [number, number, number, number]) {
  const total = weights[0] + weights[1] + weights[2] + weights[3]

  if (total <= Number.EPSILON) {
    return [1, 0, 0, 0] as const
  }

  return [
    weights[0] / total,
    weights[1] / total,
    weights[2] / total,
    weights[3] / total,
  ] as const
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function inverseLerp(min: number, max: number, value: number) {
  if (Math.abs(max - min) <= Number.EPSILON) {
    return 0
  }

  return clamp((value - min) / (max - min), 0, 1)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = inverseLerp(edge0, edge1, value)
  return amount * amount * (3 - 2 * amount)
}
