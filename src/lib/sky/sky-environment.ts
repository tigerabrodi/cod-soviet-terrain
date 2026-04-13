import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import {
  EquirectangularReflectionMapping,
  HalfFloatType,
  PMREMGenerator,
  type Texture,
} from 'three/webgpu'

export interface SkyEnvironmentSet {
  background: Texture
  environment: Texture
}

type SkyRenderer = ConstructorParameters<typeof PMREMGenerator>[0]

const skyEnvironmentCache = new WeakMap<object, Promise<SkyEnvironmentSet>>()

export function loadSkyEnvironment(renderer: SkyRenderer) {
  const cachedSkyEnvironment = skyEnvironmentCache.get(renderer as object)

  if (cachedSkyEnvironment) {
    return cachedSkyEnvironment
  }

  const skyEnvironmentPromise = createSkyEnvironment(renderer).catch(
    (error: unknown) => {
      skyEnvironmentCache.delete(renderer as object)
      throw error
    }
  )

  skyEnvironmentCache.set(renderer as object, skyEnvironmentPromise)

  return skyEnvironmentPromise
}

async function createSkyEnvironment(renderer: SkyRenderer) {
  const loader = new EXRLoader()
  loader.setDataType(HalfFloatType)

  const background = await loader.loadAsync('/skybox.exr')
  background.name = 'TerrainSkyboxEXR'
  background.mapping = EquirectangularReflectionMapping

  const pmremGenerator = new PMREMGenerator(renderer)
  const environmentRenderTarget = pmremGenerator.fromEquirectangular(background)
  const environment = environmentRenderTarget.texture

  environment.name = 'TerrainSkyEnvironmentPMREM'

  pmremGenerator.dispose()

  return {
    background,
    environment,
  }
}
