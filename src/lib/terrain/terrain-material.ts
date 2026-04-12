/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
// @ts-nocheck
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  Fn,
  attribute,
  float,
  mix,
  normalLocal,
  positionLocal,
  smoothstep,
  texture,
  transformNormalToView,
  vec3,
  vec4,
} from 'three/tsl'
import type { TerrainTextureSet } from './terrain-textures'

const TILE_SCALE = float(0.085)
const DETAIL_NORMAL_STRENGTH = float(0.6)
const GEOMETRY_NORMAL_STRENGTH = float(0.4)

const getProjectionWeights = Fn(([surfaceNormal = normalLocal]) => {
  const axisWeights = surfaceNormal.abs().add(0.0001).toVar()
  const weightTotal = axisWeights.x
    .add(axisWeights.y)
    .add(axisWeights.z)
    .toVar()

  axisWeights.assign(axisWeights.div(weightTotal))

  return axisWeights
})

const sampleTriplanarArray = Fn(
  ([
    textureNode,
    layerIndex,
    scaleNode = TILE_SCALE,
    positionNode = positionLocal,
    surfaceNormal = normalLocal,
  ]) => {
    const projectionWeights = getProjectionWeights(surfaceNormal)

    const sampleX = textureNode
      .sample(positionNode.yz.mul(scaleNode))
      .depth(layerIndex)
    const sampleY = textureNode
      .sample(positionNode.zx.mul(scaleNode))
      .depth(layerIndex)
    const sampleZ = textureNode
      .sample(positionNode.xy.mul(scaleNode))
      .depth(layerIndex)

    return sampleX
      .mul(projectionWeights.x)
      .add(sampleY.mul(projectionWeights.y))
      .add(sampleZ.mul(projectionWeights.z))
  }
)

const sampleTriplanarNormal = Fn(
  ([
    textureNode,
    layerIndex,
    scaleNode = TILE_SCALE,
    positionNode = positionLocal,
    surfaceNormal = normalLocal,
  ]) => {
    const projectionWeights = getProjectionWeights(surfaceNormal)

    const sampleX = textureNode
      .sample(positionNode.yz.mul(scaleNode))
      .depth(layerIndex)
      .xyz.mul(2)
      .sub(1)
    const sampleY = textureNode
      .sample(positionNode.zx.mul(scaleNode))
      .depth(layerIndex)
      .xyz.mul(2)
      .sub(1)
    const sampleZ = textureNode
      .sample(positionNode.xy.mul(scaleNode))
      .depth(layerIndex)
      .xyz.mul(2)
      .sub(1)

    const mappedX = vec3(sampleX.z, sampleX.y, sampleX.x)
    const mappedY = vec3(sampleY.y, sampleY.z, sampleY.x)
    const mappedZ = vec3(sampleZ.x, sampleZ.y, sampleZ.z)

    return mappedX
      .mul(projectionWeights.x)
      .add(mappedY.mul(projectionWeights.y))
      .add(mappedZ.mul(projectionWeights.z))
      .normalize()
  }
)

const sharpenSplatWeights = Fn(
  ([baseWeights, height0, height1, height2, height3]) => {
    const adjustedWeights = vec4(
      baseWeights.x.mul(height0.r.mul(0.45).add(0.8)),
      baseWeights.y.mul(height1.r.mul(0.45).add(0.8)),
      baseWeights.z.mul(height2.r.mul(0.45).add(0.8)),
      baseWeights.w.mul(height3.r.mul(0.45).add(0.8))
    )
      .add(0.0001)
      .toVar()

    const totalWeight = adjustedWeights.x
      .add(adjustedWeights.y)
      .add(adjustedWeights.z)
      .add(adjustedWeights.w)
      .toVar()

    adjustedWeights.assign(adjustedWeights.div(totalWeight))

    return adjustedWeights
  }
)

