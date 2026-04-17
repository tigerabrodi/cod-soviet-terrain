export const PLANET_RADIUS = 360
export const PLANET_MAX_HEIGHT = 24
export const PLANET_MIN_HEIGHT = -6

export type CubeFaceId =
  | 'negative-x'
  | 'negative-y'
  | 'negative-z'
  | 'positive-x'
  | 'positive-y'
  | 'positive-z'

export interface PlanetChunkDescriptor {
  centerX: number
  centerY: number
  face: CubeFaceId
  key: string
  lodLevel: number
  resolution: number
  size: number
  sphereCenter: Readonly<{ x: number; y: number; z: number }>
}

export interface TerrainChunkEdgeMorph {
  east: number
  north: number
  south: number
  west: number
}

export interface PlanetChunkVisibilityOptions {
  cameraAspect: number
  cameraForwardWorld: Vec3Like
  cameraVerticalFovDegrees: number
  cameraWorldPosition: Vec3Like
  planetRadius?: number
}

export interface Vec3Like {
  x: number
  y: number
  z: number
}

interface CubeFaceBasis {
  normal: Vec3Like
  tangentX: Vec3Like
  tangentY: Vec3Like
}

const CUBE_FACE_BASES: Record<CubeFaceId, CubeFaceBasis> = {
  'negative-x': {
    normal: { x: -1, y: 0, z: 0 },
    tangentX: { x: 0, y: 0, z: 1 },
    tangentY: { x: 0, y: 1, z: 0 },
  },
  'negative-y': {
    normal: { x: 0, y: -1, z: 0 },
    tangentX: { x: 1, y: 0, z: 0 },
    tangentY: { x: 0, y: 0, z: 1 },
  },
  'negative-z': {
    normal: { x: 0, y: 0, z: -1 },
    tangentX: { x: -1, y: 0, z: 0 },
    tangentY: { x: 0, y: 1, z: 0 },
  },
  'positive-x': {
    normal: { x: 1, y: 0, z: 0 },
    tangentX: { x: 0, y: 0, z: -1 },
    tangentY: { x: 0, y: 1, z: 0 },
  },
  'positive-y': {
    normal: { x: 0, y: 1, z: 0 },
    tangentX: { x: 1, y: 0, z: 0 },
    tangentY: { x: 0, y: 0, z: -1 },
  },
  'positive-z': {
    normal: { x: 0, y: 0, z: 1 },
    tangentX: { x: 1, y: 0, z: 0 },
    tangentY: { x: 0, y: 1, z: 0 },
  },
}

export function getCubeFacePoint(
  face: CubeFaceId,
  x: number,
  y: number,
  radius = PLANET_RADIUS
) {
  const basis = CUBE_FACE_BASES[face]

  return {
    x: basis.normal.x * radius + basis.tangentX.x * x + basis.tangentY.x * y,
    y: basis.normal.y * radius + basis.tangentX.y * x + basis.tangentY.y * y,
    z: basis.normal.z * radius + basis.tangentX.z * x + basis.tangentY.z * y,
  }
}

export function getPlanetPointOnFace(
  face: CubeFaceId,
  x: number,
  y: number,
  radius = PLANET_RADIUS,
  height = 0
) {
  return projectPointToSphere(
    getCubeFacePoint(face, x, y, radius),
    radius,
    height
  )
}

export function projectPointToSphere(
  point: Vec3Like,
  radius = PLANET_RADIUS,
  height = 0
) {
  const length = Math.hypot(point.x, point.y, point.z) || 1
  const scale = (radius + height) / length

  return {
    x: point.x * scale,
    y: point.y * scale,
    z: point.z * scale,
  }
}

export function subtractWorldOrigin(point: Vec3Like, origin: Vec3Like) {
  return {
    x: point.x - origin.x,
    y: point.y - origin.y,
    z: point.z - origin.z,
  }
}

