interface StepHeaderProps {
  stepNumber: number
  title: string
  subtitle?: string
}

export function StepHeader({ stepNumber, title, subtitle }: StepHeaderProps) {
  return (
    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
      <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">
        {stepNumber}
      </span>
      {title}
      {subtitle && <span className="text-xs text-surface-400 font-normal">{subtitle}</span>}
    </h2>
  )
}
