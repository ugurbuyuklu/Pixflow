import { useState } from 'react'
import { assetUrl } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { ReactionVideoPage } from './ReactionVideoPage'
import { StudioErrorAlert } from './StudioErrorAlert'
import { TalkingAvatarPage } from './TalkingAvatarPage'

export default function AvatarStudioPage() {
  const { studioMode, setStudioMode, error, reactionError } = useAvatarStore()
  const [fullSizeAvatarUrl, setFullSizeAvatarUrl] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <SegmentedTabs
        ariaLabel="Avatar Studio mode"
        value={studioMode}
        onChange={setStudioMode}
        items={[
          { id: 'talking', label: 'Talking Avatar' },
          { id: 'reaction', label: 'Reaction Video' },
        ]}
        className="max-w-md"
      />

      {/* Error Displays */}
      {error && <StudioErrorAlert error={error} onDismiss={() => useAvatarStore.setState({ error: null })} />}
      {reactionError && (
        <StudioErrorAlert error={reactionError} onDismiss={() => useAvatarStore.setState({ reactionError: null })} />
      )}

      {/* Page Rendering */}
      {studioMode === 'talking' ? (
        <TalkingAvatarPage fullSizeAvatarUrl={fullSizeAvatarUrl} setFullSizeAvatarUrl={setFullSizeAvatarUrl} />
      ) : (
        <ReactionVideoPage fullSizeAvatarUrl={fullSizeAvatarUrl} setFullSizeAvatarUrl={setFullSizeAvatarUrl} />
      )}

      {/* Full-size Avatar Modal (shared) */}
      {fullSizeAvatarUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <button
            type="button"
            aria-label="Close full size avatar"
            className="absolute inset-0"
            onClick={() => setFullSizeAvatarUrl(null)}
          />
          <img
            src={assetUrl(fullSizeAvatarUrl)}
            alt="Full size avatar"
            className="max-h-[90vh] max-w-[90vw] relative z-10"
          />
        </div>
      )}
    </div>
  )
}
