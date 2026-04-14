import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Group, type Mesh } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BackSide } from 'three/webgpu'
import type { Vec3Like } from '@/lib/terrain/terrain-planet'
import { createSkyDomeGeometry } from '@/lib/sky/sky-dome'
import { getDistance } from '@/components/terrain-scene-utils'

export function FloatingOriginTracker({
  cameraFocusWorld,
  focusRefreshDistance,
  onCameraFocusWorldChange,
}: {
  cameraFocusWorld: Vec3Like
  focusRefreshDistance: number
  onCameraFocusWorldChange: (cameraFocusWorld: Vec3Like) => void
}) {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const nextWorldCameraPosition = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }

    if (
      getDistance(nextWorldCameraPosition, cameraFocusWorld) >=
      focusRefreshDistance
    ) {
      onCameraFocusWorldChange(nextWorldCameraPosition)
    }
  })

  return null
}

export function WorldOriginAnchor({
  children,
  originRef,
}: {
  children: ReactNode
  originRef: MutableRefObject<Vec3Like>
}) {
  const groupRef = useRef<Group>(null)

  useFrame(() => {
    const origin = originRef.current

    groupRef.current?.position.set(-origin.x, -origin.y, -origin.z)
  })

  return <group ref={groupRef}>{children}</group>
}

export function SkyDome({
  geometry,
}: {
  geometry: ReturnType<typeof createSkyDomeGeometry>
}) {
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<Mesh>(null)

  useFrame(() => {
    meshRef.current?.position.copy(camera.position)
  })

  return (
    <mesh frustumCulled={false} geometry={geometry} ref={meshRef}>
      <meshBasicMaterial
        fog={false}
        side={BackSide}
        toneMapped={false}
        vertexColors
      />
    </mesh>
  )
}

export function OrbitCamera() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const controls = useMemo(() => {
    const nextControls = new OrbitControls(camera, gl.domElement)
    nextControls.enableDamping = true
    nextControls.dampingFactor = 0.06
    nextControls.enablePan = false
    nextControls.maxDistance = 1600
    nextControls.maxPolarAngle = Math.PI * 0.94
    nextControls.minDistance = 220
    nextControls.minPolarAngle = Math.PI * 0.06
    nextControls.target.set(0, 0, 0)

    return nextControls
  }, [camera, gl.domElement])

  useEffect(() => {
    controls.target.set(0, 0, 0)

    return () => {
      controls.dispose()
    }
  }, [controls])

  useFrame(() => {
    controls.update()
  })

  return null
}
