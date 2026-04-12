import type { CompressedTexture } from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import {
  ClampToEdgeWrapping,
  CompressedArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
} from 'three/webgpu'

export const TERRAIN_MATERIAL_ORDER = [
  'scorched-ground',
  'frozen-muddy-earth',
  'frost-snow',
  'rocky-rubble',
] as const

export const TERRAIN_MAP_TYPES = [
  'basecolor',
  'normal',
  'roughness',
  'metalness',
  'height',
] as const

export type TerrainMaterialName = (typeof TERRAIN_MATERIAL_ORDER)[number]
export type TerrainMapType = (typeof TERRAIN_MAP_TYPES)[number]

export interface TerrainTextureSet {
  basecolor: CompressedArrayTexture
  height: CompressedArrayTexture
  metalness: CompressedArrayTexture
  normal: CompressedArrayTexture
  roughness: CompressedArrayTexture
}

type DetectSupportRenderer = Parameters<KTX2Loader['detectSupport']>[0]

const textureCache = new WeakMap<object, Promise<TerrainTextureSet>>()

export function loadTerrainTextureSet(renderer: DetectSupportRenderer) {
  const cached = textureCache.get(renderer as object)

  if (cached) {
    return cached
  }

  const promise = createTerrainTextureSet(renderer).catch((error: unknown) => {
    textureCache.delete(renderer as object)
    throw error
  })

  textureCache.set(renderer as object, promise)

  return promise
}

async function createTerrainTextureSet(renderer: DetectSupportRenderer) {
  const loader = new KTX2Loader()
  loader.setTranscoderPath('/basis/')
  loader.detectSupport(renderer)

  const loaded = await Promise.all(
    TERRAIN_MAP_TYPES.map(async (mapType) => {
      const textures = await Promise.all(
        TERRAIN_MATERIAL_ORDER.map((materialName) =>
          loader.loadAsync(`/textures/${materialName}/${mapType}.ktx2`)
        )
      )

      return [mapType, packCompressedArrayTexture(mapType, textures)] as const
    })
  )

  loader.dispose()

  const textureEntries = Object.fromEntries(loaded)

  return {
    basecolor: textureEntries.basecolor,
    height: textureEntries.height,
    metalness: textureEntries.metalness,
    normal: textureEntries.normal,
    roughness: textureEntries.roughness,
  }
}

function packCompressedArrayTexture(
  mapType: TerrainMapType,
  textures: Array<CompressedTexture>
) {
  if (textures.length === 0) {
    throw new Error(`No textures supplied for ${mapType}.`)
  }

  const [referenceTexture] = textures
  const mipLevelCount = referenceTexture.mipmaps.length

  for (const texture of textures) {
    if (texture.mipmaps.length !== mipLevelCount) {
      throw new Error(`Mipmap count mismatch while packing ${mapType}.`)
    }

    if (
      texture.image.width !== referenceTexture.image.width ||
      texture.image.height !== referenceTexture.image.height
    ) {
      throw new Error(`Texture size mismatch while packing ${mapType}.`)
    }

    if (
      texture.format !== referenceTexture.format ||
      texture.type !== referenceTexture.type
    ) {
      throw new Error(`Texture format mismatch while packing ${mapType}.`)
    }
  }

  const mipmaps = referenceTexture.mipmaps.map((referenceMip, levelIndex) => {
    const packedByteLength = textures.reduce(
      (sum, texture) => sum + texture.mipmaps[levelIndex].data.byteLength,
      0
    )
    const packedData = new Uint8Array(packedByteLength)

    let offset = 0

    for (const texture of textures) {
      const levelData = texture.mipmaps[levelIndex].data
      packedData.set(levelData, offset)
      offset += levelData.byteLength
    }

    return {
      data: packedData,
      height: referenceMip.height,
      width: referenceMip.width,
    }
  })

  const textureArray = new CompressedArrayTexture(
    mipmaps,
    referenceTexture.image.width,
    referenceTexture.image.height,
    textures.length,
    referenceTexture.format,
    referenceTexture.type
  )

  textureArray.name = `terrain-${mapType}-array`
  textureArray.colorSpace = referenceTexture.colorSpace
  textureArray.minFilter =
    mipmaps.length > 1 ? LinearMipmapLinearFilter : LinearFilter
  textureArray.magFilter = LinearFilter
  textureArray.wrapS = RepeatWrapping
  textureArray.wrapT = RepeatWrapping
  textureArray.wrapR = ClampToEdgeWrapping
  textureArray.generateMipmaps = false
  textureArray.needsUpdate = true

  return textureArray
}
