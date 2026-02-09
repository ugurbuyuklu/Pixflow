import type { InputHTMLAttributes } from 'react'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  displayValue?: string | number
}

export function Slider({ label, displayValue, className = '', ...rest }: SliderProps) {
  return (
    <div className="space-y-2">
      {(label || displayValue !== undefined) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-surface-600">{label}</span>}
          {displayValue !== undefined && <span className="text-sm font-medium text-brand-400">{displayValue}</span>}
        </div>
      )}
      <input
        type="range"
        aria-label={label}
        className={`w-full h-2 rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
          [&::-webkit-slider-track]:bg-surface-200 [&::-webkit-slider-track]:rounded-full [&::-webkit-slider-track]:h-2
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-track]:bg-surface-200 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2
          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer
          ${className}`}
        {...rest}
      />
    </div>
  )
}
