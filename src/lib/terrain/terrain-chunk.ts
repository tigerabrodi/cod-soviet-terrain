import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { NoiseGenerator } from './noise'
import {
  PLANET_MAX_HEIGHT,
  PLANET_MIN_HEIGHT,
  PLANET_RADIUS,
  getPlanetPointOnFace,
  subtractWorldOrigin,
  type CubeFaceId,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from './terrain-planet'

export const DEFAULT_TERRAIN_CHUNK_SIZE = 180
export const DEFAULT_TERRAIN_CHUNK_RESOLUTION = 64

export interface TerrainChunkBuildOptions {
  centerX?: number
  centerY?: number
  edgeMorph?: TerrainChunkEdgeMorph
  face?: CubeFaceId
  mode?: 'flat' | 'planet'
  offsetX?: number
  offsetZ?: number
  origin?: readonly [number, number, number]
  planetRadius?: number
  resolution?: number
  sharedArrayBuffer?: boolean
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
  terrainCoords: Float32Array
  terrainHeights: Float32Array
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
  return options.mode === 'planet'
    ? generatePlanetTerrainChunkBuffers(options)
    : generateFlatTerrainChunkBuffers(options)
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
  geometry.setAttribute(
    'terrainCoords',
    new Float32BufferAttribute(chunkBuffers.terrainCoords, 3)
  )
  geometry.setAttribute(
    'terrainHeight',
    new Float32BufferAttribute(chunkBuffers.terrainHeights, 1)
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

export function samplePlanetTerrainHeight(x: number, y: number, z: number) {
  const broad = broadNoise.get(x, y + 17.3, z) - 10.5
  const detail =
    (detailNoise.get(x * 1.15, y * 1.15 + 61.4, z * 1.15) - 4.8) * 0.72
  const ridge =
    (ridgeNoise.get(x * 1.35, y * 1.35 + 109.7, z * 1.35) - 4.1) * 0.4
  const craterField = craterNoise.get(x * 0.85, y * 0.85 + 177.2, z * 0.85)
  const craterMask = smoothstep(6.2, 9.3, craterField)
  const craterDepth = craterMask * craterMask * 5.5

  return 8 + broad + detail + ridge - craterDepth
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

function generateFlatTerrainChunkBuffers(
  options: TerrainChunkBuildOptions
): TerrainChunkBuffers {
  const offsetX = options.offsetX ?? 0
  const offsetZ = options.offsetZ ?? 0
  const resolution = options.resolution ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION
  const size = options.size ?? DEFAULT_TERRAIN_CHUNK_SIZE
  const skirtDepth = options.skirtDepth ?? 0
  const isSharedArrayBufferEnabled = options.sharedArrayBuffer === true
  const baseVertexCount = (resolution + 1) * (resolution + 1)
  const skirtVertexCount = skirtDepth > 0 ? 8 * (resolution + 1) : 0
  const vertexCount = baseVertexCount + skirtVertexCount
  const halfSize = size * 0.5
  const arrays = createTerrainChunkArrays(
    vertexCount,
    isSharedArrayBufferEnabled
  )
  const edgeMorph = options.edgeMorph ?? createDefaultEdgeMorph()

  let minHeight = Number.POSITIVE_INFINITY
  let maxHeight = Number.NEGATIVE_INFINITY
  let heightTotal = 0
  let vertexIndex = 0

  for (let zIndex = 0; zIndex <= resolution; zIndex += 1) {
    const z = -halfSize + (zIndex / resolution) * size

    for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
      const x = -halfSize + (xIndex / resolution) * size
      const absoluteWorldPosition = {
        x: x + offsetX,
        y: sampleTerrainHeight(x + offsetX, z + offsetZ),
        z: z + offsetZ,
      }

      setVec3(arrays.positions, vertexIndex, {
        x,
        y: absoluteWorldPosition.y,
        z,
      })
      setVec3(arrays.surfaceUps, vertexIndex, { x: 0, y: 1, z: 0 })
      setVec3(arrays.terrainCoords, vertexIndex, absoluteWorldPosition)
      arrays.terrainHeights[vertexIndex] = absoluteWorldPosition.y

      minHeight = Math.min(minHeight, absoluteWorldPosition.y)
      maxHeight = Math.max(maxHeight, absoluteWorldPosition.y)
      heightTotal += absoluteWorldPosition.y
      vertexIndex += 1
    }
  }

  stitchTerrainChunkEdges(arrays, resolution, edgeMorph)

  const skirtRibbons =
    skirtDepth > 0
      ? appendTerrainChunkSkirts(
          arrays,
          baseVertexCount,
          resolution,
          skirtDepth
        )
      : []
  const indices = createTerrainChunkIndices(
    vertexCount,
    false,
    resolution,
    skirtRibbons,
    isSharedArrayBufferEnabled
  )

  accumulateTerrainChunkNormals(arrays.positions, indices, arrays.normals)
  applySplatWeights(arrays, maxHeight, minHeight)

  return {
    indices,
    normals: arrays.normals,
    positions: arrays.positions,
    splatWeights: arrays.splatWeights,
    stats: {
      averageHeight: heightTotal / baseVertexCount,
      maxHeight,
      minHeight,
      resolution,
      size,
    },
    terrainCoords: arrays.terrainCoords,
    terrainHeights: arrays.terrainHeights,
  }
}

function generatePlanetTerrainChunkBuffers(
  options: TerrainChunkBuildOptions
): TerrainChunkBuffers {
  const centerX = options.centerX ?? 0
  const centerY = options.centerY ?? 0
  const face = options.face ?? 'positive-z'
  const origin = toOriginVector(options.origin)
  const planetRadius = options.planetRadius ?? PLANET_RADIUS
  const resolution = options.resolution ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION
  const size = options.size ?? DEFAULT_TERRAIN_CHUNK_SIZE
  const skirtDepth = options.skirtDepth ?? 0
  const isSharedArrayBufferEnabled = options.sharedArrayBuffer === true
  const baseVertexCount = (resolution + 1) * (resolution + 1)
  const skirtVertexCount = skirtDepth > 0 ? 8 * (resolution + 1) : 0
  const vertexCount = baseVertexCount + skirtVertexCount
  const halfSize = size * 0.5
  const arrays = createTerrainChunkArrays(
    vertexCount,
    isSharedArrayBufferEnabled
  )
  const edgeMorph = options.edgeMorph ?? createDefaultEdgeMorph()

  let minHeight = Number.POSITIVE_INFINITY
  let maxHeight = Number.NEGATIVE_INFINITY
  let heightTotal = 0
  let vertexIndex = 0

  for (let yIndex = 0; yIndex <= resolution; yIndex += 1) {
    const patchY = centerY - halfSize + (yIndex / resolution) * size

    for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
      const patchX = centerX - halfSize + (xIndex / resolution) * size
      const basePlanetPoint = getPlanetPointOnFace(
        face,
        patchX,
        patchY,
        planetRadius
      )
      const up = normalizeVec3(basePlanetPoint)
      const height = samplePlanetTerrainHeight(
        basePlanetPoint.x,
        basePlanetPoint.y,
        basePlanetPoint.z
      )
      const absoluteWorldPosition = {
        x: basePlanetPoint.x + up.x * height,
        y: basePlanetPoint.y + up.y * height,
        z: basePlanetPoint.z + up.z * height,
      }
      const localPosition = subtractWorldOrigin(absoluteWorldPosition, origin)

      setVec3(arrays.positions, vertexIndex, localPosition)
      setVec3(arrays.surfaceUps, vertexIndex, up)
      setVec3(arrays.terrainCoords, vertexIndex, absoluteWorldPosition)
      arrays.terrainHeights[vertexIndex] = height

      minHeight = Math.min(minHeight, height)
      maxHeight = Math.max(maxHeight, height)
      heightTotal += height
      vertexIndex += 1
    }
  }

  stitchTerrainChunkEdges(arrays, resolution, edgeMorph)

  const skirtRibbons =
    skirtDepth > 0
      ? appendTerrainChunkSkirts(
          arrays,
          baseVertexCount,
          resolution,
          skirtDepth
        )
      : []
  const indices = createTerrainChunkIndices(
    vertexCount,
    true,
    resolution,
    skirtRibbons,
    isSharedArrayBufferEnabled
  )

  accumulateTerrainChunkNormals(arrays.positions, indices, arrays.normals)
  applySplatWeights(arrays, PLANET_MAX_HEIGHT, PLANET_MIN_HEIGHT)

  return {
    indices,
    normals: arrays.normals,
    positions: arrays.positions,
    splatWeights: arrays.splatWeights,
    stats: {
      averageHeight: heightTotal / baseVertexCount,
      maxHeight,
      minHeight,
      resolution,
      size,
    },
    terrainCoords: arrays.terrainCoords,
    terrainHeights: arrays.terrainHeights,
  }
}

function applySplatWeights(
  arrays: TerrainBuildArrays,
  maxHeight: number,
  minHeight: number
) {
  for (let index = 0; index < arrays.terrainHeights.length; index += 1) {
    const normal = getVec3(arrays.normals, index)
    const up = getVec3(arrays.surfaceUps, index)
    const flatness = clamp(dotVec3(normal, up), 0, 1)
    const height = arrays.terrainHeights[index]
    const height01 = inverseLerp(minHeight, maxHeight, height)
    const weights = computeSplatWeights(height01, flatness)
    const splatOffset = index * 4

    arrays.splatWeights[splatOffset] = weights[0]
    arrays.splatWeights[splatOffset + 1] = weights[1]
    arrays.splatWeights[splatOffset + 2] = weights[2]
    arrays.splatWeights[splatOffset + 3] = weights[3]
  }
}

interface TerrainBuildArrays {
  normals: Float32Array
  positions: Float32Array
  splatWeights: Float32Array
  surfaceUps: Float32Array
  terrainCoords: Float32Array
  terrainHeights: Float32Array
}

interface TerrainChunkSkirtRibbon {
  bottom: Array<number>
  top: Array<number>
}

function createTerrainChunkArrays(
  vertexCount: number,
  useSharedArrayBuffer: boolean
): TerrainBuildArrays {
  return {
    normals: createFloat32Array(vertexCount * 3, useSharedArrayBuffer),
    positions: createFloat32Array(vertexCount * 3, useSharedArrayBuffer),
    splatWeights: createFloat32Array(vertexCount * 4, useSharedArrayBuffer),
    surfaceUps: createFloat32Array(vertexCount * 3, useSharedArrayBuffer),
    terrainCoords: createFloat32Array(vertexCount * 3, useSharedArrayBuffer),
    terrainHeights: createFloat32Array(vertexCount, useSharedArrayBuffer),
  }
}

function appendTerrainChunkSkirts(
  arrays: TerrainBuildArrays,
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
      const sourcePosition = getVec3(arrays.positions, sourceIndex)
      const sourceCoord = getVec3(arrays.terrainCoords, sourceIndex)
      const sourceUp = getVec3(arrays.surfaceUps, sourceIndex)

      setVec3(arrays.positions, vertexIndex, sourcePosition)
      setVec3(arrays.terrainCoords, vertexIndex, sourceCoord)
      setVec3(arrays.surfaceUps, vertexIndex, sourceUp)
      arrays.terrainHeights[vertexIndex] = arrays.terrainHeights[sourceIndex]
      ribbon.top.push(vertexIndex)
      vertexIndex += 1

      setVec3(arrays.positions, vertexIndex, {
        x: sourcePosition.x - sourceUp.x * skirtDepth,
        y: sourcePosition.y - sourceUp.y * skirtDepth,
        z: sourcePosition.z - sourceUp.z * skirtDepth,
      })
      setVec3(arrays.terrainCoords, vertexIndex, {
        x: sourceCoord.x - sourceUp.x * skirtDepth,
        y: sourceCoord.y - sourceUp.y * skirtDepth,
        z: sourceCoord.z - sourceUp.z * skirtDepth,
      })
      setVec3(arrays.surfaceUps, vertexIndex, sourceUp)
      arrays.terrainHeights[vertexIndex] = arrays.terrainHeights[sourceIndex]
      ribbon.bottom.push(vertexIndex)
      vertexIndex += 1
    }

    skirtRibbons.push(ribbon)
  }

  return skirtRibbons
}

