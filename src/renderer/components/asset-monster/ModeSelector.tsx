import type { LucideIcon } from 'lucide-react'

interface ModeSelectorOption<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  disabled?: boolean
  badge?: string
}

interface ModeSelectorProps<T extends string> {
  value: T
  options: ModeSelectorOption<T>[]
  onChange: (value: T) => void
}

export function ModeSelector<T extends string>({ value, options, onChange }: ModeSelectorProps<T>) {
  return (
    <div className="flex bg-surface-100 rounded-lg p-1 mb-4">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => !option.disabled && onChange(option.value)}
          disabled={option.disabled}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
            value === option.value
              ? 'bg-brand-600 text-surface-900'
              : option.disabled
                ? 'text-surface-400 opacity-50 cursor-not-allowed'
                : 'text-surface-400 hover:text-surface-900'
          }`}
        >
          <option.icon className="w-4 h-4" />
          {option.label}
          {option.badge && ` ${option.badge}`}
        </button>
      ))}
    </div>
  )
}
