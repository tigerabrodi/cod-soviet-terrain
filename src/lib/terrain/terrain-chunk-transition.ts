export const DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS = 0.16

export function getTerrainChunkRevealFactor(
  elapsedSeconds: number,
  durationSeconds = DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS
) {
  if (durationSeconds <= 0) {
    return 1
  }

  return Math.max(0, Math.min(1, elapsedSeconds / durationSeconds))
}
