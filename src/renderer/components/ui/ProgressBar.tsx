interface ProgressBarProps {
  value: number
  label?: string
  className?: string
}

export function ProgressBar({ value, label, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="text-surface-500 truncate">{label}</span>
          <span className="text-surface-600 font-medium shrink-0">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
