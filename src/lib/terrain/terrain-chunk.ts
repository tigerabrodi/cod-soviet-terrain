import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { NoiseGenerator } from './noise'

export const DEFAULT_TERRAIN_CHUNK_SIZE = 180
export const DEFAULT_TERRAIN_CHUNK_RESOLUTION = 64

export interface TerrainChunkBuildOptions {
  offsetX?: number
  offsetZ?: number
  resolution?: number
  size?: number
  skirtDepth?: number
}

export interface TerrainChunkStats {
  averageHeight: number
  maxHeight: number
  minHeight: number
  resolution: number
  size: number
}

export interface TerrainChunkBuffers {
  indices: Uint16Array | Uint32Array
  normals: Float32Array
  positions: Float32Array
  splatWeights: Float32Array
  stats: TerrainChunkStats
}

export interface TerrainChunkData {
  geometry: BufferGeometry
  stats: TerrainChunkStats
}

export type TerrainSplatWeights = readonly [number, number, number, number]

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
  const chunkBuffers = generateTerrainChunkBuffers(options)

  return {
    geometry: createTerrainChunkGeometry(chunkBuffers),
    stats: chunkBuffers.stats,
  }
}

export function generateTerrainChunkBuffers(
  options: TerrainChunkBuildOptions = {}
): TerrainChunkBuffers {
  const offsetX = options.offsetX ?? 0
  const offsetZ = options.offsetZ ?? 0
  const skirtDepth = options.skirtDepth ?? 0
  const size = options.size ?? DEFAULT_TERRAIN_CHUNK_SIZE
  const resolution = options.resolution ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION
  const baseVertexCount = (resolution + 1) * (resolution + 1)
  const skirtVertexCount = skirtDepth > 0 ? 8 * (resolution + 1) : 0
  const vertexCount = baseVertexCount + skirtVertexCount
  const halfSize = size * 0.5
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const splatWeights = new Float32Array(vertexCount * 4)
  let skirtRibbons: Array<TerrainChunkSkirtRibbon> = []

  let minHeight = Number.POSITIVE_INFINITY
  let maxHeight = Number.NEGATIVE_INFINITY
  let heightTotal = 0
  let vertexIndex = 0

  for (let zIndex = 0; zIndex <= resolution; zIndex += 1) {
    const z = -halfSize + (zIndex / resolution) * size

    for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
      const x = -halfSize + (xIndex / resolution) * size
      const height = sampleTerrainHeight(x + offsetX, z + offsetZ)
      const positionOffset = vertexIndex * 3

      positions[positionOffset] = x
      positions[positionOffset + 1] = height
      positions[positionOffset + 2] = z

      minHeight = Math.min(minHeight, height)
      maxHeight = Math.max(maxHeight, height)
      heightTotal += height
      vertexIndex += 1
    }
  }

  if (skirtDepth > 0) {
    skirtRibbons = appendTerrainChunkSkirts(
      positions,
      baseVertexCount,
      resolution,
      skirtDepth
    )
  }

  const indices = createTerrainChunkIndices(
    vertexCount,
    resolution,
    skirtRibbons
  )

  accumulateTerrainChunkNormals(positions, indices, normals)

  for (let index = 0; index < vertexCount; index += 1) {
    const height = positions[index * 3 + 1]
    const flatness = clamp(normals[index * 3 + 1], 0, 1)
    const height01 = inverseLerp(minHeight, maxHeight, height)
    const weights = computeSplatWeights(height01, flatness)
    const splatOffset = index * 4

    splatWeights[splatOffset] = weights[0]
    splatWeights[splatOffset + 1] = weights[1]
    splatWeights[splatOffset + 2] = weights[2]
    splatWeights[splatOffset + 3] = weights[3]
  }

  return {
    indices,
    normals,
    positions,
    splatWeights,
    stats: {
      averageHeight: heightTotal / baseVertexCount,
      maxHeight,
      minHeight,
      resolution,
      size,
    },
  }
}

