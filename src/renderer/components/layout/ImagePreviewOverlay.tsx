import { ChevronLeft, ChevronRight, Download, FileJson, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { assetUrl, authFetch } from '../../lib/api'
import { useGenerationStore } from '../../stores/generationStore'
import { usePromptStore } from '../../stores/promptStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useImagePreviewKeyboard } from '../../hooks/useImagePreviewKeyboard'

export function ImagePreviewOverlay() {
  const previewImage = useGenerationStore((s) => s.previewImage)
  const batchProgress = useGenerationStore((s) => s.batchProgress)
  const setPreviewImage = useGenerationStore((s) => s.setPreviewImage)

  useImagePreviewKeyboard(previewImage, batchProgress, setPreviewImage)

  const completedImages = batchProgress?.images.filter((img) => img.status === 'completed' && img.url) ?? []
  const currentIndex = previewImage ? completedImages.findIndex((img) => img.url === previewImage) : -1

  const sendToImageToPrompt = async (imageUrl: string) => {
    try {
      const res = await authFetch(assetUrl(imageUrl))
      const blob = await res.blob()
      const filename = imageUrl.split('/').pop() || 'generated-image.png'
      const file = new File([blob], filename, { type: blob.type })

      setPreviewImage(null)
      usePromptStore.getState().setAnalyzeImage(file, imageUrl)
      useNavigationStore.getState().navigate('prompts', { promptMode: 'image' })
    } catch {
      console.error('Failed to load image for analysis')
    }
  }

  return (
    <AnimatePresence>
      {previewImage && (
        <motion.div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setPreviewImage(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {currentIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setPreviewImage(completedImages[currentIndex - 1].url!)
              }}
              className="absolute left-4 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-colors z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          <motion.div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={assetUrl(previewImage)}
              alt="Preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={assetUrl(previewImage)}
                download
                className="bg-success hover:bg-success-hover rounded-full p-2 transition-colors text-white"
                title="Download image"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-6 h-6" />
              </a>
              <button
                onClick={() => sendToImageToPrompt(previewImage)}
                className="bg-brand-600 hover:bg-brand-500 rounded-full p-2 transition-colors text-white"
                title="Extract prompt from image"
              >
                <FileJson className="w-6 h-6" />
              </button>
              <button
                onClick={() => setPreviewImage(null)}
                className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {currentIndex >= 0 ? (
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-surface-500 bg-black/50 px-3 py-1 rounded">
                {currentIndex + 1} / {completedImages.length}
              </p>
            ) : (
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-surface-500 bg-black/50 px-3 py-1 rounded">
                Click anywhere to close
              </p>
            )}
          </motion.div>

          {currentIndex >= 0 && currentIndex < completedImages.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setPreviewImage(completedImages[currentIndex + 1].url!)
              }}
              className="absolute right-4 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-colors z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
