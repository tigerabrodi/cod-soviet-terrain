import {
  CylinderGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const TREE_AXIS = new Vector3(0, 1, 0)

export function createDeadTreeGeometry() {
  const geometries: Array<BufferGeometry> = DEAD_TREE_SEGMENTS.map(
    ({ direction, length, origin, radiusBottom, radiusTop }) =>
      createSegmentGeometry(
        radiusTop,
        radiusBottom,
        length,
        createVector(origin),
        createVector(direction)
      )
  )
  const geometry = mergeGeometries(geometries, false)

  geometries.forEach((segmentGeometry) => {
    segmentGeometry.dispose()
  })

  if (!geometry) {
    throw new Error('Failed to merge dead tree geometries.')
  }

  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = 'DeadTreeGeometry'

  return geometry
}

const DEAD_TREE_SEGMENTS = [
  {
    direction: [0.03, 1, 0],
    length: 1.12,
    origin: [0, 0, 0],
    radiusBottom: 0.24,
    radiusTop: 0.16,
  },
  {
    direction: [0.74, 0.48, 0.08],
    length: 0.64,
    origin: [0, 0.44, 0],
    radiusBottom: 0.095,
    radiusTop: 0.05,
  },
  {
    direction: [-0.66, 0.58, -0.18],
    length: 0.6,
    origin: [0.01, 0.6, 0],
    radiusBottom: 0.084,
    radiusTop: 0.045,
  },
  {
    direction: [0.26, 0.86, -0.46],
    length: 0.48,
    origin: [0.03, 0.8, 0.01],
    radiusBottom: 0.056,
    radiusTop: 0.03,
  },
  {
    direction: [-0.34, 0.9, 0.3],
    length: 0.38,
    origin: [-0.04, 0.88, 0.02],
    radiusBottom: 0.048,
    radiusTop: 0.026,
  },
  {
    direction: [0.04, 0.98, -0.05],
    length: 0.24,
    origin: [0, 0.97, 0],
    radiusBottom: 0.025,
    radiusTop: 0.012,
  },
  {
    direction: [0.68, 0.36, -0.24],
    length: 0.44,
    origin: [0.08, 0.53, -0.01],
    radiusBottom: 0.042,
    radiusTop: 0.02,
  },
  {
    direction: [-0.58, 0.44, 0.34],
    length: 0.41,
    origin: [-0.06, 0.5, 0.03],
    radiusBottom: 0.04,
    radiusTop: 0.018,
  },
  {
    direction: [0.18, 0.74, 0.52],
    length: 0.32,
    origin: [0.02, 0.86, 0.02],
    radiusBottom: 0.03,
    radiusTop: 0.014,
  },
  {
    direction: [-0.22, 0.82, -0.52],
    length: 0.3,
    origin: [-0.01, 0.92, -0.02],
    radiusBottom: 0.028,
    radiusTop: 0.012,
  },
  {
    direction: [0.86, 0.18, 0.16],
    length: 0.26,
    origin: [0.19, 0.66, 0.02],
    radiusBottom: 0.024,
    radiusTop: 0.01,
  },
  {
    direction: [-0.82, 0.2, -0.08],
    length: 0.24,
    origin: [-0.17, 0.71, -0.03],
    radiusBottom: 0.022,
    radiusTop: 0.01,
  },
] as const

function createSegmentGeometry(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  origin: Vector3,
  direction: Vector3
) {
  const geometry = new CylinderGeometry(
    radiusTop,
    radiusBottom,
    length,
    7,
    1,
    false
  )
  const directionUnit = direction.clone().normalize()
  const midpoint = origin.clone().addScaledVector(directionUnit, length * 0.5)
  const quaternion = new Quaternion().setFromUnitVectors(TREE_AXIS, directionUnit)
  const matrix = new Matrix4().compose(
    midpoint,
    quaternion,
    new Vector3(1, 1, 1)
  )

  geometry.applyMatrix4(matrix)

  return geometry
}

function createVector(value: readonly [number, number, number]) {
  return new Vector3(value[0], value[1], value[2])
}
