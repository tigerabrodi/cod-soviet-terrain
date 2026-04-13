/// <reference lib="webworker" />

import { generateTerrainChunkBuffers } from './terrain-chunk'
import type {
  TerrainChunkWorkerRequest,
  TerrainChunkWorkerResponse,
} from './terrain-worker-types'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<TerrainChunkWorkerRequest>) => {
  const chunk = generateTerrainChunkBuffers(event.data.options)
  const response: TerrainChunkWorkerResponse = {
    chunk,
    requestId: event.data.requestId,
  }

  workerScope.postMessage(response, [
    chunk.positions.buffer,
    chunk.normals.buffer,
    chunk.splatWeights.buffer,
    chunk.indices.buffer,
  ])
}

export {}
