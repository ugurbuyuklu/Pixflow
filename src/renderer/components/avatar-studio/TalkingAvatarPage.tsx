import { AlertCircle, CheckCircle, Download, Link, Loader2, Upload, Video, Volume2, Wand2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch } from '../../lib/api'
import { downloadVideo } from '../../lib/download'
import type { ScriptTone } from '../../stores/avatarStore'
import { TALKING_AVATAR_LANGUAGE_CARDS, useAvatarStore } from '../../stores/avatarStore'
import { createOutputHistoryId, useOutputHistoryStore } from '../../stores/outputHistoryStore'
import { StepHeader } from '../asset-monster/StepHeader'
import { PreviousGenerationsPanel } from '../shared/PreviousGenerationsPanel'
import { AudioPlayer } from '../ui/AudioPlayer'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingState } from '../ui/LoadingState'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { ProgressBar } from '../ui/ProgressBar'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { ScriptRefinementToolbar } from './ScriptRefinementToolbar'
import { AvatarSelectionCard } from './shared/AvatarSelectionCard'

const TONE_OPTIONS = [
  { value: 'energetic', label: 'Energetic' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'dramatic', label: 'Dramatic' },
]
const TRANSCRIBED_AVATAR_WIDTH_CLASS = 'w-[116px]'
const TRANSCRIBED_AVATAR_HEIGHT_CLASS = 'h-[206px]'
const TRANSCRIBED_TEXTAREA_HEIGHT_CLASS = 'h-[206px] min-h-[206px] max-h-[206px] resize-none'

interface TalkingAvatarPageProps {
  fullSizeAvatarUrl: string | null
  setFullSizeAvatarUrl: (url: string | null) => void
  modeTabs?: ReactNode
}

