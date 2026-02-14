import { Loader2 } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef, isValidElement, type ReactNode } from 'react'

type Variant =
  | 'primary'
  | 'secondary'
  | 'purple'
  | 'lime'
  | 'ghost'
  | 'ghost-danger'
  | 'ghost-warning'
  | 'ghost-muted'
  | 'danger'
  | 'success'
  | 'warning'
  | 'accent'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  scrollToTopOnClick?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:from-brand-500 hover:to-brand-400 focus:ring-brand-500',
  secondary: 'bg-surface-100 text-surface-800 hover:bg-surface-200 focus:ring-surface-300',
  purple: 'bg-violet-600 text-white hover:bg-violet-500 focus:ring-violet-500',
  lime: 'bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500',
  ghost: 'bg-transparent text-surface-500 hover:bg-surface-100 hover:text-surface-800 focus:ring-surface-300',
  'ghost-danger': 'bg-transparent text-surface-400 hover:bg-danger-muted/30 hover:text-danger focus:ring-danger',
  'ghost-warning': 'bg-transparent text-surface-400 hover:bg-warning-muted/30 hover:text-warning focus:ring-warning',
  'ghost-muted': 'bg-transparent text-surface-400 hover:bg-surface-100 hover:text-surface-900 focus:ring-surface-300',
  danger: 'bg-danger text-white hover:bg-danger-hover focus:ring-danger',
  success: 'bg-success text-white hover:bg-success-hover focus:ring-success',
  warning:
    'bg-gradient-to-r from-warning to-warning-hover text-white hover:from-warning-hover hover:to-warning focus:ring-warning',
  accent:
    'bg-gradient-to-r from-accent to-accent-hover text-white hover:from-accent-hover hover:to-accent focus:ring-accent',
}

const sizeClasses: Record<Size, string> = {
  xs: 'p-1 text-xs gap-1',
  sm: 'px-3 py-2 text-xs gap-1.5 min-h-[36px]',
  md: 'px-4 py-2.5 text-sm gap-2 min-h-[44px]',
  lg: 'px-6 py-3 text-base gap-2 min-h-[44px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      icon,
      children,
      className = '',
      disabled,
      type = 'button',
      onClick,
      scrollToTopOnClick,
      ...rest
    },
    ref,
  ) => {
    const extractText = (node: ReactNode): string => {
      if (node === null || node === undefined || typeof node === 'boolean') return ''
      if (typeof node === 'string' || typeof node === 'number') return String(node)
      if (Array.isArray(node)) return node.map(extractText).join(' ')
      if (isValidElement(node)) return extractText(node.props.children)
      return ''
    }

    const labelText = extractText(children).toLowerCase()
    const isGenerateLabel = /\b(re)?generate\b|\bgenerating\b/.test(labelText)
    const effectiveVariant = isGenerateLabel ? 'lime' : variant

    const shouldAutoScrollByLabel = (button: HTMLButtonElement): boolean => {
      const label = (button.textContent || '').trim().toLowerCase()
      if (!label) return false
      if (label.includes('generated')) return false
      return label.includes('generate') || label.includes('regenerate')
    }

    const scrollAppTop = () => {
      const appScroller = document.querySelector('[data-app-scroll-container="true"]') as HTMLElement | null
      if (appScroller) {
        appScroller.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      const clickedButton = event.currentTarget
      const shouldScroll = scrollToTopOnClick ?? shouldAutoScrollByLabel(clickedButton)
      if (!shouldScroll) return
      requestAnimationFrame(scrollAppTop)
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-0 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[effectiveVariant]} ${sizeClasses[size]} ${className}`}
        onClick={handleClick}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  },
)
