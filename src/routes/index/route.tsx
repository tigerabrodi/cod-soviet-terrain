import { TerrainScene } from '@/components/terrain-scene'
import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { startTransition, useState } from 'react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [backend, setBackend] = useState('Initializing')
  const [isReady, setIsReady] = useState(false)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090d12] text-[#edf2f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(156,186,214,0.18),_transparent_40%),linear-gradient(180deg,_rgba(9,13,18,0.28),_rgba(4,7,10,0.94))]" />
      <TerrainScene
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
              Terrain slice one.
            </p>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[18px] border border-white/10 bg-black/22 px-4 py-3 text-right backdrop-blur-md"
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.06, duration: 0.55, ease: 'easeOut' }}
          >
            <p className="font-body text-[10px] tracking-[0.26em] text-[#c9d2dc]/68 uppercase">
              {backend}
            </p>
            <p className="font-body mt-2 text-sm text-[#eef2f6]">
              {isReady ? 'Textures ready' : 'Loading terrain'}
            </p>
          </motion.div>
        </div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-4 bottom-4 max-w-[16rem] rounded-[18px] border border-white/10 bg-black/18 px-4 py-3 backdrop-blur-md sm:right-6 sm:bottom-6"
          initial={{ opacity: 0, y: 14 }}
          transition={{ delay: 0.12, duration: 0.55, ease: 'easeOut' }}
        >
          <p className="font-body text-[10px] tracking-[0.26em] text-[#c9d2dc]/64 uppercase">
            Splat
          </p>
          <div className="font-body mt-2 grid gap-1 text-xs leading-5 text-[#eef2f6]/88">
            <p>Low flat. Scorched.</p>
            <p>Mid flat. Frozen earth.</p>
            <p>High flat. Frost.</p>
            <p>Steep. Rubble.</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
