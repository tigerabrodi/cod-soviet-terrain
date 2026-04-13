import { describe, expect, it } from 'vitest'
import {
  SNOW_PARTICLE_COUNT,
  SNOW_VOLUME_HEIGHT,
  SNOW_VOLUME_RADIUS,
  buildSnowParticleAttributes,
} from './snow-particles'

describe('buildSnowParticleAttributes', () => {
  it('creates deterministic particle buffers', () => {
    const firstRun = buildSnowParticleAttributes(8)
    const secondRun = buildSnowParticleAttributes(8)

    expect(Array.from(firstRun.anchorData)).toEqual(
      Array.from(secondRun.anchorData)
    )
    expect(Array.from(firstRun.configData)).toEqual(
      Array.from(secondRun.configData)
    )
    expect(Array.from(firstRun.rotationData)).toEqual(
      Array.from(secondRun.rotationData)
    )
  })

  it('keeps anchor points inside the snow volume', () => {
    const particles = buildSnowParticleAttributes(64)

    for (let index = 0; index < particles.count; index += 1) {
      const x = particles.anchorData[index * 3]
      const y = particles.anchorData[index * 3 + 1]
      const z = particles.anchorData[index * 3 + 2]

      expect(Math.hypot(x, z)).toBeLessThanOrEqual(SNOW_VOLUME_RADIUS)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(SNOW_VOLUME_HEIGHT)
    }
  })

  it('uses the default particle count', () => {
    const particles = buildSnowParticleAttributes()

    expect(particles.count).toBe(SNOW_PARTICLE_COUNT)
    expect(particles.anchorData.length).toBe(SNOW_PARTICLE_COUNT * 3)
    expect(particles.configData.length).toBe(SNOW_PARTICLE_COUNT * 4)
    expect(particles.rotationData.length).toBe(SNOW_PARTICLE_COUNT)
  })
})
