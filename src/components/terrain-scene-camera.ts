import { createInitialFlyCameraState } from '@/lib/camera/fly-camera'
import type { Vec3Like } from '@/lib/terrain/terrain-planet'

export type CameraMode = 'fly' | 'orbit'

export const INITIAL_ORBIT_CAMERA_POSITION = [640, 460, 640] as const

const INITIAL_FLY_CAMERA_STATE = createInitialFlyCameraState()
const ZERO_VECTOR = { x: 0, y: 0, z: 0 } as const

export function getModeSetup(cameraMode: CameraMode) {
  if (cameraMode === 'fly') {
    const up = normalizeVec3(INITIAL_FLY_CAMERA_STATE.position)

    return {
      cameraFocusWorld: INITIAL_FLY_CAMERA_STATE.position,
      localCameraPosition: [0, 0, 0] as const,
      localLookAt: [
        INITIAL_FLY_CAMERA_STATE.forward.x,
        INITIAL_FLY_CAMERA_STATE.forward.y,
        INITIAL_FLY_CAMERA_STATE.forward.z,
      ] as const,
      localUp: [up.x, up.y, up.z] as const,
      worldOrigin: INITIAL_FLY_CAMERA_STATE.position,
    }
  }

  return {
    cameraFocusWorld: {
      x: INITIAL_ORBIT_CAMERA_POSITION[0],
      y: INITIAL_ORBIT_CAMERA_POSITION[1],
      z: INITIAL_ORBIT_CAMERA_POSITION[2],
    },
    localCameraPosition: INITIAL_ORBIT_CAMERA_POSITION,
    localLookAt: [0, 0, 0] as const,
    localUp: [0, 1, 0] as const,
    worldOrigin: ZERO_VECTOR,
  }
}

function normalizeVec3(vector: Vec3Like) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}
