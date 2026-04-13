# Character Model Guide

## File

`public/models/character.glb` — **1.5 MB** (optimized from 8.1 MB original)

## Optimizations Applied

- Textures resized from 2048x2048 to 1024x1024
- Textures converted to KTX2 (UASTC + Zstandard supercompression)
- Meshopt geometry compression (quantized i16 positions/normals)
- Unused animation clips stripped

## Model Details

- **Mesh:** `char1` — 25,525 vertices, ~30k triangles, single mesh
- **Material:** `Material_1` — baseColor + emissive texture, opaque, double-sided
- **Skeleton:** 24-bone humanoid rig named `Armature` (scale 0.01)

## Animation Clips

| Clip | Duration | Description |
|------|----------|-------------|
| `Idle` | 5s | Main idle loop |
| `Stretching` | 1s | Stretch/fidget idle variation |
| `Sprint` | 2s | Fast run cycle |
| `Walk` | 1s | Walk cycle |

## Required Loaders

The GLB uses these glTF extensions:

- `KHR_texture_basisu` — KTX2 textures (needs `KTX2Loader`)
- `EXT_meshopt_compression` — meshopt geometry compression (needs `MeshoptDecoder`)
- `KHR_materials_specular` — specular material properties (handled by GLTFLoader natively)
- `KHR_mesh_quantization` — quantized vertex attributes (handled by GLTFLoader natively)

## Loading (WebGPU / Three.js)

```typescript
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// KTX2Loader needs the Basis Universal transcoder WASM files.
// Copy from node_modules/three/examples/jsm/libs/basis/ to public/basis/
// Or use CDN for dev: 'https://unpkg.com/three/examples/jsm/libs/basis/'
const ktx2Loader = new KTX2Loader()
  .setTranscoderPath('/basis/')
  .detectSupport(renderer)

const loader = new GLTFLoader()
loader.setKTX2Loader(ktx2Loader)
loader.setMeshoptDecoder(MeshoptDecoder)

loader.load('/models/character.glb', (gltf) => {
  const model = gltf.scene
  scene.add(model)

  // Animation clips: ['Stretching', 'Idle', 'Sprint', 'Walk']
  console.log(gltf.animations.map(clip => clip.name))
})
```

## Animation Playback

```typescript
const mixer = new THREE.AnimationMixer(model)
const clips = gltf.animations

function getAction(name: string) {
  const clip = THREE.AnimationClip.findByName(clips, name)
  return mixer.clipAction(clip)
}

// Play idle on load
const idleAction = getAction('Idle')
idleAction.play()

// Crossfade between animations
let currentAction = idleAction

function switchTo(name: string, fadeDuration = 0.3) {
  const nextAction = getAction(name)
  if (nextAction === currentAction) return

  nextAction.reset()
  nextAction.fadeIn(fadeDuration)
  currentAction.fadeOut(fadeDuration)
  nextAction.play()

  currentAction = nextAction
}

// Examples:
// switchTo('Walk')
// switchTo('Sprint')
// switchTo('Idle')

// Update in render loop:
// mixer.update(delta)
```
