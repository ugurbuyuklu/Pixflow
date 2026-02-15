import { Film, Layers, LayoutGrid, MessageSquareText, TimerReset, Video, Wand2, Zap } from 'lucide-react'
import { useNavigationStore } from '../../stores/navigationStore'
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
]

export default function HomePage() {
  const navigate = useNavigationStore((s) => s.navigate)

  return (
    <div className="space-y-6">
      <div className="bg-surface-50 rounded-xl border border-surface-200/50 p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-brand-500" />
        </div>
        <div>
          <h2 className="text-xl font-black text-surface-900">
            Welcome to <BrandedName prefix="Pix" suffix="flow" />
          </h2>
          <p className="text-sm text-surface-500">
            <BrandedName prefix="Pix" suffix="flow" /> helps content creators, social media teams, and marketing artists
            ship high‑quality assets faster, with less manual work and more consistent results.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CATEGORIES.map((category, index) => {
          const Icon = category.icon
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => navigate(category.id)}
              className="home-card-enter text-left bg-surface-50 rounded-xl border border-surface-200/50 p-5 hover:border-brand-500/40 hover:shadow-sm transition cursor-pointer"
              style={{ animationDelay: `${240 + index * 160}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-black text-surface-900">{brandedName(category.id)}</h3>
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
