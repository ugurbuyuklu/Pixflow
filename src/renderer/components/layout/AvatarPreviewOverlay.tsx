import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { assetUrl } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'

export function AvatarPreviewOverlay() {
  const fullSizeAvatarUrl = useAvatarStore((s) => s.fullSizeAvatarUrl)
  const setFullSizeAvatarUrl = useAvatarStore((s) => s.setFullSizeAvatarUrl)

  return (
    <AnimatePresence>
      {fullSizeAvatarUrl && (
        <motion.div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setFullSizeAvatarUrl(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={assetUrl(fullSizeAvatarUrl)}
              alt="Generated Avatar"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={assetUrl(fullSizeAvatarUrl)}
                download
                className="bg-success hover:bg-success-hover rounded-full p-2 transition-colors text-white"
                title="Download avatar"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-6 h-6" />
              </a>
              <button
                onClick={() => setFullSizeAvatarUrl(null)}
                className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-surface-500 bg-black/50 px-3 py-1 rounded">
              Click anywhere to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
