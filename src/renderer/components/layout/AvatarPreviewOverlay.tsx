import { Download, X } from 'lucide-react'
import { assetUrl } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'

export function AvatarPreviewOverlay() {
  const fullSizeAvatarUrl = useAvatarStore((s) => s.fullSizeAvatarUrl)
  const setFullSizeAvatarUrl = useAvatarStore((s) => s.setFullSizeAvatarUrl)

  if (!fullSizeAvatarUrl) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <button
        type="button"
        aria-label="Close avatar preview"
        className="absolute inset-0 bg-black/80"
        onClick={() => setFullSizeAvatarUrl(null)}
      />
      <div className="relative z-10">
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
          >
            <Download className="w-6 h-6" />
          </a>
          <button
            type="button"
            onClick={() => setFullSizeAvatarUrl(null)}
            className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-surface-500 bg-black/50 px-3 py-1 rounded">
          Click anywhere to close
        </p>
      </div>
    </div>
  )
}
