import { samplePlanetTerrainHeight } from '@/lib/terrain/terrain-chunk'
import { PLANET_RADIUS, type Vec3Like } from '@/lib/terrain/terrain-planet'

export interface FlyCameraState {
  forward: Vec3Like
  position: Vec3Like
  speed: number
  velocity: Vec3Like
}

export interface FlyControlInput {
  boost: boolean
  forward: number
  lift: number
  strafe: number
}

export interface FlyLookInput {
  deltaX: number
  deltaY: number
}

const DEFAULT_FLY_CLEARANCE = 12
const DEFAULT_LOOK_SENSITIVITY = 0.0024
const DEFAULT_MAX_PITCH_DOT = 0.965
const DEFAULT_CRUISE_SPEED = 76
const DEFAULT_BOOST_SPEED = 148
const DEFAULT_ACCELERATION = 9
const DEFAULT_DECELERATION = 11
const DEFAULT_SPAWN_CLEARANCE = 18

export function createInitialFlyCameraState(): FlyCameraState {
  const spawnDirection = normalize({
    x: 0.28,
    y: 0.34,
    z: 0.9,
  })
  const spawnHeight = samplePlanetTerrainHeight(
    spawnDirection.x * PLANET_RADIUS,
    spawnDirection.y * PLANET_RADIUS,
    spawnDirection.z * PLANET_RADIUS
  )
  const spawnPosition = scaleVec3(
    spawnDirection,
    PLANET_RADIUS + spawnHeight + DEFAULT_SPAWN_CLEARANCE
  )
  const surfaceRight = normalize(
    crossVec3({ x: 0, y: 1, z: 0 }, spawnDirection)
  )
  const tangentForward = normalize(crossVec3(spawnDirection, surfaceRight))

  return {
    forward: normalize(
      addVec3(scaleVec3(tangentForward, 0.96), scaleVec3(spawnDirection, -0.28))
    ),
    position: spawnPosition,
    speed: 0,
    velocity: { x: 0, y: 0, z: 0 },
  }
}

export function applyFlyLook(
  state: FlyCameraState,
  lookInput: FlyLookInput
): FlyCameraState {
  const up = normalize(state.position)
  const yawedForward = rotateAroundAxis(
    state.forward,
    up,
    -lookInput.deltaX * DEFAULT_LOOK_SENSITIVITY
  )
  const yawedRight = normalize(
    crossVec3(up, projectOntoPlane(yawedForward, up, makeStableTangent(up)))
  )
  const pitchedForward = rotateAroundAxis(
    yawedForward,
    yawedRight,
    lookInput.deltaY * DEFAULT_LOOK_SENSITIVITY
  )

  return {
    ...state,
    forward: clampPitchAgainstUp(pitchedForward, up),
  }
}

export function stepFlyCamera(
  state: FlyCameraState,
  input: FlyControlInput,
  deltaSeconds: number
): FlyCameraState {
  const safeDeltaSeconds = Math.min(Math.max(deltaSeconds, 1 / 240), 1 / 12)
  const up = normalize(state.position)
  const tangentialForward = projectOntoPlane(
    state.forward,
    up,
    makeStableTangent(up)
  )
  const right = normalize(crossVec3(tangentialForward, up))
  const movementDirection = normalizeOrZero(
    addVec3(
      addVec3(
        scaleVec3(tangentialForward, input.forward),
        scaleVec3(right, input.strafe)
      ),
      scaleVec3(up, input.lift)
    )
  )
  const targetSpeed = input.boost ? DEFAULT_BOOST_SPEED : DEFAULT_CRUISE_SPEED
  const targetVelocity = scaleVec3(
    targetDirectionOrZero(movementDirection),
    targetSpeed
  )
  const blend =
    1 -
    Math.exp(
      -(isZeroVec3(movementDirection)
        ? DEFAULT_DECELERATION
        : DEFAULT_ACCELERATION) * safeDeltaSeconds
    )
  const velocity = lerpVec3(state.velocity, targetVelocity, blend)
  let position = addVec3(state.position, scaleVec3(velocity, safeDeltaSeconds))
  const liftedPosition = keepPointAboveTerrain(position, DEFAULT_FLY_CLEARANCE)
  const radialShift = subtractVec3(liftedPosition, position)
  position = liftedPosition

  const correctedVelocity = isZeroVec3(radialShift)
    ? velocity
    : projectOntoPlane(velocity, normalize(position), { x: 0, y: 0, z: 0 })
  const reorientedForward = reorientForwardForUp(
    state.forward,
    normalize(position)
  )

  return {
    forward: reorientedForward,
    position,
    speed: lengthVec3(correctedVelocity),
    velocity: correctedVelocity,
  }
}

