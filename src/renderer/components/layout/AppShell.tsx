import {
  BarChart3,
  BookOpen,
  Film,
  Layers,
  LayoutGrid,
  Loader2,
  MessageSquareText,
  TimerReset,
  Video,
  Wand2,
  Zap,
} from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { reportFrontendPerf } from '../../lib/frontendTelemetry'
import { useAuthStore } from '../../stores/authStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useProductStore } from '../../stores/productStore'
import { useThemeStore } from '../../stores/themeStore'
import { FeedbackWidget } from '../feedback/FeedbackWidget'
import { JobMonitorWidget } from '../shared/JobMonitorWidget'
import { brandedName } from '../ui/BrandedName'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Skeleton } from '../ui/Skeleton'
import { AvatarPreviewOverlay } from './AvatarPreviewOverlay'
import { ImagePreviewOverlay } from './ImagePreviewOverlay'
import { PageTransition } from './PageTransition'
import { SideNav } from './SideNav'

const PromptFactoryPage = lazy(() => import('../prompt-factory/PromptFactoryPage'))
const AssetMonsterPage = lazy(() => import('../asset-monster/AssetMonsterPage'))
const LifetimePage = lazy(() => import('../lifetime/LifetimePage'))
const Img2VideoQueuePage = lazy(() => import('../img2video/Img2VideoQueuePage'))
const AvatarStudioPage = lazy(() => import('../avatar-studio/AvatarStudioPage'))
const CaptionsPage = lazy(() => import('../captions/CaptionsPage'))
const MachinePage = lazy(() => import('../machine/MachinePage'))
const LibraryPage = lazy(() => import('../library/LibraryPage'))
const CompetitorReportPage = lazy(() => import('../competitor-report/CompetitorReportPage'))
const HomePage = lazy(() => import('../home/HomePage'))

const PAGES = {
  home: HomePage,
  prompts: PromptFactoryPage,
  generate: AssetMonsterPage,
  lifetime: LifetimePage,
  img2video: Img2VideoQueuePage,
  avatars: AvatarStudioPage,
  captions: CaptionsPage,
  machine: MachinePage,
  history: LibraryPage,
  competitors: CompetitorReportPage,
} as const

const PAGE_ICONS: Record<keyof typeof PAGES, typeof Wand2> = {
  home: LayoutGrid,
  prompts: Wand2,
  generate: Layers,
  lifetime: TimerReset,
  img2video: Film,
  avatars: Video,
  captions: MessageSquareText,
  machine: Zap,
  history: BookOpen,
  competitors: BarChart3,
}

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
  const { loading: authLoading, init: initAuth } = useAuthStore()
  const initTheme = useThemeStore((s) => s.init)
  const loadProducts = useProductStore((s) => s.loadProducts)
  const loadNotifications = useNotificationStore((s) => s.load)
  const activeTab = useNavigationStore((s) => s.activeTab)
  const consumePendingNavigationPerf = useNavigationStore((s) => s.consumePendingNavigationPerf)

  useKeyboardShortcuts()

  useEffect(() => {
    initAuth()
    initTheme()
  }, [initAuth, initTheme])

  useEffect(() => {
    if (authLoading) return
    loadProducts()
    loadNotifications()
  }, [authLoading, loadProducts, loadNotifications])

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab is the intentional trigger — scroll to top on every tab change
  useEffect(() => {
    const scroller = document.querySelector('[data-app-scroll-container="true"]') as HTMLElement | null
    if (scroller) scroller.scrollTop = 0
  }, [activeTab])

  useEffect(() => {
    const pending = consumePendingNavigationPerf()
    if (!pending || pending.toTab !== activeTab) return

    const nowMs = globalThis.performance?.now?.() ?? Date.now()
    const tabSwitchDuration = Math.max(0, nowMs - pending.startedAtMs)
    void reportFrontendPerf({
      metric: 'tab_switch',
      tab: pending.toTab,
      fromTab: pending.fromTab,
      durationMs: tabSwitchDuration,
    })

    let cancelled = false
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return
        const renderNow = globalThis.performance?.now?.() ?? Date.now()
        const pageRenderDuration = Math.max(0, renderNow - pending.startedAtMs)
        void reportFrontendPerf({
          metric: 'page_render',
          tab: pending.toTab,
          fromTab: pending.fromTab,
          durationMs: pageRenderDuration,
        })
      })
      if (cancelled) cancelAnimationFrame(raf2)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
    }
  }, [activeTab, consumePendingNavigationPerf])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    )
  }

  const ActivePage = PAGES[activeTab]
  const PageIcon = PAGE_ICONS[activeTab]

  return (
    <div className="h-screen overflow-hidden bg-surface-0 text-surface-900 flex">
      <SideNav />
      <div className="flex-1 flex flex-col">
        <div className="sticky top-0 z-30 border-b border-surface-100 bg-surface-0 drag-region">
          <div className="w-full max-w-6xl px-4 sm:px-6 xl:px-8 h-[84px] flex items-baseline pb-[12px]">
            <h1 className="text-[2.06rem] font-black text-surface-900 flex items-center gap-3 leading-none translate-y-[36px]">
              <PageIcon className="w-8 h-8 text-brand-500 inline-block align-middle" />
              <span className="leading-none">{brandedName(activeTab)}</span>
            </h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" data-app-scroll-container="true">
          <div className="w-full max-w-6xl p-4 sm:p-6 xl:p-8">
            <PageTransition pageKey={activeTab}>
              <ErrorBoundary key={activeTab} fallbackTitle="This tab failed to load">
                <Suspense fallback={<PageSkeleton />}>
                  <ActivePage />
                </Suspense>
              </ErrorBoundary>
            </PageTransition>
          </div>
        </div>
      </div>
      <ImagePreviewOverlay />
      <AvatarPreviewOverlay />
      <FeedbackWidget />
      <JobMonitorWidget />
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
