import { lazy, Suspense, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { useProductStore } from '../../stores/productStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { LoginPage } from '../auth/LoginPage'
import { TopNav } from './TopNav'
import { ProductSelector } from './ProductSelector'
import { PageTransition } from './PageTransition'
import { ImagePreviewOverlay } from './ImagePreviewOverlay'
import { AvatarPreviewOverlay } from './AvatarPreviewOverlay'
import { FeedbackWidget } from '../feedback/FeedbackWidget'
import { Skeleton } from '../ui/Skeleton'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

const PromptFactoryPage = lazy(() => import('../prompt-factory/PromptFactoryPage'))
const AssetMonsterPage = lazy(() => import('../asset-monster/AssetMonsterPage').then((m) => ({ default: m.AssetMonsterPage })))
const AvatarStudioPage = lazy(() => import('../avatar-studio/AvatarStudioPage'))
const MachinePage = lazy(() => import('../machine/MachinePage'))
const LibraryPage = lazy(() => import('../library/LibraryPage'))

const PAGES = {
  prompts: PromptFactoryPage,
  generate: AssetMonsterPage,
  avatars: AvatarStudioPage,
  machine: MachinePage,
  history: LibraryPage,
} as const

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton width="40%" height={32} />
      <Skeleton height={200} />
      <Skeleton height={120} />
    </div>
  )
}

export function AppShell() {
  const { isAuthenticated, loading: authLoading, init: initAuth } = useAuthStore()
  const initTheme = useThemeStore((s) => s.init)
  const loadProducts = useProductStore((s) => s.loadProducts)
  const loadNotifications = useNotificationStore((s) => s.load)
  const activeTab = useNavigationStore((s) => s.activeTab)

  useKeyboardShortcuts()

  useEffect(() => {
    initAuth()
    initTheme()
  }, [initAuth, initTheme])

  useEffect(() => {
    if (isAuthenticated) {
      loadProducts()
      loadNotifications()
    }
  }, [isAuthenticated, loadProducts, loadNotifications])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!isAuthenticated) return <LoginPage />

  const ActivePage = PAGES[activeTab]

  return (
    <div className="min-h-screen bg-surface-0 text-surface-900">
      <TopNav />
      <ProductSelector />
      <div className="max-w-6xl mx-auto p-8">
        <PageTransition pageKey={activeTab}>
          <Suspense fallback={<PageSkeleton />}>
            <ActivePage />
          </Suspense>
        </PageTransition>
      </div>
      <ImagePreviewOverlay />
      <AvatarPreviewOverlay />
      <FeedbackWidget />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--surface-50)',
            color: 'var(--surface-900)',
            border: '1px solid var(--surface-100)',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
          },
        }}
      />
    </div>
  )
}
