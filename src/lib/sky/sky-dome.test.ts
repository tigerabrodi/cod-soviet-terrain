import { describe, expect, it } from 'vitest'
import { createSkyDomeGeometry, sampleSkyGradientColor } from './sky-dome'

describe('sampleSkyGradientColor', () => {
  it('brightens toward the horizon and cools toward the zenith', () => {
    const horizonColor = sampleSkyGradientColor(0)
    const zenithColor = sampleSkyGradientColor(1)

    expect(horizonColor.r).toBeGreaterThan(zenithColor.r)
    expect(horizonColor.g).toBeGreaterThan(zenithColor.g)
    expect(zenithColor.b / zenithColor.r).toBeGreaterThan(
      horizonColor.b / horizonColor.r
    )
  })
})

describe('createSkyDomeGeometry', () => {
  it('adds a color attribute for the sky gradient', () => {
    const geometry = createSkyDomeGeometry()

    try {
      const position = geometry.getAttribute('position')
      const color = geometry.getAttribute('color')

      expect(color).toBeDefined()
      expect(color.itemSize).toBe(3)
      expect(color.count).toBe(position.count)
    } finally {
      geometry.dispose()
    }
  })
})