function keepPointAboveTerrain(point: Vec3Like, clearance: number) {
  const radius = lengthVec3(point) || 1
  const up = scaleVec3(point, 1 / radius)
  const terrainRadius =
    PLANET_RADIUS +
    samplePlanetTerrainHeight(
      up.x * PLANET_RADIUS,
      up.y * PLANET_RADIUS,
      up.z * PLANET_RADIUS
    ) +
    clearance

  return radius >= terrainRadius ? point : scaleVec3(up, terrainRadius)
}

function clampPitchAgainstUp(forward: Vec3Like, up: Vec3Like) {
  const forwardLength = lengthVec3(forward) || 1
  const normalizedForward = scaleVec3(forward, 1 / forwardLength)
  const forwardDotUp = clamp(dotVec3(normalizedForward, up), -1, 1)
  const clampedDot = clamp(
    forwardDotUp,
    -DEFAULT_MAX_PITCH_DOT,
    DEFAULT_MAX_PITCH_DOT
  )
  const tangent = projectOntoPlane(normalizedForward, up, makeStableTangent(up))
  const tangentScale = Math.sqrt(Math.max(0, 1 - clampedDot * clampedDot))

  return normalize(
    addVec3(scaleVec3(tangent, tangentScale), scaleVec3(up, clampedDot))
  )
}

function reorientForwardForUp(forward: Vec3Like, up: Vec3Like) {
  const clampedForward = clampPitchAgainstUp(forward, up)
  return clampPitchAgainstUp(clampedForward, up)
}

function targetDirectionOrZero(direction: Vec3Like) {
  return isZeroVec3(direction) ? { x: 0, y: 0, z: 0 } : direction
}

function rotateAroundAxis(
  vector: Vec3Like,
  axis: Vec3Like,
  angleRadians: number
) {
  const normalizedAxis = normalize(axis)
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)

  return normalize(
    addVec3(
      addVec3(
        scaleVec3(vector, cosine),
        scaleVec3(crossVec3(normalizedAxis, vector), sine)
      ),
      scaleVec3(normalizedAxis, dotVec3(normalizedAxis, vector) * (1 - cosine))
    )
  )
}

function makeStableTangent(up: Vec3Like) {
  const candidate =
    Math.abs(up.y) < 0.92 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }

  return normalize(crossVec3(candidate, up))
}

function projectOntoPlane(
  vector: Vec3Like,
  normal: Vec3Like,
  fallback: Vec3Like
) {
  const projected = subtractVec3(
    vector,
    scaleVec3(normal, dotVec3(vector, normal))
  )

  return isZeroVec3(projected) ? fallback : normalize(projected)
}

function normalize(vector: Vec3Like) {
  const length = lengthVec3(vector) || 1

  return scaleVec3(vector, 1 / length)
}

function normalizeOrZero(vector: Vec3Like) {
  const length = lengthVec3(vector)

  return length <= 1e-6 ? { x: 0, y: 0, z: 0 } : scaleVec3(vector, 1 / length)
}

function lerpVec3(left: Vec3Like, right: Vec3Like, alpha: number) {
  return {
    x: left.x + (right.x - left.x) * alpha,
    y: left.y + (right.y - left.y) * alpha,
    z: left.z + (right.z - left.z) * alpha,
  }
}

function addVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  }
}

function subtractVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  }
}

function scaleVec3(vector: Vec3Like, scalar: number) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  }
}

function crossVec3(left: Vec3Like, right: Vec3Like) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  }
}

function dotVec3(left: Vec3Like, right: Vec3Like) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}

function lengthVec3(vector: Vec3Like) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function isZeroVec3(vector: Vec3Like) {
  return (
    Math.abs(vector.x) <= 1e-6 &&
    Math.abs(vector.y) <= 1e-6 &&
    Math.abs(vector.z) <= 1e-6
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
