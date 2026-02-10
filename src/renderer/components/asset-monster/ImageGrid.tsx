import { assetUrl } from '../../lib/api'

interface ImageGridProps<T> {
  images: T[]
  getImageUrl: (item: T) => string
  getAlt: (item: T, index: number) => string
  aspectRatio?: 'square' | '9/16'
  columns?: number
  gap?: number
  renderOverlay?: (item: T, index: number) => React.ReactNode
  onClick?: (item: T, index: number) => void
  className?: string
  itemClassName?: string
}

export function ImageGrid<T>({
  images,
  getImageUrl,
  getAlt,
  aspectRatio = 'square',
  columns = 5,
  gap = 3,
  renderOverlay,
  onClick,
  className,
  itemClassName,
}: ImageGridProps<T>) {
  const aspectClass = aspectRatio === 'square' ? 'aspect-square' : 'aspect-[9/16]'
  const gridClass = `grid-cols-${columns}`

  return (
    <div className={`grid ${gridClass} gap-${gap} ${className || ''}`}>
      {images.map((image, idx) => {
        const Element = onClick ? 'button' : 'div'
        return (
          <Element
            key={idx}
            type={onClick ? 'button' : undefined}
            onClick={() => onClick?.(image, idx)}
            className={`relative ${aspectClass} rounded-lg overflow-hidden border border-surface-200 ${
              onClick ? 'cursor-pointer hover:scale-105 transition-all' : ''
            } ${itemClassName || ''}`}
          >
            <img
              src={assetUrl(getImageUrl(image))}
              alt={getAlt(image, idx)}
              className="w-full h-full object-cover"
            />
            {renderOverlay?.(image, idx)}
          </Element>
        )
      })}
    </div>
  )
}
