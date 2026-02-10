import { CheckCircle, Loader2 } from 'lucide-react'
import { assetUrl } from '../../lib/api'

interface AvatarGenerationProgressProps {
  generating: boolean
  generationProgress: number
  avatarCount: number
  generatedUrls: string[]
}

export function AvatarGenerationProgress({
  generating,
  generationProgress,
  avatarCount,
  generatedUrls,
}: AvatarGenerationProgressProps) {
  if (!generating) return null

  return (
    <div className="p-3 bg-surface-100 border border-surface-300 rounded-lg space-y-3">
      <p className="text-surface-400 text-sm flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Generating {generationProgress}/{avatarCount}...
      </p>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: avatarCount }).map((_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            key={index}
            className="relative rounded-lg overflow-hidden bg-surface-200 aspect-[9/16] flex items-center justify-center"
          >
            {index < generationProgress ? (
              generatedUrls[index] ? (
                <img
                  src={assetUrl(generatedUrls[index])}
                  alt={`Generated avatar ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <CheckCircle className="w-8 h-8 text-success" />
              )
            ) : index === generationProgress ? (
              <>
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-brand/20 to-transparent"
                    style={{ animation: 'shimmer 1.5s infinite' }}
                  />
                </div>
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
              </>
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-surface-300" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
