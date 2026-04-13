import type {
  TerrainChunkBuildOptions,
  TerrainChunkBuffers,
} from './terrain-chunk'
import type {
  TerrainChunkWorkerRequest,
  TerrainChunkWorkerResponse,
} from './terrain-worker-types'

interface QueuedTerrainChunkRequest {
  options: TerrainChunkBuildOptions
  reject: (reason?: unknown) => void
  requestId: number
  resolve: (chunk: TerrainChunkBuffers) => void
}

interface TerrainWorkerState {
  activeRequestId: number | null
  busy: boolean
  worker: Worker
}

export class TerrainChunkWorkerPool {
  private readonly pending = new Map<number, QueuedTerrainChunkRequest>()
  private readonly queue: Array<QueuedTerrainChunkRequest> = []
  private nextRequestId = 1
  private readonly workers: Array<TerrainWorkerState>

  constructor(workerCount = getDefaultTerrainWorkerCount()) {
    this.workers = Array.from({ length: workerCount }, () => {
      const worker = new Worker(
        new URL('./terrain-chunk.worker.ts', import.meta.url),
        {
          type: 'module',
        }
      )

      return {
        activeRequestId: null,
        busy: false,
        worker,
      }
    })

    this.workers.forEach((workerState, workerIndex) => {
      workerState.worker.onmessage = (
        event: MessageEvent<TerrainChunkWorkerResponse>
      ) => {
        this.handleWorkerMessage(workerIndex, event.data)
      }

      workerState.worker.onerror = (event) => {
        this.handleWorkerError(workerIndex, event.error ?? event.message)
      }
    })
  }

  requestChunk(options: TerrainChunkBuildOptions) {
    return new Promise<TerrainChunkBuffers>((resolve, reject) => {
      this.queue.push({
        options,
        reject,
        requestId: this.nextRequestId,
        resolve,
      })
      this.nextRequestId += 1
      this.pumpQueue()
    })
  }

  destroy() {
    for (const workerState of this.workers) {
      workerState.worker.terminate()
    }

    for (const request of this.queue) {
      request.reject(new Error('Terrain worker pool was destroyed.'))
    }

    for (const request of this.pending.values()) {
      request.reject(new Error('Terrain worker pool was destroyed.'))
    }

    this.queue.length = 0
    this.pending.clear()
  }

  private pumpQueue() {
    for (const workerState of this.workers) {
      if (workerState.busy) {
        continue
      }

      const nextRequest = this.queue.shift()

      if (!nextRequest) {
        return
      }

      workerState.busy = true
      workerState.activeRequestId = nextRequest.requestId
      this.pending.set(nextRequest.requestId, nextRequest)

      const request: TerrainChunkWorkerRequest = {
        options: nextRequest.options,
        requestId: nextRequest.requestId,
      }

      workerState.worker.postMessage(request)
    }
  }

  private handleWorkerMessage(
    workerIndex: number,
    response: TerrainChunkWorkerResponse
  ) {
    const workerState = this.workers[workerIndex]
    const request = this.pending.get(response.requestId)

    workerState.busy = false
    workerState.activeRequestId = null

    if (!request) {
      this.pumpQueue()
      return
    }

    this.pending.delete(response.requestId)
    request.resolve(response.chunk)
    this.pumpQueue()
  }

  private handleWorkerError(workerIndex: number, error: unknown) {
    const workerState = this.workers[workerIndex]
    const activeRequestId = workerState.activeRequestId

    workerState.busy = false
    workerState.activeRequestId = null

    if (activeRequestId === null) {
      this.pumpQueue()
      return
    }

    const request = this.pending.get(activeRequestId)

    if (request) {
      this.pending.delete(activeRequestId)
      request.reject(error)
    }

    this.pumpQueue()
  }
}

function getDefaultTerrainWorkerCount() {
  if (typeof navigator === 'undefined') {
    return 1
  }

  return Math.max(1, Math.min(7, (navigator.hardwareConcurrency ?? 8) - 1))
}
