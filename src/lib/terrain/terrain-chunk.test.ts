import { describe, expect, it } from 'vitest'
import {
  buildTerrainChunk,
  computeSplatWeights,
  createTerrainChunkGeometry,
  generateTerrainChunkBuffers,
  sampleTerrainHeight,
} from './terrain-chunk'

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
      expect(chunkBuffers.splatWeights.length).toBe(81 * 4)
      expect(chunkBuffers.indices.length).toBe(384)

      expect(geometry.getAttribute('position').count).toBe(81)
      expect(geometry.getAttribute('normal').count).toBe(81)
      expect(geometry.getAttribute('splatWeights').count).toBe(81)
      expect(geometry.index?.count).toBe(384)
    } finally {
      geometry.dispose()
    }
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
      expect(chunkBuffers.splatWeights.length).toBe(65 * 4)
      expect(chunkBuffers.indices.length).toBe(192)

      expect(geometry.getAttribute('position').count).toBe(65)
      expect(geometry.index?.count).toBe(192)
    } finally {
      geometry.dispose()
    }
  })

  it('builds a chunk with expected geometry and terrain stats', () => {
    const { geometry, stats } = buildTerrainChunk({ resolution: 8, size: 32 })

    try {
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')
      const splatWeights = geometry.getAttribute('splatWeights')

      expect(positions.count).toBe(81)
      expect(geometry.index?.count).toBe(384)
      expect(normals.count).toBe(81)
      expect(splatWeights.count).toBe(81)
      expect(splatWeights.itemSize).toBe(4)

      expect(stats.averageHeight).toBeCloseTo(4.975243859075985, 8)
      expect(stats.minHeight).toBeCloseTo(0.6348755402730268, 8)
      expect(stats.maxHeight).toBeCloseTo(9.656834248660495, 8)

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
