import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Upload,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { notify } from '../../lib/toast'
import { useAvatarStore } from '../../stores/avatarStore'
import { useMachineStore } from '../../stores/machineStore'
import { StepHeader } from '../asset-monster/StepHeader'
import { ScriptRefinementToolbar } from '../avatar-studio/ScriptRefinementToolbar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingState } from '../ui/LoadingState'
import { ProgressBar } from '../ui/ProgressBar'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { StatusBanner } from '../ui/StatusBanner'
import { Textarea } from '../ui/Textarea'

const STEP_LABELS = {
  prompts: 'Generate Prompts',
  images: 'Generate Images',
  script: 'Write Script',
  tts: 'Text-to-Speech',
  lipsync: 'Lipsync Video',
} as const

const STEP_ORDER = ['prompts', 'images', 'script', 'tts', 'lipsync'] as const
const GREENBOX_PROMPT =
  'Using the provided reference image, preserve the face, identity, age, and pose exactly. Isolate the subject cleanly and place them on a solid chroma green (#00FF00) background. No extra objects or text. Keep clothing and proportions unchanged. High-quality cutout.'
const GREEN_THRESHOLD = {
  minGreen: 120,
  minDominance: 35,
  ratio: 0.6,
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DURATION_OPTIONS = [
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
  { value: '20', label: '20s' },
  { value: '25', label: '25s' },
  { value: '30', label: '30s' },
]

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'dramatic', label: 'Dramatic' },
]

