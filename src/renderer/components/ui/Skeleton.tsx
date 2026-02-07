interface SkeletonProps {
  width?: string | number
  height?: string | number
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  className?: string
}

const roundedClasses = {
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
}

export function Skeleton({ width, height, rounded = 'md', className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-100 ${roundedClasses[rounded]} ${className}`}
      style={{ width, height }}
    />
  )
}
