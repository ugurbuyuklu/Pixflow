import { X } from 'lucide-react'
import { assetUrl } from '../../lib/api'

interface SelectableThumbnailProps {
  id: string
  imageUrl: string
  isSelected: boolean
  onSelect: (id: string) => void
  onRemove?: (id: string) => void
  showRemoveButton?: boolean
}

export function SelectableThumbnail({
  id,
  imageUrl,
  isSelected,
  onSelect,
  onRemove,
  showRemoveButton = true,
}: SelectableThumbnailProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect(id)
      }}
      className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all group ${
        isSelected ? 'border-brand-500 ring-2 ring-brand-500/50' : 'border-transparent hover:border-surface-200'
      }`}
    >
      <img src={assetUrl(imageUrl)} className="w-full h-full object-cover" alt="" />
      {isSelected && showRemoveButton && onRemove && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onRemove(id)
          }}
          className="absolute top-1 right-1 w-5 h-5 bg-surface-900/80 hover:bg-danger rounded-full flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  )
}
