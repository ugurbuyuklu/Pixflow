import { Check, CheckCircle } from 'lucide-react'
import { assetUrl } from '../../lib/api'

interface GeneratedAvatarsGridProps {
  generatedUrls: string[]
  generating: boolean
  selectedIndex: number | null
  onSelect: (index: number) => void
}

export function GeneratedAvatarsGrid({
  generatedUrls,
  generating,
  selectedIndex,
  onSelect,
}: GeneratedAvatarsGridProps) {
  if (generatedUrls.length === 0 || generating) return null

  return (
    <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg space-y-3">
      <p className="text-success text-sm flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        {generatedUrls.length} avatar{generatedUrls.length > 1 ? 's' : ''} generated and saved to gallery!
      </p>
      <div className="grid grid-cols-4 gap-2">
        {generatedUrls.map((url, index) => (
          <button
            type="button"
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            key={index}
            className={`cursor-pointer transition-all relative rounded-lg overflow-hidden border-2 ${
              selectedIndex === index
                ? 'border-brand-500 ring-2 ring-brand-500/50'
                : 'border-transparent hover:border-surface-200'
            }`}
            onClick={() => onSelect(index)}
          >
            <img
              src={assetUrl(url)}
              alt={`Generated avatar ${index + 1}`}
              className="w-full aspect-[9/16] object-cover"
            />
            {selectedIndex === index && (
              <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-surface-400 text-center">Click to select, double-click to view full size</p>
    </div>
  )
}
