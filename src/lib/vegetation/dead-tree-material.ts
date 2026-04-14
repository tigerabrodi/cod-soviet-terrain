import { MeshStandardMaterial, Vector2 } from 'three'
import type { DeadTreeTextureSet } from './dead-tree-textures'

export function createDeadTreeMaterial(textures: DeadTreeTextureSet) {
  const material = new MeshStandardMaterial({
    bumpMap: textures.height,
    bumpScale: 0.085,
    color: '#2a1b13',
    map: textures.basecolor,
    metalness: 0.03,
    metalnessMap: textures.metalness,
    normalMap: textures.normal,
    normalScale: new Vector2(1.25, 1.25),
    roughness: 0.9,
    roughnessMap: textures.roughness,
  })

  material.envMapIntensity = 0.5
  material.name = 'DeadTreeMaterial'

  return material
}
