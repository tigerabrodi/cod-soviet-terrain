import { describe, expect, it } from 'vitest'
import { PLANET_RADIUS, getPlanetPointOnFace } from '@/lib/terrain/terrain-planet'
import { DEFAULT_TERRAIN_GENERATION_SETTINGS } from '@/lib/terrain/terrain-settings'
import {
  DEFAULT_DEAD_TREE_SETTINGS,
  buildDeadTreeChunkInstances,
  createDeadTreeSettingsSignature,
} from './dead-tree-generation'

const TEST_CHUNK = {
  centerX: 0,
  centerY: 0,
  face: 'positive-z' as const,
  key: 'positive-z:0:0:180',
  lodLevel: 0,
  resolution: 64,
  size: 180,
  sphereCenter: getPlanetPointOnFace('positive-z', 0, 0),
}

describe('buildDeadTreeChunkInstances', () => {
  it('returns deterministic tree placement for the same chunk and settings', () => {
    const first = buildDeadTreeChunkInstances({
      buildOrigin: [0, 0, 0],
      chunk: TEST_CHUNK,
      terrainSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      vegetationSettings: DEFAULT_DEAD_TREE_SETTINGS,
    })
    const second = buildDeadTreeChunkInstances({
      buildOrigin: [0, 0, 0],
      chunk: TEST_CHUNK,
      terrainSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      vegetationSettings: DEFAULT_DEAD_TREE_SETTINGS,
    })

    expect(first.count).toBe(second.count)
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions))
    expect(Array.from(first.ups)).toEqual(Array.from(second.ups))
    expect(Array.from(first.scales)).toEqual(Array.from(second.scales))
  })

  it('skips trees when vegetation is disabled or too far in lod', () => {
    const disabled = buildDeadTreeChunkInstances({
      buildOrigin: [0, 0, 0],
      chunk: TEST_CHUNK,
      terrainSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      vegetationSettings: {
        ...DEFAULT_DEAD_TREE_SETTINGS,
        density: 1,
        enabled: false,
      },
    })
    const farLod = buildDeadTreeChunkInstances({
      buildOrigin: [0, 0, 0],
      chunk: {
        ...TEST_CHUNK,
        key: 'positive-z:0:0:720',
        lodLevel: 2,
        size: 720,
      },
      terrainSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      vegetationSettings: DEFAULT_DEAD_TREE_SETTINGS,
    })

    expect(disabled.count).toBe(0)
    expect(farLod.count).toBe(0)
  })

  it('produces upright world anchored trees for a visible near chunk', () => {
    const instances = buildDeadTreeChunkInstances({
      buildOrigin: [0, 0, 0],
      chunk: TEST_CHUNK,
      terrainSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      vegetationSettings: DEFAULT_DEAD_TREE_SETTINGS,
    })

    expect(instances.count).toBeGreaterThan(0)
    expect(instances.positions.length).toBe(instances.count * 3)
    expect(instances.ups.length).toBe(instances.count * 3)
    expect(instances.scales.length).toBe(instances.count * 3)

    for (let index = 0; index < instances.count; index += 1) {
      const px = instances.positions[index * 3]
      const py = instances.positions[index * 3 + 1]
      const pz = instances.positions[index * 3 + 2]
      const ux = instances.ups[index * 3]
      const uy = instances.ups[index * 3 + 1]
      const uz = instances.ups[index * 3 + 2]
      const scaleY = instances.scales[index * 3 + 1]
      const radialLength = Math.hypot(px, py, pz)
      const upLength = Math.hypot(ux, uy, uz)

      expect(radialLength).toBeGreaterThan(PLANET_RADIUS - 2)
      expect(upLength).toBeCloseTo(1, 5)
      expect(px * ux + py * uy + pz * uz).toBeGreaterThan(PLANET_RADIUS - 8)
      expect(scaleY).toBeGreaterThan(7)
    }
  })
})

describe('createDeadTreeSettingsSignature', () => {
  it('changes when vegetation settings change', () => {
    const first = createDeadTreeSettingsSignature(DEFAULT_DEAD_TREE_SETTINGS)
    const second = createDeadTreeSettingsSignature({
      ...DEFAULT_DEAD_TREE_SETTINGS,
      density: 1.4,
    })

    expect(first).not.toBe(second)
  })
})
