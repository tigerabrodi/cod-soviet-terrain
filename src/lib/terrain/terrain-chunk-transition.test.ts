import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS,
  getTerrainChunkRevealFactor,
  MIN_TERRAIN_CHUNK_REVEAL_FACTOR,
} from './terrain-chunk-transition'

describe('getTerrainChunkRevealFactor', () => {
  it('clamps the reveal factor into the 0 to 1 range', () => {
    expect(getTerrainChunkRevealFactor(-1)).toBe(MIN_TERRAIN_CHUNK_REVEAL_FACTOR)
    expect(getTerrainChunkRevealFactor(0)).toBe(MIN_TERRAIN_CHUNK_REVEAL_FACTOR)
    expect(
      getTerrainChunkRevealFactor(DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS * 0.5)
    ).toBe(
      MIN_TERRAIN_CHUNK_REVEAL_FACTOR +
        (1 - MIN_TERRAIN_CHUNK_REVEAL_FACTOR) * 0.5
    )
    expect(
      getTerrainChunkRevealFactor(DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS)
    ).toBe(1)
    expect(
      getTerrainChunkRevealFactor(DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS * 5)
    ).toBe(1)
  })

  it('treats zero or negative duration as already revealed', () => {
    expect(getTerrainChunkRevealFactor(0.1, 0)).toBe(1)
    expect(getTerrainChunkRevealFactor(0.1, -1)).toBe(1)
  })
})
