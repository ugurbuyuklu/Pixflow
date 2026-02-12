import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface LoadingStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function LoadingState({
  title = 'Loading...',
  description,
  icon,
  size = 'md',
  className = '',
}: LoadingStateProps) {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  const textSize = size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <div className={`flex flex-col items-center justify-center py-6 text-surface-400 ${className}`}>
      <div className="flex items-center gap-2">
        {icon ?? <Loader2 className={`${iconSize} animate-spin`} />}
        <span className={`font-medium ${textSize}`}>{title}</span>
      </div>
      {description && <p className="text-xs mt-2 text-surface-400">{description}</p>}
    </div>
  )
}
