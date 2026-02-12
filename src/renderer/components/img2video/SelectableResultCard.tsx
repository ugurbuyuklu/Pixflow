import { Check, Play, ThumbsDown, ThumbsUp } from 'lucide-react'
import { assetUrl } from '../../lib/api'

interface SelectableResultCardProps {
  id: string
  imageUrl: string
  resultUrl?: string
  isSelected: boolean
  isLiked?: boolean
  isDisliked?: boolean
  isVideo?: boolean
  onSelect: (id: string) => void
  onToggleSelection: (id: string, e: React.MouseEvent) => void
  onOpenModal: (url: string, id: string) => void
}

export function SelectableResultCard({
  id,
  imageUrl,
  resultUrl,
  isSelected,
  isLiked,
  isDisliked,
  isVideo,
  onSelect,
  onToggleSelection,
  onOpenModal,
}: SelectableResultCardProps) {
  const displayUrl = resultUrl || imageUrl

  return (
    <div
      className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
        isSelected ? 'border-brand' : 'border-transparent'
      }`}
    >
      <img
        src={assetUrl(displayUrl)}
        className="w-full h-full object-cover hover:opacity-90 transition-opacity"
        alt=""
      />

      <button type="button" aria-label="Select result" className="absolute inset-0 z-0" onClick={() => onSelect(id)} />

      {/* Video play icon */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 rounded-full p-3">
            <Play className="w-6 h-6 text-white" fill="white" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenModal(assetUrl(displayUrl), id)}
        className="absolute bottom-2 right-2 px-2 py-1 rounded bg-surface-900/70 hover:bg-surface-900 text-white text-xs z-20"
      >
        View
      </button>

      {/* Selection checkbox */}
      <button
        type="button"
        onClick={(e) => onToggleSelection(id, e)}
        className={`absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center transition-colors z-20 ${
          isSelected ? 'bg-brand-600 hover:bg-brand-700' : 'bg-surface-900/50 hover:bg-surface-900/70'
        }`}
      >
        {isSelected ? (
          <Check className="w-4 h-4 text-white" />
        ) : (
          <div className="w-3.5 h-3.5 border-2 border-white/70 rounded" />
        )}
      </button>

      {/* Like/Dislike indicator */}
      {(isLiked || isDisliked) && (
        <div className="absolute bottom-2 left-2 z-10">
          {isLiked && (
            <div className="bg-secondary-600 rounded-full p-1.5">
              <ThumbsUp className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          {isDisliked && (
            <div className="bg-danger rounded-full p-1.5">
              <ThumbsDown className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
