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
  Redo,
  Undo,
  Upload,
  Users,
  Video,
  Volume2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch, getApiError } from '../../lib/api'
import type { AvatarAgeGroup, AvatarEthnicity, AvatarGender, AvatarOutfit, ScriptTone } from '../../stores/avatarStore'
import { REACTION_DEFINITIONS, useAvatarStore } from '../../stores/avatarStore'
import type { ReactionType } from '../../types'
import { AudioPlayer } from '../ui/AudioPlayer'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Textarea } from '../ui/Textarea'
import { ScriptDiffView } from './ScriptDiffView'

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
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const [videoSource, setVideoSource] = useState<'url' | 'upload'>('url')
  const [videoUrl, setVideoUrl] = useState('')
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [showVariationOptions, setShowVariationOptions] = useState(false)
  const [targetDuration, setTargetDuration] = useState(30)
  const [showDiff, setShowDiff] = useState(false)

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
    scriptHistory,
    scriptHistoryIndex,
    voices,
    voicesLoading,
    selectedVoice,
    audioMode,
    ttsGenerating,
    audioUploading,
    generatedAudioUrl,
    lipsyncGenerating,
    lipsyncJob,
    generatedVideoUrl,
    scriptMode,
    transcribingVideo,
    transcriptionError,
    selectedVideoForTranscription,
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
    setAudioMode,
    setScriptMode,
    setSelectedVideoForTranscription,
    setStudioMode,
    setSelectedReaction,
    setReactionDuration,
    setReactionAspectRatio,
    loadAvatars,
    loadVoices,
    uploadAvatars,
    generateAvatar,
    generateScript,
    refineScript,
    undoScript,
    redoScript,
    generateTTS,
    uploadAudio,
    createLipsync,
    transcribeVideo,
    generateReactionVideo,
    cancelReactionVideo,
  } = useAvatarStore()

  useEffect(() => {
    loadAvatars()
    loadVoices()
  }, [loadAvatars, loadVoices])

  // Reset video source to URL when switching to fetch mode
  useEffect(() => {
    if (scriptMode === 'fetch') {
      setVideoSource('url')
    }
  }, [scriptMode])

  const handleRefineScript = async (type: 'similar' | 'improved' | 'shorter' | 'longer') => {
    const instructions = {
      similar: 'Generate a similar variation of this script with the same tone and structure but different wording',
      improved: 'Improve this script to be more engaging, persuasive, and impactful while maintaining the same message',
      shorter: 'Make this script shorter by removing unnecessary words, phrases, or sentences. Keep the core message intact. Do NOT rewrite the entire script - just trim it down.',
      longer: 'Expand this script by adding relevant details, examples, or elaboration between existing sentences. Keep the original content and flow - just add to it. Do NOT rewrite the entire script.',
    }
    setShowDiff(true)
    await refineScript(instructions[type])
    setShowVariationOptions(false)
  }

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
          </div>

          {/* Step 2: Script */}
          <div className={`bg-surface-50 rounded-lg p-4 ${!selectedAvatar && generatedUrls.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Script
            </h2>

            {!selectedAvatar && generatedUrls.length === 0 ? (
              <p className="text-sm text-warning/80 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Please select or generate an avatar first (Step 1)
              </p>
            ) : (
              <>
            {/* Mode Switcher - 4 modes in 2x2 grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setScriptMode('existing')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  scriptMode === 'existing' ? 'bg-brand-600 text-surface-900' : 'bg-surface-100 text-surface-400 hover:text-surface-900'
                }`}
              >
                Have a Script
              </button>
              <button
                type="button"
                onClick={() => setScriptMode('audio')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  scriptMode === 'audio' ? 'bg-brand-600 text-surface-900' : 'bg-surface-100 text-surface-400 hover:text-surface-900'
                }`}
              >
                Have an Audio
              </button>
              <button
                type="button"
                onClick={() => setScriptMode('fetch')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  scriptMode === 'fetch' ? 'bg-brand-600 text-surface-900' : 'bg-surface-100 text-surface-400 hover:text-surface-900'
                }`}
              >
                Transcript a Video
              </button>
              <button
                type="button"
                onClick={() => setScriptMode('generate')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  scriptMode === 'generate' ? 'bg-brand-600 text-surface-900' : 'bg-surface-100 text-surface-400 hover:text-surface-900'
                }`}
              >
                Generate New
              </button>
            </div>

            {/* Mode: Already Have Script */}
            {scriptMode === 'existing' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-surface-400">Your Script</label>
                  <div className="flex items-center gap-2">
                    {generatedScript && !scriptGenerating && scriptHistory.length > 1 && (
                      <div className="flex items-center gap-1 border-r border-surface-300 pr-2">
                        <button
                          type="button"
                          onClick={undoScript}
                          disabled={scriptHistoryIndex <= 0}
                          className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Undo"
                        >
                          <Undo className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={redoScript}
                          disabled={scriptHistoryIndex >= scriptHistory.length - 1}
                          className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Redo"
                        >
                          <Redo className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDiff(!showDiff)}
                          className={`text-xs px-2 py-1 rounded ${showDiff ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-300'}`}
                          title={showDiff ? 'Hide changes' : 'Show changes'}
                        >
                          {showDiff ? 'Hide' : 'Diff'}
                        </button>
                      </div>
                    )}
                    {generatedScript && !scriptGenerating && (
                      <button
                        type="button"
                        onClick={() => setShowVariationOptions(!showVariationOptions)}
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Generate Similar
                      </button>
                    )}
                  </div>
                </div>
                {showVariationOptions && generatedScript && (
                  <div className="space-y-2">
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleRefineScript('similar')}
                        disabled={scriptGenerating}
                        className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                      >
                        Similar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefineScript('improved')}
                        disabled={scriptGenerating}
                        className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                      >
                        Improved
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefineScript('shorter')}
                        disabled={scriptGenerating}
                        className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                      >
                        Shorter
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefineScript('longer')}
                        disabled={scriptGenerating}
                        className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                      >
                        Longer
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={targetDuration}
                        onChange={(e) => setTargetDuration(Number(e.target.value))}
                        min={5}
                        max={120}
                        className="w-16 px-2 py-1 text-xs rounded bg-surface-200 text-surface-900 border border-surface-300"
                      />
                      <span className="text-xs text-surface-400">seconds</span>
                      <button
                        type="button"
                        onClick={() => refineScript(`Adjust this script to be exactly ${targetDuration} seconds long (approximately ${Math.round(targetDuration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`, targetDuration)}
                        disabled={scriptGenerating}
                        className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-surface-900 text-xs disabled:opacity-50"
                      >
                        Adjust to Duration
                      </button>
                    </div>
                  </div>
                )}
                {showDiff && scriptHistory.length > 1 && scriptHistoryIndex > 0 ? (
                  <ScriptDiffView
                    oldText={scriptHistory[scriptHistoryIndex - 1] || ''}
                    newText={generatedScript}
                  />
                ) : (
                  <Textarea
                    value={generatedScript}
                    onChange={(e) => setGeneratedScript(e.target.value)}
                    placeholder="Paste or type your script here..."
                    rows={6}
                    disabled={scriptGenerating}
                  />
                )}
                {generatedScript && (
                  <p className="text-xs text-surface-400">
                    {generatedScript.split(/\s+/).filter(Boolean).length} words (~
                    {Math.ceil((generatedScript.split(/\s+/).filter(Boolean).length / 150) * 60)}s)
                  </p>
                )}
              </div>
            )}

            {/* Mode: Fetch from Video */}
            {scriptMode === 'fetch' && (
              <div className="space-y-4">
                <p className="text-sm text-surface-400">
                  Select a video source to transcribe its audio into a script
                </p>

                {/* Video Source Tabs */}
                {!transcribingVideo && !generatedScript && (
                  <>
                    <div className="flex bg-surface-100 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => setVideoSource('url')}
                        className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                          videoSource === 'url' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
                        }`}
                      >
                        Video URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoSource('upload')}
                        className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                          videoSource === 'upload' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
                        }`}
                      >
                        Upload File
                      </button>
                    </div>

                    {/* Source: Video URL */}
                    {videoSource === 'url' && (
                      <div className="space-y-3">
                        <Input
                          label="Video URL"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          placeholder="https://facebook.com/ads/library/?id=... or direct .mp4 link"
                        />
                        <p className="text-xs text-surface-400">
                          ✅ Supports: Facebook Ads Library, Instagram, TikTok, YouTube, and direct video links (.mp4, .mov, etc.)
                        </p>
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => transcribeVideo(videoUrl)}
                          disabled={!videoUrl.trim()}
                          className="w-full"
                        >
                          Transcribe from URL
                        </Button>
                      </div>
                    )}

                    {/* Source: Upload File */}
                    {videoSource === 'upload' && (
                      <div className="space-y-3">
                        <input
                          ref={videoFileInputRef}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            setUploadingVideo(true)
                            try {
                              const formData = new FormData()
                              formData.append('video', file)

                              const res = await authFetch(apiUrl('/api/videos/upload'), {
                                method: 'POST',
                                body: formData,
                              })

                              if (!res.ok) {
                                throw new Error('Upload failed')
                              }

                              const data = await res.json()
                              if (data.success && data.data?.url) {
                                // Upload successful, now transcribe
                                await transcribeVideo(data.data.url)
                              }
                            } catch (err) {
                              useAvatarStore.setState({
                                transcriptionError: {
                                  message: err instanceof Error ? err.message : 'Upload failed',
                                  type: 'error',
                                },
                              })
                            } finally {
                              setUploadingVideo(false)
                              if (videoFileInputRef.current) {
                                videoFileInputRef.current.value = ''
                              }
                            }
                          }}
                        />
                        <Button
                          variant="primary"
                          size="md"
                          icon={uploadingVideo ? undefined : <Upload className="w-4 h-4" />}
                          loading={uploadingVideo}
                          onClick={() => videoFileInputRef.current?.click()}
                          disabled={uploadingVideo}
                          className="w-full"
                        >
                          {uploadingVideo ? 'Uploading...' : 'Choose Video File'}
                        </Button>
                        <p className="text-xs text-surface-400">
                          Supported formats: MP4, MOV, AVI, etc. Max 500MB.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Loading State */}
                {transcribingVideo && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Extracting audio and transcribing...</p>
                      <p className="text-xs text-surface-400 mt-1">This may take 60-90 seconds</p>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {transcriptionError && (
                  <div className="bg-danger-muted/50 border border-danger/40 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <p className="text-danger text-sm">{transcriptionError.message}</p>
                    </div>
                  </div>
                )}

                {/* Success - Transcribed Script */}
                {generatedScript && !transcribingVideo && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-surface-400">Transcribed Script (Editable)</label>
                      <div className="flex items-center gap-2">
                        {!scriptGenerating && scriptHistory.length > 1 && (
                          <div className="flex items-center gap-1 border-r border-surface-300 pr-2">
                            <button
                              type="button"
                              onClick={undoScript}
                              disabled={scriptHistoryIndex <= 0}
                              className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Undo"
                            >
                              <Undo className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={redoScript}
                              disabled={scriptHistoryIndex >= scriptHistory.length - 1}
                              className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Redo"
                            >
                              <Redo className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDiff(!showDiff)}
                              className={`text-xs px-2 py-1 rounded ${showDiff ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-300'}`}
                              title={showDiff ? 'Hide changes' : 'Show changes'}
                            >
                              {showDiff ? 'Hide' : 'Diff'}
                            </button>
                          </div>
                        )}
                        {!scriptGenerating && (
                          <button
                            type="button"
                            onClick={() => setShowVariationOptions(!showVariationOptions)}
                            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Generate Similar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setGeneratedScript('')
                            useAvatarStore.setState({ transcriptionError: null })
                          }}
                          className="text-xs text-surface-400 hover:text-surface-300 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Try another video
                        </button>
                      </div>
                    </div>
                    {showVariationOptions && (
                      <div className="space-y-2">
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleRefineScript('similar')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Similar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('improved')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Improved
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('shorter')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Shorter
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('longer')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Longer
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={targetDuration}
                            onChange={(e) => setTargetDuration(Number(e.target.value))}
                            min={5}
                            max={120}
                            className="w-16 px-2 py-1 text-xs rounded bg-surface-200 text-surface-900 border border-surface-300"
                          />
                          <span className="text-xs text-surface-400">seconds</span>
                          <button
                            type="button"
                            onClick={() => refineScript(`Adjust this script to be exactly ${targetDuration} seconds long (approximately ${Math.round(targetDuration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`, targetDuration)}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-surface-900 text-xs disabled:opacity-50"
                          >
                            Adjust to Duration
                          </button>
                        </div>
                      </div>
                    )}
                    {showDiff && scriptHistory.length > 1 && scriptHistoryIndex > 0 ? (
                      <ScriptDiffView
                        oldText={scriptHistory[scriptHistoryIndex - 1] || ''}
                        newText={generatedScript}
                      />
                    ) : (
                      <Textarea
                        value={generatedScript}
                        onChange={(e) => setGeneratedScript(e.target.value)}
                        rows={6}
                        disabled={scriptGenerating}
                      />
                    )}
                    <p className="text-xs text-surface-400">
                      {generatedScript.split(/\s+/).filter(Boolean).length} words (~
                      {Math.ceil((generatedScript.split(/\s+/).filter(Boolean).length / 150) * 60)}s)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Mode: Have an Audio */}
            {scriptMode === 'audio' && (
              <div className="space-y-4">
                <p className="text-sm text-surface-400">
                  Upload your pre-recorded audio file (from ElevenLabs, Descript, etc.)
                </p>

                {!generatedAudioUrl && (
                  <div className="border-2 border-dashed border-surface-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a"
                      className="hidden"
                      id="audio-upload-step2"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setUploadedAudioFile(file)
                          uploadAudio(file)
                        }
                      }}
                    />
                    <label
                      htmlFor="audio-upload-step2"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="w-8 h-8 text-surface-400" />
                      <p className="text-sm text-surface-300">
                        Click to upload audio file
                      </p>
                      <p className="text-xs text-surface-400">
                        MP3, WAV, M4A (max 50MB)
                      </p>
                    </label>
                  </div>
                )}

                {audioUploading && (
                  <div className="flex items-center gap-2 text-surface-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading {uploadedAudioFile?.name}...
                  </div>
                )}

                {generatedAudioUrl && (
                  <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-success text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Audio uploaded!
                      </p>
                      <div className="flex items-center gap-3">
                        {uploadedAudioFile && (
                          <div className="flex items-center gap-2 text-xs text-surface-400">
                            <Volume2 className="w-3 h-3" />
                            {uploadedAudioFile.name}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            useAvatarStore.setState({ generatedAudioUrl: null })
                            setUploadedAudioFile(null)
                          }}
                          className="text-xs text-danger hover:text-danger/80 flex items-center gap-1"
                          title="Remove audio"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <AudioPlayer src={assetUrl(generatedAudioUrl)} />
                  </div>
                )}
              </div>
            )}

            {/* Mode: Generate New Script */}
            {scriptMode === 'generate' && (
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
                    {showDiff && scriptHistory.length > 1 && scriptHistoryIndex > 0 ? (
                      <ScriptDiffView
                        oldText={scriptHistory[scriptHistoryIndex - 1] || ''}
                        newText={generatedScript}
                      />
                    ) : (
                      <Textarea
                        value={generatedScript}
                        onChange={(e) => setGeneratedScript(e.target.value)}
                        rows={4}
                        disabled={scriptGenerating}
                      />
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={generateScript}
                        disabled={scriptGenerating}
                        className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                      {!scriptGenerating && (
                        <button
                          type="button"
                          onClick={() => setShowVariationOptions(!showVariationOptions)}
                          className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Generate Similar
                        </button>
                      )}
                      {!scriptGenerating && scriptHistory.length > 1 && (
                        <div className="flex items-center gap-1 border-l border-surface-300 pl-3">
                          <button
                            type="button"
                            onClick={undoScript}
                            disabled={scriptHistoryIndex <= 0}
                            className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Undo"
                          >
                            <Undo className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={redoScript}
                            disabled={scriptHistoryIndex >= scriptHistory.length - 1}
                            className="text-xs text-surface-400 hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Redo"
                          >
                            <Redo className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDiff(!showDiff)}
                            className={`text-xs px-2 py-1 rounded ${showDiff ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-300'}`}
                            title={showDiff ? 'Hide changes' : 'Show changes'}
                          >
                            {showDiff ? 'Hide' : 'Diff'}
                          </button>
                        </div>
                      )}
                    </div>
                    {showVariationOptions && (
                      <div className="space-y-2">
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleRefineScript('similar')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Similar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('improved')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Improved
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('shorter')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Shorter
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRefineScript('longer')}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
                          >
                            Longer
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={targetDuration}
                            onChange={(e) => setTargetDuration(Number(e.target.value))}
                            min={5}
                            max={120}
                            className="w-16 px-2 py-1 text-xs rounded bg-surface-200 text-surface-900 border border-surface-300"
                          />
                          <span className="text-xs text-surface-400">seconds</span>
                          <button
                            type="button"
                            onClick={() => refineScript(`Adjust this script to be exactly ${targetDuration} seconds long (approximately ${Math.round(targetDuration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`, targetDuration)}
                            disabled={scriptGenerating}
                            className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-surface-900 text-xs disabled:opacity-50"
                          >
                            Adjust to Duration
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </div>

          {/* Step 3: Voice Selection & TTS (Hidden if "Have an Audio" mode) */}
          {scriptMode !== 'audio' && (
            <div className={`bg-surface-50 rounded-lg p-4 ${!generatedScript ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Voice & Audio
            </h2>

            {!generatedScript ? (
              <p className="text-sm text-warning/80 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Please complete Step 2 first (script required)
              </p>
            ) : (
              <>

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

              {/* Audio Preview */}
              {generatedAudioUrl && (
                <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg">
                  <p className="text-success text-sm flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4" />
                    Audio ready!
                  </p>
                  <AudioPlayer src={assetUrl(generatedAudioUrl)} />
                </div>
              )}
            </div>
            </>
            )}
          </div>
          )}

          {/* Step 4: Lipsync Video Generation */}
          <div className={`bg-surface-50 rounded-lg p-4 ${!generatedAudioUrl ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
              Generate Video
            </h2>

            {!generatedAudioUrl ? (
              <p className="text-sm text-warning/80 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {scriptMode === 'audio' ? 'Please upload audio first (Step 2)' : 'Please complete Step 3 first (audio required)'}
              </p>
            ) : (
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
                {scriptMode !== 'audio' && (
                  <div className={`flex items-center gap-2 ${generatedScript ? 'text-success' : 'text-surface-400'}`}>
                    {generatedScript ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    Script generated
                  </div>
                )}
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
            </div>
            )}
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="space-y-6">
          {generatedVideoUrl ? (
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-success rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                Output
              </h2>

              <div className="space-y-4">
                {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                <video controls src={assetUrl(generatedVideoUrl)} className="w-full rounded-lg max-h-[500px]" />

                <button
                  type="button"
                  onClick={() => downloadVideo(assetUrl(generatedVideoUrl), 'avatar-video.mp4')}
                  className="w-full bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-4 py-2.5 font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </button>
              </div>
            </div>
          ) : lipsyncGenerating ? (
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                Generating...
              </h2>
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                <p className="text-sm font-medium text-surface-300">Creating your video...</p>
                {lipsyncJob && (
                  <p className="text-xs text-surface-400">
                    Status: {lipsyncJob.status === 'processing' ? 'Processing' : lipsyncJob.status === 'completed' ? 'Downloading' : 'Queued'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-surface-50/50 rounded-lg p-8 text-center">
              <Video className="w-16 h-16 mx-auto mb-4 text-surface-300 opacity-50" />
              <p className="text-surface-400">Your video will appear here</p>
              <p className="text-xs text-surface-400 mt-2">Complete steps 1-4 to generate</p>
            </div>
          )}
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
                  <div className="space-y-4 flex flex-col items-center">
                    <div className="relative w-1/2">
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
