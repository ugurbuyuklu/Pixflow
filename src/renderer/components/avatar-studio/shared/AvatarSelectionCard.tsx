import { Check, Loader2, Upload, Users, Wand2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { assetUrl } from '../../../lib/api'
import type { AvatarAgeGroup, AvatarEthnicity, AvatarGender, AvatarOutfit } from '../../../stores/avatarStore'
import { useAvatarStore } from '../../../stores/avatarStore'
import { Button } from '../../ui/Button'
import { Select } from '../../ui/Select'
import { Slider } from '../../ui/Slider'
import { StepHeader } from '../../asset-monster/StepHeader'
import { AvatarGenerationProgress } from '../AvatarGenerationProgress'
import { GeneratedAvatarsGrid } from '../GeneratedAvatarsGrid'

interface AvatarSelectionCardProps {
  stepNumber: number
  subtitle?: string
  showGenerateOptions?: boolean
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const AGE_OPTIONS = [
  { value: 'young', label: 'Young' },
  { value: 'middle', label: 'Middle-aged' },
  { value: 'senior', label: 'Senior' },
]

const ETHNICITY_OPTIONS = [
  { value: 'caucasian', label: 'Caucasian' },
  { value: 'african', label: 'African' },
  { value: 'asian', label: 'Asian' },
  { value: 'hispanic', label: 'Hispanic' },
  { value: 'middle-eastern', label: 'Middle Eastern' },
]

const OUTFIT_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'business', label: 'Business' },
  { value: 'formal', label: 'Formal' },
]

export function AvatarSelectionCard({ stepNumber, subtitle, showGenerateOptions = true }: AvatarSelectionCardProps) {
  const {
    avatars,
    avatarsLoading,
    selectedAvatar,
    setSelectedAvatar,
    uploadAvatars,
    generating,
    generationProgress,
    generatedUrls,
    selectedGeneratedIndex,
    setSelectedGeneratedIndex,
    generateAvatar,
  } = useAvatarStore()

  const [mode, setMode] = useState<'gallery' | 'generate'>('gallery')
  const [gender, setGender] = useState<AvatarGender>('female')
  const [ageGroup, setAgeGroup] = useState<AvatarAgeGroup>('young')
  const [ethnicity, setEthnicity] = useState<AvatarEthnicity>('caucasian')
  const [outfit, setOutfit] = useState<AvatarOutfit>('business')
  const [avatarCount, setAvatarCount] = useState(1)

  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  const handleGenerate = async () => {
    await generateAvatar({ gender, ageGroup, ethnicity, outfit, count: avatarCount })
  }

  return (
    <div className="bg-surface-50 rounded-lg p-4">
      <StepHeader stepNumber={stepNumber} title="Select Avatar" subtitle={subtitle} />

      {/* Mode Toggle */}
      <div className="flex bg-surface-100 rounded-lg p-1 mb-4">
        <button
          type="button"
          onClick={() => setMode('gallery')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
            mode === 'gallery' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Gallery
        </button>
        <button
          type="button"
          onClick={() => avatarFileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors text-surface-400 hover:text-surface-900"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              uploadAvatars(e.target.files)
              e.target.value = ''
            }
          }}
        />
        {showGenerateOptions && (
          <button
            type="button"
            onClick={() => setMode('generate')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
              mode === 'generate' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            Generate New
          </button>
        )}
      </div>

      {mode === 'gallery' ? (
        <div>
          {avatarsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
            </div>
          ) : avatars.length === 0 ? (
            <div className="text-center py-8 text-surface-400 border-2 border-dashed border-surface-200 rounded-lg">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No avatars in gallery</p>
              <p className="text-sm mt-1">
                {showGenerateOptions ? 'Generate a new avatar or add images to ' : 'Add images to '}
                <code className="bg-surface-100 px-1 rounded">avatars/</code>
              </p>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {avatars.map((avatar) => (
                <button
                  type="button"
                  key={avatar.filename}
                  onClick={() => {
                    setSelectedAvatar(selectedAvatar?.filename === avatar.filename ? null : avatar)
                    useAvatarStore.setState({ generatedUrls: [], selectedGeneratedIndex: 0 })
                  }}
                  className={`w-20 shrink-0 aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                    selectedAvatar?.filename === avatar.filename
                      ? 'border-brand-500 ring-2 ring-brand-500/50'
                      : 'border-transparent hover:border-surface-200'
                  }`}
                >
                  <img src={assetUrl(avatar.url)} alt={avatar.name} className="w-full h-full object-cover" />
                  {selectedAvatar?.filename === avatar.filename && (
                    <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as AvatarGender)}
              options={GENDER_OPTIONS}
            />
            <Select
              label="Age Group"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value as AvatarAgeGroup)}
              options={AGE_OPTIONS}
            />
            <Select
              label="Ethnicity"
              value={ethnicity}
              onChange={(e) => setEthnicity(e.target.value as AvatarEthnicity)}
              options={ETHNICITY_OPTIONS}
            />
            <Select
              label="Outfit"
              value={outfit}
              onChange={(e) => setOutfit(e.target.value as AvatarOutfit)}
              options={OUTFIT_OPTIONS}
            />
          </div>
          <Slider
            label="Number of Avatars"
            displayValue={avatarCount}
            min={1}
            max={4}
            value={avatarCount}
            onChange={(e) => setAvatarCount(Number(e.currentTarget.value))}
          />
          <Button
            variant="primary"
            size="md"
            icon={generating ? undefined : <Wand2 className="w-4 h-4" />}
            loading={generating}
            onClick={handleGenerate}
            disabled={generating}
            className="w-full"
          >
            {generating
              ? `Generating ${generationProgress}/${avatarCount}...`
              : `Generate ${avatarCount > 1 ? `${avatarCount} Avatars` : 'Avatar'}`}
          </Button>
          <AvatarGenerationProgress
            generating={generating}
            generationProgress={generationProgress}
            avatarCount={avatarCount}
            generatedUrls={generatedUrls}
          />
          <GeneratedAvatarsGrid
            generatedUrls={generatedUrls}
            generating={generating}
            selectedIndex={selectedGeneratedIndex}
            onSelect={setSelectedGeneratedIndex}
          />
        </div>
      )}
    </div>
  )
}
