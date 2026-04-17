import { describe, expect, it } from 'vitest'
import {
  buildTerrainChunk,
  computeSplatWeights,
  createTerrainChunkGeometry,
  generateTerrainChunkBuffers,
  sampleTerrainHeight,
} from './terrain-chunk'
import { DEFAULT_TERRAIN_GENERATION_SETTINGS } from './terrain-settings'

describe('computeSplatWeights', () => {
  it('prefers scorched ground for low flat terrain', () => {
    expect(computeSplatWeights(0.1, 0.98)).toEqual([1, 0, 0, 0])
  })

  it('prefers frozen earth for mid flat terrain', () => {
    expect(computeSplatWeights(0.48, 0.96)).toEqual([0, 1, 0, 0])
  })

  it('prefers frost for high flat terrain', () => {
    expect(computeSplatWeights(0.92, 0.98)).toEqual([0, 0, 1, 0])
  })

  it('prefers rubble for steep terrain at any height', () => {
    expect(computeSplatWeights(0.45, 0.2)).toEqual([0, 0, 0, 1])
  })

  it('always returns normalized weights for blended inputs', () => {
    const weights = computeSplatWeights(0.34, 0.82)
    const total = weights.reduce((sum, value) => sum + value, 0)

    expect(total).toBeCloseTo(1, 6)

    for (const weight of weights) {
      expect(weight).toBeGreaterThanOrEqual(0)
      expect(weight).toBeLessThanOrEqual(1)
    }
  })
})

describe('sampleTerrainHeight', () => {
  it('returns deterministic values for stable sample points', () => {
    expect(sampleTerrainHeight(0, 0)).toBeCloseTo(4.156113335342688, 8)
    expect(sampleTerrainHeight(24, -18)).toBeCloseTo(8.909805586277777, 8)
    expect(sampleTerrainHeight(-57, 61)).toBeCloseTo(6.620292877085063, 8)
  })

  it('applies generation settings to amplify terrain relief', () => {
    const terrainBaseline = 12
    const defaultHeight = sampleTerrainHeight(24, -18)
    const amplifiedHeight = sampleTerrainHeight(24, -18, {
      ...DEFAULT_TERRAIN_GENERATION_SETTINGS,
      heightScale: 1.5,
    })

    expect(Math.abs(amplifiedHeight - terrainBaseline)).toBeGreaterThan(
      Math.abs(defaultHeight - terrainBaseline)
    )
  })

  it('changes the terrain pattern when noise scales change', () => {
    const defaultHeight = sampleTerrainHeight(24, -18)
    const remixedHeight = sampleTerrainHeight(24, -18, {
      ...DEFAULT_TERRAIN_GENERATION_SETTINGS,
      broadScale: 1.4,
      craterScale: 0.7,
      detailScale: 1.8,
      ridgeScale: 0.65,
    })

    expect(remixedHeight).not.toBeCloseTo(defaultHeight, 6)
  })

  it('changes the terrain pattern when the terrain seed changes', () => {
    const defaultHeight = sampleTerrainHeight(24, -18)
    const remixedHeight = sampleTerrainHeight(24, -18, {
      ...DEFAULT_TERRAIN_GENERATION_SETTINGS,
      seed: 287,
    })

    expect(remixedHeight).not.toBeCloseTo(defaultHeight, 6)
  })
})

