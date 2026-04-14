import { StorageBufferAttribute } from 'three/webgpu'
import {
  Fn,
  clamp,
  cos,
  float,
  instanceIndex,
  mix,
  sin,
  smoothstep,
  storage,
  uniform,
} from 'three/tsl'
import type { WebGPURenderer } from 'three/webgpu'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'

export interface SnowAccumulationSettings {
  accumulationRate: number
  meltRate: number
  visualStrength: number
  windStrength: number
}

export interface SnowAccumulationRuntimeState {
  accumulationAttribute: StorageBufferAttribute
  accumulationVersion: number
  computeNode: ComputeNode
  key: string
  lastUpdateTime: number
  settingsVersion: string
  uniforms: {
    accumulationRate: ReturnType<typeof uniform>
    deltaTime: ReturnType<typeof uniform>
    meltRate: ReturnType<typeof uniform>
    snowfallIntensity: ReturnType<typeof uniform>
    windStrength: ReturnType<typeof uniform>
  }
}

export interface SnowAccumulationBuildBuffers {
  accumulation: Float32Array
  support: Float32Array
  terrainCoords: Float32Array
  terrainHeights: Float32Array
  vertexCount: number
}

export interface SnowCoverageSample {
  deltaTime: number
  height: number
  previousCoverage: number
  snowfallIntensity: number
  support: number
  worldX: number
  worldY: number
  worldZ: number
}

export const DEFAULT_SNOW_ACCUMULATION_SETTINGS: SnowAccumulationSettings = {
  accumulationRate: 0.35,
  meltRate: 0.28,
  visualStrength: 0.85,
  windStrength: 0.55,
}

const WIND_DIRECTION = normalizeVec3({
  x: -0.58,
  y: 0.12,
  z: 0.8,
})

export function createSnowAccumulationSignature(
  settings: SnowAccumulationSettings,
  snowfallIntensity: number
) {
  return [
    settings.accumulationRate,
    settings.meltRate,
    settings.visualStrength,
    settings.windStrength,
    snowfallIntensity,
  ]
    .map((value) => clampNumber(value, 0, 4).toFixed(3))
    .join('|')
}

export function computeSnowShelterFactor(
  worldX: number,
  worldY: number,
  worldZ: number
) {
  const sample =
    Math.sin(worldX * 0.011 + WIND_DIRECTION.x * 3.1) *
    Math.cos(worldZ * 0.013 + WIND_DIRECTION.z * 2.7) *
    Math.sin(worldY * 0.009 + 0.45)

  return clampNumber(sample * 0.5 + 0.5, 0, 1)
}

export function computeNextSnowCoverage(
  sample: SnowCoverageSample,
  settings: SnowAccumulationSettings = DEFAULT_SNOW_ACCUMULATION_SETTINGS
) {
  const safeDeltaTime = clampNumber(sample.deltaTime, 0, 1)
  const snowSupport = smoothstepNumber(0.46, 0.94, sample.support)
  const altitudeFactor = smoothstepNumber(-2, 18, sample.height)
  const shelterFactor = computeSnowShelterFactor(
    sample.worldX,
    sample.worldY,
    sample.worldZ
  )
  const snowfall = clampNumber(sample.snowfallIntensity, 0, 1)
  const depositRate =
    snowfall *
    settings.accumulationRate *
    snowSupport *
    mixNumber(0.02, 0.065, altitudeFactor) *
    mixNumber(0.72, 1.08, shelterFactor)
  const slideRate =
    (1 - snowSupport) * mixNumber(0.006, 0.045, settings.windStrength)
  const meltRate =
    (1 - snowfall) *
    settings.meltRate *
    mixNumber(0.04, 0.006, altitudeFactor)
  const exposureRate =
    settings.windStrength *
    (1 - shelterFactor) *
    (1 - snowSupport) *
    0.018
  const nextCoverage =
    sample.previousCoverage +
    safeDeltaTime * (depositRate - slideRate - meltRate - exposureRate)

  return clampNumber(nextCoverage, 0, 1)
}

