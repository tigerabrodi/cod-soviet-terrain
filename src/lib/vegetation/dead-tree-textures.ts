import type { CompressedTexture } from 'three'
import {
  RepeatWrapping,
  SRGBColorSpace,
} from 'three/webgpu'
import { getSharedKTX2Loader } from '@/lib/shared/ktx2-loader'

export interface DeadTreeTextureSet {
  basecolor: CompressedTexture
  height: CompressedTexture
  metalness: CompressedTexture
  normal: CompressedTexture
  roughness: CompressedTexture
}

type DetectSupportRenderer = Parameters<typeof getSharedKTX2Loader>[0]

const textureCache = new WeakMap<object, Promise<DeadTreeTextureSet>>()

export function loadDeadTreeTextureSet(renderer: DetectSupportRenderer) {
  const cached = textureCache.get(renderer as object)

  if (cached) {
    return cached
  }

  const promise = createDeadTreeTextureSet(renderer).catch((error: unknown) => {
    textureCache.delete(renderer as object)
    throw error
  })

  textureCache.set(renderer as object, promise)

  return promise
}

async function createDeadTreeTextureSet(renderer: DetectSupportRenderer) {
  const loader = getSharedKTX2Loader(renderer)
  const [basecolor, normal, roughness, metalness, height] = await Promise.all([
    loader.loadAsync('/textures/bark-wood/basecolor.ktx2'),
    loader.loadAsync('/textures/bark-wood/normal.ktx2'),
    loader.loadAsync('/textures/bark-wood/roughness.ktx2'),
    loader.loadAsync('/textures/bark-wood/metalness.ktx2'),
    loader.loadAsync('/textures/bark-wood/height.ktx2'),
  ])

  basecolor.colorSpace = SRGBColorSpace

  for (const texture of [basecolor, normal, roughness, metalness, height]) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(1.25, 6.5)
  }

  return {
    basecolor,
    height,
    metalness,
    normal,
    roughness,
  }
}
