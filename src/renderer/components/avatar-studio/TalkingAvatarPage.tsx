import {
  AlertCircle,
  CheckCircle,
  Download,
  Loader2,
  Mic,
  Upload,
  Video,
  Volume2,
  Wand2,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch } from '../../lib/api'
import { downloadVideo } from '../../lib/download'
import type { ScriptTone } from '../../stores/avatarStore'
import { useAvatarStore } from '../../stores/avatarStore'
import { AudioPlayer } from '../ui/AudioPlayer'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { StepHeader } from '../asset-monster/StepHeader'
import { ScriptRefinementToolbar } from './ScriptRefinementToolbar'
import { AvatarSelectionCard } from './shared/AvatarSelectionCard'

const TONE_OPTIONS = [
  { value: 'energetic', label: 'Energetic' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'dramatic', label: 'Dramatic' },
]

interface TalkingAvatarPageProps {
  fullSizeAvatarUrl: string | null
  setFullSizeAvatarUrl: (url: string | null) => void
}

export function TalkingAvatarPage({ setFullSizeAvatarUrl }: TalkingAvatarPageProps) {
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const [videoSource, setVideoSource] = useState<'url' | 'upload'>('url')
  const [videoUrl, setVideoUrl] = useState('')
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [showVariationOptions, setShowVariationOptions] = useState(false)
  const [targetDuration, setTargetDuration] = useState(30)

  const {
    selectedAvatar,
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
    ttsGenerating,
    audioUploading,
    generatedAudioUrl,
    lipsyncGenerating,
    lipsyncJob,
    generatedVideoUrl,
    scriptMode,
    transcribingVideo,
    transcriptionError,
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
    generateTTS,
    uploadAudio,
    createLipsync,
    transcribeVideo: transcribeVideoFromStore,
  } = useAvatarStore()

  useEffect(() => {
    loadVoices()
  }, [loadVoices])

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

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Column: Avatar Selection */}
      <div className="space-y-6">
        <AvatarSelectionCard stepNumber={1} subtitle="(Optional)" showGenerateOptions={true} />

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

      {/* Right Column: Script & TTS Workflow */}
      <div className="space-y-6">
        {/* Step 2: Script */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Script" />

          {/* Mode Switcher - 4 modes in 2x2 grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setScriptMode('existing')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scriptMode === 'existing'
                  ? 'bg-brand-600 text-surface-900'
                  : 'bg-surface-100 text-surface-400 hover:text-surface-900'
              }`}
            >
              Have a Script
            </button>
            <button
              type="button"
              onClick={() => setScriptMode('audio')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scriptMode === 'audio'
                  ? 'bg-brand-600 text-surface-900'
                  : 'bg-surface-100 text-surface-400 hover:text-surface-900'
              }`}
            >
              Have an Audio
            </button>
            <button
              type="button"
              onClick={() => setScriptMode('fetch')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scriptMode === 'fetch'
                  ? 'bg-brand-600 text-surface-900'
                  : 'bg-surface-100 text-surface-400 hover:text-surface-900'
              }`}
            >
              Transcript from Media
            </button>
            <button
              type="button"
              onClick={() => setScriptMode('generate')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scriptMode === 'generate'
                  ? 'bg-brand-600 text-surface-900'
                  : 'bg-surface-100 text-surface-400 hover:text-surface-900'
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
                {generatedScript && !scriptGenerating && (
                  <button
                    type="button"
                    onClick={() => setShowVariationOptions(!showVariationOptions)}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    Improve Script
                  </button>
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
              {!transcribingVideo && !generatedScript && (
                <>
                  <div className="flex bg-surface-100 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setVideoSource('url')}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                        videoSource === 'url'
                          ? 'bg-brand-600 text-surface-900'
                          : 'text-surface-400 hover:text-surface-900'
                      }`}
                    >
                      Video URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoSource('upload')}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                        videoSource === 'upload'
                          ? 'bg-brand-600 text-surface-900'
                          : 'text-surface-400 hover:text-surface-900'
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-surface-400">Script</label>
                    <div className="flex items-center gap-2">
                      {!scriptGenerating && (
                        <button
                          type="button"
                          onClick={() => setShowVariationOptions(!showVariationOptions)}
                          className="text-xs text-brand-400 hover:text-brand-300"
                        >
                          Improve Script
                        </button>
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
                  />
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
                        setUploadedAudioFile(file)
                      }
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
                      onClick={() => setUploadedAudioFile(null)}
                      className="text-xs text-surface-400 hover:text-surface-300"
                    >
                      Remove
                    </button>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    icon={audioUploading ? undefined : <Upload className="w-4 h-4" />}
                    loading={audioUploading}
                    onClick={() => uploadAudio(uploadedAudioFile)}
                    disabled={audioUploading}
                    className="w-full"
                  >
                    {audioUploading ? 'Uploading...' : 'Upload Audio'}
                  </Button>
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
              <div className="grid grid-cols-2 gap-3">
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
                variant="primary"
                size="md"
                icon={scriptGenerating ? undefined : <Wand2 className="w-4 h-4" />}
                loading={scriptGenerating}
                onClick={generateScript}
                disabled={!scriptConcept.trim() || scriptGenerating}
                className="w-full"
              >
                {scriptGenerating ? 'Generating Script...' : 'Generate Script'}
              </Button>

              {generatedScript && !scriptGenerating && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-surface-400">Generated Script</label>
                    <button
                      type="button"
                      onClick={() => setShowVariationOptions(!showVariationOptions)}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      Improve Script
                    </button>
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

        {/* Step 3: Text to Speech (conditional - only if not "Have an Audio" mode) */}
        {scriptMode !== 'audio' && generatedScript && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={3} title="Text to Speech" />

            <div className="space-y-4">
              {voicesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
                </div>
              ) : (
                <Select
                  label="Voice"
                  value={selectedVoice || ''}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  options={voices.map((v) => ({ value: v.id, label: v.name }))}
                />
              )}

              <Button
                variant="primary"
                size="md"
                icon={ttsGenerating ? undefined : <Mic className="w-4 h-4" />}
                loading={ttsGenerating}
                onClick={generateTTS}
                disabled={!selectedVoice || ttsGenerating}
                className="w-full"
              >
                {ttsGenerating ? 'Generating Audio...' : 'Generate Voice'}
              </Button>

              {generatedAudioUrl && (
                <div className="p-3 bg-surface-100 rounded-lg">
                  <p className="text-sm text-surface-400 mb-2">Generated Audio:</p>
                  <AudioPlayer src={assetUrl(generatedAudioUrl)} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Lipsync Video */}
        {generatedAudioUrl && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={scriptMode === 'audio' ? 3 : 4} title="Create Talking Avatar Video" />

            <div className="space-y-4">
              <Button
                variant="success"
                size="lg"
                icon={lipsyncGenerating ? undefined : <Video className="w-5 h-5" />}
                loading={lipsyncGenerating}
                onClick={createLipsync}
                disabled={!generatedAudioUrl || lipsyncGenerating}
                className="w-full"
              >
                {lipsyncGenerating ? 'Creating Video...' : 'Create Talking Avatar Video'}
              </Button>

              {lipsyncJob && (
                <div className="p-3 bg-surface-100 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    {lipsyncJob.status === 'pending' && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-brand" />
                        <span className="text-surface-500">Queued...</span>
                      </>
                    )}
                    {lipsyncJob.status === 'processing' && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-brand" />
                        <span className="text-surface-500">Processing... ({lipsyncJob.progress || 0}%)</span>
                      </>
                    )}
                    {lipsyncJob.status === 'completed' && (
                      <>
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-success">Complete!</span>
                      </>
                    )}
                    {lipsyncJob.status === 'error' && (
                      <>
                        <XCircle className="w-4 h-4 text-danger" />
                        <span className="text-danger">Failed</span>
                      </>
                    )}
                  </div>
                  {lipsyncJob.message && <p className="text-xs text-surface-400 mt-1">{lipsyncJob.message}</p>}
                </div>
              )}

              {generatedVideoUrl && (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden">
                    {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                    <video controls autoPlay loop src={assetUrl(generatedVideoUrl)} className="w-full" />
                  </div>
                  <Button
                    variant="success"
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    onClick={() => downloadVideo(assetUrl(generatedVideoUrl), 'talking-avatar.mp4')}
                    className="w-full"
                  >
                    Download Video
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
