import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" aria-label="Close modal" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-50 border border-surface-100 rounded-xl shadow-xl w-full max-w-[min(28rem,calc(100vw-2rem))] mx-4">
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
            <h2 className="text-lg font-semibold text-surface-900 truncate mr-2">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
