import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-8 text-surface-400 border-2 border-dashed border-surface-200 rounded-lg">
      {icon && <div className="w-10 h-10 mx-auto mb-3 opacity-50 flex items-center justify-center">{icon}</div>}
      <p className="text-sm">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
