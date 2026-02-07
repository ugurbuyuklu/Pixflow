import { type HTMLAttributes } from 'react'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'brand'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface-100 text-surface-600',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-red-500/15 text-red-400',
  brand: 'bg-brand-500/15 text-brand-400',
}

export function Badge({ variant = 'default', children, className = '', ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