export function createTerrainMaterial(textures: TerrainTextureSet) {
  const splatWeights = attribute('splatWeights', 'vec4')

  const baseColorTexture = texture(textures.basecolor)
  const normalTexture = texture(textures.normal)
  const roughnessTexture = texture(textures.roughness)
  const metalnessTexture = texture(textures.metalness)
  const heightTexture = texture(textures.height)

  const layer0 = float(0)
  const layer1 = float(1)
  const layer2 = float(2)
  const layer3 = float(3)

  const height0 = sampleTriplanarArray(
    heightTexture,
    layer0,
    TILE_SCALE.mul(0.9)
  )
  const height1 = sampleTriplanarArray(
    heightTexture,
    layer1,
    TILE_SCALE.mul(0.9)
  )
  const height2 = sampleTriplanarArray(
    heightTexture,
    layer2,
    TILE_SCALE.mul(0.9)
  )
  const height3 = sampleTriplanarArray(
    heightTexture,
    layer3,
    TILE_SCALE.mul(0.9)
  )

  const blendedWeights = sharpenSplatWeights(
    splatWeights,
    height0,
    height1,
    height2,
    height3
  )

  const color0 = sampleTriplanarArray(baseColorTexture, layer0).rgb
  const color1 = sampleTriplanarArray(baseColorTexture, layer1).rgb
  const color2 = sampleTriplanarArray(baseColorTexture, layer2).rgb
  const color3 = sampleTriplanarArray(baseColorTexture, layer3).rgb

  const rough0 = sampleTriplanarArray(roughnessTexture, layer0).r
  const rough1 = sampleTriplanarArray(roughnessTexture, layer1).r
  const rough2 = sampleTriplanarArray(roughnessTexture, layer2).r
  const rough3 = sampleTriplanarArray(roughnessTexture, layer3).r

  const metal0 = sampleTriplanarArray(metalnessTexture, layer0).r
  const metal1 = sampleTriplanarArray(metalnessTexture, layer1).r
  const metal2 = sampleTriplanarArray(metalnessTexture, layer2).r
  const metal3 = sampleTriplanarArray(metalnessTexture, layer3).r

  const normal0 = sampleTriplanarNormal(
    normalTexture,
    layer0,
    TILE_SCALE.mul(1.15)
  )
  const normal1 = sampleTriplanarNormal(
    normalTexture,
    layer1,
    TILE_SCALE.mul(1.15)
  )
  const normal2 = sampleTriplanarNormal(
    normalTexture,
    layer2,
    TILE_SCALE.mul(1.15)
  )
  const normal3 = sampleTriplanarNormal(
    normalTexture,
    layer3,
    TILE_SCALE.mul(1.15)
  )

  const blendedColor = color0
    .mul(blendedWeights.x)
    .add(color1.mul(blendedWeights.y))
    .add(color2.mul(blendedWeights.z))
    .add(color3.mul(blendedWeights.w))

  const blendedRoughness = rough0
    .mul(blendedWeights.x)
    .add(rough1.mul(blendedWeights.y))
    .add(rough2.mul(blendedWeights.z))
    .add(rough3.mul(blendedWeights.w))
    .clamp(0.12, 0.98)

  const blendedMetalness = metal0
    .mul(blendedWeights.x)
    .add(metal1.mul(blendedWeights.y))
    .add(metal2.mul(blendedWeights.z))
    .add(metal3.mul(blendedWeights.w))
    .clamp(0, 0.28)

  const layeredNormal = normal0
    .mul(blendedWeights.x)
    .add(normal1.mul(blendedWeights.y))
    .add(normal2.mul(blendedWeights.z))
    .add(normal3.mul(blendedWeights.w))
    .normalize()

  const finalNormal = normalLocal
    .mul(GEOMETRY_NORMAL_STRENGTH)
    .add(layeredNormal.mul(DETAIL_NORMAL_STRENGTH))
    .normalize()

  const frostAmount = smoothstep(float(16), float(30), positionLocal.y)
  const finalColor = mix(
    blendedColor,
    blendedColor.mul(vec3(1.04, 1.05, 1.08)),
    frostAmount
  )

  const material = new MeshStandardNodeMaterial()
  material.name = 'TerrainChunkMaterial'
  material.colorNode = finalColor
  material.roughnessNode = blendedRoughness
  material.metalnessNode = blendedMetalness
  material.normalNode = transformNormalToView(finalNormal)

  return material
}
