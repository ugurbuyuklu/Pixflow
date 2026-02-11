import { AlertTriangle, Download, Loader2, RefreshCw, Video, X } from 'lucide-react'
import { assetUrl } from '../../lib/api'
import { downloadVideo } from '../../lib/download'
import type { ReactionType } from '../../types'
import { REACTION_DEFINITIONS, useAvatarStore } from '../../stores/avatarStore'
import { Button } from '../ui/Button'
import { StepHeader } from '../asset-monster/StepHeader'
import { AvatarSelectionCard } from './shared/AvatarSelectionCard'

interface ReactionVideoPageProps {
  fullSizeAvatarUrl: string | null
  setFullSizeAvatarUrl: (url: string | null) => void
}

export function ReactionVideoPage({ fullSizeAvatarUrl, setFullSizeAvatarUrl }: ReactionVideoPageProps) {
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

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* LEFT COLUMN: Avatar Selection */}
      <div className="space-y-6">
        <AvatarSelectionCard stepNumber={1} showGenerateOptions={false} />

        {/* Selected Avatar Display */}
        {(selectedAvatar || generatedUrls.length > 0) && (
          <div className="bg-surface-50 rounded-lg p-4">
            <p className="text-sm text-surface-400 mb-3">Selected Avatar:</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="w-16 h-24 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() =>
                  setFullSizeAvatarUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')
                }
              >
                <img
                  src={assetUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
                  alt="Selected avatar"
                  className="w-full h-full object-cover"
                />
              </button>
              <div>
                <p className="font-medium">
                  {generatedUrls.length > 0
                    ? `Generated Avatar ${selectedGeneratedIndex + 1}/${generatedUrls.length}`
                    : selectedAvatar?.name}
                </p>
                <p className="text-xs text-surface-400">Click image to view full size</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Reaction Workflow */}
      <div className="space-y-6">
        {/* Step 2: Choose Reaction */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Choose Reaction" />

          <div className="grid grid-cols-5 gap-2">
            {(Object.entries(REACTION_DEFINITIONS) as [ReactionType, typeof REACTION_DEFINITIONS[ReactionType]][]).map(
              ([reaction, { label, emoji }]) => (
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
              ),
            )}
          </div>
        </div>

        {/* Step 3: Video Settings */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={3} title="Video Settings" />

          <div className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-surface-500 mb-2">Aspect Ratio</span>
              <div className="flex gap-2">
                {(['9:16', '16:9', '1:1'] as const).map((ar) => (
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
          </div>
        </div>

        {/* Step 4: Generate */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={4} title="Generate" />

          <div className="space-y-4">
            {reactionGenerating ? (
              /* Generating State with Thumbnail */
              <div className="space-y-4 flex flex-col items-center">
                <div className="relative w-1/2">
                  <img
                    src={assetUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
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
                  onClick={cancelReactionVideo}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              /* Ready to Generate */
              <>
                <Button
                  variant="success"
                  size="lg"
                  icon={<Video className="w-5 h-5" />}
                  onClick={generateReactionVideo}
                  disabled={(!selectedAvatar && generatedUrls.length === 0) || !selectedReaction}
                  className="w-full"
                >
                  Generate Reaction Video
                </Button>
                {((!selectedAvatar && generatedUrls.length === 0) || !selectedReaction) && (
                  <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {!selectedAvatar && generatedUrls.length === 0
                      ? 'Select an avatar first (Step 1)'
                      : 'Choose a reaction (Step 2)'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Step 5: Output */}
        {reactionVideoUrl && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={5} title="Output" />

            <div className="space-y-4 flex flex-col items-center">
              {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
              <video controls autoPlay loop src={assetUrl(reactionVideoUrl)} className="w-1/2 rounded-lg" />

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
                  onClick={() => downloadVideo(assetUrl(reactionVideoUrl), `reaction-${selectedReaction}.mp4`)}
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
          </div>
        )}
      </div>
    </div>
  )
}
