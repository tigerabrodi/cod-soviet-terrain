export function getChunkRequestBudget({
  inflightCount,
  maxInflightRequests,
  maxNewRequestsPerPass,
}: {
  inflightCount: number
  maxInflightRequests: number
  maxNewRequestsPerPass: number
}) {
  return Math.max(
    0,
    Math.min(maxNewRequestsPerPass, maxInflightRequests - inflightCount)
  )
}

export function takeCyclicWindow<T>(
  items: Array<T>,
  count: number,
  startIndex: number
) {
  if (items.length === 0 || count <= 0) {
    return {
      items: [] as Array<T>,
      nextIndex: 0,
    }
  }

  const safeCount = Math.min(count, items.length)
  const normalizedStart =
    ((Math.trunc(startIndex) % items.length) + items.length) % items.length
  const windowItems: Array<T> = []

  for (let offset = 0; offset < safeCount; offset += 1) {
    windowItems.push(items[(normalizedStart + offset) % items.length])
  }

  return {
    items: windowItems,
    nextIndex: (normalizedStart + safeCount) % items.length,
  }
}
