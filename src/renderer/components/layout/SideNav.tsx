import {
  BookOpen,
  Film,
  Layers,
  Loader2,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  Sun,
  TimerReset,
  Video,
  Wand2,
  Zap,
} from 'lucide-react'
import { useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useMachineStore } from '../../stores/machineStore'
import { type TabId, useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import { useThemeStore } from '../../stores/themeStore'
import { Badge } from '../ui/Badge'
import { brandedName, brandedPlainText } from '../ui/BrandedName'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

const SIDEBAR_ITEMS: { id: TabId; icon: typeof Wand2 }[] = [
  { id: 'prompts', icon: Wand2 },
  { id: 'generate', icon: Layers },
  { id: 'img2video', icon: Film },
  { id: 'avatars', icon: Video },
  { id: 'captions', icon: MessageSquareText },
  { id: 'machine', icon: Zap },
  { id: 'lifetime', icon: TimerReset },
  { id: 'history', icon: BookOpen },
]

const LG_BREAKPOINT = '(min-width: 1024px)'

export function SideNav() {
  const { activeTab, navigate, sidebarCollapsed, toggleSidebarCollapsed, setSidebarCollapsed } = useNavigationStore()
  const promptCount = usePromptStore((s) => s.prompts.length)
  const machineStep = useMachineStore((s) => s.step)
  const favoritesCount = useHistoryStore((s) => s.favorites.length)
  const { mode, toggleMode } = useThemeStore()
  const userName = useAuthStore((s) => s.user?.name || 'User')

  useEffect(() => {
    const mql = window.matchMedia(LG_BREAKPOINT)
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (useNavigationStore.getState().sidebarManuallyToggled) return
      setSidebarCollapsed(!e.matches)
    }
    handleChange(mql)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [setSidebarCollapsed])

  const items = SIDEBAR_ITEMS.map((item) => {
    if (item.id === 'generate' && promptCount > 0) {
      return { ...item, badge: <Badge>{promptCount}</Badge> }
    }
    if (item.id === 'machine' && machineStep !== 'idle' && machineStep !== 'done' && machineStep !== 'error') {
      return { ...item, badge: <Loader2 className="w-3 h-3 animate-spin text-warning" /> }
    }
    if (item.id === 'history' && favoritesCount > 0) {
      return {
        ...item,
        badge: (
          <Badge variant="brand">
            <Star className="w-3 h-3 mr-0.5" />
            {favoritesCount}
          </Badge>
        ),
      }
    }
    return item
  })

  return (
    <aside
      className={`flex h-screen flex-col border-r border-surface-100 bg-surface-0 text-surface-900 overflow-hidden transition-all duration-200 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div
        className={`relative flex h-[84px] items-baseline border-b border-surface-100 pb-[12px] font-semibold drag-region ${
          sidebarCollapsed ? 'justify-center' : 'justify-between gap-3 pl-5 pr-5'
        }`}
      >
        <button
          type="button"
          onClick={() => navigate('home')}
          className={`flex items-baseline leading-none translate-y-[36px] ${
            sidebarCollapsed ? 'text-3xl' : 'text-3xl gap-2'
          }`}
          title="Home"
        >
          <span className="text-brand-400 inline-block align-baseline text-3xl">⚡</span>
          {!sidebarCollapsed && (
            <span className="leading-none text-3xl">
              <span className="text-brand-500 font-black">Pix</span>
              <span className="italic font-normal text-white">flow</span>
            </span>
          )}
        </button>
        {!sidebarCollapsed && (
          <span className="text-surface-400 text-xs uppercase leading-none translate-y-[36px]">beta</span>
        )}
        <button
          type="button"
          onClick={() => navigate('home')}
          className="absolute inset-0 no-drag z-10 cursor-pointer"
          aria-label="Go to Home"
          title="Home"
        />
      </div>
      <nav className={`flex-1 py-4 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-1'}`}>
        {items.map((item) => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              title={brandedPlainText(item.id)}
              className={`relative flex items-center w-full rounded-lg py-3 text-base font-black transition ${
                sidebarCollapsed ? 'justify-center px-2' : 'justify-between gap-3 px-4'
              } ${
                isActive
                  ? 'bg-brand-500/10 text-surface-900 border border-transparent shadow-sm'
                  : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
              }`}
            >
              <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
                <item.icon className={`w-5 h-5 ${isActive ? 'text-brand-500' : ''}`} />
                {!sidebarCollapsed && <span>{brandedName(item.id)}</span>}
              </div>
              {!sidebarCollapsed && item.badge && <span className="flex items-center">{item.badge}</span>}
              {sidebarCollapsed && item.badge && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
              )}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-surface-100 py-3 space-y-2 px-4">
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center text-surface-500 hover:text-surface-900 transition w-full"
        >
          <span className="w-8 h-8 inline-flex items-center justify-center">
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </span>
          <span className="sr-only">Toggle sidebar</span>
        </button>
        <div className="flex items-center text-surface-500 w-full">
          <NotificationBell compact buttonClassName="w-8 h-8 p-0" />
        </div>
        <button
          type="button"
          onClick={toggleMode}
          title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
          className="flex items-center text-surface-500 hover:text-surface-900 transition w-full"
        >
          <span className="w-8 h-8 inline-flex items-center justify-center">
            {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </span>
          <span className="sr-only">Toggle theme</span>
        </button>
        <div className="grid grid-cols-[32px_1fr] items-center gap-2 text-surface-500 w-full">
          <UserMenu compact buttonClassName="w-8 h-8 p-0" />
          {!sidebarCollapsed && <span className="text-sm font-medium">{userName}</span>}
        </div>
      </div>
    </aside>
  )
}
