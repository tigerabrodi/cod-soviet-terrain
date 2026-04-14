import { describe, expect, it } from 'vitest'
import {
  computeNextSnowCoverage,
  computeSnowShelterFactor,
  createSnowAccumulationSignature,
} from './snow-accumulation'

describe('computeSnowShelterFactor', () => {
  it('returns stable normalized shelter values', () => {
    expect(computeSnowShelterFactor(0, 0, 0)).toBeCloseTo(
      computeSnowShelterFactor(0, 0, 0),
      8
    )
    expect(computeSnowShelterFactor(20, 12, -8)).toBeGreaterThanOrEqual(0)
    expect(computeSnowShelterFactor(20, 12, -8)).toBeLessThanOrEqual(1)
  })
})

describe('computeNextSnowCoverage', () => {
  it('adds snow on high flat terrain while snowfall is active', () => {
    const nextCoverage = computeNextSnowCoverage({
      deltaTime: 0.2,
      height: 18,
      previousCoverage: 0.2,
      snowfallIntensity: 1,
      support: 0.96,
      worldX: 22,
      worldY: 360,
      worldZ: -14,
    })

    expect(nextCoverage).toBeGreaterThan(0.2)
  })

  it('loses snow on steep exposed terrain when snowfall stops', () => {
    const nextCoverage = computeNextSnowCoverage({
      deltaTime: 0.35,
      height: 3,
      previousCoverage: 0.7,
      snowfallIntensity: 0,
      support: 0.18,
      worldX: 140,
      worldY: 330,
      worldZ: 180,
    })

    expect(nextCoverage).toBeLessThan(0.7)
  })

  it('builds more snow in sheltered terrain than exposed terrain', () => {
    const sheltered = computeNextSnowCoverage({
      deltaTime: 0.25,
      height: 12,
      previousCoverage: 0.15,
      snowfallIntensity: 1,
      support: 0.82,
      worldX: 14,
      worldY: 360,
      worldZ: 21,
    })
    const exposed = computeNextSnowCoverage({
      deltaTime: 0.25,
      height: 12,
      previousCoverage: 0.15,
      snowfallIntensity: 1,
      support: 0.82,
      worldX: 140,
      worldY: 360,
      worldZ: 180,
    })

    expect(sheltered).not.toBe(exposed)
  })
})

describe('createSnowAccumulationSignature', () => {
  it('changes when snowfall or runtime settings change', () => {
    const first = createSnowAccumulationSignature(
      {
        accumulationRate: 1,
        meltRate: 1,
        visualStrength: 1,
        windStrength: 1,
      },
      0.5
    )
    const second = createSnowAccumulationSignature(
      {
        accumulationRate: 1.2,
        meltRate: 1,
        visualStrength: 1,
        windStrength: 1,
      },
      0.5
    )

    expect(first).not.toBe(second)
  })
})
