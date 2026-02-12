import type { ReactNode } from 'react'

interface PageTransitionProps {
  pageKey: string
  children: ReactNode
}

export function PageTransition({ pageKey, children }: PageTransitionProps) {
  return <div key={pageKey}>{children}</div>
}
