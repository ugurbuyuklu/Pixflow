import {
  AlertCircle,
  Bookmark,
  Check,
  CheckSquare,
  Download,
  FileJson,
  FileText,
  Film,
  FolderOpen,
  Image,
  ImagePlus,
  List,
  Loader2,
  Play,
  Save,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Upload,
  Users,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import {
  ASPECT_RATIOS,
  MAX_REFERENCE_IMAGES,
  OUTPUT_FORMATS,
  RESOLUTIONS,
  useGenerationStore,
} from '../../stores/generationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useImageRatingsStore } from '../../stores/imageRatingsStore'
import { useImg2VideoQueueStore } from '../../stores/img2videoQueueStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import type { GeneratedImageRecord, GeneratedPrompt } from '../../types'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { LoadingState } from '../ui/LoadingState'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { ProgressBar } from '../ui/ProgressBar'
import { Select } from '../ui/Select'
import { StatusBanner } from '../ui/StatusBanner'
import { StatusPill } from '../ui/StatusPill'
import { ImageGrid } from './ImageGrid'
import { SelectableCardGrid } from './SelectableCardGrid'
import { StepHeader } from './StepHeader'

function adaptPromptFormat(input: Record<string, unknown>): GeneratedPrompt {
  if (typeof input.style === 'string') {
    return input as unknown as GeneratedPrompt
  }

  const scene = input.scene as Record<string, unknown> | undefined
  const subject = input.subject as Record<string, unknown> | undefined
  const lighting = input.lighting as Record<string, unknown> | undefined
  const camera = input.camera as Record<string, unknown> | undefined
  const colorGrading = input.color_grading as Record<string, unknown> | undefined
  const quality = input.quality as Record<string, unknown> | undefined
  const subjectOutfit = subject?.outfit as Record<string, unknown> | undefined

  const styleParts: string[] = []
  if (scene?.environment) styleParts.push(String(scene.environment))
  if (scene?.atmosphere) styleParts.push(String(scene.atmosphere))
  if (lighting?.style) styleParts.push(String(lighting.style))

  return {
    style: styleParts.join(', ') || 'Custom prompt',

    pose: {
      framing: (camera?.framing as string) || '',
      body_position: (subject?.pose as string) || '',
      arms: (subject?.movement_detail as string) || '',
      posture: '',
      expression: {
        facial: (subject?.expression as string) || '',
        eyes: '',
        mouth: '',
      },
    },

    lighting: {
      setup: (lighting?.style as string) || '',
      key_light: (lighting?.key_light as string) || '',
      fill_light: (lighting?.fill_light as string) || (lighting?.ambient_light as string) || '',
      shadows: '',
      mood: (scene?.atmosphere as string) || '',
    },

    set_design: {
      backdrop: (scene?.environment as string) || '',
      surface: (scene?.depth as string) || '',
      props: Array.isArray(scene?.background_elements) ? (scene.background_elements as string[]) : [],
      atmosphere: (scene?.atmosphere as string) || '',
    },

    outfit: {
      main: (subjectOutfit?.outer_layer as string) || (subjectOutfit?.inner_layer as string) || '',
      underneath: (subjectOutfit?.inner_layer as string) || '',
      accessories: '',
      styling: '',
    },

    camera: {
      lens: (camera?.lens as string) || '',
      aperture: (camera?.aperture as string) || '',
      angle: (camera?.camera_angle as string) || '',
      focus: (camera?.focus as string) || '',
      distortion: '',
    },

    effects: {
      color_grade: (colorGrading?.palette as string) || '',
      grain: (quality?.grain as string) || '',
      vignette: '',
      atmosphere: (colorGrading?.tone_control as string) || '',
    },
  }
}

async function convertTextToPrompt(
  text: string,
  setError: (error: string | null) => void,
): Promise<GeneratedPrompt | null> {
  try {
    const res = await authFetch(apiUrl('/api/prompts/text-to-json'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, preserveOriginal: true }),
    })
    if (!res.ok) {
      const raw = await res.json().catch(() => ({}))
      setError(getApiError(raw, 'Failed to convert text'))
      return null
    }
    const raw = await res.json()
    const data = unwrapApiData<{ prompt: GeneratedPrompt }>(raw)
    return data.prompt
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to convert text to prompt'
    setError(message)
    return null
  }
}

