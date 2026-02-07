import toast from 'react-hot-toast'

const defaults = {
  duration: 3000,
  style: {
    background: 'var(--surface-50)',
    color: 'var(--surface-900)',
    border: '1px solid var(--surface-100)',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
  },
} as const

export const notify = {
  success: (message: string) =>
    toast.success(message, { ...defaults, iconTheme: { primary: '#22c55e', secondary: '#fff' } }),
  error: (message: string) =>
    toast.error(message, { ...defaults, iconTheme: { primary: '#ef4444', secondary: '#fff' } }),
  info: (message: string) =>
    toast(message, { ...defaults, icon: 'ℹ️' }),
}
