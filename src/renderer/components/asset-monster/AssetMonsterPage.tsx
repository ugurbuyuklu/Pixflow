import JSZip from 'jszip'
import {
  AlertCircle,
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
  Sparkles,
  ThumbsUp,
  ThumbsDown,
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
import { useImg2VideoQueueStore } from '../../stores/img2videoQueueStore'
import { useImageRatingsStore } from '../../stores/imageRatingsStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import type { GeneratedPrompt, GeneratedImageRecord } from '../../types'
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
  } catch {
    setError('Failed to convert text to prompt')
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
    customPromptJson,
    customPromptCount,
    customPromptError,
    imageSource,
    avatars,
    avatarsLoading,
    aspectRatio,
    numImagesPerPrompt,
    outputFormat,
    resolution,
    togglePromptSelection,
    selectAllPrompts,
    deselectAllPrompts,
    setPromptSource,
    setCustomPromptJson,
    setCustomPromptCount,
    setCustomPromptError,
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
  const { rateImage: rateImageInStore, removeRating } = useImageRatingsStore()

  const [batchImageIds, setBatchImageIds] = useState<Map<number, number>>(new Map())

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
      const customPrompts = await parseCustomPrompt(customPromptJson, customPromptCount, setCustomPromptError)
      if (!customPrompts) return
      startBatch(customPrompts, 'custom')
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

  const totalImages = promptSource === 'custom' ? customPromptCount : selectedPrompts.size
  const completedCount = batchProgress?.completedImages ?? 0
  const totalCount = batchProgress?.totalImages ?? totalImages
  const avgPerImage = completedCount > 0 ? elapsed / completedCount : 0
  const remainingSeconds = completedCount > 0 ? Math.ceil(avgPerImage * (totalCount - completedCount)) : 0

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Left: Prompt Selection */}
      <div className="col-span-1 bg-surface-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Prompts</h2>
          <div className="flex bg-surface-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setPromptSource('generated')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                promptSource === 'generated'
                  ? 'bg-brand-600 text-surface-900'
                  : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <List className="w-3 h-3" />
              Generated
            </button>
            <button
              type="button"
              onClick={() => setPromptSource('custom')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                promptSource === 'custom' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <FileJson className="w-3 h-3" />
              Custom
            </button>
          </div>
        </div>

        {promptSource === 'generated' ? (
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
            <>
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
            </>
          )
        ) : (
          <div className="space-y-4">
            <div>
              <span className="block text-sm text-surface-400 mb-2">
                Custom Prompt
                <span className="text-surface-400 ml-2 font-normal">(JSON or plain text)</span>
              </span>
              <textarea
                value={customPromptJson}
                onChange={(e) => {
                  setCustomPromptJson(e.target.value)
                  setCustomPromptError(null)
                }}
                placeholder={`Describe the scene or paste JSON...

Examples:
• Black & white editorial photoshoot with dramatic lighting
• {"style": "Romantic portrait...", "lighting": {...}}`}
                className={`w-full h-64 bg-surface-100 rounded-lg p-3 text-sm resize-none border ${
                  customPromptError ? 'border-danger focus:border-danger' : 'border-transparent focus:border-brand-500'
                } focus:outline-none`}
              />
              {customPromptError && (
                <p className="text-danger text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {customPromptError}
                </p>
              )}
            </div>
            <Slider
              label="Number of Images"
              displayValue={customPromptCount}
              min={1}
              max={4}
              value={customPromptCount}
              onChange={(e) => setCustomPromptCount(Number(e.currentTarget.value))}
            />
          </div>
        )}
      </div>

      {/* Right: Upload & Generate */}
      <div className="col-span-2 space-y-6">
        {/* Reference Image Section */}
        <div className="bg-surface-50 rounded-lg p-4">
          <input {...getInputProps()} />

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Reference Image</h2>
            <div className="flex bg-surface-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setImageSource('upload')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                  imageSource === 'upload' ? 'bg-brand-600 text-surface-900' : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <ImagePlus className="w-4 h-4" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => setImageSource('gallery')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                  imageSource === 'gallery'
                    ? 'bg-brand-600 text-surface-900'
                    : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <Users className="w-4 h-4" />
                Gallery {avatars.length > 0 && `(${avatars.length})`}
              </button>
            </div>
          </div>

          {referencePreviews.length > 0 && (
            <div className="mb-4 p-3 bg-surface-100 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-success flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {referencePreviews.length} Image{referencePreviews.length > 1 ? 's' : ''} Selected
                  {referencePreviews.length > 1 && (
                    <span className="text-xs text-surface-400 font-normal">(for couple/family)</span>
                  )}
                </p>
                <Button variant="ghost-danger" size="sm" onClick={clearReferenceImages}>
                  Clear All
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {referencePreviews.map((preview, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    key={index}
                    className="relative group shrink-0"
                  >
                    <img src={preview} alt={`Reference ${index + 1}`} className="w-14 h-14 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -top-1 -right-1 bg-danger rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {referencePreviews.length < MAX_REFERENCE_IMAGES && (
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="w-14 h-14 shrink-0 border-2 border-dashed border-surface-200 rounded-lg flex items-center justify-center text-surface-400 hover:border-brand-500 hover:text-brand-400 transition-colors"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {imageSource === 'upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-200'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-surface-400" />
              <p className="text-surface-400">{isDragActive ? 'Drop image here' : 'Drag & drop or click to upload'}</p>
              <p className="text-sm text-surface-400 mt-1">JPEG, PNG, WebP up to 10MB</p>
            </div>
          )}

          {imageSource === 'gallery' && (
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
                    Add images to <code className="bg-surface-100 px-1 rounded">avatars/</code> folder
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {avatars.map((avatar) => {
                    const isSelected = referenceImages.some((f) => f.name === avatar.filename)
                    return (
                      <button
                        type="button"
                        key={avatar.filename}
                        onClick={() => selectAvatar(avatar)}
                        className={`w-20 shrink-0 aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-200'
                        }`}
                      >
                        <img src={assetUrl(avatar.url)} alt={avatar.name} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                            <Check className="w-3 h-3" />
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

        {/* Generation Settings */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-surface-400 mb-3">Generation Settings</h3>
          <div className="grid grid-cols-4 gap-4">
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
            (promptSource === 'generated' ? selectedPrompts.size === 0 : !customPromptJson.trim())
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

        {batchProgress && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Generation Progress</h2>
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
                      {selectedResultImages.size === batchProgress.images.filter((i) => i.status === 'completed').length
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
        )}

        {completedBatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">Previous Generations</h2>
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
    </div>
  )
}
