import {
  applyFlyLook,
  createInitialFlyCameraState,
  stepFlyCamera,
  type FlyCameraState,
} from '@/lib/camera/fly-camera'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type MutableRefObject } from 'react'
import { Camera } from 'three'
import type { Vec3Like } from '@/lib/terrain/terrain-planet'

export interface FlyCameraControllerProps {
  focusRefreshDistance: number
  initialState?: FlyCameraState
  onCameraFocusWorldChange: (cameraFocusWorld: Vec3Like) => void
  onWorldOriginSnapshotChange: (worldOrigin: Vec3Like) => void
  worldOriginRef: MutableRefObject<Vec3Like>
}

export function FlyCameraController({
  focusRefreshDistance,
  initialState = createInitialFlyCameraState(),
  onCameraFocusWorldChange,
  onWorldOriginSnapshotChange,
  worldOriginRef,
}: FlyCameraControllerProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const flyStateRef = useRef<FlyCameraState>(initialState)
  const focusWorldRef = useRef<Vec3Like>(initialState.position)
  const keyStateRef = useRef({
    KeyA: false,
    KeyD: false,
    KeyE: false,
    KeyQ: false,
    KeyS: false,
    KeyW: false,
    ShiftLeft: false,
    ShiftRight: false,
  })
  const pointerLockedRef = useRef(false)

  useEffect(() => {
    flyStateRef.current = initialState
    focusWorldRef.current = initialState.position
    worldOriginRef.current = initialState.position
    onWorldOriginSnapshotChange(initialState.position)
    onCameraFocusWorldChange(initialState.position)
    syncCameraFromFlyState(camera, initialState)
  }, [
    camera,
    initialState,
    onCameraFocusWorldChange,
    onWorldOriginSnapshotChange,
    worldOriginRef,
  ])

  useEffect(() => {
    const element = gl.domElement

    const handlePointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === element
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!pointerLockedRef.current) {
        return
      }

      flyStateRef.current = applyFlyLook(flyStateRef.current, {
        deltaX: event.movementX,
        deltaY: event.movementY,
      })
      syncCameraFromFlyState(camera, flyStateRef.current)
    }

    const handlePointerDown = () => {
      if (document.pointerLockElement === element) {
        return
      }

      try {
        const requestResult = element.requestPointerLock()

        if (
          typeof requestResult === 'object' &&
          requestResult !== null &&
          'catch' in requestResult &&
          typeof requestResult.catch === 'function'
        ) {
          requestResult.catch((error: unknown) => {
            console.error('Failed to acquire pointer lock.', error)
          })
        }
      } catch (error) {
        console.error('Failed to acquire pointer lock.', error)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if (event.code in keyStateRef.current) {
        keyStateRef.current[event.code as keyof typeof keyStateRef.current] =
          true
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code in keyStateRef.current) {
        keyStateRef.current[event.code as keyof typeof keyStateRef.current] =
          false
      }
    }

    document.addEventListener('pointerlockchange', handlePointerLockChange)
    document.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    element.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      element.removeEventListener('pointerdown', handlePointerDown)

      if (document.pointerLockElement === element) {
        document.exitPointerLock()
      }
    }
  }, [camera, gl.domElement])

  useFrame((_, deltaSeconds) => {
    const input = readFlyInput(keyStateRef.current)

    flyStateRef.current = stepFlyCamera(
      flyStateRef.current,
      input,
      deltaSeconds
    )
    worldOriginRef.current = flyStateRef.current.position
    syncCameraFromFlyState(camera, flyStateRef.current)

    if (
      getDistance(flyStateRef.current.position, focusWorldRef.current) >=
      focusRefreshDistance
    ) {
      focusWorldRef.current = flyStateRef.current.position
      onCameraFocusWorldChange(flyStateRef.current.position)
      onWorldOriginSnapshotChange(flyStateRef.current.position)
    }
  })

  return null
}

function syncCameraFromFlyState(camera: Camera, flyState: FlyCameraState) {
  const up = normalizeVec3(flyState.position)

  camera.position.set(0, 0, 0)
  camera.up.set(up.x, up.y, up.z)
  camera.lookAt(flyState.forward.x, flyState.forward.y, flyState.forward.z)
}

function readFlyInput(keyState: {
  KeyA: boolean
  KeyD: boolean
  KeyE: boolean
  KeyQ: boolean
  KeyS: boolean
  KeyW: boolean
  ShiftLeft: boolean
  ShiftRight: boolean
}) {
  return {
    boost: keyState.ShiftLeft || keyState.ShiftRight,
    forward: (keyState.KeyW ? 1 : 0) - (keyState.KeyS ? 1 : 0),
    lift: (keyState.KeyE ? 1 : 0) - (keyState.KeyQ ? 1 : 0),
    strafe: (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0),
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function normalizeVec3(vector: Vec3Like) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function getDistance(left: Vec3Like, right: Vec3Like) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
}
