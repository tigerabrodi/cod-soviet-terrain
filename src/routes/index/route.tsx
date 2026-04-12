import { TerrainScene, type CameraMode } from '@/components/terrain-scene'
import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { startTransition, useState } from 'react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [backend, setBackend] = useState('Initializing')
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [isReady, setIsReady] = useState(false)

  return (
    <div className="relative h-dvh overflow-hidden bg-[#090d12] text-[#edf2f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(156,186,214,0.18),_transparent_40%),linear-gradient(180deg,_rgba(9,13,18,0.28),_rgba(4,7,10,0.94))]" />
      <TerrainScene
        cameraMode={cameraMode}
        onBackendChange={(nextBackend) => {
          startTransition(() => {
            setBackend(nextBackend)
          })
        }}
        onReadyChange={(nextReady) => {
          startTransition(() => {
            setIsReady(nextReady)
          })
        }}
      />
      <div className="pointer-events-none absolute inset-0 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xs rounded-[20px] border border-white/10 bg-black/22 px-4 py-3 backdrop-blur-md"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-body text-[10px] tracking-[0.32em] text-[#c9d2dc]/70 uppercase">
              COD Soviet Terrain
            </p>
            <p className="font-display mt-2 text-[clamp(1.2rem,2.2vw,2rem)] leading-none text-[#f4f7fb]">
              Terrain streaming.
            </p>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto rounded-[18px] border border-white/10 bg-black/22 px-4 py-3 text-right backdrop-blur-md"
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.06, duration: 0.55, ease: 'easeOut' }}
          >
            <p className="font-body text-[10px] tracking-[0.26em] text-[#c9d2dc]/68 uppercase">
              {backend}
            </p>
            <p className="font-body mt-2 text-sm text-[#eef2f6]">
              {isReady ? 'Textures ready' : 'Loading terrain'}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className={`font-body rounded-full border px-3 py-1 text-xs transition ${
                  cameraMode === 'orbit'
                    ? 'border-[#dbe6f3]/42 bg-[#dbe6f3]/14 text-[#f4f7fb]'
                    : 'border-white/10 bg-white/5 text-[#d0d8e1]'
                }`}
                onClick={() => {
                  startTransition(() => {
                    setCameraMode('orbit')
                  })
                }}
                type="button"
              >
                Inspect
              </button>
              <button
                className={`font-body rounded-full border px-3 py-1 text-xs transition ${
                  cameraMode === 'fly'
                    ? 'border-[#dbe6f3]/42 bg-[#dbe6f3]/14 text-[#f4f7fb]'
                    : 'border-white/10 bg-white/5 text-[#d0d8e1]'
                }`}
                onClick={() => {
                  startTransition(() => {
                    setCameraMode('fly')
                  })
                }}
                type="button"
              >
                Fly
              </button>
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/18 px-4 py-2 backdrop-blur-md sm:bottom-6"
          initial={{ opacity: 0, y: 14 }}
          transition={{ delay: 0.12, duration: 0.55, ease: 'easeOut' }}
        >
          <p className="font-body text-center text-[11px] text-[#eef2f6]/82 sm:text-xs">
            {cameraMode === 'fly'
              ? 'Fly. Click scene. WASD move. Q E up down. Shift fast. Esc unlock.'
              : 'Inspect. Drag to orbit. Scroll to zoom. Use Fly for ground view.'}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
