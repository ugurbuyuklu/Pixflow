import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  Download,
  FolderOpen,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Upload,
  Users,
  Video,
  Volume2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { apiUrl, assetUrl, authFetch, getApiError } from '../../lib/api'
import type { AvatarAgeGroup, AvatarEthnicity, AvatarGender, AvatarOutfit, ScriptTone } from '../../stores/avatarStore'
import { REACTION_DEFINITIONS, useAvatarStore } from '../../stores/avatarStore'
import type { ReactionType } from '../../types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Textarea } from '../ui/Textarea'

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
]
const AGE_OPTIONS = [
  { value: 'young-adult', label: 'Young Adult (20s)' },
  { value: 'adult', label: 'Adult (30s)' },
  { value: 'middle-aged', label: 'Middle-aged (40-50s)' },
]
const ETHNICITY_OPTIONS = [
  { value: 'caucasian', label: 'Caucasian' },
  { value: 'black', label: 'Black / African' },
  { value: 'asian', label: 'East Asian' },
  { value: 'hispanic', label: 'Hispanic / Latino' },
  { value: 'middle-eastern', label: 'Middle Eastern' },
  { value: 'south-asian', label: 'South Asian' },
]
const OUTFIT_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'business', label: 'Business' },
  { value: 'sporty', label: 'Sporty' },
  { value: 'elegant', label: 'Elegant' },
  { value: 'streetwear', label: 'Streetwear' },
]
const TONE_OPTIONS = [
  { value: 'energetic', label: 'Energetic' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'dramatic', label: 'Dramatic' },
]

async function downloadVideo(url: string, filename: string) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  } catch (err) {
    console.error('Failed to download video:', err)
  }
}

