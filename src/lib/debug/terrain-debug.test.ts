import { describe, expect, it } from 'vitest'
import {
  clampTerrainDebugSettings,
  createDefaultTerrainDebugSettings,
  getSnowParticleCount,
  parseTerrainDebugSettings,
} from './terrain-debug'

describe('clampTerrainDebugSettings', () => {
  it('keeps debug values inside safe runtime ranges', () => {
    const clamped = clampTerrainDebugSettings({
      lighting: {
        environmentIntensity: 9,
        fogDensity: -4,
        sunIntensity: 5,
      },
      terrainGeneration: {
        craterStrength: -3,
        detailStrength: 9,
        heightScale: 20,
        ridgeStrength: -2,
      },
      terrainMaterial: {
        frostStrength: 5,
        textureScale: 0.1,
      },
      vegetation: {
        density: 4,
        enabled: true,
        heightScale: 0.1,
        maxLodLevel: 8,
      },
      weather: {
        accumulationRate: 9,
        coverageStrength: 9,
        driftStrength: -5,
        fallSpeed: 9,
        meltRate: -4,
        snowDensity: -1,
        snowEnabled: true,
        windStrength: 7,
      },
    })

    expect(clamped.lighting.environmentIntensity).toBe(2)
    expect(clamped.lighting.fogDensity).toBe(0)
    expect(clamped.lighting.sunIntensity).toBe(2.4)
    expect(clamped.terrainGeneration.heightScale).toBe(2.25)
    expect(clamped.terrainGeneration.detailStrength).toBe(2.5)
    expect(clamped.terrainGeneration.ridgeStrength).toBe(0)
    expect(clamped.terrainGeneration.craterStrength).toBe(0)
    expect(clamped.terrainMaterial.textureScale).toBe(0.45)
    expect(clamped.terrainMaterial.frostStrength).toBe(2)
    expect(clamped.vegetation.density).toBe(2.4)
    expect(clamped.vegetation.heightScale).toBe(0.55)
    expect(clamped.vegetation.maxLodLevel).toBe(2)
    expect(clamped.weather.accumulationRate).toBe(2.5)
    expect(clamped.weather.coverageStrength).toBe(2)
    expect(clamped.weather.snowDensity).toBe(0)
    expect(clamped.weather.fallSpeed).toBe(2.2)
    expect(clamped.weather.driftStrength).toBe(0)
    expect(clamped.weather.meltRate).toBe(0)
    expect(clamped.weather.windStrength).toBe(2)
  })
})

describe('parseTerrainDebugSettings', () => {
  it('falls back to defaults when storage is missing or invalid', () => {
    expect(parseTerrainDebugSettings(null)).toEqual(
      createDefaultTerrainDebugSettings()
    )
    expect(parseTerrainDebugSettings('not-json')).toEqual(
      createDefaultTerrainDebugSettings()
    )
  })

  it('merges partial stored state with defaults', () => {
    const parsed = parseTerrainDebugSettings(
      JSON.stringify({
        terrainGeneration: {
          heightScale: 1.4,
        },
        vegetation: {
          enabled: false,
        },
        weather: {
          snowEnabled: false,
        },
      })
    )

    expect(parsed.terrainGeneration.heightScale).toBe(1.4)
    expect(parsed.vegetation.enabled).toBe(false)
    expect(parsed.vegetation.density).toBe(0.9)
    expect(parsed.weather.snowEnabled).toBe(false)
    expect(parsed.weather.accumulationRate).toBe(0.35)
    expect(parsed.weather.fallSpeed).toBe(1)
    expect(parsed.lighting.sunIntensity).toBe(1)
  })
})

describe('getSnowParticleCount', () => {
  it('returns zero when snow is disabled', () => {
    expect(
      getSnowParticleCount({
        accumulationRate: 1,
        coverageStrength: 1,
        driftStrength: 1,
        fallSpeed: 1,
        meltRate: 1,
        snowDensity: 1,
        snowEnabled: false,
        windStrength: 1,
      })
    ).toBe(0)
  })

  it('scales the live particle count when snow is enabled', () => {
    expect(
      getSnowParticleCount({
        accumulationRate: 1,
        coverageStrength: 1,
        driftStrength: 1,
        fallSpeed: 1,
        meltRate: 1,
        snowDensity: 0.5,
        snowEnabled: true,
        windStrength: 1,
      })
    ).toBe(4500)
  })
})
