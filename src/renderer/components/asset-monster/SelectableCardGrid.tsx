import { VirtualizedGrid } from '../ui/VirtualizedGrid'

interface SelectableCardGridProps<T> {
  items: T[]
  selectedSet: Set<T>
  onToggle: (item: T) => void
  renderContent: (item: T, index: number) => React.ReactNode
  getKey: (item: T, index: number) => string | number
}

export function SelectableCardGrid<T>({
  items,
  selectedSet,
  onToggle,
  renderContent,
  getKey,
}: SelectableCardGridProps<T>) {
  return (
    <VirtualizedGrid
      items={items}
      columns={5}
      itemHeight={56}
      gap={8}
      className="max-h-[400px]"
      getKey={getKey}
      renderItem={(item, index) => (
        <button
          type="button"
          onClick={() => onToggle(item)}
          className={`h-full w-full rounded-lg font-medium text-lg flex items-center justify-center transition-colors ${
            selectedSet.has(item)
              ? 'bg-brand-600 hover:bg-brand-700 text-white'
              : 'bg-surface-200 hover:bg-surface-300 text-surface-600'
          }`}
        >
          {renderContent(item, index)}
        </button>
      )}
    />
  )
}
