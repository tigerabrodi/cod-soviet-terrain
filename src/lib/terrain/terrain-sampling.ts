import { NoiseGenerator } from './noise'
import {
  DEFAULT_TERRAIN_GENERATION_SETTINGS,
  type TerrainGenerationSettings,
} from './terrain-settings'

export type TerrainSplatWeights = readonly [number, number, number, number]

interface TerrainNoiseOffsets {
  broad: readonly [number, number, number]
  crater: readonly [number, number, number]
  detail: readonly [number, number, number]
  ridge: readonly [number, number, number]
}

const broadNoise = new NoiseGenerator({
  exponentiation: 1.85,
  height: 28,
  lacunarity: 2.15,
  octaves: 6,
  persistence: 0.52,
  scale: 180,
  seed: 'soviet-terrain-broad',
})

const detailNoise = new NoiseGenerator({
  exponentiation: 1.3,
  height: 10,
  lacunarity: 2.4,
  octaves: 4,
  persistence: 0.58,
  scale: 70,
  seed: 'soviet-terrain-detail',
})

const ridgeNoise = new NoiseGenerator({
  exponentiation: 1.1,
  height: 8,
  lacunarity: 2.75,
  octaves: 3,
  persistence: 0.5,
  scale: 38,
  seed: 'soviet-terrain-ridge',
})

const craterNoise = new NoiseGenerator({
  exponentiation: 2.4,
  height: 12,
  lacunarity: 2.05,
  octaves: 3,
  persistence: 0.64,
  scale: 54,
  seed: 'soviet-terrain-crater',
})

const terrainNoiseOffsetsCache = new Map<number, TerrainNoiseOffsets>()

export function sampleTerrainHeight(
  x: number,
  z: number,
  settings: TerrainGenerationSettings = DEFAULT_TERRAIN_GENERATION_SETTINGS
) {
  const noiseOffsets = getTerrainNoiseOffsets(settings.seed)
  const broad = (broadNoise.get(
    x * settings.broadScale + noiseOffsets.broad[0],
    17.3 + noiseOffsets.broad[1],
    z * settings.broadScale + noiseOffsets.broad[2]
  ) -
    10.5) *
    settings.broadStrength
  const detail =
    (detailNoise.get(
      x * 1.15 * settings.detailScale + noiseOffsets.detail[0],
      61.4 + noiseOffsets.detail[1],
      z * 1.15 * settings.detailScale + noiseOffsets.detail[2]
    ) - 4.8) *
    0.85 *
    settings.detailStrength
  const ridge =
    (ridgeNoise.get(
      x * 1.35 * settings.ridgeScale + noiseOffsets.ridge[0],
      109.7 + noiseOffsets.ridge[1],
      z * 1.35 * settings.ridgeScale + noiseOffsets.ridge[2]
    ) - 4.1) *
    0.45 *
    settings.ridgeStrength
  const craterField = craterNoise.get(
    x * 0.85 * settings.craterScale + noiseOffsets.crater[0],
    177.2 + noiseOffsets.crater[1],
    z * 0.85 * settings.craterScale + noiseOffsets.crater[2]
  )
  const craterMask = smoothstep(6.2, 9.3, craterField)
  const craterDepth = craterMask * craterMask * 7.5 * settings.craterStrength

  return 12 + (broad + detail + ridge - craterDepth) * settings.heightScale
}

