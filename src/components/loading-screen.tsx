import { motion } from 'motion/react'

// CUSTOMIZE: Replace spinner with your brand's loading animation
function LoadingScreen() {
  return (
    <div className="bg-bg flex min-h-screen items-center justify-center overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          opacity: { duration: 0.4, ease: 'easeOut' },
          y: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
        }}
      >
        <div className="border-border border-t-accent h-10 w-10 animate-spin rounded-full border-2" />
      </motion.div>
    </div>
  )
}

export { LoadingScreen }
