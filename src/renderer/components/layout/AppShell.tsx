import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useAuthStore } from '../../stores/authStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useProductStore } from '../../stores/productStore'
import { useThemeStore } from '../../stores/themeStore'
// biome-ignore lint/correctness/noUnusedImports: re-enable with auth gate before release
import { LoginPage } from '../auth/LoginPage'
import { FeedbackWidget } from '../feedback/FeedbackWidget'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Skeleton } from '../ui/Skeleton'
import { AvatarPreviewOverlay } from './AvatarPreviewOverlay'
import { ImagePreviewOverlay } from './ImagePreviewOverlay'
import { PageTransition } from './PageTransition'
import { ProductSelector } from './ProductSelector'
import { TopNav } from './TopNav'

const PromptFactoryPage = lazy(() => import('../prompt-factory/PromptFactoryPage'))
const AssetMonsterPage = lazy(() => import('../asset-monster/AssetMonsterPage'))
const Img2VideoQueuePage = lazy(() => import('../img2video/Img2VideoQueuePage'))
const AvatarStudioPage = lazy(() => import('../avatar-studio/AvatarStudioPage'))
const MachinePage = lazy(() => import('../machine/MachinePage'))
const LibraryPage = lazy(() => import('../library/LibraryPage'))

const PAGES = {
  prompts: PromptFactoryPage,
  generate: AssetMonsterPage,
  img2video: Img2VideoQueuePage,
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

  // TODO: re-enable auth gate before release
  // if (!isAuthenticated) return <LoginPage />

  const ActivePage = PAGES[activeTab]

  return (
    <div className="min-h-screen bg-surface-0 text-surface-900">
      <div className="sticky top-0 z-40 bg-surface-0">
        <TopNav />
        <ProductSelector />
      </div>
      <div className="max-w-6xl mx-auto p-8">
        <PageTransition pageKey={activeTab}>
          <ErrorBoundary key={activeTab} fallbackTitle="This tab failed to load">
            <Suspense fallback={<PageSkeleton />}>
              <ActivePage />
            </Suspense>
          </ErrorBoundary>
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