export function samplePlanetTerrainHeight(
  x: number,
  y: number,
  z: number,
  settings: TerrainGenerationSettings = DEFAULT_TERRAIN_GENERATION_SETTINGS
) {
  const noiseOffsets = getTerrainNoiseOffsets(settings.seed)
  const broad = (broadNoise.get(
    x * settings.broadScale + noiseOffsets.broad[0],
    y * settings.broadScale + 17.3 + noiseOffsets.broad[1],
    z * settings.broadScale + noiseOffsets.broad[2]
  ) -
    10.5) *
    settings.broadStrength
  const detail =
    (detailNoise.get(
      x * 1.15 * settings.detailScale + noiseOffsets.detail[0],
      y * 1.15 * settings.detailScale + 61.4 + noiseOffsets.detail[1],
      z * 1.15 * settings.detailScale + noiseOffsets.detail[2]
    ) - 4.8) *
    0.72 *
    settings.detailStrength
  const ridge =
    (ridgeNoise.get(
      x * 1.35 * settings.ridgeScale + noiseOffsets.ridge[0],
      y * 1.35 * settings.ridgeScale + 109.7 + noiseOffsets.ridge[1],
      z * 1.35 * settings.ridgeScale + noiseOffsets.ridge[2]
    ) - 4.1) *
    0.4 *
    settings.ridgeStrength
  const craterField = craterNoise.get(
    x * 0.85 * settings.craterScale + noiseOffsets.crater[0],
    y * 0.85 * settings.craterScale + 177.2 + noiseOffsets.crater[1],
    z * 0.85 * settings.craterScale + noiseOffsets.crater[2]
  )
  const craterMask = smoothstep(6.2, 9.3, craterField)
  const craterDepth = craterMask * craterMask * 5.5 * settings.craterStrength

  return 8 + (broad + detail + ridge - craterDepth) * settings.heightScale
}

export function computeSplatWeights(
  height01: number,
  flatness: number
): TerrainSplatWeights {
  const steepness = 1 - flatness
  const rockWeight = smoothstep(0.18, 0.42, steepness)
  const flatShare = 1 - rockWeight

  const scorchedWeight = flatShare * (1 - smoothstep(0.2, 0.42, height01))
  const frozenWeight =
    flatShare *
    smoothstep(0.24, 0.5, height01) *
    (1 - smoothstep(0.56, 0.78, height01))
  const frostWeight = flatShare * smoothstep(0.6, 0.88, height01)

  return normalizeWeights([
    scorchedWeight,
    frozenWeight,
    frostWeight,
    rockWeight,
  ])
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = inverseLerp(edge0, edge1, value)
  return amount * amount * (3 - 2 * amount)
}

function normalizeWeights(
  weights: [number, number, number, number]
): TerrainSplatWeights {
  const total = weights[0] + weights[1] + weights[2] + weights[3]

  if (total <= Number.EPSILON) {
    return [1, 0, 0, 0] as const
  }

  return [
    weights[0] / total,
    weights[1] / total,
    weights[2] / total,
    weights[3] / total,
  ] as const
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function inverseLerp(min: number, max: number, value: number) {
  if (Math.abs(max - min) <= Number.EPSILON) {
    return 0
  }

  return clamp((value - min) / (max - min), 0, 1)
}

function getTerrainNoiseOffsets(seed: number) {
  const normalizedSeed = Math.round(seed)
  const cached = terrainNoiseOffsetsCache.get(normalizedSeed)

  if (cached) {
    return cached
  }

  if (normalizedSeed === 0) {
    const zeroOffsets = {
      broad: [0, 0, 0] as const,
      crater: [0, 0, 0] as const,
      detail: [0, 0, 0] as const,
      ridge: [0, 0, 0] as const,
    } satisfies TerrainNoiseOffsets

    terrainNoiseOffsetsCache.set(normalizedSeed, zeroOffsets)

    return zeroOffsets
  }

  const offsets = {
    broad: createNoiseOffsetVector(normalizedSeed, 11),
    crater: createNoiseOffsetVector(normalizedSeed, 41),
    detail: createNoiseOffsetVector(normalizedSeed, 23),
    ridge: createNoiseOffsetVector(normalizedSeed, 31),
  } satisfies TerrainNoiseOffsets

  terrainNoiseOffsetsCache.set(normalizedSeed, offsets)

  return offsets
}

function createNoiseOffsetVector(seed: number, salt: number) {
  return [
    hashSeed(seed, salt) * 2400 - 1200,
    hashSeed(seed, salt + 1) * 2400 - 1200,
    hashSeed(seed, salt + 2) * 2400 - 1200,
  ] as const
}

function hashSeed(seed: number, salt: number) {
  const hashed = Math.sin((seed + 1) * 127.1 + salt * 311.7) * 43758.5453123
  return hashed - Math.floor(hashed)
}
