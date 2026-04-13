import { describe, expect, it } from 'vitest'
import {
  getChunkAnchor,
  selectQuadtreeChunkWindow,
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

  it('assigns lod levels by chunk ring distance from the anchor', () => {
    const chunkWindow = selectChunkWindow(
      { gridX: 0, gridZ: 0 },
      180,
      2,
      [64, 32, 16]
    )

    expect(chunkWindow).toHaveLength(25)
    expect(chunkWindow.find((chunk) => chunk.key === '0:0')).toMatchObject({
      key: '0:0',
      lodLevel: 0,
      resolution: 64,
    })
    expect(chunkWindow.find((chunk) => chunk.key === '1:0')).toMatchObject({
      key: '1:0',
      lodLevel: 1,
      resolution: 32,
    })
    expect(chunkWindow.find((chunk) => chunk.key === '2:0')).toMatchObject({
      key: '2:0',
      lodLevel: 2,
      resolution: 16,
    })
    expect(chunkWindow.find((chunk) => chunk.key === '2:2')).toMatchObject({
      key: '2:2',
      lodLevel: 2,
      resolution: 16,
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

describe('selectQuadtreeChunkWindow', () => {
  it('returns mixed quadtree leaf sizes around the camera focus', () => {
    const chunkWindow = selectQuadtreeChunkWindow(0, 0, 180, [64, 32, 16])
    const uniqueKeys = new Set(chunkWindow.map((chunk) => chunk.key))
    const sizeCounts = chunkWindow.reduce<Record<number, number>>(
      (counts, chunk) => {
        counts[chunk.size] = (counts[chunk.size] ?? 0) + 1
        return counts
      },
      {}
    )

    expect(uniqueKeys.size).toBe(chunkWindow.length)
    expect(sizeCounts[180]).toBe(16)
    expect(sizeCounts[360]).toBe(16)
    expect(sizeCounts[720]).toBe(4)

    expect(
      chunkWindow.find((chunk) => chunk.worldX === -90 && chunk.worldZ === -90)
    ).toMatchObject({
      lodLevel: 0,
      resolution: 64,
      size: 180,
    })

    expect(
      chunkWindow.find((chunk) => chunk.worldX === 540 && chunk.worldZ === -180)
    ).toMatchObject({
      lodLevel: 1,
      resolution: 32,
      size: 360,
    })

    expect(
      chunkWindow.find(
        (chunk) => chunk.worldX === -720 && chunk.worldZ === -720
      )
    ).toMatchObject({
      lodLevel: 2,
      resolution: 16,
      size: 720,
    })
  })
})
