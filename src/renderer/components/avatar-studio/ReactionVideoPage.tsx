import { AlertTriangle, Download, Loader2, RefreshCw, Video, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useRef } from 'react'
import { assetUrl } from '../../lib/api'
import { downloadVideo } from '../../lib/download'
import { REACTION_DEFINITIONS, useAvatarStore } from '../../stores/avatarStore'
import { createOutputHistoryId, useOutputHistoryStore } from '../../stores/outputHistoryStore'
import type { ReactionType } from '../../types'
import { StepHeader } from '../asset-monster/StepHeader'
import { PreviousGenerationsPanel } from '../shared/PreviousGenerationsPanel'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { AvatarSelectionCard } from './shared/AvatarSelectionCard'

interface ReactionVideoPageProps {
  fullSizeAvatarUrl: string | null
  setFullSizeAvatarUrl: (url: string | null) => void
  modeTabs?: ReactNode
}

export function ReactionVideoPage({
  fullSizeAvatarUrl: _fullSizeAvatarUrl,
  setFullSizeAvatarUrl: _setFullSizeAvatarUrl,
  modeTabs,
}: ReactionVideoPageProps) {
  const activeReactionHistoryIdRef = useRef<string | null>(null)
  const {
    selectedAvatar,
    generatedUrls,
    selectedGeneratedIndex,
    selectedReaction,
    reactionDuration,
    reactionAspectRatio,
    reactionGenerating,
    reactionVideoUrl,
    setSelectedReaction,
    setReactionDuration,
    setReactionAspectRatio,
    generateReactionVideo,
    cancelReactionVideo,
  } = useAvatarStore()
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => outputHistoryEntries.filter((entry) => entry.category === 'avatars_reaction'),
    [outputHistoryEntries],
  )
  const activeAvatarUrl = (selectedAvatar?.url || generatedUrls[selectedGeneratedIndex] || '').trim()
  const hasSelectedAvatar = Boolean(activeAvatarUrl)

  const handleGenerateReaction = async () => {
    const historyId = createOutputHistoryId('reaction')
    activeReactionHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'avatars_reaction',
      title: selectedReaction ? `Reaction: ${REACTION_DEFINITIONS[selectedReaction].label}` : 'Reaction Video',
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Generating reaction video...',
      artifacts: [],
    })

    await generateReactionVideo()
    if (activeReactionHistoryIdRef.current !== historyId) return

    const state = useAvatarStore.getState()
    if (state.reactionVideoUrl) {
      patchHistory(historyId, {
        status: 'completed',
        message: `${state.reactionAspectRatio} · ${state.reactionDuration}s`,
        artifacts: [
          {
            id: `${historyId}_video`,
            label: state.selectedReaction ? REACTION_DEFINITIONS[state.selectedReaction].label : 'Reaction',
            type: 'video',
            url: state.reactionVideoUrl,
          },
        ],
      })
    } else {
      patchHistory(historyId, {
        status: 'failed',
        message: state.reactionError?.message || 'Failed to generate reaction video',
      })
    }

    activeReactionHistoryIdRef.current = null
  }

  const handleCancelReaction = () => {
    const activeId = activeReactionHistoryIdRef.current
    if (activeId) {
      removeHistory(activeId)
      activeReactionHistoryIdRef.current = null
    }
    cancelReactionVideo()
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6 xl:col-start-1 xl:col-end-2">
        {modeTabs && (
          <div className="bg-surface-50 rounded-lg p-4 space-y-4">
            <StepHeader stepNumber={1} title="Mode" />
            {modeTabs}
          </div>
        )}
        <AvatarSelectionCard stepNumber={2} showGenerateOptions={false} />

        {/* Step 3: Choose Reaction */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={3} title="Choose Reaction" />

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {(
              Object.entries(REACTION_DEFINITIONS) as [ReactionType, (typeof REACTION_DEFINITIONS)[ReactionType]][]
            ).map(([reaction, { label, emoji }]) => (
              <button
                key={reaction}
                type="button"
                onClick={() => setSelectedReaction(reaction)}
                className={`p-3 rounded-lg border-2 transition-all hover:scale-105 flex flex-col items-center gap-2 ${
                  selectedReaction === reaction
                    ? 'border-brand bg-brand/10'
                    : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-xs font-medium text-surface-600">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: Video Settings */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={4} title="Video Settings" />

          <div className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-surface-500 mb-2">Aspect Ratio</span>
              <div className="flex gap-2">
                {(['9:16', '4:5', '1:1'] as const).map((ar) => (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => setReactionAspectRatio(ar)}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      reactionAspectRatio === ar
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-200 text-surface-500 hover:bg-surface-300'
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-surface-500 mb-2">Duration</span>
              <div className="flex gap-2">
                {(['5', '10'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setReactionDuration(d)}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      reactionDuration === d
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-200 text-surface-500 hover:bg-surface-300'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <div className="pt-2">
              {reactionGenerating ? (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="relative w-1/2">
                    <img
                      src={assetUrl(activeAvatarUrl)}
                      alt="Generating reaction"
                      className="w-full aspect-[9/16] object-cover rounded-lg opacity-50"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-12 h-12 animate-spin text-brand" />
                      <p className="text-sm font-medium text-surface-900">
                        Generating {selectedReaction && REACTION_DEFINITIONS[selectedReaction].emoji} reaction...
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="md"
                    icon={<X className="w-4 h-4" />}
                    onClick={handleCancelReaction}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="lg"
                    icon={<Video className="w-5 h-5" />}
                    onClick={handleGenerateReaction}
                    disabled={!hasSelectedAvatar || !selectedReaction}
                    className="w-full"
                  >
                    Generate Reaction Video
                  </Button>
                  {(!hasSelectedAvatar || !selectedReaction) && (
                    <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {!hasSelectedAvatar ? 'Select an avatar first (Step 1)' : 'Choose a reaction (Step 2)'}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUT */}
      <div className="space-y-6 xl:col-start-2 xl:col-end-3">
        {(reactionVideoUrl || reactionGenerating) && (
          <div className="bg-surface-50 rounded-lg p-4 min-h-[420px]">
            <StepHeader stepNumber={6} title="Final Outputs" />

            {reactionVideoUrl ? (
              <div className="space-y-4 flex flex-col items-center">
                {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                <video controls autoPlay loop src={assetUrl(reactionVideoUrl)} className="w-full rounded-lg" />

                <div className="flex items-center gap-2 text-sm text-surface-500">
                  <span>
                    {selectedReaction && REACTION_DEFINITIONS[selectedReaction].emoji}{' '}
                    {selectedReaction && REACTION_DEFINITIONS[selectedReaction].label}
                  </span>
                  <span className="text-surface-300">•</span>
                  <span>{reactionAspectRatio}</span>
                  <span className="text-surface-300">•</span>
                  <span>{reactionDuration}s</span>
                </div>

                <div className="flex gap-2 w-full">
                  <Button
                    variant="success"
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    onClick={() =>
                      downloadVideo(assetUrl(reactionVideoUrl), `reaction-${selectedReaction || 'video'}.mp4`)
                    }
                    className="flex-1"
                  >
                    Download Video
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    icon={<RefreshCw className="w-4 h-4" />}
                    onClick={() => {
                      useAvatarStore.setState({ reactionVideoUrl: null, selectedReaction: null })
                    }}
                  >
                    Generate Another
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Generating reaction video..."
                description="Output will appear here when ready."
                icon={<Loader2 className="w-7 h-7 animate-spin text-brand" />}
              />
            )}
          </div>
        )}
        <PreviousGenerationsPanel
          entries={historyEntries}
          onDeleteEntry={removeHistory}
          onClear={() => removeManyHistory(historyEntries.map((entry) => entry.id))}
        />
      </div>
    </div>
  )
}
