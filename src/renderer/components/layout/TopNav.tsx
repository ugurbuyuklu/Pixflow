import { BookOpen, Film, Layers, Loader2, Moon, Star, Sun, Video, Wand2, Zap } from 'lucide-react'
import { useHistoryStore } from '../../stores/historyStore'
import { useMachineStore } from '../../stores/machineStore'
import { type TabId, useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import { useThemeStore } from '../../stores/themeStore'
import { Badge } from '../ui/Badge'
import { PrimaryTabBar } from '../ui/navigation/PrimaryTabBar'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

const TABS: { id: TabId; label: string; icon: typeof Wand2 }[] = [
  { id: 'prompts', label: 'Prompt Factory', icon: Wand2 },
  { id: 'generate', label: 'Asset Monster', icon: Layers },
  { id: 'img2video', label: 'Img2 Engine', icon: Film },
  { id: 'avatars', label: 'Avatar Studio', icon: Video },
  { id: 'machine', label: 'The Machine', icon: Zap },
  { id: 'history', label: 'Library', icon: BookOpen },
]

export function TopNav() {
  const { activeTab, navigate } = useNavigationStore()
  const promptCount = usePromptStore((s) => s.prompts.length)
  const machineStep = useMachineStore((s) => s.step)
  const favoritesCount = useHistoryStore((s) => s.favorites.length)
  const { mode, toggleMode } = useThemeStore()
  const tabsWithBadges = TABS.map((tab) => {
    if (tab.id === 'generate' && promptCount > 0) {
      return { ...tab, badge: <Badge>{promptCount}</Badge> }
    }
    if (tab.id === 'machine' && machineStep !== 'idle' && machineStep !== 'done' && machineStep !== 'error') {
      return { ...tab, badge: <Loader2 className="w-3 h-3 animate-spin text-warning" /> }
    }
    if (tab.id === 'history' && favoritesCount > 0) {
      return {
        ...tab,
        badge: (
          <Badge variant="brand">
            <Star className="w-3 h-3 mr-0.5" />
            {favoritesCount}
          </Badge>
        ),
      }
    }
    return tab
  })

  return (
    <>
      <div className="border-b border-surface-100 drag-region">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-3 no-drag">
            <span className="text-brand-400">⚡</span>
            Pixflow
          </h1>
          <div className="flex items-center gap-2 no-drag">
            <NotificationBell />
            <button
              type="button"
              onClick={toggleMode}
              className="p-2 text-surface-400 hover:text-surface-900 transition-colors rounded-lg hover:bg-surface-100"
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <UserMenu />
          </div>
        </div>
      </div>

      <div className="border-b border-surface-100">
        <div className="max-w-6xl mx-auto px-8">
          <PrimaryTabBar
            ariaLabel="Primary category navigation"
            value={activeTab}
            onChange={navigate}
            items={tabsWithBadges.map((tab) => ({
              id: tab.id,
              label: tab.label,
              icon: <tab.icon className="w-4 h-4" />,
              badge: tab.badge,
            }))}
          />
        </div>
      </div>
    </>
  )
}
