import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

interface VirtualizedListProps<T> {
  items: T[]
  itemHeight: number
  overscan?: number
  className?: string
  getKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  overscan = 4,
  className,
  getKey,
  renderItem,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => setScrollTop(el.scrollTop)
    const updateViewportHeight = () => setViewportHeight(el.clientHeight)
    updateViewportHeight()

    el.addEventListener('scroll', onScroll, { passive: true })

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateViewportHeight)
      observer.observe(el)
    } else {
      window.addEventListener('resize', updateViewportHeight)
    }

    return () => {
      el.removeEventListener('scroll', onScroll)
      if (observer) {
        observer.disconnect()
      } else {
        window.removeEventListener('resize', updateViewportHeight)
      }
    }
  }, [])

  const effectiveViewportHeight = viewportHeight || 400
  const totalHeight = items.length * itemHeight
  const visibleWindow = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(items.length, Math.ceil((scrollTop + effectiveViewportHeight) / itemHeight) + overscan)
    return { startIndex, endIndex }
  }, [effectiveViewportHeight, itemHeight, items.length, overscan, scrollTop])

  const visibleItems = items.slice(visibleWindow.startIndex, visibleWindow.endIndex)

  return (
    <div ref={containerRef} className={`overflow-y-auto ${className || ''}`}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${visibleWindow.startIndex * itemHeight}px)` }}>
          {visibleItems.map((item, idx) => {
            const index = visibleWindow.startIndex + idx
            return (
              <div key={getKey(item, index)} style={{ height: itemHeight }}>
                {renderItem(item, index)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
