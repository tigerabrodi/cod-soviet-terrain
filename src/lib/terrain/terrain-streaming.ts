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
  size: number
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
        size: chunkSize,
        worldX: gridX * chunkSize,
        worldZ: gridZ * chunkSize,
      })
    }
  }

  return chunkWindow
}

export function selectQuadtreeChunkWindow(
  worldX: number,
  worldZ: number,
  minChunkSize: number,
  lodResolutions: ReadonlyArray<number> = [DEFAULT_TERRAIN_CHUNK_RESOLUTION]
) {
  const maxLodLevel = lodResolutions.length - 1
  const rootChunkSize = minChunkSize * 2 ** maxLodLevel
  const rootAnchor = getChunkAnchor(worldX, worldZ, rootChunkSize)
  const chunkWindow: Array<TerrainChunkDescriptor> = []

  for (
    let rootGridZ = rootAnchor.gridZ - 1;
    rootGridZ <= rootAnchor.gridZ + 1;
    rootGridZ += 1
  ) {
    for (
      let rootGridX = rootAnchor.gridX - 1;
      rootGridX <= rootAnchor.gridX + 1;
      rootGridX += 1
    ) {
      collectQuadtreeLeaves(
        {
          lodLevel: maxLodLevel,
          size: rootChunkSize,
          worldX: rootGridX * rootChunkSize,
          worldZ: rootGridZ * rootChunkSize,
        },
        {
          cameraX: worldX,
          cameraZ: worldZ,
          chunkWindow,
          lodResolutions,
          minChunkSize,
        }
      )
    }
  }

  return chunkWindow.sort((left, right) => {
    if (left.lodLevel !== right.lodLevel) {
      return left.lodLevel - right.lodLevel
    }

    if (left.worldZ !== right.worldZ) {
      return left.worldZ - right.worldZ
    }

    return left.worldX - right.worldX
  })
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

interface QuadtreeBuildContext {
  cameraX: number
  cameraZ: number
  chunkWindow: Array<TerrainChunkDescriptor>
  lodResolutions: ReadonlyArray<number>
  minChunkSize: number
}

interface QuadtreeNodeDescriptor {
  lodLevel: number
  size: number
  worldX: number
  worldZ: number
}

function collectQuadtreeLeaves(
  node: QuadtreeNodeDescriptor,
  context: QuadtreeBuildContext
) {
  if (
    node.lodLevel === 0 ||
    !shouldSubdivideQuadtreeNode(node, context.cameraX, context.cameraZ)
  ) {
    context.chunkWindow.push(
      createQuadtreeChunkDescriptor(
        node,
        context.cameraX,
        context.cameraZ,
        context.lodResolutions,
        context.minChunkSize
      )
    )
    return
  }

  const childSize = node.size * 0.5

  for (const childWorldZ of [
    node.worldZ - childSize * 0.5,
    node.worldZ + childSize * 0.5,
  ]) {
    for (const childWorldX of [
      node.worldX - childSize * 0.5,
      node.worldX + childSize * 0.5,
    ]) {
      collectQuadtreeLeaves(
        {
          lodLevel: node.lodLevel - 1,
          size: childSize,
          worldX: childWorldX,
          worldZ: childWorldZ,
        },
        context
      )
    }
  }
}

function createQuadtreeChunkDescriptor(
  node: QuadtreeNodeDescriptor,
  cameraX: number,
  cameraZ: number,
  lodResolutions: ReadonlyArray<number>,
  minChunkSize: number
): TerrainChunkDescriptor {
  return {
    gridDistance:
      Math.max(
        Math.abs(node.worldX - cameraX),
        Math.abs(node.worldZ - cameraZ)
      ) / minChunkSize,
    gridX: node.worldX / node.size,
    gridZ: node.worldZ / node.size,
    key: getQuadtreeChunkKey(node.worldX, node.worldZ, node.size),
    lodLevel: node.lodLevel,
    resolution:
      lodResolutions[node.lodLevel] ?? DEFAULT_TERRAIN_CHUNK_RESOLUTION,
    size: node.size,
    worldX: node.worldX,
    worldZ: node.worldZ,
  }
}

function getDistanceToNodeBounds(
  worldX: number,
  worldZ: number,
  nodeWorldX: number,
  nodeWorldZ: number,
  nodeSize: number
) {
  const halfSize = nodeSize * 0.5
  const distanceX = Math.max(Math.abs(worldX - nodeWorldX) - halfSize, 0)
  const distanceZ = Math.max(Math.abs(worldZ - nodeWorldZ) - halfSize, 0)

  return Math.hypot(distanceX, distanceZ)
}

function shouldSubdivideQuadtreeNode(
  node: QuadtreeNodeDescriptor,
  cameraX: number,
  cameraZ: number
) {
  return (
    getDistanceToNodeBounds(
      cameraX,
      cameraZ,
      node.worldX,
      node.worldZ,
      node.size
    ) <=
    node.size * 0.5
  )
}

function getQuadtreeChunkKey(worldX: number, worldZ: number, size: number) {
  return `${worldX}:${worldZ}:${size}`
}
