import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

interface VirtualizedGridProps<T> {
  items: T[]
  columns: number
  itemHeight: number
  itemAspectRatio?: number
  gap?: number
  overscanRows?: number
  className?: string
  getKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
}

export function VirtualizedGrid<T>({
  items,
  columns,
  itemHeight,
  itemAspectRatio,
  gap = 8,
  overscanRows = 2,
  className,
  getKey,
  renderItem,
}: VirtualizedGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => setScrollTop(el.scrollTop)
    const updateViewport = () => {
      setViewportHeight(el.clientHeight)
      setContainerWidth(el.clientWidth)
    }
    updateViewport()

    el.addEventListener('scroll', onScroll, { passive: true })

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateViewport)
      observer.observe(el)
    } else {
      window.addEventListener('resize', updateViewport)
    }

    return () => {
      el.removeEventListener('scroll', onScroll)
      if (observer) {
        observer.disconnect()
      } else {
        window.removeEventListener('resize', updateViewport)
      }
    }
  }, [])

  const effectiveViewportHeight = viewportHeight || 400
  const effectiveItemHeight = useMemo(() => {
    if (!itemAspectRatio || containerWidth <= 0) return itemHeight
    const totalGap = gap * (columns - 1)
    const itemWidth = (containerWidth - totalGap) / columns
    if (itemWidth <= 0) return itemHeight
    const computed = Math.floor(itemWidth / itemAspectRatio)
    return computed > 0 ? computed : itemHeight
  }, [columns, containerWidth, gap, itemAspectRatio, itemHeight])

  const rowStride = effectiveItemHeight + gap
  const totalRows = Math.ceil(items.length / columns)
  const totalHeight = totalRows === 0 ? 0 : totalRows * effectiveItemHeight + (totalRows - 1) * gap

  const rowWindow = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / rowStride) - overscanRows)
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + effectiveViewportHeight) / rowStride) + overscanRows)
    return { startRow, endRow }
  }, [effectiveViewportHeight, overscanRows, rowStride, scrollTop, totalRows])

  const rows: number[] = []
  for (let row = rowWindow.startRow; row < rowWindow.endRow; row++) {
    rows.push(row)
  }

  return (
    <div ref={containerRef} className={`overflow-y-auto ${className || ''}`}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {rows.map((row) => {
          const rowStart = row * columns
          const rowEnd = Math.min(rowStart + columns, items.length)
          const rowItems = items.slice(rowStart, rowEnd)

          return (
            <div
              key={`row-${row}`}
              style={{
                position: 'absolute',
                top: row * rowStride,
                left: 0,
                right: 0,
                height: effectiveItemHeight,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap,
              }}
            >
              {rowItems.map((item, offset) => {
                const index = rowStart + offset
                return <div key={getKey(item, index)}>{renderItem(item, index)}</div>
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
