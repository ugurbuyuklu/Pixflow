import { BarChart3, Film, Layers, LayoutGrid, MessageSquareText, TimerReset, Video, Wand2, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigationStore } from '../../stores/navigationStore'
import { type OutputHistoryEntry, useOutputHistoryStore } from '../../stores/outputHistoryStore'
import { BrandedName, brandedName } from '../ui/BrandedName'

const CATEGORIES = [
  {
    id: 'prompts' as const,
    icon: Wand2,
    description:
      'Generate structured, research‑augmented prompts from concepts or images. Built for consistent, production‑ready outputs.',
  },
  {
    id: 'generate' as const,
    icon: Layers,
    description:
      'Batch-generate image assets from prompts and references. Control aspect ratio, resolution, and format at scale.',
  },
  {
    id: 'img2video' as const,
    icon: Film,
    description:
      'Turn images into motion with prompt‑driven video generation. Manage queues and presets for consistent results.',
  },
  {
    id: 'avatars' as const,
    icon: Video,
    description:
      'Create talking avatars, scripts, voices, lipsync, and reactions. Designed for fast, repeatable workflows.',
  },
  {
    id: 'captions' as const,
    icon: MessageSquareText,
    description: 'Generate styled subtitles and burn them into video. Save presets for consistent visual language.',
  },
  {
    id: 'machine' as const,
    icon: Zap,
    description:
      'End‑to‑end pipeline from concept to final media. Orchestrates prompts, images, scripts, TTS, and lipsync.',
  },
  {
    id: 'lifetime' as const,
    icon: TimerReset,
    description:
      'Build an age progression timeline from a baby photo. Generate white-background age frames and transition videos end-to-end.',
  },
  {
    id: 'competitors' as const,
    icon: BarChart3,
    description:
      'Track competitor creatives from the last 7 days with a focused report. Start with Clone AI and expand to richer market signals.',
  },
]

const VISITED_KEY = 'pixflow_visited'
const BANNER_DISMISSED_KEY = 'pixflow_banner_dismissed'

function RecentJobsRow({ entries }: { entries: OutputHistoryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {entries.map((entry) => (
        <span
          key={entry.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-100 border border-surface-200 text-xs text-surface-500"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.status === 'completed' ? 'bg-success' : 'bg-danger'}`}
          />
          {entry.title}
        </span>
      ))}
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigationStore((s) => s.navigate)
  const allEntries = useOutputHistoryStore((s) => s.entries)
  const [isReturning, setIsReturning] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(BANNER_DISMISSED_KEY) === '1') {
      setDismissed(true)
      return
    }
    if (localStorage.getItem(VISITED_KEY) === '1') {
      setIsReturning(true)
    } else {
      localStorage.setItem(VISITED_KEY, '1')
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem(BANNER_DISMISSED_KEY, '1')
  }

  const recentEntries = allEntries
    .filter((e) => e.status === 'completed' || e.status === 'failed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3)

  return (
    <div className="space-y-6">
      {!dismissed && (
        <div className="bg-surface-50 rounded-xl border border-surface-200/50 p-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <LayoutGrid className="w-6 h-6 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            {isReturning ? (
              <>
                <h2 className="text-xl font-black text-surface-900">
                  Welcome back to <BrandedName prefix="Pix" suffix="flow" />
                </h2>
                {recentEntries.length > 0 ? (
                  <>
                    <p className="text-sm text-surface-500 mt-1">Here's what you've been working on:</p>
                    <RecentJobsRow entries={recentEntries} />
                  </>
                ) : (
                  <p className="text-sm text-surface-500 mt-1">Pick up where you left off — choose a module below.</p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-black text-surface-900">
                  Welcome to <BrandedName prefix="Pix" suffix="flow" />
                </h2>
                <p className="text-sm text-surface-500">
                  <BrandedName prefix="Pix" suffix="flow" /> helps content creators, social media teams, and marketing
                  artists ship high‑quality assets faster, with less manual work and more consistent results.
                </p>
              </>
            )}
          </div>
          {isReturning && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="shrink-0 text-surface-400 hover:text-surface-600 transition-colors rounded-md p-1 hover:bg-surface-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CATEGORIES.map((category, index) => {
          const Icon = category.icon
          const isDisabled = category.id === 'competitors'
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                if (isDisabled) return
                navigate(category.id)
              }}
              disabled={isDisabled}
              title={isDisabled ? `${brandedName(category.id)} (Under Development)` : brandedName(category.id)}
              className={`home-card-enter text-left bg-surface-50 rounded-xl border border-surface-200/50 p-5 transition ${
                isDisabled
                  ? 'opacity-65 cursor-not-allowed'
                  : 'hover:border-brand-500/40 hover:shadow-sm cursor-pointer'
              }`}
              style={{ animationDelay: `${240 + index * 160}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-black text-surface-900 flex items-center gap-2">
                    <span>{brandedName(category.id)}</span>
                    {isDisabled && <span className="text-xs font-bold text-surface-500">(U/D)</span>}
                  </h3>
                  <p className="text-sm text-surface-500">{category.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
