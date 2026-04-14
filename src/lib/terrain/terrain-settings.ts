export interface TerrainGenerationSettings {
  craterStrength: number
  detailStrength: number
  heightScale: number
  ridgeStrength: number
}

export const DEFAULT_TERRAIN_GENERATION_SETTINGS: TerrainGenerationSettings = {
  craterStrength: 1,
  detailStrength: 1,
  heightScale: 1,
  ridgeStrength: 1,
}

export function clampTerrainGenerationSettings(
  settings: TerrainGenerationSettings
) {
  return {
    craterStrength: clamp(settings.craterStrength, 0, 2.5),
    detailStrength: clamp(settings.detailStrength, 0, 2.5),
    heightScale: clamp(settings.heightScale, 0.35, 2.25),
    ridgeStrength: clamp(settings.ridgeStrength, 0, 2.5),
  }
}

export function createTerrainGenerationSignature(
  settings: TerrainGenerationSettings
) {
  const normalized = clampTerrainGenerationSettings(settings)

  return [
    normalized.heightScale,
    normalized.detailStrength,
    normalized.ridgeStrength,
    normalized.craterStrength,
  ]
    .map((value) => value.toFixed(3))
    .join('|')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