export function TalkingAvatarPage({ setFullSizeAvatarUrl: _setFullSizeAvatarUrl, modeTabs }: TalkingAvatarPageProps) {
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const activeTalkingHistoryIdRef = useRef<string | null>(null)
  const [videoSource, setVideoSource] = useState<'url' | 'upload'>('url')
  const [videoUrl, setVideoUrl] = useState('')
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null)
  const [audioUploadProgress, setAudioUploadProgress] = useState(0)
  const [audioUploadDone, setAudioUploadDone] = useState(false)
  const [showVariationOptions, setShowVariationOptions] = useState(false)
  const [targetDuration, setTargetDuration] = useState(30)

  const {
    selectedAvatar,
    talkingAvatarUrl,
    generatedUrls,
    selectedGeneratedIndex,
    scriptConcept,
    scriptDuration,
    scriptTone,
    scriptGenerating,
    generatedScript,
    scriptHistory,
    scriptHistoryIndex,
    voices,
    voicesLoading,
    selectedVoice,
    audioUploading,
    lipsyncGenerating,
    scriptMode,
    transcribingVideo,
    transcriptionError,
    autoDetectLanguage,
    detectedLanguage,
    translationLanguages,
    translatedScripts,
    translatedVideos,
    translationGenerating,
    translationError,
    setScriptConcept,
    setScriptDuration,
    setScriptTone,
    setGeneratedScript,
    setSelectedVoice,
    setScriptMode,
    loadVoices,
    generateScript,
    refineScript,
    undoScript,
    redoScript,
    uploadAudio,
    transcribeVideo: transcribeVideoFromStore,
    toggleTranslationLanguage,
    setAutoDetectLanguage,
    clearTranslations,
    generateTalkingAvatarVideosBatch,
  } = useAvatarStore()
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => outputHistoryEntries.filter((entry) => entry.category === 'avatars_talking'),
    [outputHistoryEntries],
  )

  useEffect(() => {
    loadVoices()
  }, [loadVoices])

  useEffect(() => {
    if (!uploadedAudioFile) {
      setAudioUploadProgress(0)
      setAudioUploadDone(false)
      return
    }
    if (!audioUploading) return

    setAudioUploadDone(false)
    setAudioUploadProgress((prev) => (prev > 0 && prev < 95 ? prev : 8))
    const timer = window.setInterval(() => {
      setAudioUploadProgress((prev) => {
        if (prev >= 92) return prev
        return Math.min(92, prev + Math.max(2, Math.floor(Math.random() * 7)))
      })
    }, 220)

    return () => window.clearInterval(timer)
  }, [audioUploading, uploadedAudioFile])

  useEffect(() => {
    if (!uploadedAudioFile) return
    if (audioUploading) return
    if (uploadedAudioUrl) {
      setAudioUploadProgress(100)
      setAudioUploadDone(true)
    }
  }, [audioUploading, uploadedAudioFile, uploadedAudioUrl])

  const handleRefineScript = async (type: 'improved' | 'shorter' | 'longer') => {
    const prompts = {
      improved: 'Improve this script to be more engaging and professional while keeping similar length',
      shorter: 'Make this script 20% shorter while keeping key points',
      longer: 'Expand this script by 20% with additional relevant details',
    }
    await refineScript(prompts[type])
  }

  const transcribeVideo = async (url: string) => {
    await transcribeVideoFromStore(url)
  }

  const handleAudioFileSelected = async (file: File) => {
    setUploadedAudioFile(file)
    setUploadedAudioUrl(null)
    setAudioUploadProgress(5)
    setAudioUploadDone(false)
    const uploadedUrl = await uploadAudio(file)
    if (uploadedUrl) {
      setUploadedAudioUrl(uploadedUrl)
      await transcribeVideo(uploadedUrl)
    }
  }

  const scriptModeTabs: {
    id: 'existing' | 'audio' | 'fetch' | 'generate'
    label: string
  }[] = [
    { id: 'existing', label: 'Have a Script' },
    { id: 'audio', label: 'Have an Audio' },
    { id: 'fetch', label: 'Transcript Media' },
    { id: 'generate', label: 'Generate New' },
  ]
  const videoSourceTabs: { id: 'url' | 'upload'; label: string; icon: JSX.Element }[] = [
    { id: 'url', label: 'Video URL', icon: <Link className="w-4 h-4" /> },
    { id: 'upload', label: 'Upload File', icon: <Upload className="w-4 h-4" /> },
  ]
  const selectedAvatarUrl = (
    selectedAvatar?.url ||
    talkingAvatarUrl ||
    generatedUrls[selectedGeneratedIndex] ||
    ''
  ).trim()
  const hasSelectedAvatar = Boolean(selectedAvatarUrl)
  const showTranscribedAvatarThumb =
    (scriptMode === 'fetch' || scriptMode === 'audio') && Boolean(generatedScript.trim()) && hasSelectedAvatar

  const handleGenerateTalkingBatch = async () => {
    const historyId = createOutputHistoryId('talking')
    activeTalkingHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'avatars_talking',
      title: `Talking Avatar (${translationLanguages.length} language${translationLanguages.length === 1 ? '' : 's'})`,
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Generating videos...',
      artifacts: [],
    })

    await generateTalkingAvatarVideosBatch()
    if (activeTalkingHistoryIdRef.current !== historyId) return

    const state = useAvatarStore.getState()
    const completed = state.translatedVideos.filter((item) => item.status === 'completed' && item.videoUrl)
    const failed = state.translatedVideos.filter((item) => item.status === 'failed')

    if (completed.length === 0) {
      patchHistory(historyId, {
        status: 'failed',
        message: state.translationError?.message || 'No video output generated.',
        artifacts: [],
      })
      activeTalkingHistoryIdRef.current = null
      return
    }

    patchHistory(historyId, {
      status: failed.length > 0 ? 'completed' : 'completed',
      message:
        failed.length > 0
          ? `${completed.length} completed, ${failed.length} failed`
          : `${completed.length} video${completed.length === 1 ? '' : 's'} completed`,
      artifacts: completed.map((item) => ({
        id: `${historyId}_${item.language}`,
        label: item.language,
        type: 'video',
        url: item.videoUrl || undefined,
      })),
    })
    activeTalkingHistoryIdRef.current = null
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left Column: Inputs (Avatar + Script + TTS) */}
      <div className="space-y-6">
        {modeTabs && (
          <div className="bg-surface-50 rounded-lg p-4 space-y-4">
            <StepHeader stepNumber={1} title="Mode" />
            {modeTabs}
          </div>
        )}
        {/* Step 2: Avatar Selection */}
        <AvatarSelectionCard stepNumber={2} subtitle="(Optional)" showGenerateOptions={true} />

        {/* Step 3: Script */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={3} title="Script" />

          <SegmentedTabs
            value={scriptMode}
            items={scriptModeTabs}
            onChange={setScriptMode}
            ariaLabel="Script mode"
            size="sm"
            className="mb-4"
          />

          {/* Mode: Already Have Script */}
          {scriptMode === 'existing' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Your Script</span>
                {generatedScript && !scriptGenerating && (
                  <Button variant="ghost" size="sm" onClick={() => setShowVariationOptions(!showVariationOptions)}>
                    Improve
                  </Button>
                )}
              </div>
              {showVariationOptions && generatedScript && (
                <ScriptRefinementToolbar
                  onImprove={() => handleRefineScript('improved')}
                  onShorter={() => handleRefineScript('shorter')}
                  onLonger={() => handleRefineScript('longer')}
                  onDuration={(duration) =>
                    refineScript(
                      `Adjust this script to be exactly ${duration} seconds long (approximately ${Math.round(duration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`,
                      duration,
                    )
                  }
                  onUndo={undoScript}
                  onRedo={redoScript}
                  isGenerating={scriptGenerating}
                  canUndo={scriptHistoryIndex > 0}
                  canRedo={scriptHistoryIndex < scriptHistory.length - 1}
                  targetDuration={targetDuration}
                  onTargetDurationChange={setTargetDuration}
                />
              )}
              <Textarea
                value={generatedScript}
                onChange={(e) => setGeneratedScript(e.target.value)}
                placeholder="Paste or type your script here..."
                rows={6}
                disabled={scriptGenerating}
              />
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
              <p className="text-sm text-surface-400">Select a video source to transcribe its audio into a script</p>

              {/* Video Source Tabs */}
              {!transcribingVideo && (
                <>
                  <SegmentedTabs
                    value={videoSource}
                    items={videoSourceTabs}
                    onChange={setVideoSource}
                    ariaLabel="Transcript video source"
                    size="sm"
                  />

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
                        ✅ Supports: Facebook Ads Library, Instagram, TikTok, YouTube, and direct video links (.mp4,
                        .mov, etc.)
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
                        accept="video/*,audio/*"
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
                        {uploadingVideo ? 'Uploading...' : 'Choose Media File'}
                      </Button>
                      <p className="text-xs text-surface-400">
                        Supported formats: MP4, MOV, AVI, MP3, WAV, M4A, etc. Max 500MB.
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
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  {showTranscribedAvatarThumb && (
                    <div className={`${TRANSCRIBED_AVATAR_WIDTH_CLASS} shrink-0`}>
                      <p className="text-[11px] uppercase tracking-wide text-surface-400 mb-2">Selected Avatar</p>
                      <div
                        className={`w-full ${TRANSCRIBED_AVATAR_HEIGHT_CLASS} rounded-lg overflow-hidden border border-surface-200 bg-surface-0`}
                      >
                        <img
                          src={assetUrl(selectedAvatarUrl)}
                          alt="Selected avatar"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-400">Script</span>
                      <div className="flex items-center gap-2">
                        {!scriptGenerating && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowVariationOptions(!showVariationOptions)}
                          >
                            Improve
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setGeneratedScript('')
                            useAvatarStore.setState({ transcriptionError: null })
                          }}
                          className="text-xs text-surface-400 hover:text-surface-300"
                        >
                          Try another
                        </button>
                      </div>
                    </div>
                    {showVariationOptions && (
                      <ScriptRefinementToolbar
                        onImprove={() => handleRefineScript('improved')}
                        onShorter={() => handleRefineScript('shorter')}
                        onLonger={() => handleRefineScript('longer')}
                        onDuration={(duration) =>
                          refineScript(
                            `Adjust this script to be exactly ${duration} seconds long (approximately ${Math.round(duration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`,
                            duration,
                          )
                        }
                        onUndo={undoScript}
                        onRedo={redoScript}
                        isGenerating={scriptGenerating}
                        canUndo={scriptHistoryIndex > 0}
                        canRedo={scriptHistoryIndex < scriptHistory.length - 1}
                        targetDuration={targetDuration}
                        onTargetDurationChange={setTargetDuration}
                      />
                    )}
                    <Textarea
                      value={generatedScript}
                      onChange={(e) => setGeneratedScript(e.target.value)}
                      rows={6}
                      disabled={scriptGenerating}
                      className={TRANSCRIBED_TEXTAREA_HEIGHT_CLASS}
                    />
                    <p className="text-xs text-surface-400">
                      {generatedScript.split(/\s+/).filter(Boolean).length} words (~
                      {Math.ceil((generatedScript.split(/\s+/).filter(Boolean).length / 150) * 60)}s)
                    </p>
                  </div>
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

              {!uploadedAudioFile ? (
                <div className="border-2 border-dashed border-surface-200 rounded-lg p-6 text-center">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-surface-300" />
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    id="audio-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        void handleAudioFileSelected(file)
                      }
                      e.currentTarget.value = ''
                    }}
                  />
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => document.getElementById('audio-upload')?.click()}
                    className="mx-auto"
                  >
                    Choose Audio File
                  </Button>
                  <p className="text-xs text-surface-400 mt-2">Supported: MP3, WAV, M4A, etc.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-surface-100 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-surface-400" />
                      <span className="text-sm font-medium">{uploadedAudioFile.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedAudioFile(null)
                        setUploadedAudioUrl(null)
                        setAudioUploadProgress(0)
                        setAudioUploadDone(false)
                      }}
                      className="text-xs text-surface-400 hover:text-surface-300"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="p-3 bg-surface-100 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-surface-400">
                      <span className="flex items-center gap-2">
                        {audioUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {audioUploading ? 'Uploading automatically...' : audioUploadDone ? 'Upload completed' : 'Ready'}
                      </span>
                      <span>{Math.round(audioUploadProgress)}%</span>
                    </div>
                    <ProgressBar value={audioUploadProgress} />
                    {audioUploadDone && (
                      <div className="text-xs text-success flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Audio uploaded successfully.
                      </div>
                    )}
                  </div>
                  {uploadedAudioUrl && (
                    <div className="p-3 bg-surface-100 rounded-lg">
                      <p className="text-xs text-surface-400 mb-2">Uploaded Audio Preview</p>
                      <AudioPlayer src={assetUrl(uploadedAudioUrl)} />
                    </div>
                  )}
                  {transcribingVideo && (
                    <div className="p-3 bg-surface-100 rounded-lg text-xs text-surface-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribing audio to script...
                    </div>
                  )}
                  {generatedScript && !transcribingVideo && (
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      {showTranscribedAvatarThumb && (
                        <div className={`${TRANSCRIBED_AVATAR_WIDTH_CLASS} shrink-0`}>
                          <p className="text-[11px] uppercase tracking-wide text-surface-400 mb-2">Selected Avatar</p>
                          <div
                            className={`w-full ${TRANSCRIBED_AVATAR_HEIGHT_CLASS} rounded-lg overflow-hidden border border-surface-200 bg-surface-0`}
                          >
                            <img
                              src={assetUrl(selectedAvatarUrl)}
                              alt="Selected avatar"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-surface-400">Transcribed Script</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowVariationOptions(!showVariationOptions)}
                          >
                            Improve
                          </Button>
                        </div>
                        {showVariationOptions && (
                          <ScriptRefinementToolbar
                            onImprove={() => handleRefineScript('improved')}
                            onShorter={() => handleRefineScript('shorter')}
                            onLonger={() => handleRefineScript('longer')}
                            onDuration={(duration) =>
                              refineScript(
                                `Adjust this script to be exactly ${duration} seconds long (approximately ${Math.round(duration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`,
                                duration,
                              )
                            }
                            onUndo={undoScript}
                            onRedo={redoScript}
                            isGenerating={scriptGenerating}
                            canUndo={scriptHistoryIndex > 0}
                            canRedo={scriptHistoryIndex < scriptHistory.length - 1}
                            targetDuration={targetDuration}
                            onTargetDurationChange={setTargetDuration}
                          />
                        )}
                        <Textarea
                          value={generatedScript}
                          onChange={(e) => setGeneratedScript(e.target.value)}
                          rows={6}
                          disabled={scriptGenerating}
                          className={TRANSCRIBED_TEXTAREA_HEIGHT_CLASS}
                        />
                        <p className="text-xs text-surface-400">
                          {generatedScript.split(/\s+/).filter(Boolean).length} words (~
                          {Math.ceil((generatedScript.split(/\s+/).filter(Boolean).length / 150) * 60)}s)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode: Generate New Script */}
          {scriptMode === 'generate' && (
            <div className="space-y-4">
              <Input
                label="What is your video about?"
                value={scriptConcept}
                onChange={(e) => setScriptConcept(e.target.value)}
                placeholder="e.g., Introducing our new AI-powered analytics platform"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Duration (seconds)"
                  type="number"
                  value={scriptDuration}
                  onChange={(e) => setScriptDuration(Number(e.target.value))}
                  min={5}
                  max={120}
                />
                <Select
                  label="Tone"
                  value={scriptTone}
                  onChange={(e) => setScriptTone(e.target.value as ScriptTone)}
                  options={TONE_OPTIONS}
                />
              </div>
              <Button
                size="md"
                icon={scriptGenerating ? undefined : <Wand2 className="w-4 h-4" />}
                loading={scriptGenerating}
                onClick={generateScript}
                disabled={!scriptConcept.trim() || scriptGenerating}
                className="w-full"
              >
                {scriptGenerating ? 'Generating Script...' : generatedScript ? 'Regenerate' : 'Generate Script'}
              </Button>

              {generatedScript && !scriptGenerating && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-400">Generated Script</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowVariationOptions(!showVariationOptions)}>
                      Improve
                    </Button>
                  </div>
                  {showVariationOptions && (
                    <ScriptRefinementToolbar
                      onImprove={() => handleRefineScript('improved')}
                      onShorter={() => handleRefineScript('shorter')}
                      onLonger={() => handleRefineScript('longer')}
                      onDuration={(duration) =>
                        refineScript(
                          `Adjust this script to be exactly ${duration} seconds long (approximately ${Math.round(duration * 2.5)} words). If too long, remove unnecessary words/phrases. If too short, add relevant details between existing sentences. Keep the original structure and flow - only add or remove minimal content to reach the target duration.`,
                          duration,
                        )
                      }
                      onUndo={undoScript}
                      onRedo={redoScript}
                      isGenerating={scriptGenerating}
                      canUndo={scriptHistoryIndex > 0}
                      canRedo={scriptHistoryIndex < scriptHistory.length - 1}
                      targetDuration={targetDuration}
                      onTargetDurationChange={setTargetDuration}
                    />
                  )}
                  <Textarea
                    value={generatedScript}
                    onChange={(e) => setGeneratedScript(e.target.value)}
                    rows={6}
                    disabled={scriptGenerating}
                  />
                  <p className="text-xs text-surface-400">
                    {generatedScript.split(/\s+/).filter(Boolean).length} words (~
                    {Math.ceil((generatedScript.split(/\s+/).filter(Boolean).length / 150) * 60)}s)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {generatedScript && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={4} title="Languages" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-surface-400">Enable language cards (max 10).</p>
              <button
                type="button"
                onClick={() => setAutoDetectLanguage(!autoDetectLanguage)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  autoDetectLanguage
                    ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                    : 'border-surface-200 text-surface-400'
                }`}
              >
                Auto-detect {autoDetectLanguage ? 'On' : 'Off'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {TALKING_AVATAR_LANGUAGE_CARDS.map((language) => {
                const active = translationLanguages.includes(language.code)
                const detected = detectedLanguage === language.code
                return (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => toggleTranslationLanguage(language.code)}
                    className={`px-3 py-2 rounded-lg text-xs border text-left transition-colors ${
                      active
                        ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                        : 'border-surface-200 text-surface-300 hover:text-surface-100 hover:border-surface-100'
                    }`}
                  >
                    <div className="font-semibold">{language.code}</div>
                    <div className="text-[10px] opacity-80">{language.label}</div>
                    {detected && <div className="text-[10px] mt-1 text-brand-300">Auto detected</div>}
                  </button>
                )
              })}
            </div>
            {translationError && (
              <div className="mt-3 bg-danger-muted/50 border border-danger/40 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                  <p className="text-danger text-sm">{translationError.message}</p>
                </div>
              </div>
            )}
            {translatedScripts.length > 0 && (
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="md" onClick={clearTranslations}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        {generatedScript && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={5} title="Voice" />
            <div className="space-y-4">
              {voicesLoading ? (
                <LoadingState title="Loading voices..." size="sm" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {voices.slice(0, 10).map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        selectedVoice === voice.id
                          ? 'bg-brand-500/20 border-brand-500 text-brand-100'
                          : 'border-surface-200 text-surface-300 hover:border-surface-100 hover:text-surface-100'
                      }`}
                    >
                      <p className="text-xs font-semibold truncate">{voice.name}</p>
                      <p className="text-[10px] opacity-80 mt-1 truncate">
                        {voice.labels?.accent || voice.category || 'Voice'}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              <Button
                size="lg"
                icon={translationGenerating || lipsyncGenerating ? undefined : <Video className="w-5 h-5" />}
                loading={translationGenerating || lipsyncGenerating}
                onClick={handleGenerateTalkingBatch}
                disabled={
                  voicesLoading ||
                  !selectedVoice ||
                  translationLanguages.length === 0 ||
                  !generatedScript.trim() ||
                  !hasSelectedAvatar
                }
                className="w-full"
              >
                {translationGenerating || lipsyncGenerating
                  ? 'Generating...'
                  : `Generate ${translationLanguages.length} Talking Avatar Videos`}
              </Button>
              {!hasSelectedAvatar && (
                <p className="text-xs text-surface-400">
                  Select an avatar first. This flow now generates video-only outputs.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Outputs */}
      <div className="space-y-6">
        {translatedScripts.length > 0 && (
          <div className="bg-surface-50 rounded-lg p-4 space-y-3">
            <StepHeader stepNumber={6} title="Final Outputs" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {translatedScripts.map((entry) => {
                const video = translatedVideos.find((item) => item.language === entry.language)
                const hasVideo = Boolean(video?.videoUrl && /\.(mp4|mov|webm|m4v)$/i.test(video.videoUrl))
                return (
                  <div key={entry.language} className="bg-surface-0 border border-surface-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-surface-400">{entry.language}</span>
                      {!video || video.status === 'queued' ? (
                        <span className="text-xs text-surface-400">Queued</span>
                      ) : null}
                    </div>

                    {video?.status === 'generating' && (
                      <div className="flex items-center gap-2 text-xs text-surface-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating talking avatar video...
                      </div>
                    )}
                    {video?.status === 'failed' && (
                      <p className="text-xs text-danger">{video.error || 'Video generation failed'}</p>
                    )}
                    {video?.status === 'completed' && video.videoUrl && (
                      <div className="space-y-2">
                        {hasVideo ? (
                          <div className="rounded-lg overflow-hidden">
                            {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                            <video controls src={assetUrl(video.videoUrl)} className="w-full" />
                          </div>
                        ) : (
                          <p className="text-xs text-danger">Video output missing for this language.</p>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Download className="w-4 h-4" />}
                          onClick={() =>
                            downloadVideo(
                              assetUrl(video.videoUrl || ''),
                              `talking-avatar-${entry.language.toLowerCase()}.mp4`,
                            )
                          }
                          disabled={!hasVideo}
                        >
                          Download Video
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
