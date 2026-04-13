import { DEFAULT_TERRAIN_CHUNK_RESOLUTION } from './terrain-chunk'

export interface TerrainChunkAnchor {
  gridX: number
  gridZ: number
}

export interface TerrainChunkDescriptor extends TerrainChunkAnchor {
  gridDistance: number
  key: string
  lodLevel: number
  resolution: number
  worldX: number
  worldZ: number
}

export function getChunkAnchor(
  worldX: number,
  worldZ: number,
  chunkSize: number
): TerrainChunkAnchor {
  return {
    gridX: getChunkCoordinate(worldX, chunkSize),
    gridZ: getChunkCoordinate(worldZ, chunkSize),
  }
}

export function getChunkCoordinate(worldValue: number, chunkSize: number) {
  return Math.floor((worldValue + chunkSize * 0.5) / chunkSize)
}

export function selectChunkWindow(
  anchor: TerrainChunkAnchor,
  chunkSize: number,
  radius: number,
  lodResolutions: ReadonlyArray<number> = [DEFAULT_TERRAIN_CHUNK_RESOLUTION]
) {
  const chunkWindow: Array<TerrainChunkDescriptor> = []

  for (
    let gridZ = anchor.gridZ - radius;
    gridZ <= anchor.gridZ + radius;
    gridZ += 1
  ) {
    for (
      let gridX = anchor.gridX - radius;
      gridX <= anchor.gridX + radius;
      gridX += 1
    ) {
      const gridDistance = Math.max(
        Math.abs(gridX - anchor.gridX),
        Math.abs(gridZ - anchor.gridZ)
      )
      const lodLevel = Math.min(gridDistance, lodResolutions.length - 1)

      chunkWindow.push({
        gridDistance,
        gridX,
        gridZ,
        key: getChunkKey(gridX, gridZ),
        lodLevel,
        resolution:
          lodResolutions[lodLevel] ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION,
        worldX: gridX * chunkSize,
        worldZ: gridZ * chunkSize,
      })
    }
  }

  return chunkWindow
}

export function shouldRefreshChunkWindow(
  currentAnchor: TerrainChunkAnchor,
  worldX: number,
  worldZ: number,
  chunkSize: number
) {
  const nextAnchor = getChunkAnchor(worldX, worldZ, chunkSize)

  return (
    nextAnchor.gridX !== currentAnchor.gridX ||
    nextAnchor.gridZ !== currentAnchor.gridZ
  )
}

function getChunkKey(gridX: number, gridZ: number) {
  return `${gridX}:${gridZ}`
}
