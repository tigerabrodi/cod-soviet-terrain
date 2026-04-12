import { describe, expect, it } from 'vitest'
import {
  getChunkAnchor,
  selectChunkWindow,
  shouldRefreshChunkWindow,
} from './terrain-streaming'

describe('getChunkAnchor', () => {
  it('keeps positions inside the current centered chunk until the edge', () => {
    expect(getChunkAnchor(0, 0, 180)).toEqual({ gridX: 0, gridZ: 0 })
    expect(getChunkAnchor(89.9, -89.9, 180)).toEqual({
      gridX: 0,
      gridZ: 0,
    })
    expect(getChunkAnchor(90.1, -90.1, 180)).toEqual({
      gridX: 1,
      gridZ: -1,
    })
  })
})

describe('selectChunkWindow', () => {
  it('returns a stable chunk window around the anchor chunk', () => {
    const chunkWindow = selectChunkWindow({ gridX: 1, gridZ: -2 }, 180, 1)

    expect(chunkWindow).toHaveLength(9)
    expect(chunkWindow.map((chunk) => chunk.key)).toEqual([
      '0:-3',
      '1:-3',
      '2:-3',
      '0:-2',
      '1:-2',
      '2:-2',
      '0:-1',
      '1:-1',
      '2:-1',
    ])
    expect(chunkWindow[4]).toMatchObject({
      gridX: 1,
      gridZ: -2,
      key: '1:-2',
      worldX: 180,
      worldZ: -360,
    })
  })
})

describe('shouldRefreshChunkWindow', () => {
  it('refreshes only when the camera crosses into a new chunk', () => {
    expect(shouldRefreshChunkWindow({ gridX: 0, gridZ: 0 }, 25, -40, 180)).toBe(
      false
    )
    expect(
      shouldRefreshChunkWindow({ gridX: 0, gridZ: 0 }, 90.1, -40, 180)
    ).toBe(true)
    expect(shouldRefreshChunkWindow({ gridX: 0, gridZ: 0 }, 20, -95, 180)).toBe(
      true
    )
  })
})
