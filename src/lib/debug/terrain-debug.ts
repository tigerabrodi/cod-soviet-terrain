import {
  DEFAULT_TERRAIN_GENERATION_SETTINGS,
  clampTerrainGenerationSettings,
  type TerrainGenerationSettings,
} from '@/lib/terrain/terrain-settings'
import { SNOW_PARTICLE_COUNT } from '@/lib/weather/snow-particles'

export interface TerrainMaterialDebugSettings {
  frostStrength: number
  textureScale: number
}

export interface TerrainLightingDebugSettings {
  environmentIntensity: number
  fogDensity: number
  sunIntensity: number
}

export interface TerrainPerformanceDebugSettings {
  renderScale: number
  showWireframe: boolean
}

export interface TerrainWeatherDebugSettings {
  accumulationRate: number
  coverageStrength: number
  driftStrength: number
  fallSpeed: number
  meltRate: number
  snowDensity: number
  snowEnabled: boolean
  windStrength: number
}

export interface TerrainDebugSettings {
  lighting: TerrainLightingDebugSettings
  performance: TerrainPerformanceDebugSettings
  terrainGeneration: TerrainGenerationSettings
  terrainMaterial: TerrainMaterialDebugSettings
  weather: TerrainWeatherDebugSettings
}

export const TERRAIN_DEBUG_STORAGE_KEY = 'cod-soviet-terrain-debug'

export const DEFAULT_TERRAIN_DEBUG_SETTINGS: TerrainDebugSettings = {
  lighting: {
    environmentIntensity: 1,
    fogDensity: 1,
    sunIntensity: 1,
  },
  performance: {
    renderScale: 1,
    showWireframe: false,
  },
  terrainGeneration: DEFAULT_TERRAIN_GENERATION_SETTINGS,
  terrainMaterial: {
    frostStrength: 1,
    textureScale: 1,
  },
  weather: {
    accumulationRate: 0.32,
    coverageStrength: 0.9,
    driftStrength: 0.85,
    fallSpeed: 0.58,
    meltRate: 0.22,
    snowDensity: 0.56,
    snowEnabled: true,
    windStrength: 0.48,
  },
}

export function createDefaultTerrainDebugSettings(): TerrainDebugSettings {
  return {
    lighting: { ...DEFAULT_TERRAIN_DEBUG_SETTINGS.lighting },
    performance: { ...DEFAULT_TERRAIN_DEBUG_SETTINGS.performance },
    terrainGeneration: { ...DEFAULT_TERRAIN_DEBUG_SETTINGS.terrainGeneration },
    terrainMaterial: { ...DEFAULT_TERRAIN_DEBUG_SETTINGS.terrainMaterial },
    weather: { ...DEFAULT_TERRAIN_DEBUG_SETTINGS.weather },
  }
}

export function clampTerrainDebugSettings(settings: TerrainDebugSettings) {
  return {
    lighting: {
      environmentIntensity: clamp(
        settings.lighting.environmentIntensity,
        0.2,
        2
      ),
      fogDensity: clamp(settings.lighting.fogDensity, 0, 2.2),
      sunIntensity: clamp(settings.lighting.sunIntensity, 0.2, 2.4),
    },
    performance: {
      renderScale: clamp(settings.performance.renderScale, 0.45, 1.1),
      showWireframe: settings.performance.showWireframe,
    },
    terrainGeneration: clampTerrainGenerationSettings(
      settings.terrainGeneration
    ),
    terrainMaterial: {
      frostStrength: clamp(settings.terrainMaterial.frostStrength, 0, 2),
      textureScale: clamp(settings.terrainMaterial.textureScale, 0.45, 1.8),
    },
    weather: {
      accumulationRate: clamp(settings.weather.accumulationRate, 0, 2.5),
      coverageStrength: clamp(settings.weather.coverageStrength, 0, 2),
      driftStrength: clamp(settings.weather.driftStrength, 0, 2),
      fallSpeed: clamp(settings.weather.fallSpeed, 0.2, 2.2),
      meltRate: clamp(settings.weather.meltRate, 0, 2),
      snowDensity: clamp(settings.weather.snowDensity, 0, 2),
      snowEnabled: settings.weather.snowEnabled,
      windStrength: clamp(settings.weather.windStrength, 0, 2),
    },
  }
}

export function parseTerrainDebugSettings(
  serialized: string | null | undefined
) {
  if (!serialized) {
    return createDefaultTerrainDebugSettings()
  }

  try {
    const parsed = JSON.parse(serialized) as Partial<TerrainDebugSettings>
    const defaults = createDefaultTerrainDebugSettings()

    return clampTerrainDebugSettings({
      lighting: {
        ...defaults.lighting,
        ...parsed.lighting,
      },
      performance: {
        ...defaults.performance,
        ...parsed.performance,
      },
      terrainGeneration: {
        ...defaults.terrainGeneration,
        ...parsed.terrainGeneration,
      },
      terrainMaterial: {
        ...defaults.terrainMaterial,
        ...parsed.terrainMaterial,
      },
      weather: {
        ...defaults.weather,
        ...parsed.weather,
      },
    })
  } catch {
    return createDefaultTerrainDebugSettings()
  }
}

export function getSnowParticleCount(settings: TerrainWeatherDebugSettings) {
  return settings.snowEnabled
    ? Math.round(SNOW_PARTICLE_COUNT * clamp(settings.snowDensity, 0, 2))
    : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