function stitchTerrainChunkEdges(
  arrays: TerrainBuildArrays,
  resolution: number,
  edgeMorph: TerrainChunkEdgeMorph
) {
  const edgeSourceIndices = getTerrainChunkEdgeSourceIndices(resolution)

  for (const edgeName of Object.keys(edgeSourceIndices) as Array<
    keyof TerrainChunkEdgeMorph
  >) {
    const morphLevel = edgeMorph[edgeName]

    if (morphLevel <= 0) {
      continue
    }

    const edgeIndices = edgeSourceIndices[edgeName]
    const stitchStep = Math.max(1, Math.round(4 ** morphLevel))

    for (
      let segmentStart = 0;
      segmentStart < edgeIndices.length - 1;
      segmentStart += stitchStep
    ) {
      const segmentEnd = Math.min(
        segmentStart + stitchStep,
        edgeIndices.length - 1
      )
      const segmentSpan = segmentEnd - segmentStart

      if (segmentSpan <= 1) {
        continue
      }

      const startIndex = edgeIndices[segmentStart]
      const endIndex = edgeIndices[segmentEnd]
      const startPosition = getVec3(arrays.positions, startIndex)
      const endPosition = getVec3(arrays.positions, endIndex)
      const startTerrainCoord = getVec3(arrays.terrainCoords, startIndex)
      const endTerrainCoord = getVec3(arrays.terrainCoords, endIndex)
      const startUp = getVec3(arrays.surfaceUps, startIndex)
      const endUp = getVec3(arrays.surfaceUps, endIndex)
      const startHeight = arrays.terrainHeights[startIndex]
      const endHeight = arrays.terrainHeights[endIndex]

      for (
        let segmentIndex = 1;
        segmentIndex < segmentSpan;
        segmentIndex += 1
      ) {
        const vertexIndex = edgeIndices[segmentStart + segmentIndex]
        const amount = segmentIndex / segmentSpan

        setVec3(
          arrays.positions,
          vertexIndex,
          lerpVec3(startPosition, endPosition, amount)
        )
        setVec3(
          arrays.terrainCoords,
          vertexIndex,
          lerpVec3(startTerrainCoord, endTerrainCoord, amount)
        )
        setVec3(
          arrays.surfaceUps,
          vertexIndex,
          normalizeVec3(lerpVec3(startUp, endUp, amount))
        )
        arrays.terrainHeights[vertexIndex] = lerp(
          startHeight,
          endHeight,
          amount
        )
      }
    }
  }
}

