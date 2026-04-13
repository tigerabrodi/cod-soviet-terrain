import type { CompressedTexture } from 'three'
import { getSharedKTX2Loader } from '@/lib/shared/ktx2-loader'

export const SNOW_PARTICLE_COUNT = 9000
export const SNOW_VOLUME_HEIGHT = 46
export const SNOW_VOLUME_RADIUS = 54

type DetectSupportRenderer = Parameters<typeof getSharedKTX2Loader>[0]

export interface SnowParticleBuffers {
  anchorData: Float32Array
  configData: Float32Array
  count: number
  rotationData: Float32Array
}

const snowTextureCache = new WeakMap<object, Promise<CompressedTexture>>()

export function buildSnowParticleAttributes(
  count = SNOW_PARTICLE_COUNT
): SnowParticleBuffers {
  const anchorData = new Float32Array(count * 3)
  const configData = new Float32Array(count * 4)
  const rotationData = new Float32Array(count)
  const random = createMulberry32(0x5f3759df)

  for (let index = 0; index < count; index += 1) {
    const radius = Math.sqrt(random()) * SNOW_VOLUME_RADIUS
    const angle = random() * Math.PI * 2
    const fallSpeed = 0.22 + random() * 0.24
    const driftFrequency = 0.52 + random() * 0.9
    const driftAmplitude = 0.45 + random() * 1.7
    const height = random() * SNOW_VOLUME_HEIGHT
    const phase = random()
    const rotationSeed = random()

    anchorData[index * 3] = Math.cos(angle) * radius
    anchorData[index * 3 + 1] = height
    anchorData[index * 3 + 2] = Math.sin(angle) * radius

    configData[index * 4] = fallSpeed
    configData[index * 4 + 1] = driftFrequency
    configData[index * 4 + 2] = driftAmplitude
    configData[index * 4 + 3] = phase

    rotationData[index] = rotationSeed
  }

  return {
    anchorData,
    configData,
    count,
    rotationData,
  }
}

export function loadSnowflakeTexture(renderer: DetectSupportRenderer) {
  const cached = snowTextureCache.get(renderer as object)

  if (cached) {
    return cached
  }

  const promise = createSnowflakeTexture(renderer).catch((error: unknown) => {
    snowTextureCache.delete(renderer as object)
    throw error
  })

  snowTextureCache.set(renderer as object, promise)

  return promise
}

async function createSnowflakeTexture(renderer: DetectSupportRenderer) {
  const loader = getSharedKTX2Loader(renderer)

  const texture = await loader.loadAsync('/textures/particles/snowflake.ktx2')

  return texture
}

function createMulberry32(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5

    let next = Math.imul(state ^ (state >>> 15), 1 | state)

    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}
