import { describe, expect, it } from 'vitest'
import {
  buildTerrainChunk,
  computeSplatWeights,
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
          const weight = splatWeights.array[index * splatWeights.itemSize + channel]
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
})
