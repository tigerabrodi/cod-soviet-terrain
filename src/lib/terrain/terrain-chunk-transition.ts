export const DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS = 0.16
export const MIN_TERRAIN_CHUNK_REVEAL_FACTOR = 0.18

export function getTerrainChunkRevealFactor(
  elapsedSeconds: number,
  durationSeconds = DEFAULT_TERRAIN_CHUNK_REVEAL_SECONDS
) {
  if (durationSeconds <= 0) {
    return 1
  }

  const clampedProgress = Math.max(0, Math.min(1, elapsedSeconds / durationSeconds))

  return (
    MIN_TERRAIN_CHUNK_REVEAL_FACTOR +
    (1 - MIN_TERRAIN_CHUNK_REVEAL_FACTOR) * clampedProgress
  )
}
