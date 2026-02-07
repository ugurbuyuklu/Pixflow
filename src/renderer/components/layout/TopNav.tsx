import { Wand2, Layers, Video, Zap, Star, Loader2, BookOpen, Sun, Moon } from 'lucide-react'
import { useNavigationStore, type TabId } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import { useMachineStore } from '../../stores/machineStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useThemeStore } from '../../stores/themeStore'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'
import { Badge } from '../ui/Badge'

const TABS: { id: TabId; label: string; icon: typeof Wand2 }[] = [
  { id: 'prompts', label: 'Prompt Factory', icon: Wand2 },
  { id: 'generate', label: 'Asset Monster', icon: Layers },
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

  return (
    <>
      <div className="border-b border-surface-100 app-drag-region">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-3 app-no-drag">
            <span className="text-brand-400">⚡</span>
            Pixflow
          </h1>
          <div className="flex items-center gap-2 app-no-drag">
            <NotificationBell />
            <button
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
          <div className="flex gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                  activeTab === id ? 'text-brand-400' : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {id === 'generate' && promptCount > 0 && (
                  <Badge>{promptCount}</Badge>
                )}
                {id === 'machine' && machineStep !== 'idle' && machineStep !== 'done' && machineStep !== 'error' && (
                  <Loader2 className="w-3 h-3 animate-spin text-warning" />
                )}
                {id === 'history' && favoritesCount > 0 && (
                  <Badge variant="brand">
                    <Star className="w-3 h-3 mr-0.5" />
                    {favoritesCount}
                  </Badge>
                )}
                {activeTab === id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-400" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
