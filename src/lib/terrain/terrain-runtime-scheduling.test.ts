import { describe, expect, it } from 'vitest'
import {
  getChunkRequestBudget,
  takeCyclicWindow,
} from './terrain-runtime-scheduling'

describe('getChunkRequestBudget', () => {
  it('caps new chunk requests by pass budget and inflight limit', () => {
    expect(
      getChunkRequestBudget({
        inflightCount: 0,
        maxInflightRequests: 6,
        maxNewRequestsPerPass: 3,
      })
    ).toBe(3)
    expect(
      getChunkRequestBudget({
        inflightCount: 5,
        maxInflightRequests: 6,
        maxNewRequestsPerPass: 3,
      })
    ).toBe(1)
    expect(
      getChunkRequestBudget({
        inflightCount: 7,
        maxInflightRequests: 6,
        maxNewRequestsPerPass: 3,
      })
    ).toBe(0)
  })
})

describe('takeCyclicWindow', () => {
  it('returns a stable wrapped slice and next cursor', () => {
    const result = takeCyclicWindow(['a', 'b', 'c', 'd'], 3, 2)

    expect(result.items).toEqual(['c', 'd', 'a'])
    expect(result.nextIndex).toBe(1)
  })

  it('handles empty arrays and oversized counts safely', () => {
    expect(takeCyclicWindow([], 4, 1)).toEqual({
      items: [],
      nextIndex: 0,
    })
    expect(takeCyclicWindow([1, 2], 8, 0)).toEqual({
      items: [1, 2],
      nextIndex: 0,
    })
  })
})
