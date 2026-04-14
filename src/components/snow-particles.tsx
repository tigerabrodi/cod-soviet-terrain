/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// @ts-nocheck
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { InstancedBufferAttribute, Quaternion, Sprite, Vector3 } from 'three'
import { PointsNodeMaterial } from 'three/webgpu'
import {
  cos,
  float,
  fract,
  instancedBufferAttribute,
  mix,
  sin,
  smoothstep,
  texture,
  time,
  vec3,
} from 'three/tsl'
import {
  SNOW_PARTICLE_COUNT,
  buildSnowParticleAttributes,
  loadSnowflakeTexture,
  SNOW_VOLUME_HEIGHT,
} from '@/lib/weather/snow-particles'
import type { SnowParticleBuffers } from '@/lib/weather/snow-particles'

const TAU = float(Math.PI * 2)
const WORLD_UP = new Vector3(0, 1, 0)
const SNOW_UP = new Vector3()
const SNOW_QUATERNION = new Quaternion()

export interface SnowParticleDebugSettings {
  density: number
  driftStrength: number
  enabled: boolean
  fallSpeed: number
}

export function SnowParticles({
  density,
  driftStrength,
  enabled,
  fallSpeed,
}: SnowParticleDebugSettings) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const particleCount = useMemo(
    () =>
      enabled ? Math.max(0, Math.round(SNOW_PARTICLE_COUNT * density)) : 0,
    [density, enabled]
  )
  const particleBuffers = useMemo(
    () => buildSnowParticleAttributes(particleCount),
    [particleCount]
  )
  const [snowSprite, setSnowSprite] = useState<Sprite | null>(null)
  const visibleSnowSprite = enabled && particleCount > 0 ? snowSprite : null

  useEffect(() => {
    if (!enabled || particleCount <= 0) {
      return
    }

    let isMounted = true
    let mountedSprite: Sprite | null = null

    loadSnowflakeTexture(gl as Parameters<typeof loadSnowflakeTexture>[0])
      .then((snowflakeTexture) => {
        if (!isMounted) {
          return
        }

        const sprite = createSnowSprite(particleBuffers, snowflakeTexture, {
          driftStrength,
          fallSpeed,
        })

        mountedSprite = sprite
        setSnowSprite(sprite)
      })
      .catch((error: unknown) => {
        console.error('Failed to load snowflake texture.', error)
      })

    return () => {
      isMounted = false
      mountedSprite?.material.dispose()
    }
  }, [driftStrength, enabled, fallSpeed, gl, particleBuffers, particleCount])

  useFrame(() => {
    if (!visibleSnowSprite) {
      return
    }

    visibleSnowSprite.position.copy(camera.position)
    SNOW_UP.copy(camera.up).normalize()
    SNOW_QUATERNION.setFromUnitVectors(WORLD_UP, SNOW_UP)
    visibleSnowSprite.quaternion.copy(SNOW_QUATERNION)
  })

  return visibleSnowSprite ? <primitive object={visibleSnowSprite} /> : null
}

function createSnowSprite(
  particleBuffers: SnowParticleBuffers,
  snowflakeTexture: Awaited<ReturnType<typeof loadSnowflakeTexture>>,
  settings: Pick<SnowParticleDebugSettings, 'driftStrength' | 'fallSpeed'>
) {
  const anchorAttribute = new InstancedBufferAttribute(
    particleBuffers.anchorData,
    3
  )
  const configAttribute = new InstancedBufferAttribute(
    particleBuffers.configData,
    4
  )
  const rotationAttribute = new InstancedBufferAttribute(
    particleBuffers.rotationData,
    1
  )
  const anchorNode = instancedBufferAttribute(anchorAttribute, 'vec3')
  const configNode = instancedBufferAttribute(configAttribute, 'vec4')
  const rotationNode = instancedBufferAttribute(rotationAttribute, 'float')
  const driftScale = float(settings.driftStrength)
  const fallSpeedScale = float(settings.fallSpeed)
  const cycle = fract(
    time.mul(configNode.x).mul(fallSpeedScale).add(configNode.w)
  )
  const driftX = sin(time.mul(configNode.y).add(configNode.w.mul(TAU))).mul(
    configNode.z.mul(driftScale)
  )
  const driftZ = cos(
    time.mul(configNode.y.mul(0.82)).add(configNode.w.mul(TAU.mul(0.68)))
  ).mul(configNode.z.mul(driftScale).mul(0.86))
  const fallOffset = cycle.mul(float(SNOW_VOLUME_HEIGHT))
  const fallFade = smoothstep(float(0.04), float(0.18), cycle).mul(
    float(1).sub(smoothstep(float(0.78), float(1), cycle))
  )
  const sizeNode = mix(
    float(0.38),
    float(0.9),
    fract(rotationNode.mul(1.73).add(configNode.w))
  )
  const tint = mix(
    vec3(0.78, 0.82, 0.88),
    vec3(0.98, 0.995, 1.02),
    fract(rotationNode.mul(1.11))
  )
  const snowTextureNode = texture(snowflakeTexture)
  const material = new PointsNodeMaterial()
  const sprite = new Sprite(material)

  material.colorNode = tint.mul(float(1.12))
  material.opacityNode = snowTextureNode.a.mul(fallFade)
  material.positionNode = vec3(
    anchorNode.x.add(driftX),
    anchorNode.y.sub(fallOffset),
    anchorNode.z.add(driftZ)
  )
  material.rotationNode = rotationNode.mul(TAU).add(time.mul(0.2))
  material.sizeNode = sizeNode
  material.alphaTest = 0.16
  material.depthWrite = false
  material.fog = true
  material.map = snowflakeTexture
  material.name = 'SnowParticlesMaterial'
  material.sizeAttenuation = true
  material.transparent = true

  sprite.count = particleBuffers.count
  sprite.frustumCulled = false
  sprite.name = 'SnowParticles'
  sprite.renderOrder = 12

  return sprite
}
