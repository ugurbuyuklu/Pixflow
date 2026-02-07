import { type HTMLAttributes, type ReactNode } from 'react'

type Padding = 'sm' | 'md' | 'lg'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding
  header?: ReactNode
}

const paddingClasses: Record<Padding, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ padding = 'md', header, children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-surface-50 border border-surface-100 ${className}`}
      {...rest}
    >
      {header && (
        <div className="px-4 py-3 border-b border-surface-100">
          {header}
        </div>
      )}
      <div className={paddingClasses[padding]}>{children}</div>
    </div>
  )
}