export function selectPlanetChunkWindow(
  cameraWorldPosition: Vec3Like,
  lodResolutions: ReadonlyArray<number>,
  planetRadius = PLANET_RADIUS
) {
  const chunkWindow: Array<PlanetChunkDescriptor> = []
  const minChunkSize = getPlanetMinChunkSize(lodResolutions, planetRadius)
  const rootChunkSize = planetRadius * 2
  const maxLodLevel = lodResolutions.length - 1

  for (const face of getCubeFaces()) {
    collectPlanetChunks(
      {
        centerX: 0,
        centerY: 0,
        face,
        lodLevel: maxLodLevel,
        size: rootChunkSize,
      },
      {
        cameraWorldPosition,
        chunkWindow,
        lodResolutions,
        minChunkSize,
        planetRadius,
      }
    )
  }

  return chunkWindow.sort((left, right) => {
    if (left.lodLevel !== right.lodLevel) {
      return left.lodLevel - right.lodLevel
    }

    if (left.face !== right.face) {
      return left.face.localeCompare(right.face)
    }

    if (left.centerY !== right.centerY) {
      return left.centerY - right.centerY
    }

    return left.centerX - right.centerX
  })
}

export function filterVisiblePlanetChunks<T extends PlanetChunkDescriptor>(
  chunkWindow: ReadonlyArray<T>,
  {
    cameraAspect,
    cameraForwardWorld,
    cameraVerticalFovDegrees,
    cameraWorldPosition,
    planetRadius = PLANET_RADIUS,
  }: PlanetChunkVisibilityOptions
) {
  const safeCameraAspect = Math.max(1, cameraAspect)
  const normalizedCameraForward = normalizeVec3(cameraForwardWorld)

  if (lengthVec3(normalizedCameraForward) <= 0.000001) {
    return [...chunkWindow]
  }

  return chunkWindow.filter((chunk) => {
    if (
      !isPlanetChunkAboveHorizon(chunk, cameraWorldPosition, planetRadius)
    ) {
      return false
    }

    if (chunk.lodLevel > 0) {
      return true
    }

    return isPlanetChunkInsideViewCone(
      chunk,
      cameraWorldPosition,
      normalizedCameraForward,
      safeCameraAspect,
      cameraVerticalFovDegrees
    )
  })
}

export function getPlanetMinChunkSize(
  lodResolutions: ReadonlyArray<number>,
  planetRadius = PLANET_RADIUS
) {
  return (planetRadius * 2) / 2 ** (lodResolutions.length - 1)
}

export function getCubeFaces(): ReadonlyArray<CubeFaceId> {
  return [
    'negative-x',
    'negative-y',
    'negative-z',
    'positive-x',
    'positive-y',
    'positive-z',
  ]
}

export function getPlanetChunkEdgeMorphs(
  chunkWindow: ReadonlyArray<PlanetChunkDescriptor>
) {
  const edgeMorphs = new Map<string, TerrainChunkEdgeMorph>()

  for (const chunk of chunkWindow) {
    edgeMorphs.set(chunk.key, {
      east: 0,
      north: 0,
      south: 0,
      west: 0,
    })
  }

  for (const chunk of chunkWindow) {
    const currentEdgeMorph = edgeMorphs.get(chunk.key)

    if (!currentEdgeMorph) {
      continue
    }

    for (const neighbor of chunkWindow) {
      if (
        neighbor.key === chunk.key ||
        neighbor.face !== chunk.face ||
        neighbor.lodLevel <= chunk.lodLevel
      ) {
        continue
      }

      if (touchesEastEdge(chunk, neighbor)) {
        currentEdgeMorph.east = Math.max(
          currentEdgeMorph.east,
          neighbor.lodLevel - chunk.lodLevel
        )
      }

      if (touchesWestEdge(chunk, neighbor)) {
        currentEdgeMorph.west = Math.max(
          currentEdgeMorph.west,
          neighbor.lodLevel - chunk.lodLevel
        )
      }

      if (touchesNorthEdge(chunk, neighbor)) {
        currentEdgeMorph.north = Math.max(
          currentEdgeMorph.north,
          neighbor.lodLevel - chunk.lodLevel
        )
      }

      if (touchesSouthEdge(chunk, neighbor)) {
        currentEdgeMorph.south = Math.max(
          currentEdgeMorph.south,
          neighbor.lodLevel - chunk.lodLevel
        )
      }
    }
  }

  return edgeMorphs
}