function getTerrainChunkEdgeSourceIndices(resolution: number) {
  const edgeLength = resolution + 1

  return {
    east: Array.from(
      { length: edgeLength },
      (_, index) => index * edgeLength + resolution
    ),
    north: Array.from({ length: edgeLength }, (_, index) => index),
    south: Array.from(
      { length: edgeLength },
      (_, index) => resolution * edgeLength + index
    ),
    west: Array.from({ length: edgeLength }, (_, index) => index * edgeLength),
  } satisfies Record<keyof TerrainChunkEdgeMorph, Array<number>>
}

function getTerrainChunkSkirtSourceIndices(resolution: number) {
  const edgeIndices = getTerrainChunkEdgeSourceIndices(resolution)

  const edgeLength = resolution + 1

  return [
    edgeIndices.north,
    edgeIndices.east,
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
  flipWinding: boolean,
  resolution: number,
  skirtRibbons: Array<TerrainChunkSkirtRibbon>,
  useSharedArrayBuffer: boolean
) {
  const indexCount =
    resolution * resolution * 6 + skirtRibbons.length * resolution * 6
  const indices =
    vertexCount > 65535
      ? createUint32Array(indexCount, useSharedArrayBuffer)
      : createUint16Array(indexCount, useSharedArrayBuffer)

  let indexOffset = 0

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const topLeft = zIndex * (resolution + 1) + xIndex
      const topRight = topLeft + 1
      const bottomLeft = (zIndex + 1) * (resolution + 1) + xIndex
      const bottomRight = bottomLeft + 1

      if (flipWinding) {
        indices[indexOffset] = topLeft
        indices[indexOffset + 1] = topRight
        indices[indexOffset + 2] = bottomLeft
        indices[indexOffset + 3] = topRight
        indices[indexOffset + 4] = bottomRight
        indices[indexOffset + 5] = bottomLeft
      } else {
        indices[indexOffset] = topLeft
        indices[indexOffset + 1] = bottomLeft
        indices[indexOffset + 2] = topRight
        indices[indexOffset + 3] = topRight
        indices[indexOffset + 4] = bottomLeft
        indices[indexOffset + 5] = bottomRight
      }

      indexOffset += 6
    }
  }

  for (const ribbon of skirtRibbons) {
    for (let segmentIndex = 0; segmentIndex < resolution; segmentIndex += 1) {
      const topLeft = ribbon.top[segmentIndex]
      const topRight = ribbon.top[segmentIndex + 1]
      const bottomLeft = ribbon.bottom[segmentIndex]
      const bottomRight = ribbon.bottom[segmentIndex + 1]

      if (flipWinding) {
        indices[indexOffset] = topLeft
        indices[indexOffset + 1] = bottomLeft
        indices[indexOffset + 2] = topRight
        indices[indexOffset + 3] = topRight
        indices[indexOffset + 4] = bottomLeft
        indices[indexOffset + 5] = bottomRight
      } else {
        indices[indexOffset] = topLeft
        indices[indexOffset + 1] = topRight
        indices[indexOffset + 2] = bottomLeft
        indices[indexOffset + 3] = topRight
        indices[indexOffset + 4] = bottomRight
        indices[indexOffset + 5] = bottomLeft
      }

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
    const normalized = normalizeVec3({
      x: normals[index],
      y: normals[index + 1],
      z: normals[index + 2],
    })

    normals[index] = normalized.x
    normals[index + 1] = normalized.y
    normals[index + 2] = normalized.z
  }
}

