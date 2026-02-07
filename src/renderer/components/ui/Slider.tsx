import { type InputHTMLAttributes } from 'react'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  displayValue?: string | number
}

export function Slider({ label, displayValue, className = '', ...rest }: SliderProps) {
  return (
    <div className="space-y-1">
      {(label || displayValue !== undefined) && (
        <div className="flex items-center justify-between">
          {label && <label className="text-sm font-medium text-surface-600">{label}</label>}
          {displayValue !== undefined && (
            <span className="text-sm font-medium text-brand-400">{displayValue}</span>
          )}
        </div>
      )}
      <input
        type="range"
        className={`w-full h-2 rounded-full appearance-none bg-surface-200 accent-brand-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...rest}
      />
    </div>
  )
}