interface PlanetChunkBuildContext {
  cameraWorldPosition: Vec3Like
  chunkWindow: Array<PlanetChunkDescriptor>
  lodResolutions: ReadonlyArray<number>
  minChunkSize: number
  planetRadius: number
}

interface PlanetChunkNode {
  centerX: number
  centerY: number
  face: CubeFaceId
  lodLevel: number
  size: number
}

function collectPlanetChunks(
  node: PlanetChunkNode,
  context: PlanetChunkBuildContext
) {
  if (
    node.lodLevel === 0 ||
    !shouldSubdividePlanetChunk(
      node,
      context.cameraWorldPosition,
      context.planetRadius
    )
  ) {
    context.chunkWindow.push(
      createPlanetChunkDescriptor(
        node,
        context.lodResolutions,
        context.planetRadius
      )
    )
    return
  }

  const childSize = node.size * 0.5
  const childOffset = childSize * 0.5

  for (const childCenterY of [
    node.centerY - childOffset,
    node.centerY + childOffset,
  ]) {
    for (const childCenterX of [
      node.centerX - childOffset,
      node.centerX + childOffset,
    ]) {
      collectPlanetChunks(
        {
          centerX: childCenterX,
          centerY: childCenterY,
          face: node.face,
          lodLevel: node.lodLevel - 1,
          size: childSize,
        },
        context
      )
    }
  }
}

function createPlanetChunkDescriptor(
  node: PlanetChunkNode,
  lodResolutions: ReadonlyArray<number>,
  planetRadius: number
): PlanetChunkDescriptor {
  return {
    centerX: node.centerX,
    centerY: node.centerY,
    face: node.face,
    key: `${node.face}:${node.centerX}:${node.centerY}:${node.size}`,
    lodLevel: node.lodLevel,
    resolution: lodResolutions[node.lodLevel] ?? lodResolutions[0] ?? 16,
    size: node.size,
    sphereCenter: getPlanetPointOnFace(
      node.face,
      node.centerX,
      node.centerY,
      planetRadius
    ),
  }
}

function shouldSubdividePlanetChunk(
  node: PlanetChunkNode,
  cameraWorldPosition: Vec3Like,
  planetRadius: number
) {
  const sphereCenter = getPlanetPointOnFace(
    node.face,
    node.centerX,
    node.centerY,
    planetRadius
  )

  return (
    getDistance(cameraWorldPosition, sphereCenter) <= node.size &&
    node.size > planetRadius * 0.125
  )
}

function isPlanetChunkAboveHorizon(
  chunk: PlanetChunkDescriptor,
  cameraWorldPosition: Vec3Like,
  planetRadius: number
) {
  const cameraDistance = lengthVec3(cameraWorldPosition)

  if (cameraDistance <= planetRadius + 0.000001) {
    return true
  }

  const chunkDirection = normalizeVec3(chunk.sphereCenter)
  const cameraDirection = normalizeVec3(cameraWorldPosition)
  const horizonAngle = Math.acos(
    clamp(planetRadius / cameraDistance, -1, 1)
  )
  const chunkAngularRadius = Math.asin(
    clamp(
      getPlanetChunkBoundingRadius(chunk) /
        Math.max(lengthVec3(chunk.sphereCenter), 0.000001),
      0,
      0.999
    )
  )
  const visibilityThreshold = Math.cos(
    horizonAngle + chunkAngularRadius + 0.12
  )

  return dotVec3(cameraDirection, chunkDirection) >= visibilityThreshold
}