const APP_OPTIONS = [
  { value: 'Clone AI', label: 'Clone AI' },
  { value: 'Fling', label: 'Fling' },
  { value: 'Impresso', label: 'Impresso' },
  { value: 'Renova', label: 'Renova' },
  { value: 'Fyro', label: 'Fyro' },
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

export default function MachinePage() {
  const machineRefInputRef = useRef<HTMLInputElement>(null)
  const avatarUploadInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [assetsDownloading, setAssetsDownloading] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const {
    step,
    failedStep,
    error,
    concept,
    promptCount,
    refPreviews,
    scriptDuration,
    scriptTone,
    selectedApp,
    selectedVoice,
    selectedAvatar,
    selectedAvatars,
    prompts,
    batchProgress,
    script,
    scriptGenerating,
    scriptHistory,
    scriptHistoryIndex,
    audioUrl,
    videoUrl,
    setConcept,
    setPromptCount,
    setScriptDuration,
    setScriptTone,
    setSelectedApp,
    setSelectedVoice,
    setSelectedAvatar,
    toggleGalleryAvatar,
    setScript,
    refineScript,
    undoScript,
    redoScript,
    addRefImages,
    removeRefImage,
    generateScript,
    run,
    cancel,
  } = useMachineStore()

  const { avatars, avatarsLoading, voices, voicesLoading, loadAvatars } = useAvatarStore()
  const [showImproveOptions, setShowImproveOptions] = useState(false)
  const [targetDuration, setTargetDuration] = useState(20)

  useEffect(() => {
    const { loadAvatars, loadVoices } = useAvatarStore.getState()
    loadAvatars()
    loadVoices()
  }, [])

  const detectGreenScreen = async (file: File): Promise<boolean> => {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = url
      })
      const maxDim = 200
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      ctx.drawImage(img, 0, 0, width, height)
      const { data } = ctx.getImageData(0, 0, width, height)
      const margin = Math.max(2, Math.round(Math.min(width, height) * 0.12))
      let total = 0
      let green = 0
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (x > margin && x < width - margin && y > margin && y < height - margin) continue
          const idx = (y * width + x) * 4
          const r = data[idx]
          const g = data[idx + 1]
          const b = data[idx + 2]
          total++
          if (
            g >= GREEN_THRESHOLD.minGreen &&
            g - r >= GREEN_THRESHOLD.minDominance &&
            g - b >= GREEN_THRESHOLD.minDominance
          ) {
            green++
          }
        }
      }
      if (!total) return false
      return green / total >= GREEN_THRESHOLD.ratio
    } catch {
      return false
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true)
    try {
      const alreadyGreen = await detectGreenScreen(file)
      if (alreadyGreen) {
        const formData = new FormData()
        formData.append('files', file)
        const res = await authFetch(apiUrl('/api/avatars/upload'), {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Failed to upload avatar'))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ avatars: Array<{ name: string; filename: string; url: string }> }>(raw)
        const uploaded = data.avatars?.[0]
        await loadAvatars()
        if (uploaded) {
          toggleGalleryAvatar({
            name: uploaded.name,
            filename: uploaded.filename,
            url: uploaded.url,
            source: 'uploaded',
          })
        }
        notify.success('Avatar uploaded')
      } else {
        const formData = new FormData()
        formData.append('referenceImage', file)
        formData.append('prompt', GREENBOX_PROMPT)
        formData.append('aspectRatio', '9:16')
        const res = await authFetch(apiUrl('/api/avatars/generate-from-reference'), {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Failed to process avatar'))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ localPath: string }>(raw)
        await loadAvatars()
        const updated = useAvatarStore.getState().avatars.find((a) => a.url === data.localPath)
        const filename = data.localPath.split('/').pop() || file.name
        toggleGalleryAvatar(
          updated ?? {
            name: filename,
            filename,
            url: data.localPath,
            source: 'generated',
          },
        )
        notify.success('Avatar processed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload avatar'
      notify.error(message)
    } finally {
      setAvatarUploading(false)
      if (avatarUploadInputRef.current) avatarUploadInputRef.current.value = ''
    }
  }

  const isIdle = step === 'idle'
  const isError = step === 'error'
  const isDone = step === 'done'
  const isRunning = !isIdle && !isError && !isDone
  const completedImages = batchProgress?.images.filter((image) => image.status === 'completed' && image.url) ?? []
  const hasAnyAsset = completedImages.length > 0 || Boolean(script.trim() || audioUrl || videoUrl)
  const previewImage = previewIndex != null ? completedImages[previewIndex] : null
  const hasPrevPreview = previewIndex != null && previewIndex > 0
  const hasNextPreview = previewIndex != null && previewIndex < completedImages.length - 1

  useEffect(() => {
    if (previewIndex == null) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewIndex(null)
        return
      }
      if (e.key === 'ArrowLeft' && hasPrevPreview) {
        setPreviewIndex((prev) => (prev == null ? prev : Math.max(0, prev - 1)))
      }
      if (e.key === 'ArrowRight' && hasNextPreview) {
        setPreviewIndex((prev) => (prev == null ? prev : Math.min(completedImages.length - 1, prev + 1)))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [previewIndex, hasPrevPreview, hasNextPreview, completedImages.length])

  const handleDownloadAllAssets = async () => {
    if (!hasAnyAsset || assetsDownloading) return

    try {
      setAssetsDownloading(true)
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      if (completedImages.length > 0) {
        const imagesFolder = zip.folder('images')
        await Promise.all(
          completedImages.map(async (image, index) => {
            const imageUrl = image.url ? assetUrl(image.url) : ''
            if (!imagesFolder || !imageUrl) return
            const res = await fetch(imageUrl)
            if (!res.ok) return
            const blob = await res.blob()
            const fallbackName = `image_${String(index + 1).padStart(2, '0')}.jpg`
            const fileName = image.url?.split('/').pop() || fallbackName
            imagesFolder.file(fileName, blob)
          }),
        )
      }

      if (script.trim()) {
        zip.file('script.txt', script.trim())
      }

      if (prompts.length > 0) {
        zip.file('prompts.json', JSON.stringify(prompts, null, 2))
      }

      if (audioUrl) {
        const res = await fetch(assetUrl(audioUrl))
        if (res.ok) {
          const blob = await res.blob()
          zip.file(audioUrl.split('/').pop() || 'voiceover.mp3', blob)
        }
      }

      if (videoUrl) {
        const res = await fetch(assetUrl(videoUrl))
        if (res.ok) {
          const blob = await res.blob()
          zip.file(videoUrl.split('/').pop() || 'avatar-video.mp4', blob)
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const blobUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `machine_assets_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      notify.success('Downloaded all assets')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download assets'
      notify.error(message)
    } finally {
      setAssetsDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <StatusBanner
          type={error.type}
          message={error.message}
          onDismiss={() => useMachineStore.setState({ error: null })}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={1} title="Concept" />
            <Input
              label="Concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. Christmas, Halloween, Summer Beach..."
            />
          </div>

          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={2} title="Prompt Generation" />
            <Slider
              label="Number of Prompts"
              displayValue={promptCount}
              min={1}
              max={10}
              value={promptCount}
              onChange={(e) => setPromptCount(Number(e.currentTarget.value))}
            />
            <div className="flex justify-between text-xs text-surface-400 mt-1">
              <span>1</span>
              <span>6</span>
              <span>10</span>
            </div>
          </div>

          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={3} title="Reference Images" />
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-surface-400">Avatar (Required)</p>
                  <Button
                    variant="ghost-muted"
                    size="sm"
                    icon={avatarUploading ? undefined : <Upload className="w-4 h-4" />}
                    loading={avatarUploading}
                    disabled={avatarUploading}
                    onClick={() => avatarUploadInputRef.current?.click()}
                  >
                    {avatarUploading ? 'Uploading...' : 'Upload Avatar'}
                  </Button>
                  <input
                    ref={avatarUploadInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void handleAvatarUpload(file)
                    }}
                  />
                </div>
                {avatarsLoading ? (
                  <LoadingState title="Loading avatars..." size="sm" />
                ) : avatars.length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">
                    No avatars. Go to the Avatars tab to generate or upload some.
                  </p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {avatars.map((avatar) => {
                      const selIdx = selectedAvatars.findIndex((a) => a.filename === avatar.filename)
                      const isSelected = selIdx >= 0
                      return (
                        <button
                          type="button"
                          key={avatar.filename}
                          onClick={() => toggleGalleryAvatar(avatar)}
                          className={`w-20 shrink-0 aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                            isSelected
                              ? 'border-brand-500 ring-2 ring-brand-500/50'
                              : 'border-transparent hover:border-surface-200'
                          }`}
                        >
                          <img src={assetUrl(avatar.url)} alt={avatar.name} className="w-full h-full object-cover" />
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-brand-500 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white">
                              {selIdx + 1}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] text-surface-400 mt-2">
                  {selectedAvatars.length > 1
                    ? `${selectedAvatars.length} avatars selected — #1 is used for lipsync, all are reference images.`
                    : 'Select one or more avatars. First selected is used for lipsync. Uploaded avatars are auto green-screened.'}
                </p>
              </div>

              <div>
                <p className="text-xs text-surface-400 mb-2">Additional People (Optional)</p>
                <input
                  ref={machineRefInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addRefImages(Array.from(e.target.files).slice(0, 5))
                    e.target.value = ''
                  }}
                />
                {refPreviews.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {refPreviews.map((src, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: static list
                        key={i}
                        className="relative w-16 h-16 rounded overflow-hidden"
                      >
                        <img src={src} alt={`Reference person ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeRefImage(i)}
                          className="absolute top-0 right-0 bg-black/60 rounded-bl p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {refPreviews.length < 5 && (
                      <button
                        type="button"
                        onClick={() => machineRefInputRef.current?.click()}
                        className="w-16 h-16 border-2 border-dashed border-surface-200 rounded flex items-center justify-center text-surface-400 hover:text-surface-900 hover:border-surface-200"
                      >
                        <ImagePlus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => machineRefInputRef.current?.click()}
                    className="w-full py-4 border-2 border-dashed border-surface-200 rounded-lg text-surface-400 hover:text-surface-900 hover:border-surface-200 flex flex-col items-center gap-1"
                  >
                    <Users className="w-5 h-5" />
                    <span className="text-xs">Add extra people for couple/family (max 5)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={4} title="Voiceover" />
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="App"
                  value={selectedApp}
                  onChange={(e) => {
                    setSelectedApp(e.target.value)
                    if (concept.trim() && !isRunning && !scriptGenerating) generateScript()
                  }}
                  options={APP_OPTIONS}
                />
                <Select
                  label="Duration"
                  value={String(scriptDuration)}
                  onChange={(e) => setScriptDuration(Number(e.target.value))}
                  options={DURATION_OPTIONS}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1">
                <div className="flex items-center justify-start">
                  <p className="text-xs text-surface-400">Avatar</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-surface-400">Voiceover Script</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateScript}
                    disabled={!concept.trim() || scriptGenerating || isRunning}
                    loading={scriptGenerating}
                    className="ml-auto"
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowImproveOptions((prev) => !prev)}
                    disabled={!script.trim() || scriptGenerating}
                  >
                    Improve
                  </Button>
                </div>
                <div className="relative w-[120px] aspect-square rounded-lg border border-surface-200 bg-surface-100 overflow-hidden">
                  {selectedAvatar ? (
                    <>
                      <img
                        src={assetUrl(selectedAvatar.url)}
                        alt={selectedAvatar.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedAvatar(null)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-danger flex items-center justify-center"
                        title="Remove avatar"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-surface-400">
                      No avatar
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <Textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Generate a script or type your own..."
                    rows={6}
                    className="h-[120px] resize-none"
                  />
                  {showImproveOptions && (
                    <div className="mt-3">
                      <ScriptRefinementToolbar
                        onImprove={() =>
                          refineScript(
                            'Improve this script to be more engaging and professional while keeping similar length',
                          )
                        }
                        onShorter={() => refineScript('Make this script 20% shorter while keeping key points')}
                        onLonger={() => refineScript('Expand this script by 20% with additional relevant details')}
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
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  {voicesLoading ? (
                    <LoadingState title="Loading voices..." size="sm" />
                  ) : (
                    <Select
                      label="Voice"
                      value={selectedVoice?.id || ''}
                      onChange={(e) => setSelectedVoice(voices.find((v) => v.id === e.target.value) || null)}
                      options={[
                        { value: '', label: 'Select a voice...' },
                        ...voices.map((v) => ({
                          value: v.id,
                          label: `${v.name}${v.labels?.accent ? ` (${v.labels.accent})` : ''}`,
                        })),
                      ]}
                    />
                  )}
                </div>
                <Select
                  label="Tone"
                  value={scriptTone}
                  onChange={(e) => setScriptTone(e.target.value as typeof scriptTone)}
                  options={TONE_OPTIONS}
                />
              </div>
            </div>
          </div>

          <Button
            variant="lime"
            size="lg"
            onClick={() => run()}
            disabled={!concept.trim() || !selectedAvatar || !selectedVoice || isRunning}
            icon={<Zap className="w-6 h-6" />}
            className="w-full py-4 text-lg font-semibold"
          >
            {isRunning ? 'Running...' : 'Run The Machine'}
          </Button>
        </div>

        <div className="space-y-6">
          {isError && (
            <div className="bg-surface-50 rounded-lg p-6 space-y-4">
              <StepHeader stepNumber={5} title="Output" />
              <div className="bg-danger-muted/20 border border-danger/40 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-danger mb-2 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Pipeline Failed at {capitalize(failedStep)}
                </h2>
                {error && <p className="text-sm text-danger/80 mb-4 break-words">{error.message}</p>}
                <div className="flex gap-3">
                  {failedStep !== 'idle' && (
                    <Button
                      onClick={() => run(failedStep)}
                      icon={<RefreshCw className="w-5 h-5" />}
                      className="flex-1 py-3"
                    >
                      Retry from {capitalize(failedStep)}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={cancel} className="flex-1 py-3">
                    Start Over
                  </Button>
                </div>
              </div>

              {prompts.length > 0 && (
                <div className="bg-surface-0 rounded-lg p-4 text-sm text-surface-400 border border-surface-200">
                  <p className="font-medium text-surface-500 mb-1">Completed before failure:</p>
                  <ul className="space-y-1">
                    <li>✅ {prompts.length} prompts generated</li>
                    {batchProgress && batchProgress.completedImages > 0 && (
                      <li>✅ {batchProgress.completedImages} images generated</li>
                    )}
                    {script && <li>✅ Script written</li>}
                    {audioUrl && <li>✅ Audio generated</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {isRunning && (
            <>
              <div className="bg-surface-50 rounded-lg p-6">
                <StepHeader
                  stepNumber={5}
                  title="Running The Machine"
                  subtitle={concept ? `Concept: ${concept}` : undefined}
                />
                <div className="space-y-4">
                  {STEP_ORDER.map((s, i) => {
                    const currentIdx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number])
                    const isActive = step === s
                    const isDone = i < currentIdx
                    const isPending = i > currentIdx

                    return (
                      <div
                        key={s}
                        className={`flex items-center gap-4 p-3 rounded-lg ${isActive ? 'bg-surface-100' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                          {isDone ? (
                            <CheckCircle className="w-6 h-6 text-success" />
                          ) : isActive ? (
                            <Loader2 className="w-6 h-6 animate-spin text-warning" />
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-surface-200" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${isDone ? 'text-success' : isActive ? 'text-warning' : 'text-surface-400'}`}
                          >
                            {STEP_LABELS[s]}
                          </p>
                          {s === 'prompts' && isDone && prompts.length > 0 && (
                            <p className="text-xs text-surface-400">{prompts.length} prompts generated</p>
                          )}
                          {s === 'images' && isActive && batchProgress && (
                            <div className="mt-2">
                              <ProgressBar
                                value={
                                  batchProgress.totalImages > 0
                                    ? (batchProgress.completedImages / batchProgress.totalImages) * 100
                                    : 0
                                }
                              />
                              <p className="text-xs text-surface-400 mt-1">
                                {batchProgress.completedImages}/{batchProgress.totalImages} images
                              </p>
                            </div>
                          )}
                          {s === 'images' && isDone && batchProgress && (
                            <p className="text-xs text-surface-400">{batchProgress.completedImages} images generated</p>
                          )}
                          {s === 'script' && isDone && script && (
                            <p className="text-xs text-surface-400">{script.split(/\s+/).length} words</p>
                          )}
                          {s === 'tts' && isDone && audioUrl && <p className="text-xs text-surface-400">Audio ready</p>}
                          {isPending && <p className="text-xs text-surface-300">Waiting...</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {script && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-surface-400 mb-2">Voiceover Script</p>
                    <div className="bg-surface-100 rounded-lg p-3 text-sm text-surface-500 max-h-32 overflow-auto whitespace-pre-wrap">
                      {script}
                    </div>
                  </div>
                )}
              </div>

              <Button variant="danger" onClick={cancel} icon={<X className="w-5 h-5" />} className="w-full py-3">
                Cancel
              </Button>
            </>
          )}

          {isDone && (
            <div className="bg-surface-50 rounded-lg p-6 space-y-6">
              <StepHeader stepNumber={5} title="Output" subtitle={concept || undefined} />

              {hasAnyAsset && (
                <Button
                  variant="secondary"
                  onClick={handleDownloadAllAssets}
                  loading={assetsDownloading}
                  disabled={assetsDownloading}
                  icon={assetsDownloading ? undefined : <Download className="w-5 h-5" />}
                  className="w-full py-3"
                >
                  {assetsDownloading ? 'Preparing ZIP...' : 'Download All Assets (.zip)'}
                </Button>
              )}

              {batchProgress && batchProgress.images.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-surface-400 mb-3">
                    Generated Images ({completedImages.length})
                  </h3>
                  <div className="grid grid-cols-6 gap-2">
                    {completedImages.map((img, index) => (
                      <button
                        key={img.index}
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        className="aspect-[9/16] rounded-lg overflow-hidden bg-surface-100 hover:ring-2 hover:ring-brand-500/60 transition-all"
                        title="Preview image"
                      >
                        <img
                          src={assetUrl(img.url!)}
                          alt={`Generated result ${img.index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {script && (
                <div>
                  <h3 className="text-sm font-semibold text-surface-400 mb-2">Voiceover Script</h3>
                  <div className="bg-surface-100 rounded-lg p-3 text-sm text-surface-500 max-h-32 overflow-auto whitespace-pre-wrap">
                    {script}
                  </div>
                </div>
              )}

              {audioUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-surface-400 mb-2">Audio</h3>
                  {/* biome-ignore lint/a11y/useMediaCaption: AI-generated audio, no captions available */}
                  <audio controls src={assetUrl(audioUrl)} className="w-full" />
                </div>
              )}

              {videoUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-surface-400 mb-2">Avatar Video</h3>
                  {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                  <video controls src={assetUrl(videoUrl)} className="w-56 rounded-lg" />
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  variant="ghost-muted"
                  size="sm"
                  onClick={() =>
                    useMachineStore.setState({
                      step: 'idle',
                      failedStep: 'idle',
                      prompts: [],
                      batchProgress: null,
                      script: '',
                      audioUrl: null,
                      videoUrl: null,
                      error: null,
                    })
                  }
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Run Again
                </Button>
              </div>
            </div>
          )}

          {isIdle && (
            <div className="bg-surface-50 rounded-lg p-4">
              <StepHeader stepNumber={5} title="Output" />
              <div className="rounded-lg border border-surface-200 bg-surface-0 p-6 text-sm text-surface-500">
                Results will appear here once The Machine finishes.
              </div>
            </div>
          )}
        </div>
      </div>

      {previewImage?.url && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0"
            onClick={() => setPreviewIndex(null)}
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPreviewIndex(null)
            }}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-brand-600/80 hover:bg-brand-700 flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void downloadVideo(assetUrl(previewImage.url!), `machine-image-${previewImage.index + 1}.jpg`)
            }}
            className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-secondary-600 hover:bg-secondary-700 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">Download</span>
          </button>

          {hasPrevPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewIndex((prev) => (prev == null ? prev : Math.max(0, prev - 1)))
              }}
              className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 flex items-center justify-center transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          )}

          <img
            src={assetUrl(previewImage.url)}
            alt={`Generated result ${previewImage.index + 1}`}
            className="relative z-10 max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />

          {hasNextPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewIndex((prev) => (prev == null ? prev : Math.min(completedImages.length - 1, prev + 1)))
              }}
              className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 flex items-center justify-center transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
