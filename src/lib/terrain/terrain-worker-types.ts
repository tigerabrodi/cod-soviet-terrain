import type {
  TerrainChunkBuildOptions,
  TerrainChunkBuffers,
} from './terrain-chunk'

export interface TerrainChunkWorkerRequest {
  options: TerrainChunkBuildOptions
  requestId: number
}

export interface TerrainChunkWorkerResponse {
  chunk: TerrainChunkBuffers
  requestId: number
}