export function createSnowAccumulationRuntimeState(
  chunkState: SnowAccumulationBuildBuffers & {
    key: string
    settingsVersion: string
  }
) {
  const accumulationAttribute = new StorageBufferAttribute(
    chunkState.accumulation,
    1
  )
  const supportAttribute = new StorageBufferAttribute(chunkState.support, 1)
  const terrainHeightAttribute = new StorageBufferAttribute(
    chunkState.terrainHeights,
    1
  )
  const terrainCoordAttribute = new StorageBufferAttribute(
    chunkState.terrainCoords,
    3
  )
  const accumulationStorage = storage(
    accumulationAttribute,
    'float',
    chunkState.vertexCount
  )
  const supportStorage = storage(
    supportAttribute,
    'float',
    chunkState.vertexCount
  ).toReadOnly()
  const terrainHeightStorage = storage(
    terrainHeightAttribute,
    'float',
    chunkState.vertexCount
  ).toReadOnly()
  const terrainCoordStorage = storage(
    terrainCoordAttribute,
    'vec3',
    chunkState.vertexCount
  ).toReadOnly()
  const deltaTime = uniform(0.12)
  const snowfallIntensity = uniform(0)
  const accumulationRate = uniform(1)
  const meltRate = uniform(1)
  const windStrength = uniform(1)

  const computeNode = Fn(() => {
    const id = instanceIndex.toConst('snowVertexId')
    const currentCoverage = accumulationStorage.element(id).toVar()
    const height = terrainHeightStorage.element(id).toVar()
    const support = supportStorage.element(id).toVar()
    const terrainCoord = terrainCoordStorage.element(id).toVar()
    const shelterNoise = sin(
      terrainCoord.x.mul(0.011).add(float(WIND_DIRECTION.x * 3.1))
    )
      .mul(
        cos(terrainCoord.z.mul(0.013).add(float(WIND_DIRECTION.z * 2.7)))
      )
      .mul(sin(terrainCoord.y.mul(0.009).add(0.45)))
    const shelterFactor = clamp(shelterNoise.mul(0.5).add(0.5), 0, 1)
    const snowSupport = smoothstep(0.46, 0.94, support)
    const altitudeFactor = smoothstep(-2, 18, height)
    const depositRate = snowfallIntensity
      .mul(accumulationRate)
      .mul(snowSupport)
      .mul(mix(0.02, 0.065, altitudeFactor))
      .mul(mix(0.72, 1.08, shelterFactor))
    const slideRate = float(1)
      .sub(snowSupport)
      .mul(mix(0.006, 0.045, windStrength))
    const meltStrength = float(1)
      .sub(snowfallIntensity)
      .mul(meltRate)
      .mul(mix(0.04, 0.006, altitudeFactor))
    const exposureRate = windStrength
      .mul(float(1).sub(shelterFactor))
      .mul(float(1).sub(snowSupport))
      .mul(0.018)
    const nextCoverage = clamp(
      currentCoverage.add(
        deltaTime.mul(
          depositRate.sub(slideRate).sub(meltStrength).sub(exposureRate)
        )
      ),
      0,
      1
    )

    accumulationStorage.element(id).assign(nextCoverage)
  })().compute(chunkState.vertexCount)

  return {
    accumulationAttribute,
    accumulationVersion: 0,
    computeNode,
    key: chunkState.key,
    lastUpdateTime: 0,
    settingsVersion: chunkState.settingsVersion,
    uniforms: {
      accumulationRate,
      deltaTime,
      meltRate,
      snowfallIntensity,
      windStrength,
    },
  } satisfies SnowAccumulationRuntimeState
}

export function updateSnowAccumulationRuntimeState(
  renderer: WebGPURenderer,
  state: SnowAccumulationRuntimeState,
  deltaTimeSeconds: number,
  snowfallIntensity: number,
  settings: SnowAccumulationSettings
) {
  state.uniforms.accumulationRate.value = settings.accumulationRate
  state.uniforms.deltaTime.value = clampNumber(deltaTimeSeconds, 0, 1)
  state.uniforms.meltRate.value = settings.meltRate
  state.uniforms.snowfallIntensity.value = clampNumber(snowfallIntensity, 0, 1)
  state.uniforms.windStrength.value = settings.windStrength
  void renderer.compute(state.computeNode)
  state.accumulationVersion += 1
  state.lastUpdateTime += deltaTimeSeconds
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mixNumber(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha
}

function normalizeVec3(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function smoothstepNumber(edge0: number, edge1: number, value: number) {
  const normalized = clampNumber((value - edge0) / (edge1 - edge0), 0, 1)

  return normalized * normalized * (3 - 2 * normalized)
}
