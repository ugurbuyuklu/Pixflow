import { Check, Trash2, Upload, Users, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../../lib/api'
import { notify } from '../../../lib/toast'
import type { AvatarAgeGroup, AvatarEthnicity, AvatarGender, AvatarOutfit } from '../../../stores/avatarStore'
import { useAvatarStore } from '../../../stores/avatarStore'
import { StepHeader } from '../../asset-monster/StepHeader'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { LoadingState } from '../../ui/LoadingState'
import { SegmentedTabs } from '../../ui/navigation/SegmentedTabs'
import { Select } from '../../ui/Select'
import { Slider } from '../../ui/Slider'
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
    deleteUploadedAvatar,
    generating,
    generationProgress,
    generatedUrls,
    selectedGeneratedIndex,
    setSelectedGeneratedIndex,
    generateAvatar,
    loadAvatars,
  } = useAvatarStore()

  const [mode, setMode] = useState<'gallery' | 'generate' | 'upload'>('gallery')
  const [gender, setGender] = useState<AvatarGender>('female')
  const [ageGroup, setAgeGroup] = useState<AvatarAgeGroup>('young')
  const [ethnicity, setEthnicity] = useState<AvatarEthnicity>('caucasian')
  const [outfit, setOutfit] = useState<AvatarOutfit>('business')
  const [avatarCount, setAvatarCount] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  const openUploadPicker = () => {
    const input = avatarFileInputRef.current
    if (!input) return
    input.value = ''
    const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker
    if (typeof picker === 'function') picker.call(input)
    else input.click()
  }

  useEffect(() => {
    loadAvatars()
  }, [loadAvatars])

  useEffect(() => {
    if (!showGenerateOptions && mode === 'generate') setMode('gallery')
  }, [mode, showGenerateOptions])

  const handleModeChange = (nextMode: 'gallery' | 'generate' | 'upload') => {
    setMode(nextMode)
    if (nextMode === 'upload') {
      window.setTimeout(() => openUploadPicker(), 0)
    }
  }

  const handleGenerate = async () => {
    await generateAvatar({ gender, ageGroup, ethnicity, outfit, count: avatarCount })
  }

  const modeTabs: { id: 'gallery' | 'generate' | 'upload'; label: string; icon?: JSX.Element }[] = [
    { id: 'gallery', label: 'Gallery', icon: <Users className="w-4 h-4" /> },
  ]
  if (showGenerateOptions) {
    modeTabs.push({ id: 'generate', label: 'Generate New', icon: <Wand2 className="w-4 h-4" /> })
  }
  modeTabs.push({ id: 'upload', label: 'Upload', icon: <Upload className="w-4 h-4" /> })
  const isGenerateMode = mode === 'generate' && showGenerateOptions
  const isUploadMode = mode === 'upload'
  const isUploaded = (avatar: { source?: string; url: string }) =>
    avatar.source === 'uploaded' || avatar.url.startsWith('/avatars_uploads/')
  const isCurated = (avatar: { source?: string; url: string }) =>
    avatar.source === 'curated' || avatar.url.startsWith('/avatars/')
  const isGenerated = (avatar: { source?: string; url: string }) =>
    avatar.source === 'generated' || avatar.url.startsWith('/avatars_generated/')
  const curatedAvatars = avatars.filter((avatar) => isCurated(avatar))
  const generatedAvatars = avatars.filter((avatar) => isGenerated(avatar))
  const uploadedAvatars = avatars.filter((avatar) => isUploaded(avatar))

  const handleAvatarUpload = async (files: FileList) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      await uploadAvatars(files)
      notify.success(`Uploaded ${files.length} avatar${files.length === 1 ? '' : 's'}`)
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Upload failed'
      notify.error(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-surface-50 rounded-lg p-4">
      <StepHeader stepNumber={stepNumber} title="Select Avatar" subtitle={subtitle} />

      {/* Mode Toggle */}
      <div className="mb-4">
        <SegmentedTabs
          value={mode}
          items={modeTabs}
          onChange={handleModeChange}
          ariaLabel="Avatar selection mode"
          className="w-full"
          size="sm"
        />
      </div>

      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (!e.target.files || e.target.files.length === 0) return
          await handleAvatarUpload(e.target.files)
          e.target.value = ''
        }}
      />

      {isUploadMode && (
        <div className="space-y-3">
          {uploading && (
            <div className="rounded-lg border border-surface-200 bg-surface-0 p-3 flex justify-center">
              <Button variant="ghost-muted" size="sm" loading>
                Uploading...
              </Button>
            </div>
          )}

          {avatarsLoading ? (
            <LoadingState title="Loading avatars..." size="sm" />
          ) : uploadedAvatars.length === 0 ? (
            <EmptyState
              title="No uploaded avatars yet"
              description="Upload images to add them to this list."
              icon={<Upload className="w-10 h-10" />}
            />
          ) : (
            <div>
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Uploaded Images</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {uploadedAvatars.map((avatar) => (
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
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (deleting.has(avatar.filename)) return
                        setDeleting((prev) => new Set(prev).add(avatar.filename))
                        try {
                          if (selectedAvatar?.filename === avatar.filename) setSelectedAvatar(null)
                          await deleteUploadedAvatar(avatar.filename)
                          notify.success('Uploaded avatar removed')
                        } catch (err) {
                          const message =
                            err && typeof err === 'object' && 'message' in err
                              ? String(err.message)
                              : 'Failed to delete uploaded avatar'
                          notify.error(message)
                        } finally {
                          setDeleting((prev) => {
                            const next = new Set(prev)
                            next.delete(avatar.filename)
                            return next
                          })
                        }
                      }}
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 hover:bg-danger flex items-center justify-center"
                      title="Delete uploaded avatar"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isUploadMode &&
        (!isGenerateMode ? (
          <div>
            {avatarsLoading ? (
              <LoadingState title="Loading avatars..." size="sm" />
            ) : avatars.length === 0 ? (
              <EmptyState
                title="No avatars in gallery"
                description={`${showGenerateOptions ? 'Generate a new avatar or add images to ' : 'Add images to '}avatars/ folder`}
                icon={<Users className="w-10 h-10" />}
              />
            ) : (
              <div className="space-y-3">
                {curatedAvatars.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Gallery</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {curatedAvatars.map((avatar) => {
                        const canDelete = !isCurated(avatar)
                        return (
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
                            {canDelete && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (deleting.has(avatar.filename)) return
                                  setDeleting((prev) => new Set(prev).add(avatar.filename))
                                  try {
                                    if (selectedAvatar?.filename === avatar.filename) setSelectedAvatar(null)
                                    await deleteUploadedAvatar(avatar.filename)
                                    notify.success('Avatar removed')
                                  } catch (err) {
                                    const message =
                                      err && typeof err === 'object' && 'message' in err
                                        ? String(err.message)
                                        : 'Failed to delete avatar'
                                    notify.error(message)
                                  } finally {
                                    setDeleting((prev) => {
                                      const next = new Set(prev)
                                      next.delete(avatar.filename)
                                      return next
                                    })
                                  }
                                }}
                                className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 hover:bg-danger flex items-center justify-center"
                                title="Delete avatar"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {generatedAvatars.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Generated</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {generatedAvatars.map((avatar) => {
                        const canDelete = !isCurated(avatar)
                        return (
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
                            {canDelete && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (deleting.has(avatar.filename)) return
                                  setDeleting((prev) => new Set(prev).add(avatar.filename))
                                  try {
                                    if (selectedAvatar?.filename === avatar.filename) setSelectedAvatar(null)
                                    await deleteUploadedAvatar(avatar.filename)
                                    notify.success('Avatar removed')
                                  } catch (err) {
                                    const message =
                                      err && typeof err === 'object' && 'message' in err
                                        ? String(err.message)
                                        : 'Failed to delete avatar'
                                    notify.error(message)
                                  } finally {
                                    setDeleting((prev) => {
                                      const next = new Set(prev)
                                      next.delete(avatar.filename)
                                      return next
                                    })
                                  }
                                }}
                                className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 hover:bg-danger flex items-center justify-center"
                                title="Delete avatar"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {uploadedAvatars.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                      Uploaded Images
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {uploadedAvatars.map((avatar) => (
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
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (deleting.has(avatar.filename)) return
                              setDeleting((prev) => new Set(prev).add(avatar.filename))
                              try {
                                if (selectedAvatar?.filename === avatar.filename) setSelectedAvatar(null)
                                await deleteUploadedAvatar(avatar.filename)
                                notify.success('Uploaded avatar removed')
                              } catch (err) {
                                const message =
                                  err && typeof err === 'object' && 'message' in err
                                    ? String(err.message)
                                    : 'Failed to delete uploaded avatar'
                                notify.error(message)
                              } finally {
                                setDeleting((prev) => {
                                  const next = new Set(prev)
                                  next.delete(avatar.filename)
                                  return next
                                })
                              }
                            }}
                            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 hover:bg-danger flex items-center justify-center"
                            title="Delete uploaded avatar"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
        ))}
    </div>
  )
}
