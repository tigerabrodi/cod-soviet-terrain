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
      weather: {
        driftStrength: -5,
        fallSpeed: 9,
        snowDensity: -1,
        snowEnabled: true,
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
    expect(clamped.weather.snowDensity).toBe(0)
    expect(clamped.weather.fallSpeed).toBe(2.2)
    expect(clamped.weather.driftStrength).toBe(0)
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
        weather: {
          snowEnabled: false,
        },
      })
    )

    expect(parsed.terrainGeneration.heightScale).toBe(1.4)
    expect(parsed.weather.snowEnabled).toBe(false)
    expect(parsed.weather.fallSpeed).toBe(1)
    expect(parsed.lighting.sunIntensity).toBe(1)
  })
})

describe('getSnowParticleCount', () => {
  it('returns zero when snow is disabled', () => {
    expect(
      getSnowParticleCount({
        driftStrength: 1,
        fallSpeed: 1,
        snowDensity: 1,
        snowEnabled: false,
      })
    ).toBe(0)
  })

  it('scales the live particle count when snow is enabled', () => {
    expect(
      getSnowParticleCount({
        driftStrength: 1,
        fallSpeed: 1,
        snowDensity: 0.5,
        snowEnabled: true,
      })
    ).toBe(4500)
  })
})
