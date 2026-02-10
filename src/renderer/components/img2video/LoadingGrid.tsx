import { Loader2 } from 'lucide-react'
import { assetUrl } from '../../lib/api'

interface LoadingGridItem {
  id: string
  imageUrl?: string
}

interface LoadingGridProps {
  items: LoadingGridItem[]
  title?: string
}

export function LoadingGrid({ items, title = 'Generating...' }: LoadingGridProps) {
  if (items.length === 0) return null

  return (
    <div className="bg-surface-50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.id} className="relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-200">
            {item.imageUrl && (
              <img src={assetUrl(item.imageUrl)} className="w-full h-full object-cover opacity-30" alt="" />
            )}
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
              style={{ backgroundSize: '200% 100%' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
