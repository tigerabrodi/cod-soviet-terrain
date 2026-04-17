export interface TerrainGenerationSettings {
  broadScale: number
  broadStrength: number
  craterScale: number
  craterStrength: number
  detailScale: number
  detailStrength: number
  heightScale: number
  ridgeScale: number
  ridgeStrength: number
  seed: number
}

export const DEFAULT_TERRAIN_GENERATION_SETTINGS: TerrainGenerationSettings = {
  broadScale: 1,
  broadStrength: 1,
  craterScale: 1,
  craterStrength: 1,
  detailScale: 1,
  detailStrength: 1,
  heightScale: 1,
  ridgeScale: 1,
  ridgeStrength: 1,
  seed: 0,
}

export const TERRAIN_GENERATION_PRESETS = {
  blasted: DEFAULT_TERRAIN_GENERATION_SETTINGS,
  alpine: {
    broadScale: 0.88,
    broadStrength: 1.3,
    craterScale: 0.9,
    craterStrength: 0.45,
    detailScale: 1.25,
    detailStrength: 1.15,
    heightScale: 1.45,
    ridgeScale: 1.55,
    ridgeStrength: 1.8,
    seed: 0,
  },
  fractured: {
    broadScale: 1.12,
    broadStrength: 1.1,
    craterScale: 1.15,
    craterStrength: 1.15,
    detailScale: 1.7,
    detailStrength: 1.5,
    heightScale: 1.2,
    ridgeScale: 1.35,
    ridgeStrength: 1.45,
    seed: 0,
  },
  cratered: {
    broadScale: 1.04,
    broadStrength: 0.92,
    craterScale: 1.55,
    craterStrength: 2,
    detailScale: 0.95,
    detailStrength: 0.7,
    heightScale: 1.08,
    ridgeScale: 0.95,
    ridgeStrength: 0.65,
    seed: 0,
  },
  plains: {
    broadScale: 0.78,
    broadStrength: 0.68,
    craterScale: 0.85,
    craterStrength: 0.25,
    detailScale: 0.82,
    detailStrength: 0.35,
    heightScale: 0.72,
    ridgeScale: 0.8,
    ridgeStrength: 0.2,
    seed: 0,
  },
} as const

export type TerrainGenerationPresetName =
  keyof typeof TERRAIN_GENERATION_PRESETS

export function clampTerrainGenerationSettings(
  settings: TerrainGenerationSettings
) {
  return {
    broadScale: clamp(settings.broadScale, 0.45, 2.2),
    broadStrength: clamp(settings.broadStrength, 0, 2.5),
    craterScale: clamp(settings.craterScale, 0.45, 2.4),
    craterStrength: clamp(settings.craterStrength, 0, 2.5),
    detailScale: clamp(settings.detailScale, 0.45, 2.4),
    detailStrength: clamp(settings.detailStrength, 0, 2.5),
    heightScale: clamp(settings.heightScale, 0.35, 2.25),
    ridgeScale: clamp(settings.ridgeScale, 0.45, 2.6),
    ridgeStrength: clamp(settings.ridgeStrength, 0, 2.5),
    seed: clampInteger(settings.seed, 0, 999),
  }
}

export function createTerrainGenerationSignature(
  settings: TerrainGenerationSettings
) {
  const normalized = clampTerrainGenerationSettings(settings)

  return [
    normalized.broadScale,
    normalized.broadStrength,
    normalized.detailScale,
    normalized.heightScale,
    normalized.detailStrength,
    normalized.ridgeScale,
    normalized.ridgeStrength,
    normalized.craterScale,
    normalized.craterStrength,
    normalized.seed,
  ]
    .map((value) => value.toFixed(3))
    .join('|')
}

export function applyTerrainGenerationPreset(
  presetName: TerrainGenerationPresetName,
  seed = 0
) {
  const preset = TERRAIN_GENERATION_PRESETS[presetName]

  return clampTerrainGenerationSettings({
    ...preset,
    seed,
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max))
}
