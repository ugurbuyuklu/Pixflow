import { useState } from 'react'
import { assetUrl } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'
import { Button } from '../ui/Button'
import { StudioErrorAlert } from './StudioErrorAlert'
import { TalkingAvatarPage } from './TalkingAvatarPage'
import { ReactionVideoPage } from './ReactionVideoPage'

export default function AvatarStudioPage() {
  const { studioMode, setStudioMode, error, reactionError } = useAvatarStore()
  const [fullSizeAvatarUrl, setFullSizeAvatarUrl] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-4">
        <Button
          variant={studioMode === 'talking' ? 'primary' : 'ghost-muted'}
          size="md"
          onClick={() => setStudioMode('talking')}
        >
          Talking Avatar
        </Button>
        <Button
          variant={studioMode === 'reaction' ? 'primary' : 'ghost-muted'}
          size="md"
          onClick={() => setStudioMode('reaction')}
        >
          Reaction Video
        </Button>
      </div>

      {/* Error Displays */}
      {error && (
        <StudioErrorAlert
          error={error}
          onDismiss={() => useAvatarStore.setState({ error: null })}
        />
      )}
      {reactionError && (
        <StudioErrorAlert
          error={reactionError}
          onDismiss={() => useAvatarStore.setState({ reactionError: null })}
        />
      )}

      {/* Page Rendering */}
      {studioMode === 'talking' ? (
        <TalkingAvatarPage
          fullSizeAvatarUrl={fullSizeAvatarUrl}
          setFullSizeAvatarUrl={setFullSizeAvatarUrl}
        />
      ) : (
        <ReactionVideoPage
          fullSizeAvatarUrl={fullSizeAvatarUrl}
          setFullSizeAvatarUrl={setFullSizeAvatarUrl}
        />
      )}

      {/* Full-size Avatar Modal (shared) */}
      {fullSizeAvatarUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setFullSizeAvatarUrl(null)}
        >
          <img
            src={assetUrl(fullSizeAvatarUrl)}
            alt="Full size avatar"
            className="max-h-[90vh] max-w-[90vw]"
          />
        </div>
      )}
    </div>
  )
}