export default function AvatarStudioPage() {
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  const {
    mode,
    avatars,
    avatarsLoading,
    selectedAvatar,
    error,
    gender,
    ageGroup,
    ethnicity,
    outfit,
    avatarCount,
    generating,
    generatedUrls,
    selectedGeneratedIndex,
    generationProgress,
    scriptConcept,
    scriptDuration,
    scriptTone,
    scriptGenerating,
    generatedScript,
    scriptWordCount,
    scriptEstimatedDuration,
    voices,
    voicesLoading,
    selectedVoice,
    ttsGenerating,
    generatedAudioUrl,
    lipsyncGenerating,
    lipsyncJob,
    generatedVideoUrl,
    i2vPrompt,
    i2vDuration,
    i2vLoading,
    i2vVideoUrl,
    i2vError,
    studioMode,
    selectedReaction,
    reactionDuration,
    reactionAspectRatio,
    reactionGenerating,
    reactionVideoUrl,
    reactionError,
    setMode,
    setSelectedAvatar,
    setFullSizeAvatarUrl,
    setGender,
    setAgeGroup,
    setEthnicity,
    setOutfit,
    setAvatarCount,
    setSelectedGeneratedIndex,
    setScriptConcept,
    setScriptDuration,
    setScriptTone,
    setGeneratedScript,
    setSelectedVoice,
    setI2vPrompt,
    setI2vDuration,
    setStudioMode,
    setSelectedReaction,
    setReactionDuration,
    setReactionAspectRatio,
    loadAvatars,
    loadVoices,
    uploadAvatars,
    generateAvatar,
    generateScript,
    generateTTS,
    createLipsync,
    generateI2V,
    generateReactionVideo,
    cancelReactionVideo,
  } = useAvatarStore()

  useEffect(() => {
    loadAvatars()
    loadVoices()
  }, [loadAvatars, loadVoices])

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

      {error && (
        <div
          className={`rounded-lg p-4 flex items-start gap-3 ${
            error.type === 'warning'
              ? 'bg-warning-muted/50 border border-warning/40'
              : 'bg-danger-muted/50 border border-danger/40'
          }`}
        >
          <AlertCircle
            className={`w-5 h-5 shrink-0 mt-0.5 ${error.type === 'warning' ? 'text-warning' : 'text-danger'}`}
          />
          <p className={`flex-1 ${error.type === 'warning' ? 'text-warning' : 'text-danger'}`}>{error.message}</p>
          <Button
            variant="ghost-muted"
            size="xs"
            aria-label="Dismiss"
            icon={<X className="w-4 h-4" />}
            onClick={() => useAvatarStore.setState({ error: null })}
          />
        </div>
      )}

      {reactionError && (
        <div
          className={`rounded-lg p-4 flex items-start gap-3 ${
            reactionError.type === 'warning'
              ? 'bg-warning-muted/50 border border-warning/40'
              : 'bg-danger-muted/50 border border-danger/40'
          }`}
        >
          <AlertCircle
            className={`w-5 h-5 shrink-0 mt-0.5 ${reactionError.type === 'warning' ? 'text-warning' : 'text-danger'}`}
          />
          <p className={`flex-1 ${reactionError.type === 'warning' ? 'text-warning' : 'text-danger'}`}>
            {reactionError.message}
          </p>
          <Button
            variant="ghost-muted"
            size="xs"
            aria-label="Dismiss"
            icon={<X className="w-4 h-4" />}
            onClick={() => useAvatarStore.setState({ reactionError: null })}
          />
        </div>
      )}

      {studioMode === 'talking' ? (
        <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Avatar Selection */}
        <div className="space-y-6">
          {/* Step 1: Avatar Selection */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
              Select Avatar
            </h2>

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
                      Generate a new avatar or add images to{' '}
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
                  onClick={generateAvatar}
                  disabled={generating}
                  className="w-full"
                >
                  {generating
                    ? `Generating ${generationProgress}/${avatarCount}...`
                    : `Generate ${avatarCount > 1 ? `${avatarCount} Avatars` : 'Avatar'}`}
                </Button>
                {generatedUrls.length > 0 && (
                  <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg space-y-3">
                    <p className="text-success text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {generatedUrls.length} avatar{generatedUrls.length > 1 ? 's' : ''} generated and saved to gallery!
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {generatedUrls.map((url, index) => (
                        <button
                          type="button"
                          // biome-ignore lint/suspicious/noArrayIndexKey: static list
                          key={index}
                          className={`cursor-pointer transition-all relative rounded-lg overflow-hidden border-2 ${
                            selectedGeneratedIndex === index
                              ? 'border-brand-500 ring-2 ring-brand-500/50'
                              : 'border-transparent hover:border-surface-200'
                          }`}
                          onClick={() => setSelectedGeneratedIndex(index)}
                        >
                          <img
                            src={assetUrl(url)}
                            alt={`Generated avatar ${index + 1}`}
                            className="w-full aspect-[9/16] object-cover"
                          />
                          {selectedGeneratedIndex === index && (
                            <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-surface-400 text-center">
                      Click to select, double-click to view full size
                    </p>
                  </div>
                )}
              </div>
            )}

            {(selectedAvatar || generatedUrls.length > 0) && (
              <div className="mt-4 p-3 bg-surface-100 rounded-lg">
                <p className="text-sm text-surface-400 mb-2">Selected Avatar:</p>
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

          {/* Step 2: Script Generation */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Generate Script
            </h2>

            <div className="space-y-4">
              <Input
                label="App/Product Concept"
                value={scriptConcept}
                onChange={(e) => setScriptConcept(e.target.value)}
                placeholder="e.g., AI photo transformation app, fitness tracker, dating app..."
              />

              <div className="grid grid-cols-2 gap-4">
                <Slider
                  label="Duration"
                  displayValue={`${scriptDuration}s`}
                  min={10}
                  max={60}
                  value={scriptDuration}
                  onChange={(e) => setScriptDuration(Number(e.currentTarget.value))}
                />
                <Select
                  label="Tone"
                  value={scriptTone}
                  onChange={(e) => setScriptTone(e.target.value as ScriptTone)}
                  options={TONE_OPTIONS}
                />
              </div>

              <Button
                variant="primary"
                size="md"
                icon={scriptGenerating ? undefined : <MessageSquare className="w-4 h-4" />}
                loading={scriptGenerating}
                onClick={generateScript}
                disabled={scriptGenerating || !scriptConcept.trim()}
                className="w-full"
              >
                {scriptGenerating ? 'Generating Script...' : 'Generate Script'}
              </Button>
              {!scriptGenerating && !scriptConcept.trim() && (
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Enter an app/product concept above to generate a script
                </p>
              )}

              {generatedScript && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-400">Generated Script:</span>
                    <span className="text-xs text-surface-400">
                      {scriptWordCount} words (~{scriptEstimatedDuration}s)
                    </span>
                  </div>
                  <Textarea value={generatedScript} onChange={(e) => setGeneratedScript(e.target.value)} rows={4} />
                  <button
                    type="button"
                    onClick={generateScript}
                    disabled={scriptGenerating}
                    className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {/* Step 3: Voice Selection & TTS */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Voice & Audio
            </h2>

            <div className="space-y-4">
              <div>
                <span className="block text-sm text-surface-400 mb-2">Select Voice</span>
                {voicesLoading ? (
                  <div className="flex items-center gap-2 text-surface-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading voices...
                  </div>
                ) : (
                  <Select
                    value={selectedVoice?.id || ''}
                    onChange={(e) => setSelectedVoice(voices.find((v) => v.id === e.target.value) || null)}
                    options={[
                      { value: '', label: 'Select a voice...' },
                      ...voices.map((voice) => ({
                        value: voice.id,
                        label: `${voice.name}${voice.category ? ` (${voice.category})` : ''}`,
                      })),
                    ]}
                  />
                )}
              </div>

              {selectedVoice?.previewUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Volume2 className="w-4 h-4" />}
                  onClick={() => new Audio(selectedVoice.previewUrl).play()}
                >
                  Preview Voice
                </Button>
              )}

              <Button
                variant="primary"
                size="md"
                icon={ttsGenerating ? undefined : <Mic className="w-4 h-4" />}
                loading={ttsGenerating}
                onClick={generateTTS}
                disabled={ttsGenerating || !generatedScript || !selectedVoice}
                className="w-full"
              >
                {ttsGenerating ? 'Generating Audio...' : 'Generate Audio'}
              </Button>
              {!ttsGenerating && (!generatedScript || !selectedVoice) && (
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {!generatedScript ? 'Generate a script first (Step 2)' : 'Select a voice above'}
                </p>
              )}

              {generatedAudioUrl && (
                <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg">
                  <p className="text-success text-sm flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4" />
                    Audio generated!
                  </p>
                  {/* biome-ignore lint/a11y/useMediaCaption: AI-generated audio, no captions available */}
                  <audio controls src={assetUrl(generatedAudioUrl)} className="w-full" />
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Lipsync Video Generation */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
              Generate Video
            </h2>

            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div
                  className={`flex items-center gap-2 ${selectedAvatar || generatedUrls.length > 0 ? 'text-success' : 'text-surface-400'}`}
                >
                  {selectedAvatar || generatedUrls.length > 0 ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Avatar selected
                </div>
                <div className={`flex items-center gap-2 ${generatedScript ? 'text-success' : 'text-surface-400'}`}>
                  {generatedScript ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Script generated
                </div>
                <div className={`flex items-center gap-2 ${generatedAudioUrl ? 'text-success' : 'text-surface-400'}`}>
                  {generatedAudioUrl ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Audio generated
                </div>
              </div>

              <Button
                variant="success"
                size="lg"
                icon={lipsyncGenerating ? undefined : <Video className="w-5 h-5" />}
                loading={lipsyncGenerating}
                onClick={createLipsync}
                disabled={lipsyncGenerating || !generatedAudioUrl || (!selectedAvatar && generatedUrls.length === 0)}
                className="w-full"
              >
                {lipsyncGenerating
                  ? `Generating Video...${lipsyncJob?.progress !== undefined ? ` (${lipsyncJob.progress}%)` : ''}`
                  : 'Create Talking Avatar Video'}
              </Button>
              {!lipsyncGenerating && (!generatedAudioUrl || (!selectedAvatar && generatedUrls.length === 0)) && (
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {!selectedAvatar && generatedUrls.length === 0
                    ? 'Select an avatar first (Step 1)'
                    : 'Generate audio first (Step 3)'}
                </p>
              )}

              {lipsyncJob && (
                <div
                  className={`p-3 rounded-lg ${
                    lipsyncJob.status === 'complete'
                      ? 'bg-success-muted/30 border border-success/40'
                      : lipsyncJob.status === 'error'
                        ? 'bg-danger-muted/30 border border-danger/40'
                        : 'bg-warning-muted/30 border border-warning/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-sm flex items-center gap-2 ${
                        lipsyncJob.status === 'complete'
                          ? 'text-success'
                          : lipsyncJob.status === 'error'
                            ? 'text-danger'
                            : 'text-warning'
                      }`}
                    >
                      {lipsyncJob.status === 'complete' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : lipsyncJob.status === 'error' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {lipsyncJob.status === 'pending' && 'Queued...'}
                      {lipsyncJob.status === 'processing' && 'Processing video...'}
                      {lipsyncJob.status === 'complete' && 'Video ready!'}
                      {lipsyncJob.status === 'error' && (lipsyncJob.error || 'Generation failed')}
                    </p>
                    {lipsyncJob.status === 'complete' && generatedVideoUrl && (
                      <button
                        type="button"
                        onClick={() => downloadVideo(assetUrl(generatedVideoUrl), 'lipsync-video.mp4')}
                        className="bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-3 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 5: Video Output */}
          {generatedVideoUrl && (
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-success rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                Output
              </h2>

              <div className="space-y-4">
                {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                <video controls src={assetUrl(generatedVideoUrl)} className="w-full rounded-lg" />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadVideo(assetUrl(generatedVideoUrl), 'avatar-video.mp4')}
                    className="flex-1 bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Video
                  </button>
                  <Button
                    variant="secondary"
                    size="md"
                    icon={<FolderOpen className="w-4 h-4" />}
                    onClick={async () => {
                      const response = await authFetch(apiUrl('/api/generate/open-folder'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: 'outputs' }),
                      })
                      if (!response.ok) {
                        const raw = await response.json().catch(() => ({}))
                        useAvatarStore.setState({
                          error: { message: getApiError(raw, 'Failed to open folder'), type: 'error' },
                        })
                      }
                    }}
                  >
                    Open Folder
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Video className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold text-surface-900">Image to Video</h3>
            <span className="text-xs text-surface-400 ml-auto">Powered by Kling AI</span>
          </div>

          {i2vError && (
            <div
              className={`rounded-lg p-3 mb-4 flex items-start gap-2 ${
                i2vError.type === 'warning'
                  ? 'bg-warning-muted/50 border border-warning/40'
                  : 'bg-danger-muted/50 border border-danger/40'
              }`}
            >
              <AlertCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${i2vError.type === 'warning' ? 'text-warning' : 'text-danger'}`}
              />
              <p className={`text-sm ${i2vError.type === 'warning' ? 'text-warning' : 'text-danger'}`}>
                {i2vError.message}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <Textarea
              label="Motion Prompt"
              value={i2vPrompt}
              onChange={(e) => setI2vPrompt(e.target.value)}
              placeholder="Describe the motion or scene... e.g., 'Camera slowly zooms in while the subject smiles and waves'"
              className="h-20"
            />

            <div className="flex items-center gap-4">
              <div>
                <span className="block text-sm font-medium text-surface-500 mb-2">Duration</span>
                <div className="flex gap-2">
                  {(['5', '10'] as const).map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setI2vDuration(d)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        i2vDuration === d
                          ? 'bg-accent text-white'
                          : 'bg-surface-200 text-surface-500 hover:bg-surface-200'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex justify-end">
                <Button
                  variant="accent"
                  size="lg"
                  icon={i2vLoading ? undefined : <Video className="w-5 h-5" />}
                  loading={i2vLoading}
                  onClick={generateI2V}
                  disabled={i2vLoading || !i2vPrompt.trim()}
                >
                  {i2vLoading ? 'Generating...' : 'Generate Video'}
                </Button>
              </div>
            </div>

            {i2vVideoUrl && (
              <div className="space-y-3">
                {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                <video controls src={assetUrl(i2vVideoUrl)} className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={() => downloadVideo(assetUrl(i2vVideoUrl), 'image-to-video.mp4')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg font-medium transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
        /* Reaction Video Workflow */
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column: Avatar Selection (Shared) */}
          <div className="space-y-6">
            {/* Step 1: Avatar Selection */}
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                Select Avatar
              </h2>

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
                        Generate a new avatar or add images to{' '}
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
                    onClick={generateAvatar}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating
                      ? `Generating ${generationProgress}/${avatarCount}...`
                      : `Generate ${avatarCount > 1 ? `${avatarCount} Avatars` : 'Avatar'}`}
                  </Button>
                  {generatedUrls.length > 0 && (
                    <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg space-y-3">
                      <p className="text-success text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {generatedUrls.length} avatar{generatedUrls.length > 1 ? 's' : ''} generated and saved to gallery!
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {generatedUrls.map((url, index) => (
                          <button
                            type="button"
                            // biome-ignore lint/suspicious/noArrayIndexKey: static list
                            key={index}
                            className={`cursor-pointer transition-all relative rounded-lg overflow-hidden border-2 ${
                              selectedGeneratedIndex === index
                                ? 'border-brand-500 ring-2 ring-brand-500/50'
                                : 'border-transparent hover:border-surface-200'
                            }`}
                            onClick={() => setSelectedGeneratedIndex(index)}
                          >
                            <img
                              src={assetUrl(url)}
                              alt={`Generated avatar ${index + 1}`}
                              className="w-full aspect-[9/16] object-cover"
                            />
                            {selectedGeneratedIndex === index && (
                              <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-surface-400 text-center">
                        Click to select, double-click to view full size
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(selectedAvatar || generatedUrls.length > 0) && (
                <div className="mt-4 p-3 bg-surface-100 rounded-lg">
                  <p className="text-sm text-surface-400 mb-2">Selected Avatar:</p>
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
          </div>

          {/* Right Column: Reaction Workflow */}
          <div className="space-y-6">
            {/* Step 2: Choose Reaction */}
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                Choose Reaction
              </h2>

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
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                Video Settings
              </h2>

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
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                Generate
              </h2>

              <div className="space-y-4">
                {reactionGenerating ? (
                  /* Generating State with Thumbnail */
                  <div className="space-y-4">
                    <div className="relative">
                      <img
                        src={assetUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
                        alt="Generating reaction"
                        className="w-full aspect-[9/16] object-cover rounded-lg opacity-50"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-brand" />
                        <p className="text-sm font-medium text-surface-900">Generating {selectedReaction && REACTION_DEFINITIONS[selectedReaction].emoji} reaction...</p>
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
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="bg-success rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                  Output
                </h2>

                <div className="space-y-4">
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

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => downloadVideo(assetUrl(reactionVideoUrl), `reaction-${selectedReaction}.mp4`)}
                      className="flex-1 bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download Video
                    </button>
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
      )}
    </div>
  )
}
