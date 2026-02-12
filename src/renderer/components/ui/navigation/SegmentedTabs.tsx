import { type KeyboardEvent, type ReactNode, useRef } from 'react'

type SegmentedTabId = string

interface SegmentedTabItem<T extends SegmentedTabId> {
  id: T
  label: string
  icon?: ReactNode
  badge?: ReactNode
  disabled?: boolean
  panelId?: string
}

interface SegmentedTabsProps<T extends SegmentedTabId> {
  value: T
  items: SegmentedTabItem<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  size?: 'sm' | 'md'
}

function moveIndex(length: number, start: number, direction: 1 | -1): number {
  if (length <= 0) return -1
  const next = (start + direction + length) % length
  return next
}

export function SegmentedTabs<T extends SegmentedTabId>({
  value,
  items,
  onChange,
  ariaLabel,
  className = '',
  size = 'md',
}: SegmentedTabsProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm'

  const findNextEnabled = (startIndex: number, direction: 1 | -1): number => {
    if (items.length === 0) return -1
    let idx = startIndex
    for (let i = 0; i < items.length; i += 1) {
      idx = moveIndex(items.length, idx, direction)
      if (!items[idx]?.disabled) return idx
    }
    return -1
  }

  const focusTab = (index: number) => {
    if (index < 0 || index >= items.length) return
    const nextItem = items[index]
    if (!nextItem || nextItem.disabled) return
    onChange(nextItem.id)
    tabRefs.current[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(findNextEnabled(index, 1))
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(findNextEnabled(index, -1))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusTab(findNextEnabled(-1, 1))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusTab(findNextEnabled(0, -1))
    }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex bg-surface-100 rounded-lg p-1 gap-1 ${className}`}>
      {items.map((item, index) => {
        const isActive = item.id === value
        return (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={item.panelId}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => {
              if (!item.disabled) onChange(item.id)
            }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md font-medium transition-colors ${sizeClass} ${
              isActive
                ? 'bg-brand-600 text-surface-900'
                : item.disabled
                  ? 'text-surface-400 opacity-50 cursor-not-allowed'
                  : 'text-surface-400 hover:text-surface-900'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </button>
        )
      })}
    </div>
  )
}
