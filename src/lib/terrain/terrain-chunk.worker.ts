/// <reference lib="webworker" />

import { generateTerrainChunkBuffers } from './terrain-chunk'
import type {
  TerrainChunkWorkerRequest,
  TerrainChunkWorkerResponse,
} from './terrain-worker-types'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<TerrainChunkWorkerRequest>) => {
  const chunk = generateTerrainChunkBuffers({
    ...event.data.options,
    sharedArrayBuffer: true,
  })
  const response: TerrainChunkWorkerResponse = {
    chunk,
    requestId: event.data.requestId,
  }

  workerScope.postMessage(response)
}

export {}