function isPlanetChunkInsideViewCone(
  chunk: PlanetChunkDescriptor,
  cameraWorldPosition: Vec3Like,
  cameraForwardWorld: Vec3Like,
  cameraAspect: number,
  cameraVerticalFovDegrees: number
) {
  const toChunk = subtractVec3(chunk.sphereCenter, cameraWorldPosition)
  const chunkDistance = lengthVec3(toChunk)
  const chunkRadius = getPlanetChunkBoundingRadius(chunk)

  if (chunkDistance <= chunkRadius + 0.000001) {
    return true
  }

  const verticalHalfFovRadians =
    Math.max(10, cameraVerticalFovDegrees) * (Math.PI / 180) * 0.5
  const horizontalHalfFovRadians = Math.atan(
    Math.tan(verticalHalfFovRadians) * cameraAspect
  )
  const viewHalfAngle = Math.max(
    verticalHalfFovRadians,
    horizontalHalfFovRadians
  )
  const chunkAngularRadius = Math.asin(
    clamp(chunkRadius / chunkDistance, 0, 0.999)
  )
  const visibilityThreshold = Math.cos(
    viewHalfAngle + chunkAngularRadius + 0.38
  )

  return (
    dotVec3(normalizeVec3(toChunk), normalizeVec3(cameraForwardWorld)) >=
    visibilityThreshold
  )
}

function getPlanetChunkBoundingRadius(chunk: PlanetChunkDescriptor) {
  const halfDiagonal = Math.hypot(chunk.size * 0.5, chunk.size * 0.5)

  return halfDiagonal * 0.55 + PLANET_MAX_HEIGHT + 6
}

function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

function lengthVec3(vector: Vec3Like) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function normalizeVec3(vector: Vec3Like) {
  const length = lengthVec3(vector)

  return length <= 0.000001
    ? { x: 0, y: 0, z: 0 }
    : {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length,
      }
}

function subtractVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function dotVec3(left: Vec3Like, right: Vec3Like) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function touchesEastEdge(
  chunk: PlanetChunkDescriptor,
  neighbor: PlanetChunkDescriptor
) {
  return (
    areRangesOverlapping(
      getMinEdge(chunk.centerY, chunk.size),
      getMaxEdge(chunk.centerY, chunk.size),
      getMinEdge(neighbor.centerY, neighbor.size),
      getMaxEdge(neighbor.centerY, neighbor.size)
    ) &&
    areValuesClose(
      getMaxEdge(chunk.centerX, chunk.size),
      getMinEdge(neighbor.centerX, neighbor.size)
    )
  )
}

function touchesWestEdge(
  chunk: PlanetChunkDescriptor,
  neighbor: PlanetChunkDescriptor
) {
  return (
    areRangesOverlapping(
      getMinEdge(chunk.centerY, chunk.size),
      getMaxEdge(chunk.centerY, chunk.size),
      getMinEdge(neighbor.centerY, neighbor.size),
      getMaxEdge(neighbor.centerY, neighbor.size)
    ) &&
    areValuesClose(
      getMinEdge(chunk.centerX, chunk.size),
      getMaxEdge(neighbor.centerX, neighbor.size)
    )
  )
}

function touchesNorthEdge(
  chunk: PlanetChunkDescriptor,
  neighbor: PlanetChunkDescriptor
) {
  return (
    areRangesOverlapping(
      getMinEdge(chunk.centerX, chunk.size),
      getMaxEdge(chunk.centerX, chunk.size),
      getMinEdge(neighbor.centerX, neighbor.size),
      getMaxEdge(neighbor.centerX, neighbor.size)
    ) &&
    areValuesClose(
      getMinEdge(chunk.centerY, chunk.size),
      getMaxEdge(neighbor.centerY, neighbor.size)
    )
  )
}

function touchesSouthEdge(
  chunk: PlanetChunkDescriptor,
  neighbor: PlanetChunkDescriptor
) {
  return (
    areRangesOverlapping(
      getMinEdge(chunk.centerX, chunk.size),
      getMaxEdge(chunk.centerX, chunk.size),
      getMinEdge(neighbor.centerX, neighbor.size),
      getMaxEdge(neighbor.centerX, neighbor.size)
    ) &&
    areValuesClose(
      getMaxEdge(chunk.centerY, chunk.size),
      getMinEdge(neighbor.centerY, neighbor.size)
    )
  )
}

function getMinEdge(center: number, size: number) {
  return center - size * 0.5
}

function getMaxEdge(center: number, size: number) {
  return center + size * 0.5
}

function areRangesOverlapping(
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number
) {
  return leftMax > rightMin && rightMax > leftMin
}

function areValuesClose(left: number, right: number) {
  return Math.abs(left - right) <= 0.000001
}
