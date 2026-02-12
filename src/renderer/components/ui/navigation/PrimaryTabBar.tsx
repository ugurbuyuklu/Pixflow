import { type KeyboardEvent, type ReactNode, useRef } from 'react'

type PrimaryTabId = string

interface PrimaryTabItem<T extends PrimaryTabId> {
  id: T
  label: string
  icon?: ReactNode
  badge?: ReactNode
  disabled?: boolean
  panelId?: string
}

interface PrimaryTabBarProps<T extends PrimaryTabId> {
  value: T
  items: PrimaryTabItem<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

function moveIndex(length: number, start: number, direction: 1 | -1): number {
  if (length <= 0) return -1
  const next = (start + direction + length) % length
  return next
}

export function PrimaryTabBar<T extends PrimaryTabId>({
  value,
  items,
  onChange,
  ariaLabel,
  className = '',
}: PrimaryTabBarProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

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
    <div role="tablist" aria-label={ariaLabel} className={`flex gap-1 ${className}`}>
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
            className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
              isActive
                ? 'text-brand-400'
                : item.disabled
                  ? 'text-surface-400 opacity-50 cursor-not-allowed'
                  : 'text-surface-400 hover:text-surface-900'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
            {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-400" />}
          </button>
        )
      })}
    </div>
  )
}
