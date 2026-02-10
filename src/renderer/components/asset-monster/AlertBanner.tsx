import { AlertCircle, Clock, WifiOff, X } from 'lucide-react'
import { Button } from '../ui/Button'

interface AlertAction {
  label: string
  onClick: () => void
}

interface AlertBannerProps {
  type: 'warning' | 'error'
  message: string
  action?: AlertAction
  onDismiss: () => void
  offline?: boolean
}

export function AlertBanner({ type, message, action, onDismiss, offline }: AlertBannerProps) {
  const isWarning = type === 'warning'

  const Icon = isWarning ? Clock : offline ? WifiOff : AlertCircle

  return (
    <div
      className={`rounded-lg p-4 flex items-start gap-3 ${
        isWarning ? 'bg-warning-muted/50 border border-warning/40' : 'bg-danger-muted/50 border border-danger/40'
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${isWarning ? 'text-warning' : 'text-danger'}`} />
      <div className="flex-1">
        <p className={isWarning ? 'text-warning' : 'text-danger'}>{message}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`mt-2 text-sm underline ${
              isWarning ? 'text-warning hover:text-warning-hover' : 'text-danger hover:text-danger-hover'
            }`}
          >
            {action.label}
          </button>
        )}
      </div>
      <Button variant="ghost-muted" size="xs" aria-label="Dismiss" icon={<X className="w-4 h-4" />} onClick={onDismiss} />
    </div>
  )
}
