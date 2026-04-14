import { Camera, SphereGeometry } from 'three'
import { samplePlanetTerrainHeight } from '@/lib/terrain/terrain-chunk'
import {
  PLANET_RADIUS,
  type TerrainChunkEdgeMorph,
  type Vec3Like,
} from '@/lib/terrain/terrain-planet'

export function edgeMorphEquals(
  left: TerrainChunkEdgeMorph,
  right: TerrainChunkEdgeMorph
) {
  return (
    left.east === right.east &&
    left.north === right.north &&
    left.south === right.south &&
    left.west === right.west
  )
}

export function getChunkRequestSignature(
  resolution: number,
  edgeMorph: TerrainChunkEdgeMorph,
  terrainGenerationSignature: string
) {
  return `${resolution}:${edgeMorph.east}:${edgeMorph.north}:${edgeMorph.south}:${edgeMorph.west}:${terrainGenerationSignature}`
}

export function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}

export function toOriginTuple(
  vector: Vec3Like
): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

export function createPlanetBackdropGeometry(
  terrainSettings: {
    craterStrength: number
    detailStrength: number
    heightScale: number
    ridgeStrength: number
  }
) {
  const geometry = new SphereGeometry(PLANET_RADIUS - 8, 72, 44)
  const positions = geometry.getAttribute('position')

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    const length = Math.hypot(x, y, z) || 1
    const up = {
      x: x / length,
      y: y / length,
      z: z / length,
    }
    const height = samplePlanetTerrainHeight(
      up.x * PLANET_RADIUS,
      up.y * PLANET_RADIUS,
      up.z * PLANET_RADIUS,
      terrainSettings
    )
    const radius = PLANET_RADIUS + height - 10

    positions.setXYZ(index, up.x * radius, up.y * radius, up.z * radius)
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return geometry
}

export function applyCameraSetup(
  camera: Camera,
  setup: {
    localCameraPosition: readonly [number, number, number]
    localLookAt: readonly [number, number, number]
    localUp: readonly [number, number, number]
  }
) {
  camera.position.set(
    setup.localCameraPosition[0],
    setup.localCameraPosition[1],
    setup.localCameraPosition[2]
  )
  camera.up.set(setup.localUp[0], setup.localUp[1], setup.localUp[2])
  camera.lookAt(
    setup.localLookAt[0],
    setup.localLookAt[1],
    setup.localLookAt[2]
  )
}