function createFloat32Array(length: number, useSharedArrayBuffer: boolean) {
  return new Float32Array(
    createBuffer(Float32Array.BYTES_PER_ELEMENT * length, useSharedArrayBuffer)
  )
}

function createUint16Array(length: number, useSharedArrayBuffer: boolean) {
  return new Uint16Array(
    createBuffer(Uint16Array.BYTES_PER_ELEMENT * length, useSharedArrayBuffer)
  )
}

function createUint32Array(length: number, useSharedArrayBuffer: boolean) {
  return new Uint32Array(
    createBuffer(Uint32Array.BYTES_PER_ELEMENT * length, useSharedArrayBuffer)
  )
}

function createBuffer(byteLength: number, useSharedArrayBuffer: boolean) {
  return useSharedArrayBuffer && typeof SharedArrayBuffer !== 'undefined'
    ? new SharedArrayBuffer(byteLength)
    : new ArrayBuffer(byteLength)
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

function setVec3(array: Float32Array, index: number, value: Vec3Like) {
  const offset = index * 3
  array[offset] = value.x
  array[offset + 1] = value.y
  array[offset + 2] = value.z
}

function getVec3(array: Float32Array, index: number) {
  const offset = index * 3

  return {
    x: array[offset],
    y: array[offset + 1],
    z: array[offset + 2],
  }
}

function normalizeVec3(value: Vec3Like) {
  const length = Math.hypot(value.x, value.y, value.z)

  if (length <= Number.EPSILON) {
    return { x: 0, y: 1, z: 0 }
  }

  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  }
}

function dotVec3(left: Vec3Like, right: Vec3Like) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function lerpVec3(start: Vec3Like, end: Vec3Like, amount: number) {
  return {
    x: lerp(start.x, end.x, amount),
    y: lerp(start.y, end.y, amount),
    z: lerp(start.z, end.z, amount),
  }
}

function toOriginVector(
  origin: readonly [number, number, number] | undefined
): Vec3Like {
  return {
    x: origin?.[0] ?? 0,
    y: origin?.[1] ?? 0,
    z: origin?.[2] ?? 0,
  }
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

function createDefaultEdgeMorph(): TerrainChunkEdgeMorph {
  return {
    east: 0,
    north: 0,
    south: 0,
    west: 0,
  }
}
