import JSZip from 'jszip'
import {
  AlertCircle,
  Bookmark,
  Check,
  CheckCircle,
  CheckSquare,
  Clock,
  Download,
  FileJson,
  Film,
  FolderOpen,
  Image,
  ImagePlus,
  List,
  Loader2,
  Pencil,
  Play,
  Plus,
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
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'

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
      body: JSON.stringify({ text }),
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
    clearReferenceImages,
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

  const [batchImageIds, setBatchImageIds] = useState<Map<number, number>>(new Map())
  const [previewPrompt, setPreviewPrompt] = useState<GeneratedPrompt | null>(null)
  const [selectedLibraryPrompts, setSelectedLibraryPrompts] = useState<Set<string>>(new Set())

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFilePicker,
  } = useDropzone({
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
      if (savedCustomPrompts.length === 0) {
        setBatchError({ message: 'Please save at least one custom prompt first.', type: 'warning' })
        return
      }

      // Use saved custom prompts directly
      const validPrompts = savedCustomPrompts.map((sp) => sp.prompt)
      startBatch(validPrompts, 'custom')
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

  const totalImages =
    promptSource === 'custom'
      ? savedCustomPrompts.length
      : promptSource === 'library'
        ? selectedLibraryPrompts.size
        : selectedPrompts.size
  const completedCount = batchProgress?.completedImages ?? 0
  const totalCount = batchProgress?.totalImages ?? totalImages
  const avgPerImage = completedCount > 0 ? elapsed / completedCount : 0
  const remainingSeconds = completedCount > 0 ? Math.ceil(avgPerImage * (totalCount - completedCount)) : 0

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Column: Inputs */}
      <div className="space-y-6">
        {/* Step 1: Select Prompts */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            Select Prompts
          </h2>
          <div className="flex bg-surface-100 rounded-lg p-1 mb-4">
            <button
              type="button"
              onClick={() => setPromptSource('generated')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                promptSource === 'generated'
                  ? 'bg-brand-600 text-surface-900'
                  : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <List className="w-4 h-4" />
              Generated Prompts
            </button>
            <button
              type="button"
              onClick={() => setPromptSource('custom')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                promptSource === 'custom' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <FileJson className="w-4 h-4" />
              Custom Prompt
            </button>
            <button
              type="button"
              onClick={() => setPromptSource('library')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm transition-colors ${
                promptSource === 'library' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              Library
            </button>
          </div>

          {promptSource === 'library' ? (
            <div className="space-y-3">
              {favorites.length === 0 ? (
                <div className="text-center py-8 text-surface-400 border-2 border-dashed border-surface-200 rounded-lg">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No favorited prompts yet</p>
                  <p className="text-xs mt-1">Favorite prompts from Library to use them here</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedLibraryPrompts(new Set(favorites.map((f) => f.id)))}
                      >
                        Select All
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setSelectedLibraryPrompts(new Set())}>
                        Deselect All
                      </Button>
                    </div>
                    <span className="text-sm text-surface-400">
                      {selectedLibraryPrompts.size}/{favorites.length}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {favorites.map((fav) => (
                      <button
                        type="button"
                        key={fav.id}
                        onClick={() => {
                          const next = new Set(selectedLibraryPrompts)
                          if (next.has(fav.id)) next.delete(fav.id)
                          else next.add(fav.id)
                          setSelectedLibraryPrompts(next)
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 ${
                          selectedLibraryPrompts.has(fav.id)
                            ? 'bg-brand-600/30 border border-brand-500'
                            : 'bg-surface-100 hover:bg-surface-200 border border-transparent'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            selectedLibraryPrompts.has(fav.id) ? 'bg-brand-500 border-brand-500' : 'border-surface-200'
                          }`}
                        >
                          {selectedLibraryPrompts.has(fav.id) && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{fav.name}</div>
                          {fav.concept && <div className="text-xs text-surface-400 mt-0.5">{fav.concept}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : promptSource === 'generated' ? (
            prompts.length === 0 ? (
              <div className="text-center py-8 text-surface-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No prompts yet</p>
                <button
                  type="button"
                  onClick={() => navigate('prompts')}
                  className="mt-2 text-brand-400 hover:text-brand-300 text-sm"
                >
                  Generate prompts first →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Prompt List */}
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
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {prompts.map((prompt, index) => (
                      <button
                        type="button"
                        // biome-ignore lint/suspicious/noArrayIndexKey: static list
                        key={index}
                        onClick={() => togglePromptSelection(index)}
                        onMouseEnter={() => setPreviewPrompt(prompt)}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 ${
                          selectedPrompts.has(index)
                            ? 'bg-brand-600/30 border border-brand-500'
                            : 'bg-surface-100 hover:bg-surface-200 border border-transparent'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            selectedPrompts.has(index) ? 'bg-brand-500 border-brand-500' : 'border-surface-200'
                          }`}
                        >
                          {selectedPrompts.has(index) && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-xs text-surface-400">#{index + 1}</span>
                          <p className="text-sm break-words">{prompt.style}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCustomPromptJson(JSON.stringify(prompt, null, 2))
                            setPromptSource('custom')
                          }}
                          className="shrink-0 p-1 rounded text-surface-400 hover:text-brand-400 hover:bg-surface-200 transition-colors"
                          title="Edit as custom prompt"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Preview Panel */}
                <div className="bg-surface-100 rounded-lg p-4">
                  {previewPrompt ? (
                    <div className="space-y-3 text-sm">
                      <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                        Preview
                      </div>
                      {previewPrompt.style && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Style</label>
                          <p className="text-surface-900 mt-0.5">{previewPrompt.style}</p>
                        </div>
                      )}
                      {previewPrompt.camera && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Camera</label>
                          <p className="text-surface-900 mt-0.5">
                            {[
                              previewPrompt.camera.lens,
                              previewPrompt.camera.aperture,
                              previewPrompt.camera.angle,
                              previewPrompt.camera.focus,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      )}
                      {previewPrompt.lighting && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Lighting</label>
                          <p className="text-surface-900 mt-0.5">
                            {[
                              previewPrompt.lighting.setup,
                              previewPrompt.lighting.key_light,
                              previewPrompt.lighting.fill_light,
                              previewPrompt.lighting.shadows,
                              previewPrompt.lighting.mood,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      )}
                      {previewPrompt.pose && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Pose</label>
                          <p className="text-surface-900 mt-0.5">
                            {[
                              previewPrompt.pose.framing,
                              previewPrompt.pose.body_position,
                              previewPrompt.pose.arms,
                              previewPrompt.pose.posture,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      )}
                      {previewPrompt.set_design && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Set Design</label>
                          <p className="text-surface-900 mt-0.5">
                            {[
                              previewPrompt.set_design.backdrop,
                              previewPrompt.set_design.surface,
                              previewPrompt.set_design.atmosphere,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      )}
                      {previewPrompt.effects && (
                        <div>
                          <label className="text-xs font-medium text-surface-500">Effects</label>
                          <p className="text-surface-900 mt-0.5">
                            {[
                              previewPrompt.effects.color_grade,
                              previewPrompt.effects.vignette,
                              previewPrompt.effects.contrast,
                              previewPrompt.effects.grain,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-surface-400">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Hover over a prompt to preview</p>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : promptSource === 'custom' ? (
            <div className="space-y-4">
              {/* Input Area */}
              <div className="border border-surface-200 rounded-lg p-4 bg-surface-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-surface-600">New Custom Prompt</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const parsed = await parseCustomPrompt(currentCustomPromptInput, 1, setCurrentCustomPromptError)
                      if (parsed && parsed[0]) {
                        const prompt = parsed[0]
                        const name = prompt.style?.split(' ').slice(0, 4).join(' ') || 'Custom Prompt'
                        await addToFavorites(prompt, name, 'custom')
                        saveCurrentCustomPrompt(prompt, name)
                      }
                    }}
                    disabled={!currentCustomPromptInput.trim()}
                    className="text-surface-400 hover:text-brand-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Save to Library & Add Card"
                  >
                    <Save className="w-5 h-5" />
                  </button>
                </div>
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
                  <div className="grid grid-cols-5 gap-3 max-h-[400px] overflow-y-auto">
                    {savedCustomPrompts.map((sp) => (
                      <div
                        key={sp.id}
                        className="relative border border-surface-200 rounded-lg p-3 bg-surface-100 hover:bg-surface-200 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => removeSavedCustomPrompt(sp.id)}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-surface-900/60 hover:bg-danger flex items-center justify-center transition-colors"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="pr-6">
                          <p className="text-xs font-medium text-surface-900 line-clamp-2">{sp.name}</p>
                          {sp.prompt.camera && (
                            <p className="text-xs text-surface-500 mt-1 line-clamp-1">
                              {sp.prompt.camera.lens || sp.prompt.camera.angle}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Step 2: Reference Images (Optional) */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            Reference Images
            <span className="text-xs text-surface-400 font-normal">(Optional)</span>
          </h2>
          <input {...getInputProps()} />

          <div className="flex bg-surface-100 rounded-lg p-1 mb-4">
            <button
              type="button"
              onClick={() => setImageSource('upload')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                imageSource === 'upload' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <button
              type="button"
              onClick={() => setImageSource('gallery')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                imageSource === 'gallery' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Gallery {avatars.length > 0 && `(${avatars.length})`}
            </button>
          </div>

          {/* Unified Drag & Drop Zone - Always Visible */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-4 min-h-[140px] transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <input {...getInputProps()} />

            {referencePreviews.length === 0 ? (
              <div className="text-center py-8">
                <Upload className="w-8 h-8 mx-auto mb-2 text-surface-400" />
                <p className="text-surface-400 text-sm">
                  {isDragActive ? 'Drop images here' : 'Drop images here or use Add Image button'}
                </p>
                <p className="text-xs text-surface-400 mt-1">JPEG, PNG, WebP • Max 5 images</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {referencePreviews.map((preview, idx) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    key={idx}
                    className="relative aspect-square rounded-lg overflow-hidden border border-surface-200"
                  >
                    <img src={preview} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Image Button */}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              if (imageSource === 'upload') {
                openFilePicker()
              }
              // Gallery mode: user picks from gallery grid below
            }}
            disabled={referenceImages.length >= MAX_REFERENCE_IMAGES}
          >
            Add Image {referenceImages.length >= MAX_REFERENCE_IMAGES && '(Max 5)'}
          </Button>

          {/* Gallery Grid - Conditionally Shown */}
          {imageSource === 'gallery' && (
            <div className="border border-surface-200 rounded-lg p-3">
              {avatarsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
                </div>
              ) : avatars.length === 0 ? (
                <div className="text-center py-8 text-surface-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No avatars in gallery</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Add images to <code className="bg-surface-100 px-1 rounded text-xs">avatars/</code> folder
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2 max-h-[200px] overflow-y-auto">
                  {avatars.map((avatar) => {
                    const isSelected = referenceImages.some((f) => f.name === avatar.filename)
                    return (
                      <button
                        type="button"
                        key={avatar.filename}
                        onClick={() => selectAvatar(avatar)}
                        disabled={referenceImages.length >= MAX_REFERENCE_IMAGES && !isSelected}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative ${
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
        </div>

        {/* Step 3: Settings */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
            Settings
          </h2>
          <div className="grid grid-cols-2 gap-4">
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
        </div>

        {/* Generate Button */}
        <Button
          variant="success"
          size="lg"
          icon={batchLoading ? undefined : <Play className="w-5 h-5" />}
          loading={batchLoading}
          onClick={handleBatchGenerate}
          disabled={
            batchLoading ||
            referenceImages.length === 0 ||
            (promptSource === 'generated'
              ? selectedPrompts.size === 0
              : promptSource === 'custom'
                ? customPrompts.length === 0 || customPrompts.some((cp) => cp.error !== null)
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

        {batchError && (
          <div
            className={`rounded-lg p-4 flex items-start gap-3 ${
              batchError.type === 'warning'
                ? 'bg-warning-muted/50 border border-warning/40'
                : 'bg-danger-muted/50 border border-danger/40'
            }`}
          >
            {batchError.type === 'warning' ? (
              <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            ) : !navigator.onLine ? (
              <WifiOff className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={batchError.type === 'warning' ? 'text-warning' : 'text-danger'}>{batchError.message}</p>
              {batchError.action && (
                <button
                  type="button"
                  onClick={batchError.action.onClick}
                  className={`mt-2 text-sm underline ${
                    batchError.type === 'warning'
                      ? 'text-warning hover:text-warning-hover'
                      : 'text-danger hover:text-danger-hover'
                  }`}
                >
                  {batchError.action.label}
                </button>
              )}
            </div>
            <Button
              variant="ghost-muted"
              size="xs"
              aria-label="Dismiss"
              icon={<X className="w-4 h-4" />}
              onClick={() => setBatchError(null)}
            />
          </div>
        )}

        {uploadError && (
          <div className="bg-danger-muted/50 border border-danger/40 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <p className="flex-1 text-danger">{uploadError}</p>
            <Button
              variant="ghost-muted"
              size="xs"
              aria-label="Dismiss"
              icon={<X className="w-4 h-4" />}
              onClick={() => setUploadError(null)}
            />
          </div>
        )}
      </div>

      {/* Right Column: Outputs */}
      <div className="space-y-6">
        {/* Step 4: Results */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
            Results
          </h2>

          {batchProgress ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      batchProgress.status === 'completed'
                        ? 'success'
                        : batchProgress.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {batchProgress.status.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-surface-400">{batchProgress.progress}%</span>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-3">
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
                          <ThumbsUp className="w-3.5 h-3.5 text-white" />
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
                          <ThumbsDown className="w-3.5 h-3.5 text-white" />
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
                        icon={<CheckSquare className="w-3.5 h-3.5" />}
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
                        selectAllResultImages()
                        downloadImages(
                          batchProgress.images.filter((i) => i.status === 'completed' && i.url).map((i) => i.url!),
                        )
                      }}
                    >
                      Download All
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Download className="w-4 h-4" />}
                      disabled={selectedResultImages.size === 0}
                      onClick={() =>
                        downloadImages(
                          batchProgress.images
                            .filter((i) => i.status === 'completed' && i.url && selectedResultImages.has(i.index))
                            .map((i) => i.url!),
                        )
                      }
                    >
                      Download Selected ({selectedResultImages.size})
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Film className="w-4 h-4" />}
                      disabled={selectedResultImages.size === 0}
                      onClick={() => {
                        const completed =
                          batchProgress?.images.filter(
                            (img) => img.status === 'completed' && img.url && selectedResultImages.has(img.index),
                          ) ?? []
                        const imageUrls = completed.map((img) => img.url!)
                        const newIds = useImg2VideoQueueStore.getState().addItems(imageUrls)
                        // Select first item for immediate editing
                        if (newIds.length > 0) {
                          useImg2VideoQueueStore.getState().selectItem(newIds[0])
                        }
                        navigate('img2video')
                      }}
                    >
                      Send to Img2Video ({selectedResultImages.size})
                    </Button>
                    <div className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<FolderOpen className="w-4 h-4" />}
                        onClick={async () => {
                          try {
                            const response = await authFetch(apiUrl('/api/generate/open-folder'), {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ folderPath: batchProgress.outputDir }),
                            })
                            if (!response.ok) {
                              const raw = await response.json().catch(() => ({}))
                              setBatchError({ message: getApiError(raw, 'Failed to open folder'), type: 'error' })
                            }
                          } catch {
                            setBatchError({ message: 'Failed to open folder', type: 'error' })
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
          ) : (
            <div className="text-center py-12 text-surface-400">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Configure generation and click Generate</p>
              <p className="text-xs mt-1">Results will appear here</p>
            </div>
          )}
        </div>

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
                  <div className="grid grid-cols-6 gap-2">
                    {completed.map((img) => (
                      <button
                        type="button"
                        key={img.index}
                        onClick={() => img.url && setPreviewImage(img.url)}
                        title="Double click to preview"
                        className={`relative aspect-[9/16] rounded-lg border-2 ${entry.color} cursor-pointer hover:scale-105 transition-all overflow-hidden`}
                      >
                        <img
                          src={assetUrl(img.url!)}
                          alt={`Batch ${completedBatches.length - batchIdx} #${img.index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </button>
                    ))}
                  </div>
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
