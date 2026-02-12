import type { LucideIcon } from 'lucide-react'
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { Button } from './Button'

type StatusType = 'warning' | 'error' | 'info'

interface StatusBannerProps {
  type: StatusType
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  icon?: LucideIcon
}

const typeStyles: Record<StatusType, { container: string; icon: string; Icon: typeof AlertCircle }> = {
  warning: {
    container: 'bg-warning-muted/50 border border-warning/40 text-warning',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  error: {
    container: 'bg-danger-muted/50 border border-danger/40 text-danger',
    icon: 'text-danger',
    Icon: AlertCircle,
  },
  info: {
    container: 'bg-surface-100 border border-surface-200 text-surface-500',
    icon: 'text-surface-400',
    Icon: Info,
  },
}

export function StatusBanner({ type, message, actionLabel, onAction, onDismiss, icon }: StatusBannerProps) {
  const { container, icon: iconClass, Icon: defaultIcon } = typeStyles[type]
  const Icon = icon || defaultIcon
  return (
    <div className={`rounded-lg p-4 flex items-start gap-3 ${container}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconClass}`} />
      <p className="flex-1">{message}</p>
      {actionLabel && onAction && (
        <Button variant={type === 'error' ? 'ghost-danger' : 'ghost-warning'} size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {onDismiss && (
        <Button variant="ghost-muted" size="xs" aria-label="Dismiss" onClick={onDismiss}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}
