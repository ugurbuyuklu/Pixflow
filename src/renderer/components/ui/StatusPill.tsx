import type { HTMLAttributes } from 'react'

type Status =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'generating'
  | 'completed'
  | 'success'
  | 'failed'
  | 'error'
  | 'draft'
  | 'neutral'

type Size = 'xs' | 'sm' | 'md'

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: Status
  label?: string
  size?: Size
}

const statusClasses: Record<Status, string> = {
  queued: 'bg-surface-100 text-surface-600 border-surface-200',
  pending: 'bg-surface-100 text-surface-600 border-surface-200',
  processing: 'bg-warning/15 text-warning border-warning/30',
  generating: 'bg-warning/15 text-warning border-warning/30',
  completed: 'bg-success/15 text-success border-success/30',
  success: 'bg-success/15 text-success border-success/30',
  failed: 'bg-danger/15 text-danger border-danger/30',
  error: 'bg-danger/15 text-danger border-danger/30',
  draft: 'bg-surface-100 text-surface-500 border-surface-200',
  neutral: 'bg-surface-100 text-surface-600 border-surface-200',
}

const sizeClasses: Record<Size, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

const statusLabels: Record<Status, string> = {
  queued: 'Queued',
  pending: 'Queued',
  processing: 'Processing',
  generating: 'Generating',
  completed: 'Completed',
  success: 'Success',
  failed: 'Failed',
  error: 'Failed',
  draft: 'Draft',
  neutral: 'Info',
}

export function StatusPill({ status, label, size = 'sm', className = '', ...rest }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${statusClasses[status]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {label || statusLabels[status]}
    </span>
  )
}