export function createTerrainChunkGeometry(chunkBuffers: TerrainChunkBuffers) {
  const geometry = new BufferGeometry()

  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(chunkBuffers.positions, 3)
  )
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(chunkBuffers.normals, 3)
  )
  geometry.setAttribute(
    'splatWeights',
    new Float32BufferAttribute(chunkBuffers.splatWeights, 4)
  )
  geometry.setIndex(new BufferAttribute(chunkBuffers.indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return geometry
}

export function sampleTerrainHeight(x: number, z: number) {
  const broad = broadNoise.get(x, 17.3, z) - 10.5
  const detail = (detailNoise.get(x * 1.15, 61.4, z * 1.15) - 4.8) * 0.85
  const ridge = (ridgeNoise.get(x * 1.35, 109.7, z * 1.35) - 4.1) * 0.45
  const craterField = craterNoise.get(x * 0.85, 177.2, z * 0.85)
  const craterMask = smoothstep(6.2, 9.3, craterField)
  const craterDepth = craterMask * craterMask * 7.5

  return 12 + broad + detail + ridge - craterDepth
}

export function computeSplatWeights(
  height01: number,
  flatness: number
): TerrainSplatWeights {
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

interface TerrainChunkSkirtRibbon {
  bottom: Array<number>
  top: Array<number>
}

function appendTerrainChunkSkirts(
  positions: Float32Array,
  baseVertexCount: number,
  resolution: number,
  skirtDepth: number
) {
  const skirtRibbons: Array<TerrainChunkSkirtRibbon> = []
  let vertexIndex = baseVertexCount

  for (const sourceIndices of getTerrainChunkSkirtSourceIndices(resolution)) {
    const ribbon: TerrainChunkSkirtRibbon = {
      bottom: [],
      top: [],
    }

    for (const sourceIndex of sourceIndices) {
      const sourceOffset = sourceIndex * 3
      const topVertexIndex = vertexIndex
      const topOffset = topVertexIndex * 3

      positions[topOffset] = positions[sourceOffset]
      positions[topOffset + 1] = positions[sourceOffset + 1]
      positions[topOffset + 2] = positions[sourceOffset + 2]
      ribbon.top.push(topVertexIndex)
      vertexIndex += 1

      const bottomVertexIndex = vertexIndex
      const bottomOffset = bottomVertexIndex * 3

      positions[bottomOffset] = positions[sourceOffset]
      positions[bottomOffset + 1] = positions[sourceOffset + 1] - skirtDepth
      positions[bottomOffset + 2] = positions[sourceOffset + 2]
      ribbon.bottom.push(bottomVertexIndex)
      vertexIndex += 1
    }

    skirtRibbons.push(ribbon)
  }

  return skirtRibbons
}

function getTerrainChunkSkirtSourceIndices(resolution: number) {
  const edgeLength = resolution + 1

  return [
    Array.from({ length: edgeLength }, (_, index) => index),
    Array.from(
      { length: edgeLength },
      (_, index) => index * edgeLength + resolution
    ),
    Array.from(
      { length: edgeLength },
      (_, index) => resolution * edgeLength + (resolution - index)
    ),
    Array.from(
      { length: edgeLength },
      (_, index) => (resolution - index) * edgeLength
    ),
  ]
}

function createTerrainChunkIndices(
  vertexCount: number,
  resolution: number,
  skirtRibbons: Array<TerrainChunkSkirtRibbon> = []
) {
  const indexCount =
    resolution * resolution * 6 + skirtRibbons.length * resolution * 6
  const indices =
    vertexCount > 65535
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount)

  let indexOffset = 0

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const topLeft = zIndex * (resolution + 1) + xIndex
      const topRight = topLeft + 1
      const bottomLeft = (zIndex + 1) * (resolution + 1) + xIndex
      const bottomRight = bottomLeft + 1

      indices[indexOffset] = topLeft
      indices[indexOffset + 1] = bottomLeft
      indices[indexOffset + 2] = topRight
      indices[indexOffset + 3] = topRight
      indices[indexOffset + 4] = bottomLeft
      indices[indexOffset + 5] = bottomRight
      indexOffset += 6
    }
  }

  for (const ribbon of skirtRibbons) {
    for (let segmentIndex = 0; segmentIndex < resolution; segmentIndex += 1) {
      const topLeft = ribbon.top[segmentIndex]
      const topRight = ribbon.top[segmentIndex + 1]
      const bottomLeft = ribbon.bottom[segmentIndex]
      const bottomRight = ribbon.bottom[segmentIndex + 1]

      indices[indexOffset] = topLeft
      indices[indexOffset + 1] = topRight
      indices[indexOffset + 2] = bottomLeft
      indices[indexOffset + 3] = topRight
      indices[indexOffset + 4] = bottomRight
      indices[indexOffset + 5] = bottomLeft
      indexOffset += 6
    }
  }

  return indices
}

function accumulateTerrainChunkNormals(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
  normals: Float32Array
) {
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]
    const b = indices[index + 1]
    const c = indices[index + 2]

    const ax = positions[a * 3]
    const ay = positions[a * 3 + 1]
    const az = positions[a * 3 + 2]
    const bx = positions[b * 3]
    const by = positions[b * 3 + 1]
    const bz = positions[b * 3 + 2]
    const cx = positions[c * 3]
    const cy = positions[c * 3 + 1]
    const cz = positions[c * 3 + 2]

    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az

    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx

    normals[a * 3] += nx
    normals[a * 3 + 1] += ny
    normals[a * 3 + 2] += nz
    normals[b * 3] += nx
    normals[b * 3 + 1] += ny
    normals[b * 3 + 2] += nz
    normals[c * 3] += nx
    normals[c * 3 + 1] += ny
    normals[c * 3 + 2] += nz
  }

  for (let index = 0; index < normals.length; index += 3) {
    const nx = normals[index]
    const ny = normals[index + 1]
    const nz = normals[index + 2]
    const length = Math.hypot(nx, ny, nz)

    if (length <= Number.EPSILON) {
      normals[index] = 0
      normals[index + 1] = 1
      normals[index + 2] = 0
      continue
    }

    normals[index] = nx / length
    normals[index + 1] = ny / length
    normals[index + 2] = nz / length
  }
}

function normalizeWeights(
  weights: [number, number, number, number]
): TerrainSplatWeights {
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
