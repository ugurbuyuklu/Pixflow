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
    <div className="grid grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
      {items.map((item, index) => (
        <button
          key={getKey(item, index)}
          type="button"
          onClick={() => onToggle(item)}
          className={`aspect-[2/1] rounded-lg font-medium text-lg flex items-center justify-center transition-colors ${
            selectedSet.has(item)
              ? 'bg-brand-600 hover:bg-brand-700 text-white'
              : 'bg-surface-200 hover:bg-surface-300 text-surface-600'
          }`}
        >
          {renderContent(item, index)}
        </button>
      ))}
    </div>
  )
}