async function parseCustomPrompt(
  customPromptJson: string,
  customPromptCount: number,
  setError: (error: string | null) => void,
): Promise<GeneratedPrompt[] | null> {
  const input = customPromptJson.trim()
  if (!input) {
    setError('Please enter a prompt')
    return null
  }

  if (input.startsWith('{') && input.endsWith('}')) {
    try {
      const parsed = JSON.parse(input)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Invalid prompt: must be a JSON object')
        return null
      }
      setError(null)
      const adapted = adaptPromptFormat(parsed as Record<string, unknown>)
      return Array.from({ length: customPromptCount }, () => structuredClone(adapted))
    } catch {
      setError('Invalid JSON format')
      return null
    }
  }

  setError(null)
  const converted = await convertTextToPrompt(input, setError)
  if (!converted) return null
  return Array.from({ length: customPromptCount }, () => structuredClone(converted))
}

export default function AssetMonsterPage() {
  const {
    selectedPrompts,
    referenceImages,
    referencePreviews,
    batchLoading,
    batchProgress,
    batchError,
    uploadError,
    promptSource,
    currentCustomPromptInput,
    currentCustomPromptError,
    savedCustomPrompts,
    imageSource,
    avatars,
    avatarsLoading,
    aspectRatio,
    numImagesPerPrompt,
    outputFormat,
    resolution,
    previewImage,
    togglePromptSelection,
    selectAllPrompts,
    deselectAllPrompts,
    setPromptSource,
    updateCurrentCustomPromptInput,
    setCurrentCustomPromptError,
    saveCurrentCustomPrompt,
    removeSavedCustomPrompt,
    setImageSource,
    setAspectRatio,
    setNumImagesPerPrompt,
    setOutputFormat,
    setResolution,
    setPreviewImage,
    addReferenceFiles,
    removeReferenceImage,
    setUploadError,
    setBatchError,
    selectAvatar,
    loadAvatars,
    startBatch,
    selectedResultImages,
    toggleResultImage,
    selectAllResultImages,
    deselectAllResultImages,
    completedBatches,
    clearCompletedBatches,
  } = useGenerationStore()

  const { prompts, concepts } = usePromptStore()
  const concept = concepts.find((c) => c.value.trim())?.value || ''
  const { navigate } = useNavigationStore()
  const { rateImage: rateImageInStore } = useImageRatingsStore()
  const { favorites, loadAll: loadHistory, addToFavorites } = useHistoryStore()
  const curatedAvatars = avatars.filter((avatar) => avatar.url.startsWith('/avatars/'))

  const [batchImageIds, setBatchImageIds] = useState<Map<number, number>>(new Map())
  const [selectedLibraryPrompts] = useState<Set<string>>(new Set())
  const [selectedCustomPrompts, setSelectedCustomPrompts] = useState<Set<string>>(new Set())
  const [customPromptSaved, setCustomPromptSaved] = useState(false)
  const [customPromptSaving, setCustomPromptSaving] = useState(false)
  const [customPromptConverting, setCustomPromptConverting] = useState(false)
  const [customPromptImporting, setCustomPromptImporting] = useState(false)
  const [customPromptImportProgress, setCustomPromptImportProgress] = useState<{
    completed: number
    total: number
  } | null>(null)
  const customPromptFileRef = useRef<HTMLInputElement | null>(null)
  const IMPORT_CONCURRENCY = 4

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    noClick: false,
    noKeyboard: true,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) addReferenceFiles(acceptedFiles)
    },
    onDropRejected: (rejections) => {
      setUploadError(rejections[0]?.errors[0]?.message || 'File rejected')
    },
  })

  const batchStartTime = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (batchLoading && !batchStartTime.current) {
      batchStartTime.current = Date.now()
    }
    if (!batchLoading) {
      batchStartTime.current = null
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Math.floor((Date.now() - (batchStartTime.current ?? Date.now())) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [batchLoading])

  useEffect(() => {
    loadAvatars()
  }, [loadAvatars])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (batchProgress?.status === 'completed' && batchProgress.jobId) {
      console.log('[AssetMonster] Loading image IDs for job:', batchProgress.jobId)
      authFetch(apiUrl(`/api/images?jobId=${batchProgress.jobId}`))
        .then((res) => res.json())
        .then((raw) => {
          const data = unwrapApiData<{ images: GeneratedImageRecord[] }>(raw)
          console.log('[AssetMonster] Loaded images from DB:', data.images.length)
          const idMap = new Map(data.images.map((img) => [img.batchIndex, img.id]))
          setBatchImageIds(idMap)
        })
        .catch((err) => {
          console.error('[AssetMonster] Failed to load image IDs:', err)
        })
    }
  }, [batchProgress?.status, batchProgress?.jobId])

  // Auto-timeout stuck generating images after 5 minutes
  useEffect(() => {
    if (!batchProgress) return

    const generatingImages = batchProgress.images.filter((img) => img.status === 'generating')
    if (generatingImages.length === 0) return

    const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
    const timers = generatingImages.map((img) =>
      setTimeout(() => {
        console.warn(`[AssetMonster] Image ${img.index} timed out after 5 minutes`)
        const updatedImages = batchProgress.images.map((i) =>
          i.index === img.index ? { ...i, status: 'failed' as const, error: 'Generation timeout (5 min)' } : i,
        )
        useGenerationStore.setState({
          batchProgress: { ...batchProgress, images: updatedImages },
        })
      }, TIMEOUT_MS),
    )

    return () => timers.forEach(clearTimeout)
  }, [batchProgress])

  const handleRateImage = async (batchIndex: number, rating: 1 | -1) => {
    const imageId = batchImageIds.get(batchIndex)
    if (!imageId) {
      console.error('Image ID not found for index:', batchIndex)
      return
    }

    try {
      await rateImageInStore(imageId, rating)
      console.log(`Rated image ${imageId} with ${rating}`)
    } catch (err) {
      console.error('Failed to rate image:', err)
    }
  }

  const downloadImages = async (urls: string[]) => {
    if (urls.length === 0) return

    if (urls.length === 1) {
      const res = await fetch(assetUrl(urls[0]))
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = urls[0].split('/').pop() || 'image.jpg'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      return
    }

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(assetUrl(url))
        const blob = await res.blob()
        zip.file(url.split('/').pop() || 'image.jpg', blob)
      }),
    )
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const blobUrl = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${concept || 'generated'}_images.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }

  const handleBatchGenerate = async () => {
    if (promptSource === 'custom') {
      // Use selected saved custom prompts first
      if (selectedCustomPrompts.size > 0) {
        const validPrompts = Array.from(selectedCustomPrompts)
          .map((id) => savedCustomPrompts.find((sp) => sp.id === id)?.prompt)
          .filter((p): p is GeneratedPrompt => p !== undefined)

        if (validPrompts.length === 0) {
          setBatchError({
            message: 'Selected custom prompts are invalid. Please reselect and try again.',
            type: 'warning',
          })
          return
        }

        startBatch(validPrompts, 'custom')
        return
      }

      // Fallback: allow direct generate from unsaved custom prompt input
      const inlinePrompt = currentCustomPromptInput.trim()
      if (!inlinePrompt) {
        setBatchError({ message: 'Please select or enter at least one custom prompt.', type: 'warning' })
        return
      }

      setCustomPromptConverting(true)
      try {
        const parsedInline = await parseCustomPrompt(inlinePrompt, 1, setCurrentCustomPromptError)
        if (!parsedInline || parsedInline.length === 0) return
        startBatch(parsedInline, 'custom')
      } finally {
        setCustomPromptConverting(false)
      }
    } else if (promptSource === 'library') {
      if (selectedLibraryPrompts.size === 0) {
        setBatchError({ message: 'Please select at least one prompt from library.', type: 'warning' })
        return
      }
      const libraryPrompts = Array.from(selectedLibraryPrompts)
        .map((id) => favorites.find((f) => f.id === id)?.prompt)
        .filter((p): p is GeneratedPrompt => p !== undefined)

      if (libraryPrompts.length === 0) {
        setBatchError({ message: 'No valid prompts found in selection.', type: 'warning' })
        return
      }

      startBatch(libraryPrompts, 'library')
    } else {
      if (selectedPrompts.size === 0) {
        setBatchError({ message: 'Please select at least one prompt.', type: 'warning' })
        return
      }
      startBatch(
        Array.from(selectedPrompts).map((i) => prompts[i]),
        concept || 'untitled',
      )
    }
  }

  const hasInlineCustomPrompt = currentCustomPromptInput.trim().length > 0
  const hasCustomPromptReady = selectedCustomPrompts.size > 0 || hasInlineCustomPrompt
  const totalImages =
    promptSource === 'custom'
      ? selectedCustomPrompts.size > 0
        ? selectedCustomPrompts.size
        : hasInlineCustomPrompt
          ? 1
          : 0
      : promptSource === 'library'
        ? selectedLibraryPrompts.size
        : selectedPrompts.size
  const completedCount = batchProgress?.completedImages ?? 0
  const totalCount = batchProgress?.totalImages ?? totalImages
  const avgPerImage = completedCount > 0 ? elapsed / completedCount : 0
  const remainingSeconds = completedCount > 0 ? Math.ceil(avgPerImage * (totalCount - completedCount)) : 0

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left Column: Inputs */}
      <div className="space-y-6">
        {/* Step 1: Select Prompts */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={1} title="Select Prompts" />
          <SegmentedTabs
            ariaLabel="Prompt source"
            value={promptSource}
            items={[
              { id: 'generated' as const, label: 'Generated Prompts', icon: <List className="w-4 h-4" /> },
              { id: 'custom' as const, label: 'Custom Prompt', icon: <FileJson className="w-4 h-4" /> },
              { id: 'library' as const, label: 'Library', icon: <Bookmark className="w-4 h-4" />, disabled: true },
            ]}
            onChange={setPromptSource}
          />

          {promptSource === 'library' ? (
            <EmptyState
              title="Library integration coming soon"
              description="This feature is temporarily disabled"
              icon={<Bookmark className="w-8 h-8" />}
            />
          ) : promptSource === 'generated' ? (
            prompts.length === 0 ? (
              <EmptyState
                title="No prompts yet"
                description="Generate prompts first to continue."
                icon={<Sparkles className="w-8 h-8" />}
                actionLabel="Go to Prompt Factory"
                onAction={() => navigate('prompts')}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => selectAllPrompts(prompts.length)}>
                      Select All
                    </Button>
                    <Button variant="secondary" size="sm" onClick={deselectAllPrompts}>
                      Deselect All
                    </Button>
                  </div>
                  <span className="text-sm text-surface-400">
                    {selectedPrompts.size}/{prompts.length}
                  </span>
                </div>
                <SelectableCardGrid
                  items={prompts.map((_, idx) => idx)}
                  selectedSet={selectedPrompts}
                  onToggle={togglePromptSelection}
                  renderContent={(_, index) => index + 1}
                  getKey={(_, index) => index}
                />
              </div>
            )
          ) : promptSource === 'custom' ? (
            <div className="space-y-4">
              {/* Input Area */}
              <div className="border border-surface-200 rounded-lg p-4 bg-surface-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-surface-600">New Custom Prompt</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileText className="w-4 h-4" />}
                      loading={customPromptImporting}
                      onClick={() => customPromptFileRef.current?.click()}
                      disabled={customPromptImporting}
                      title="Fetch from text file"
                    >
                      {customPromptImporting ? 'Importing...' : 'Fetch File'}
                    </Button>
                    <Button
                      variant={customPromptSaved ? 'lime' : 'secondary'}
                      size="sm"
                      loading={customPromptSaving}
                      icon={customPromptSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      onClick={async () => {
                        if (customPromptSaving) return
                        const trimmed = currentCustomPromptInput.trim()
                        const needsConversion = !(trimmed.startsWith('{') && trimmed.endsWith('}'))
                        setCustomPromptSaving(true)
                        setCustomPromptConverting(needsConversion)
                        const parsed = await parseCustomPrompt(currentCustomPromptInput, 1, setCurrentCustomPromptError)
                        setCustomPromptConverting(false)
                        if (parsed?.[0]) {
                          const prompt = parsed[0]
                          const name = `${savedCustomPrompts.length + 1}`
                          await addToFavorites(prompt, name, 'custom')
                          const id = saveCurrentCustomPrompt(prompt, name)
                          setSelectedCustomPrompts((prev) => {
                            const next = new Set(prev)
                            next.add(id)
                            return next
                          })
                          setCustomPromptSaved(true)
                          setTimeout(() => setCustomPromptSaved(false), 2000)
                        }
                        setCustomPromptSaving(false)
                      }}
                      disabled={!currentCustomPromptInput.trim() || customPromptSaved || customPromptSaving}
                      title="Save to Library & Add Card"
                    >
                      {customPromptSaved ? 'Saved!' : customPromptSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
                <input
                  ref={customPromptFileRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    event.target.value = ''
                    setCurrentCustomPromptError(null)
                    try {
                      const content = await file.text()
                      const blockPattern = /(?:^|\n)\s*(?:---\s*)?prompt\s*\d+\s*(?:---)?\s*\n?/gi
                      const segments: string[] = []
                      let lastIndex = 0
                      for (;;) {
                        const match = blockPattern.exec(content)
                        if (!match) break
                        if (match.index >= lastIndex) {
                          const before = content.slice(lastIndex, match.index).trim()
                          if (before) segments.push(before)
                        }
                        lastIndex = blockPattern.lastIndex
                      }
                      const after = content.slice(lastIndex).trim()
                      if (after) segments.push(after)

                      const blockEntries = segments
                        .map((block) => {
                          const trimmed = block.trim()
                          const unquoted =
                            trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).trim() : trimmed
                          return unquoted
                        })
                        .filter(Boolean)
                      const lineEntries = content
                        .split(/\r?\n/)
                        .map((line) =>
                          line
                            .trim()
                            .replace(/^prompt\s*\d+\s*[:–.)-]?\s*/i, '')
                            .trim(),
                        )
                        .filter(Boolean)

                      const paragraphEntries = content
                        .split(/\r?\n\s*\r?\n/)
                        .map((block) => block.trim())
                        .filter(Boolean)

                      const entries = (
                        blockEntries.length > 0
                          ? blockEntries
                          : paragraphEntries.length > 0
                            ? paragraphEntries
                            : lineEntries
                      ).slice(0, 10)
                      if (entries.length === 0) {
                        setCurrentCustomPromptError('No prompts found in file')
                        return
                      }
                      setCustomPromptImporting(true)
                      setCustomPromptImportProgress({ completed: 0, total: entries.length })
                      const baseIndex = savedCustomPrompts.length
                      let completed = 0
                      const queue = entries.map((text, index) => ({ text, index }))
                      const worker = async () => {
                        while (queue.length > 0) {
                          const next = queue.shift()
                          if (!next) return
                          const parsed = await convertTextToPrompt(next.text, setCurrentCustomPromptError)
                          if (parsed) {
                            const name = `${baseIndex + next.index + 1}`
                            await addToFavorites(parsed, name, 'custom')
                            const id = saveCurrentCustomPrompt(parsed, name)
                            setSelectedCustomPrompts((prev) => {
                              const updated = new Set(prev)
                              updated.add(id)
                              return updated
                            })
                          }
                          completed += 1
                          setCustomPromptImportProgress({ completed, total: entries.length })
                        }
                      }
                      const workerCount = Math.min(IMPORT_CONCURRENCY, queue.length)
                      await Promise.all(Array.from({ length: workerCount }, () => worker()))
                    } finally {
                      setCustomPromptImporting(false)
                      setTimeout(() => setCustomPromptImportProgress(null), 1200)
                    }
                  }}
                />
                {customPromptImportProgress && (
                  <p className="text-xs text-surface-500 mb-2">
                    Importing prompts… {customPromptImportProgress.completed}/{customPromptImportProgress.total}
                  </p>
                )}
                {customPromptSaving && customPromptConverting && (
                  <p className="text-xs text-surface-500 mb-2">Converting prompt…</p>
                )}
                <textarea
                  value={currentCustomPromptInput}
                  onChange={(e) => updateCurrentCustomPromptInput(e.target.value)}
                  placeholder={`Describe the scene or paste JSON...

Examples:
• Black & white editorial photoshoot with dramatic lighting
• {"style": "Romantic portrait...", "lighting": {...}}`}
                  className={`w-full h-32 bg-surface-0 rounded-lg p-3 text-sm resize-none border ${
                    currentCustomPromptError
                      ? 'border-danger focus:border-danger'
                      : 'border-surface-200 focus:border-brand-500'
                  } focus:outline-none`}
                  rows={8}
                />
                {currentCustomPromptError && (
                  <p className="text-danger text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {currentCustomPromptError}
                  </p>
                )}
              </div>

              {/* Saved Cards Grid */}
              {savedCustomPrompts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-surface-600">
                      Saved Prompts ({savedCustomPrompts.length})
                    </span>
                  </div>
                  <SelectableCardGrid
                    items={savedCustomPrompts.map((sp) => sp.id)}
                    selectedSet={selectedCustomPrompts}
                    onToggle={(id) => {
                      const next = new Set(selectedCustomPrompts)
                      if (next.has(id)) {
                        next.delete(id)
                      } else {
                        next.add(id)
                      }
                      setSelectedCustomPrompts(next)
                    }}
                    renderContent={(id) => savedCustomPrompts.find((sp) => sp.id === id)?.name || ''}
                    getKey={(id) => id}
                    onRemove={(id) => {
                      removeSavedCustomPrompt(id)
                      setSelectedCustomPrompts((prev) => {
                        const next = new Set(prev)
                        next.delete(id)
                        return next
                      })
                    }}
                    removeLabel={(id) => `Remove ${savedCustomPrompts.find((sp) => sp.id === id)?.name ?? 'prompt'}`}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Step 2: Reference Images (Optional) */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Reference Images" subtitle="(Optional)" />
          <input {...getInputProps()} />

          <SegmentedTabs
            ariaLabel="Reference image source"
            value={imageSource}
            items={[
              {
                id: 'gallery' as const,
                label: 'Gallery',
                icon: <FolderOpen className="w-4 h-4" />,
                badge: curatedAvatars.length > 0 ? <span>({curatedAvatars.length})</span> : undefined,
              },
              { id: 'upload' as const, label: 'Upload', icon: <Upload className="w-4 h-4" /> },
            ]}
            onChange={setImageSource}
          />

          {/* Gallery Grid - Conditionally Shown */}
          {imageSource === 'gallery' && (
            <div className="border border-surface-200 rounded-lg p-3">
              {avatarsLoading ? (
                <LoadingState title="Loading avatars..." size="sm" />
              ) : curatedAvatars.length === 0 ? (
                <EmptyState
                  title="No avatars in gallery"
                  description="Add images to avatars/ folder"
                  icon={<Users className="w-10 h-10" />}
                />
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {curatedAvatars.map((avatar) => {
                    const isSelected = referenceImages.some((f) => f.name === avatar.filename)
                    return (
                      <button
                        type="button"
                        key={avatar.filename}
                        onClick={() => selectAvatar(avatar)}
                        disabled={referenceImages.length >= MAX_REFERENCE_IMAGES && !isSelected}
                        className={`flex-shrink-0 w-24 aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-300'
                        }`}
                      >
                        <img src={assetUrl(avatar.url)} alt={avatar.name} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selected Images Display */}
          {referencePreviews.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-surface-600">
                  Selected Images ({referencePreviews.length}/{MAX_REFERENCE_IMAGES})
                </span>
              </div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                  isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <input {...getInputProps()} />
                <ImageGrid
                  images={referencePreviews}
                  getImageUrl={(preview) => preview}
                  getAlt={(_, idx) => `Reference ${idx + 1}`}
                  aspectRatio="square"
                  renderOverlay={(_, idx) => (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeReferenceImage(idx)
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-danger transition-colors"
                      title="Remove image"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                />
              </div>
            </div>
          )}

          {/* Add Image Button - Upload Mode */}
          {imageSource === 'upload' && (
            <div
              {...getRootProps()}
              className={`mt-4 border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-2 text-surface-400" />
              <p className="text-surface-400 text-sm">
                {isDragActive ? 'Drop images here' : 'Drop images here or click to browse'}
              </p>
              <p className="text-xs text-surface-400 mt-1">JPEG, PNG, WebP • Max 5 images</p>
            </div>
          )}
        </div>

        {/* Step 3: Settings */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={3} title="Settings" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Aspect Ratio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
            />
            <Select
              label="Images per Prompt"
              value={String(numImagesPerPrompt)}
              onChange={(e) => setNumImagesPerPrompt(Number(e.target.value))}
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
            />
            <Select
              label="Resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              options={RESOLUTIONS.map((r) => ({ value: r, label: r }))}
            />
            <Select
              label="Format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              options={OUTPUT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))}
            />
          </div>
          <div className="pt-4 mt-4 border-t border-surface-200/60">
            <Button
              size="lg"
              icon={batchLoading ? undefined : <Play className="w-5 h-5" />}
              loading={batchLoading}
              onClick={handleBatchGenerate}
              disabled={
                batchLoading ||
                (promptSource === 'generated'
                  ? selectedPrompts.size === 0
                  : promptSource === 'custom'
                    ? !hasCustomPromptReady
                    : selectedLibraryPrompts.size === 0)
              }
              className="w-full"
            >
              {batchLoading ? (
                <span className="flex items-center gap-2">
                  Generating {completedCount}/{totalCount}...
                  {completedCount > 0 && (
                    <span className="text-white/60">
                      ~
                      {remainingSeconds >= 60
                        ? `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`
                        : `${remainingSeconds}s`}{' '}
                      remaining
                    </span>
                  )}
                </span>
              ) : (
                `Generate ${totalImages} Image${totalImages !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>

        {batchError && (
          <StatusBanner
            type={batchError.type}
            message={batchError.message}
            actionLabel={batchError.action?.label}
            onAction={batchError.action?.onClick}
            onDismiss={() => setBatchError(null)}
            icon={!navigator.onLine ? WifiOff : undefined}
          />
        )}

        {uploadError && (
          <StatusBanner
            type="error"
            message={uploadError}
            onDismiss={() => setUploadError(null)}
            icon={!navigator.onLine ? WifiOff : undefined}
          />
        )}
      </div>

      {/* Right Column: Outputs */}
      <div className="space-y-6">
        {/* Step 4: Final Outputs */}
        {batchProgress && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={4} title="Final Outputs" />

            {
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={
                        batchProgress.status === 'completed'
                          ? 'completed'
                          : batchProgress.status === 'failed'
                            ? 'failed'
                            : 'generating'
                      }
                      size="sm"
                      label={batchProgress.status.toUpperCase()}
                    />
                    <span className="text-sm text-surface-400">{batchProgress.progress}%</span>
                  </div>
                </div>
                <ProgressBar value={batchProgress.progress} className="mb-4" />

                <div className="grid grid-cols-5 gap-3">
                  {batchProgress.images.map((img) => (
                    <button
                      type="button"
                      key={img.index}
                      onClick={() => {
                        if (batchProgress.status === 'completed' && img.status === 'completed') {
                          toggleResultImage(img.index)
                        } else if (img.status === 'completed' && img.url) {
                          setPreviewImage(img.url)
                        }
                      }}
                      onDoubleClick={() => img.status === 'completed' && img.url && setPreviewImage(img.url)}
                      title={
                        img.status === 'completed'
                          ? 'Double click to preview'
                          : img.status === 'generating'
                            ? 'Generating...'
                            : img.status === 'failed'
                              ? 'Generation failed'
                              : batchLoading
                                ? 'Queued'
                                : undefined
                      }
                      className={`relative aspect-[9/16] rounded-lg border-2 flex items-center justify-center ${
                        img.status === 'completed' && selectedResultImages.has(img.index)
                          ? 'border-brand-400 bg-brand-600/10 ring-2 ring-brand-400/30 cursor-pointer hover:scale-105 transition-all'
                          : img.status === 'completed'
                            ? 'border-success bg-success/10 cursor-pointer hover:border-success-hover hover:scale-105 transition-all'
                            : img.status === 'generating'
                              ? 'border-warning bg-warning/10'
                              : img.status === 'failed'
                                ? 'border-danger bg-danger/10'
                                : 'border-surface-200 bg-surface-100'
                      }`}
                    >
                      {img.status === 'completed' && img.url ? (
                        <img
                          src={assetUrl(img.url!)}
                          alt={`Generated ${img.index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : img.status === 'generating' ? (
                        <>
                          <div className="absolute inset-0 overflow-hidden rounded-lg">
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-warning/10 to-transparent"
                              style={{ animation: 'shimmer 1.5s infinite' }}
                            />
                          </div>
                          <Loader2 className="w-6 h-6 animate-spin text-warning" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const updatedImages = batchProgress.images.map((i) =>
                                i.index === img.index
                                  ? { ...i, status: 'failed' as const, error: 'Cancelled by user' }
                                  : i,
                              )
                              useGenerationStore.setState({
                                batchProgress: { ...batchProgress, images: updatedImages },
                              })
                            }}
                            className="absolute top-1 right-1 w-6 h-6 bg-danger/90 hover:bg-danger rounded-full flex items-center justify-center transition-colors z-10"
                            title="Cancel generation"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </>
                      ) : img.status === 'failed' ? (
                        <XCircle className="w-6 h-6 text-danger" />
                      ) : batchLoading ? (
                        <>
                          <div className="absolute inset-0 overflow-hidden rounded-lg">
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-surface-300/10 to-transparent"
                              style={{ animation: 'shimmer 2s infinite' }}
                            />
                          </div>
                          <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
                        </>
                      ) : (
                        <Image className="w-6 h-6 text-surface-400" />
                      )}
                      {batchProgress.status === 'completed' && img.status === 'completed' && (
                        <div
                          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedResultImages.has(img.index)
                              ? 'bg-brand-500 border-brand-500'
                              : 'bg-black/40 border-white/50'
                          }`}
                        >
                          {selectedResultImages.has(img.index) && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      {img.status === 'completed' && img.url && batchProgress.status === 'completed' && (
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!batchImageIds.has(img.index)) {
                                console.warn('[AssetMonster] Image not in DB yet, cannot rate')
                                return
                              }
                              handleRateImage(img.index, 1)
                            }}
                            disabled={!batchImageIds.has(img.index)}
                            className="w-7 h-7 rounded-full bg-black/60 hover:bg-success/80 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={batchImageIds.has(img.index) ? 'Like' : 'Loading...'}
                          >
                            <ThumbsUp className="w-4 h-4 text-white" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!batchImageIds.has(img.index)) {
                                console.warn('[AssetMonster] Image not in DB yet, cannot rate')
                                return
                              }
                              handleRateImage(img.index, -1)
                            }}
                            disabled={!batchImageIds.has(img.index)}
                            className="w-7 h-7 rounded-full bg-black/60 hover:bg-danger/80 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={batchImageIds.has(img.index) ? 'Dislike' : 'Loading...'}
                          >
                            <ThumbsDown className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {batchProgress.status === 'completed' && (
                  <div className="mt-4 pt-4 border-t border-surface-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<CheckSquare className="w-4 h-4" />}
                          onClick={() =>
                            selectedResultImages.size ===
                            batchProgress.images.filter((i) => i.status === 'completed').length
                              ? deselectAllResultImages()
                              : selectAllResultImages()
                          }
                        >
                          {selectedResultImages.size ===
                          batchProgress.images.filter((i) => i.status === 'completed').length
                            ? 'Deselect All'
                            : 'Select All'}
                        </Button>
                        {selectedResultImages.size > 0 && (
                          <span className="text-xs text-surface-400">{selectedResultImages.size} selected</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download className="w-4 h-4" />}
                        onClick={() => {
                          const completedImages = batchProgress.images.filter((i) => i.status === 'completed' && i.url)
                          const isAllSelected = selectedResultImages.size === completedImages.length

                          if (isAllSelected || selectedResultImages.size === 0) {
                            // Download all
                            downloadImages(completedImages.map((i) => i.url!))
                          } else {
                            // Download selected
                            downloadImages(
                              batchProgress.images
                                .filter((i) => i.status === 'completed' && i.url && selectedResultImages.has(i.index))
                                .map((i) => i.url!),
                            )
                          }
                        }}
                      >
                        {selectedResultImages.size === 0 ||
                        selectedResultImages.size ===
                          batchProgress.images.filter((i) => i.status === 'completed').length
                          ? 'Download All'
                          : `Download Selected (${selectedResultImages.size})`}
                      </Button>
                      <Button
                        variant="lime"
                        size="sm"
                        icon={<ImagePlus className="w-4 h-4" />}
                        onClick={() => {
                          const completedImages =
                            batchProgress?.images.filter((img) => img.status === 'completed' && img.url) ?? []
                          const isAllSelected = selectedResultImages.size === completedImages.length

                          const imagesToSend =
                            isAllSelected || selectedResultImages.size === 0
                              ? completedImages
                              : completedImages.filter((img) => selectedResultImages.has(img.index))

                          const imageUrls = imagesToSend.map((img) => img.url!)
                          const newIds = useImg2VideoQueueStore.getState().addItems(imageUrls, 'img2img')
                          if (newIds.length > 0) {
                            useImg2VideoQueueStore.getState().selectItem(newIds[0])
                          }
                          navigate('img2video')
                        }}
                      >
                        {selectedResultImages.size === 0 ||
                        selectedResultImages.size ===
                          batchProgress.images.filter((i) => i.status === 'completed').length
                          ? 'Img2Img'
                          : `Img2Img (${selectedResultImages.size})`}
                      </Button>
                      <Button
                        variant="lime"
                        size="sm"
                        icon={<Film className="w-4 h-4" />}
                        onClick={() => {
                          const completedImages =
                            batchProgress?.images.filter((img) => img.status === 'completed' && img.url) ?? []
                          const isAllSelected = selectedResultImages.size === completedImages.length

                          const imagesToSend =
                            isAllSelected || selectedResultImages.size === 0
                              ? completedImages
                              : completedImages.filter((img) => selectedResultImages.has(img.index))

                          const imageUrls = imagesToSend.map((img) => img.url!)
                          const newIds = useImg2VideoQueueStore.getState().addItems(imageUrls, 'img2video')
                          if (newIds.length > 0) {
                            useImg2VideoQueueStore.getState().selectItem(newIds[0])
                          }
                          navigate('img2video')
                        }}
                      >
                        {selectedResultImages.size === 0 ||
                        selectedResultImages.size ===
                          batchProgress.images.filter((i) => i.status === 'completed').length
                          ? 'Img2Video'
                          : `Img2Video (${selectedResultImages.size})`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        )}

        {/* Previous Batches */}
        {completedBatches.length > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">Previous Batches</h3>
              <Button variant="ghost-muted" size="xs" onClick={clearCompletedBatches}>
                Clear History
              </Button>
            </div>
            {[...completedBatches].reverse().map((entry, batchIdx) => {
              const completed = entry.batch.images.filter((img) => img.status === 'completed' && img.url)
              if (completed.length === 0) return null
              return (
                <div key={entry.batch.jobId} className="bg-surface-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full border-2 ${entry.color}`} />
                    <span className="text-xs text-surface-400">
                      Batch {completedBatches.length - batchIdx} — {completed.length} images
                    </span>
                    <Button
                      variant="ghost-muted"
                      size="xs"
                      icon={<Download className="w-3 h-3" />}
                      onClick={() => downloadImages(completed.map((img) => img.url!))}
                    >
                      Download
                    </Button>
                  </div>
                  <ImageGrid
                    images={completed}
                    getImageUrl={(img) => img.url!}
                    getAlt={(img) => `Batch ${completedBatches.length - batchIdx} #${img.index + 1}`}
                    aspectRatio="9/16"
                    gap={2}
                    onClick={(img) => img.url && setPreviewImage(img.url)}
                    itemClassName={`border-2 ${entry.color}`}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {previewImage && (
        <button
          type="button"
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => e.key === 'Escape' && setPreviewImage(null)}
        >
          <img src={assetUrl(previewImage)} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </button>
      )}
    </div>
  )
}