describe('buildTerrainChunk', () => {
  it('creates transferable terrain buffers for worker generation', () => {
    const chunkBuffers = generateTerrainChunkBuffers({
      resolution: 8,
      size: 32,
    })
    const geometry = createTerrainChunkGeometry(chunkBuffers)

    try {
      expect(chunkBuffers.positions.length).toBe(81 * 3)
      expect(chunkBuffers.normals.length).toBe(81 * 3)
      expect(chunkBuffers.snowCoverage.length).toBe(81)
      expect(chunkBuffers.snowSupport.length).toBe(81)
      expect(chunkBuffers.splatWeights.length).toBe(81 * 4)
      expect(chunkBuffers.terrainUps.length).toBe(81 * 3)
      expect(chunkBuffers.indices.length).toBe(384)

      expect(geometry.getAttribute('position').count).toBe(81)
      expect(geometry.getAttribute('normal').count).toBe(81)
      expect(geometry.getAttribute('snowCoverage').count).toBe(81)
      expect(geometry.getAttribute('snowSupport').count).toBe(81)
      expect(geometry.getAttribute('splatWeights').count).toBe(81)
      expect(geometry.getAttribute('terrainUp').count).toBe(81)
      expect(geometry.index?.count).toBe(384)
    } finally {
      geometry.dispose()
    }
  })

  it('can build chunk buffers on SharedArrayBuffer for worker sharing', () => {
    const chunkBuffers = generateTerrainChunkBuffers({
      resolution: 8,
      sharedArrayBuffer: true,
      size: 32,
    })

    expect(chunkBuffers.positions.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(chunkBuffers.normals.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(chunkBuffers.snowCoverage.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(chunkBuffers.snowSupport.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(chunkBuffers.splatWeights.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(chunkBuffers.indices.buffer).toBeInstanceOf(SharedArrayBuffer)
  })

  it('adds edge skirts when requested to hide lod cracks', () => {
    const chunkBuffers = generateTerrainChunkBuffers({
      resolution: 4,
      size: 32,
      skirtDepth: 6,
    })
    const geometry = createTerrainChunkGeometry(chunkBuffers)

    try {
      expect(chunkBuffers.positions.length).toBe(65 * 3)
      expect(chunkBuffers.normals.length).toBe(65 * 3)
      expect(chunkBuffers.snowCoverage.length).toBe(65)
      expect(chunkBuffers.snowSupport.length).toBe(65)
      expect(chunkBuffers.splatWeights.length).toBe(65 * 4)
      expect(chunkBuffers.indices.length).toBe(192)

      expect(geometry.getAttribute('position').count).toBe(65)
      expect(geometry.getAttribute('snowSupport').count).toBe(65)
      expect(geometry.index?.count).toBe(192)
    } finally {
      geometry.dispose()
    }
  })

  it('snaps stitched edges to the coarser lod boundary shape', () => {
    const unstitchedChunk = buildTerrainChunk({
      resolution: 8,
      size: 32,
    })
    const stitchedChunk = buildTerrainChunk({
      edgeMorph: { east: 1, north: 0, south: 0, west: 0 },
      resolution: 8,
      size: 32,
    })

    try {
      const unstitchedEdgeHeights = getSortedEdgeHeights(
        unstitchedChunk.geometry,
        'east'
      )
      const stitchedEdgeHeights = getSortedEdgeHeights(
        stitchedChunk.geometry,
        'east'
      )

      expect(stitchedEdgeHeights[0]).toBeCloseTo(unstitchedEdgeHeights[0], 6)
      expect(stitchedEdgeHeights[4]).toBeCloseTo(unstitchedEdgeHeights[4], 6)
      expect(stitchedEdgeHeights[8]).toBeCloseTo(unstitchedEdgeHeights[8], 6)

      expect(stitchedEdgeHeights[1]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[0], unstitchedEdgeHeights[4], 0.25),
        6
      )
      expect(stitchedEdgeHeights[2]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[0], unstitchedEdgeHeights[4], 0.5),
        6
      )
      expect(stitchedEdgeHeights[3]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[0], unstitchedEdgeHeights[4], 0.75),
        6
      )
      expect(stitchedEdgeHeights[5]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[4], unstitchedEdgeHeights[8], 0.25),
        6
      )
      expect(stitchedEdgeHeights[6]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[4], unstitchedEdgeHeights[8], 0.5),
        6
      )
      expect(stitchedEdgeHeights[7]).toBeCloseTo(
        lerp(unstitchedEdgeHeights[4], unstitchedEdgeHeights[8], 0.75),
        6
      )
    } finally {
      unstitchedChunk.geometry.dispose()
      stitchedChunk.geometry.dispose()
    }
  })

  it('builds a chunk with expected geometry and terrain stats', () => {
    const { geometry, stats } = buildTerrainChunk({ resolution: 8, size: 32 })

    try {
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')
      const snowCoverage = geometry.getAttribute('snowCoverage')
      const snowSupport = geometry.getAttribute('snowSupport')
      const splatWeights = geometry.getAttribute('splatWeights')
      const terrainUp = geometry.getAttribute('terrainUp')

      expect(positions.count).toBe(81)
      expect(geometry.index?.count).toBe(384)
      expect(normals.count).toBe(81)
      expect(snowCoverage.count).toBe(81)
      expect(snowSupport.count).toBe(81)
      expect(splatWeights.count).toBe(81)
      expect(splatWeights.itemSize).toBe(4)
      expect(terrainUp.count).toBe(81)

      expect(stats.averageHeight).toBeCloseTo(4.975243859075985, 8)
      expect(stats.minHeight).toBeCloseTo(0.6348755402730268, 8)
      expect(stats.maxHeight).toBeCloseTo(9.656834248660495, 8)

      for (let index = 0; index < snowCoverage.count; index += 1) {
        expect(snowCoverage.getX(index)).toBe(0)
        expect(snowSupport.getX(index)).toBeGreaterThanOrEqual(0)
        expect(snowSupport.getX(index)).toBeLessThanOrEqual(1)
      }

      for (let index = 0; index < splatWeights.count; index += 1) {
        let total = 0

        for (let channel = 0; channel < splatWeights.itemSize; channel += 1) {
          const weight =
            splatWeights.array[index * splatWeights.itemSize + channel]
          total += weight
          expect(weight).toBeGreaterThanOrEqual(0)
          expect(weight).toBeLessThanOrEqual(1)
        }

        expect(total).toBeCloseTo(1, 5)
      }
    } finally {
      geometry.dispose()
    }
  })

  it('builds planet chunk normals facing away from the planet center', () => {
    const { geometry } = buildTerrainChunk({
      centerX: 0,
      centerY: 0,
      face: 'positive-y',
      mode: 'planet',
      origin: [0, 0, 0],
      resolution: 8,
      size: 180,
    })

    try {
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')

      for (let index = 0; index < positions.count; index += 1) {
        const dot =
          positions.getX(index) * normals.getX(index) +
          positions.getY(index) * normals.getY(index) +
          positions.getZ(index) * normals.getZ(index)

        expect(dot).toBeGreaterThan(0)
      }
    } finally {
      geometry.dispose()
    }
  })

  it('matches border heights for neighboring chunk offsets', () => {
    const leftChunk = buildTerrainChunk({
      offsetX: 0,
      offsetZ: 0,
      resolution: 4,
      size: 32,
    })
    const rightChunk = buildTerrainChunk({
      offsetX: 32,
      offsetZ: 0,
      resolution: 4,
      size: 32,
    })

    try {
      const leftPositions = leftChunk.geometry.getAttribute('position')
      const rightPositions = rightChunk.geometry.getAttribute('position')
      const leftEdgeHeights = new Map<number, number>()
      const rightEdgeHeights = new Map<number, number>()

      for (let index = 0; index < leftPositions.count; index += 1) {
        if (Math.abs(leftPositions.getX(index) - 16) <= 0.000001) {
          leftEdgeHeights.set(
            leftPositions.getZ(index),
            leftPositions.getY(index)
          )
        }
      }

      for (let index = 0; index < rightPositions.count; index += 1) {
        if (Math.abs(rightPositions.getX(index) + 16) <= 0.000001) {
          rightEdgeHeights.set(
            rightPositions.getZ(index),
            rightPositions.getY(index)
          )
        }
      }

      expect(leftEdgeHeights.size).toBe(5)
      expect(rightEdgeHeights.size).toBe(5)
      expect([...leftEdgeHeights.keys()]).toEqual([...rightEdgeHeights.keys()])

      for (const [z, leftHeight] of leftEdgeHeights) {
        expect(leftHeight).toBeCloseTo(rightEdgeHeights.get(z) ?? NaN, 6)
      }
    } finally {
      leftChunk.geometry.dispose()
      rightChunk.geometry.dispose()
    }
  })
})

function getSortedEdgeHeights(
  geometry: ReturnType<typeof buildTerrainChunk>['geometry'],
  edge: 'east' | 'north' | 'south' | 'west'
) {
  const positions = geometry.getAttribute('position')
  const heights: Array<{ coordinate: number; height: number }> = []

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)

    if (edge === 'east' && Math.abs(x - 16) <= 0.000001) {
      heights.push({ coordinate: z, height: y })
    }

    if (edge === 'west' && Math.abs(x + 16) <= 0.000001) {
      heights.push({ coordinate: z, height: y })
    }

    if (edge === 'north' && Math.abs(z + 16) <= 0.000001) {
      heights.push({ coordinate: x, height: y })
    }

    if (edge === 'south' && Math.abs(z - 16) <= 0.000001) {
      heights.push({ coordinate: x, height: y })
    }
  }

  return heights
    .sort((left, right) => left.coordinate - right.coordinate)
    .map((entry) => entry.height)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}
