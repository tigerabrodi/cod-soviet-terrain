import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

type DetectSupportRenderer = Parameters<KTX2Loader['detectSupport']>[0]

const loaderCache = new WeakMap<object, KTX2Loader>()

export function getSharedKTX2Loader(renderer: DetectSupportRenderer) {
  const cachedLoader = loaderCache.get(renderer as object)

  if (cachedLoader) {
    return cachedLoader
  }

  const loader = new KTX2Loader()

  loader.setTranscoderPath('/basis/')
  loader.detectSupport(renderer)
  loaderCache.set(renderer as object, loader)

  return loader
}
