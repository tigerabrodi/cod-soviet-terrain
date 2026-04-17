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
      performance: {
        renderScale: 8,
        showWireframe: true,
      },
      terrainGeneration: {
        broadScale: -1,
        broadStrength: 9,
        craterScale: 8,
        craterStrength: -3,
        detailScale: 8,
        detailStrength: 9,
        heightScale: 20,
        ridgeScale: -3,
        ridgeStrength: -2,
        seed: 4000,
      },
      terrainMaterial: {
        frostStrength: 5,
        textureScale: 0.1,
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
    expect(clamped.performance.renderScale).toBe(1.1)
    expect(clamped.performance.showWireframe).toBe(true)
    expect(clamped.terrainGeneration.broadScale).toBe(0.45)
    expect(clamped.terrainGeneration.broadStrength).toBe(2.5)
    expect(clamped.terrainGeneration.detailScale).toBe(2.4)
    expect(clamped.terrainGeneration.ridgeScale).toBe(0.45)
    expect(clamped.terrainGeneration.craterScale).toBe(2.4)
    expect(clamped.terrainGeneration.heightScale).toBe(2.25)
    expect(clamped.terrainGeneration.detailStrength).toBe(2.5)
    expect(clamped.terrainGeneration.ridgeStrength).toBe(0)
    expect(clamped.terrainGeneration.craterStrength).toBe(0)
    expect(clamped.terrainGeneration.seed).toBe(999)
    expect(clamped.terrainMaterial.textureScale).toBe(0.45)
    expect(clamped.terrainMaterial.frostStrength).toBe(2)
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
        performance: {
          showWireframe: true,
        },
        terrainGeneration: {
          broadScale: 1.4,
          heightScale: 1.4,
          seed: 73,
        },
        weather: {
          snowEnabled: false,
        },
      })
    )

    expect(parsed.performance.showWireframe).toBe(true)
    expect(parsed.performance.renderScale).toBe(1)
    expect(parsed.terrainGeneration.broadScale).toBe(1.4)
    expect(parsed.terrainGeneration.heightScale).toBe(1.4)
    expect(parsed.terrainGeneration.seed).toBe(73)
    expect(parsed.weather.snowEnabled).toBe(false)
    expect(parsed.weather.accumulationRate).toBe(0.32)
    expect(parsed.weather.fallSpeed).toBe(0.58)
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
    ).toBe(3000)
  })
})
