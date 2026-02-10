import { AlertCircle, X } from 'lucide-react'
import { Button } from '../ui/Button'

interface StudioErrorAlertProps {
  error: {
    message: string
    type: 'warning' | 'error'
  }
  onDismiss: () => void
}

export function StudioErrorAlert({ error, onDismiss }: StudioErrorAlertProps) {
  const isWarning = error.type === 'warning'

  return (
    <div
      className={`rounded-lg p-4 flex items-start gap-3 ${
        isWarning
          ? 'bg-warning-muted/50 border border-warning/40'
          : 'bg-danger-muted/50 border border-danger/40'
      }`}
    >
      <AlertCircle
        className={`w-5 h-5 shrink-0 mt-0.5 ${isWarning ? 'text-warning' : 'text-danger'}`}
      />
      <p className={`flex-1 ${isWarning ? 'text-warning' : 'text-danger'}`}>
        {error.message}
      </p>
      <Button
        variant="ghost-muted"
        size="xs"
        aria-label="Dismiss"
        icon={<X className="w-4 h-4" />}
        onClick={onDismiss}
      />
    </div>
  )
}
