import { useThree } from '@react-three/fiber'
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import type { CubeFaceId } from '@/lib/terrain/terrain-planet'
import type { TerrainGenerationSettings } from '@/lib/terrain/terrain-settings'
import {
  buildDeadTreeChunkInstances,
  type DeadTreeSettings,
} from '@/lib/vegetation/dead-tree-generation'
import { createDeadTreeGeometry } from '@/lib/vegetation/dead-tree-geometry'
import { createDeadTreeMaterial } from '@/lib/vegetation/dead-tree-material'
import { loadDeadTreeTextureSet } from '@/lib/vegetation/dead-tree-textures'

const MODEL_UP = new Vector3(0, 1, 0)

export interface TerrainTreeChunkRuntime {
  buildOrigin: readonly [number, number, number]
  centerX: number
  centerY: number
  face: CubeFaceId
  key: string
  lodLevel: number
  size: number
}

export interface TerrainTreesProps {
  chunks: Array<TerrainTreeChunkRuntime>
  onTreeCountChange?: (treeCount: number) => void
  terrainSettings: TerrainGenerationSettings
  vegetationSettings: DeadTreeSettings
}

export const TerrainTrees = memo(function TerrainTrees({
  chunks,
  onTreeCountChange,
  terrainSettings,
  vegetationSettings,
}: TerrainTreesProps) {
  const gl = useThree((state) => state.gl)
  const [material, setMaterial] = useState<Material | null>(null)
  const geometry = useMemo(() => createDeadTreeGeometry(), [])
  const fallbackMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#4b443d',
        metalness: 0.02,
        roughness: 0.98,
      }),
    []
  )
  const visibleChunks = useMemo(
    () =>
      vegetationSettings.enabled
        ? chunks.filter((chunk) => chunk.lodLevel <= vegetationSettings.maxLodLevel)
        : [],
    [chunks, vegetationSettings.enabled, vegetationSettings.maxLodLevel]
  )
  const chunkInstances = useMemo(
    () =>
      visibleChunks
        .map((chunk) => ({
          chunk,
          instances: buildDeadTreeChunkInstances({
            buildOrigin: chunk.buildOrigin,
            chunk,
            terrainSettings,
            vegetationSettings,
          }),
        }))
        .filter(({ instances }) => instances.count > 0),
    [
      terrainSettings,
      vegetationSettings,
      visibleChunks,
    ]
  )
  const totalTreeCount = useMemo(
    () =>
      chunkInstances.reduce(
        (treeTotal, chunkInstancesEntry) =>
          treeTotal + chunkInstancesEntry.instances.count,
        0
      ),
    [chunkInstances]
  )
  const visibleMaterial = material ?? fallbackMaterial

  useEffect(() => {
    onTreeCountChange?.(totalTreeCount)
  }, [onTreeCountChange, totalTreeCount])

  useEffect(() => {
    let isMounted = true
    let mountedMaterial: Material | null = null

    loadDeadTreeTextureSet(gl as Parameters<typeof loadDeadTreeTextureSet>[0])
      .then((textures) => {
        if (!isMounted) {
          return
        }

        const nextMaterial = createDeadTreeMaterial(textures)

        mountedMaterial = nextMaterial
        setMaterial(nextMaterial)
      })
      .catch((error: unknown) => {
        console.error('Failed to load dead tree textures.', error)
      })

    return () => {
      isMounted = false
      mountedMaterial?.dispose()
    }
  }, [gl])

  useEffect(() => {
    return () => {
      geometry.dispose()
      fallbackMaterial.dispose()
    }
  }, [fallbackMaterial, geometry])

  return (
    <>
      {chunkInstances.map(({ chunk, instances }) => (
        <TerrainTreeChunk
          chunk={chunk}
          geometry={geometry}
          instances={instances}
          key={chunk.key}
          material={visibleMaterial}
        />
      ))}
    </>
  )
})

function TerrainTreeChunk({
  chunk,
  geometry,
  instances,
  material,
}: {
  chunk: TerrainTreeChunkRuntime
  geometry: BufferGeometry
  instances: ReturnType<typeof buildDeadTreeChunkInstances>
  material: Material
}) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const alignQuaternion = new Quaternion()
    const yawQuaternion = new Quaternion()
    const instanceQuaternion = new Quaternion()
    const instanceMatrix = new Matrix4()
    const instancePosition = new Vector3()
    const instanceScale = new Vector3()
    const surfaceUp = new Vector3()

    for (let index = 0; index < instances.count; index += 1) {
      instancePosition.set(
        instances.positions[index * 3],
        instances.positions[index * 3 + 1],
        instances.positions[index * 3 + 2]
      )
      surfaceUp.set(
        instances.ups[index * 3],
        instances.ups[index * 3 + 1],
        instances.ups[index * 3 + 2]
      )
      instanceScale.set(
        instances.scales[index * 3],
        instances.scales[index * 3 + 1],
        instances.scales[index * 3 + 2]
      )
      alignQuaternion.setFromUnitVectors(MODEL_UP, surfaceUp.normalize())
      yawQuaternion.setFromAxisAngle(MODEL_UP, instances.yaws[index])
      instanceQuaternion.copy(alignQuaternion).multiply(yawQuaternion)
      instanceMatrix.compose(
        instancePosition,
        instanceQuaternion,
        instanceScale
      )
      mesh.setMatrixAt(index, instanceMatrix)
    }

    mesh.count = instances.count
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])

  if (instances.count === 0) {
    return null
  }

  return (
    <instancedMesh
      args={[geometry, material, instances.count]}
      castShadow
      count={instances.count}
      frustumCulled={false}
      position={chunk.buildOrigin}
      receiveShadow
      ref={meshRef}
    />
  )
}
