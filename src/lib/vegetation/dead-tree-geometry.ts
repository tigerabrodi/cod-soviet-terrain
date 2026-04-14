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
  const geometries: Array<BufferGeometry> = [
    createSegmentGeometry(
      0.16,
      0.24,
      1.12,
      new Vector3(0, 0, 0),
      new Vector3(0.03, 1, 0)
    ),
    createSegmentGeometry(
      0.05,
      0.095,
      0.64,
      new Vector3(0, 0.44, 0),
      new Vector3(0.74, 0.48, 0.08)
    ),
    createSegmentGeometry(
      0.045,
      0.084,
      0.6,
      new Vector3(0.01, 0.6, 0),
      new Vector3(-0.66, 0.58, -0.18)
    ),
    createSegmentGeometry(
      0.03,
      0.056,
      0.48,
      new Vector3(0.03, 0.8, 0.01),
      new Vector3(0.26, 0.86, -0.46)
    ),
    createSegmentGeometry(
      0.026,
      0.048,
      0.38,
      new Vector3(-0.04, 0.88, 0.02),
      new Vector3(-0.34, 0.9, 0.3)
    ),
    createSegmentGeometry(
      0.012,
      0.025,
      0.24,
      new Vector3(0, 0.97, 0),
      new Vector3(0.04, 0.98, -0.05)
    ),
  ]
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
