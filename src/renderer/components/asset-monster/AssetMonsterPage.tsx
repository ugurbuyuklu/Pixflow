import { useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Sparkles, Check, CheckCircle, XCircle, Upload, Image, Play, Loader2,
  FolderOpen, AlertCircle, X, WifiOff, Clock, Users, ImagePlus, FileJson, List,
} from 'lucide-react'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import {
  useGenerationStore,
  MAX_REFERENCE_IMAGES, ASPECT_RATIOS, RESOLUTIONS, OUTPUT_FORMATS,
} from '../../stores/generationStore'
import { usePromptStore } from '../../stores/promptStore'
import { useNavigationStore } from '../../stores/navigationStore'
import type { GeneratedPrompt } from '../../types'

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
      framing: camera?.framing as string || '',
      body_position: subject?.pose as string || '',
      arms: subject?.movement_detail as string || '',
      posture: '',
      expression: {
        facial: subject?.expression as string || '',
        eyes: '',
        mouth: '',
      },
    },

    lighting: {
      setup: lighting?.style as string || '',
      key_light: lighting?.key_light as string || '',
      fill_light: lighting?.fill_light as string || lighting?.ambient_light as string || '',
      shadows: '',
      mood: scene?.atmosphere as string || '',
    },

    set_design: {
      backdrop: scene?.environment as string || '',
      surface: scene?.depth as string || '',
      props: Array.isArray(scene?.background_elements) ? scene.background_elements as string[] : [],
      atmosphere: scene?.atmosphere as string || '',
    },

    outfit: {
      main: subjectOutfit?.outer_layer as string || subjectOutfit?.inner_layer as string || '',
      underneath: subjectOutfit?.inner_layer as string || '',
      accessories: '',
      styling: '',
    },

    camera: {
      lens: camera?.lens as string || '',
      aperture: camera?.aperture as string || '',
      angle: camera?.camera_angle as string || '',
      focus: camera?.focus as string || '',
      distortion: '',
    },

    effects: {
      color_grade: colorGrading?.palette as string || '',
      grain: quality?.grain as string || '',
      vignette: '',
      atmosphere: colorGrading?.tone_control as string || '',
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
      return Array(customPromptCount).fill(adaptPromptFormat(parsed as Record<string, unknown>))
    } catch {
      setError('Invalid JSON format')
      return null
    }
  }

  setError(null)
  const converted = await convertTextToPrompt(input, setError)
  if (!converted) return null
  return Array(customPromptCount).fill(converted)
}

export function AssetMonsterPage() {
  const {
    selectedPrompts, referenceImages, referencePreviews, batchLoading, batchProgress, batchError, uploadError, previewImage,
    promptSource, customPromptJson, customPromptCount, customPromptError,
    imageSource, avatars, avatarsLoading,
    aspectRatio, numImagesPerPrompt, outputFormat, resolution,
    togglePromptSelection, selectAllPrompts, deselectAllPrompts,
    setPromptSource, setCustomPromptJson, setCustomPromptCount, setCustomPromptError,
    setImageSource, setAspectRatio, setNumImagesPerPrompt, setOutputFormat, setResolution, setPreviewImage,
    addReferenceFiles, removeReferenceImage, clearReferenceImages, setUploadError, setBatchError,
    selectAvatar, loadAvatars, startBatch,
  } = useGenerationStore()

  const { prompts, concept } = usePromptStore()
  const { navigate } = useNavigationStore()

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
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

  useEffect(() => { loadAvatars() }, [])

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

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Left: Prompt Selection */}
      <div className="col-span-1 bg-surface-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Prompts</h2>
          <div className="flex bg-surface-100 rounded-lg p-1">
            <button
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
              onClick={() => setPromptSource('custom')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                promptSource === 'custom'
                  ? 'bg-brand-600 text-surface-900'
                  : 'text-surface-400 hover:text-surface-900'
              }`}
            >
              <FileJson className="w-3 h-3" />
              Custom
            </button>
          </div>
        </div>

        {promptSource === 'generated' ? (
          <>
            {prompts.length === 0 ? (
              <div className="text-center py-8 text-surface-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No prompts yet</p>
                <button
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
                    <button
                      onClick={() => selectAllPrompts(prompts.length)}
                      className="text-xs px-2 py-1 bg-surface-100 hover:bg-surface-200 rounded"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllPrompts}
                      className="text-xs px-2 py-1 bg-surface-100 hover:bg-surface-200 rounded"
                    >
                      Deselect All
                    </button>
                  </div>
                  <span className="text-sm text-surface-400">
                    {selectedPrompts.size}/{prompts.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {prompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => togglePromptSelection(index)}
                      className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 ${
                        selectedPrompts.has(index)
                          ? 'bg-brand-600/30 border border-brand-500'
                          : 'bg-surface-100 hover:bg-surface-200 border border-transparent'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        selectedPrompts.has(index)
                          ? 'bg-brand-500 border-brand-500'
                          : 'border-surface-200'
                      }`}>
                        {selectedPrompts.has(index) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-surface-400">#{index + 1}</span>
                        <p className="text-sm break-words">{prompt.style}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-surface-400 mb-2">
                Custom Prompt
                <span className="text-surface-400 ml-2 font-normal">(JSON or plain text)</span>
              </label>
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
                  customPromptError
                    ? 'border-danger focus:border-danger'
                    : 'border-transparent focus:border-brand-500'
                } focus:outline-none`}
              />
              {customPromptError && (
                <p className="text-danger text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {customPromptError}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-surface-400 mb-2">
                Number of Images: {customPromptCount}
              </label>
              <input
                type="range"
                min="1"
                max="4"
                value={customPromptCount}
                onChange={(e) => setCustomPromptCount(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-xs text-surface-400 mt-1">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
              </div>
            </div>
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
                onClick={() => setImageSource('upload')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                  imageSource === 'upload'
                    ? 'bg-brand-600 text-surface-900'
                    : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <ImagePlus className="w-4 h-4" />
                Upload
              </button>
              <button
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
                <button
                  onClick={clearReferenceImages}
                  className="text-surface-400 hover:text-danger text-sm"
                >
                  Clear All
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {referencePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Reference ${index + 1}`}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -top-1 -right-1 bg-danger rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {referencePreviews.length < MAX_REFERENCE_IMAGES && (
                  <button
                    onClick={openFilePicker}
                    className="w-16 h-16 border-2 border-dashed border-surface-200 rounded-lg flex items-center justify-center text-surface-400 hover:border-brand-500 hover:text-brand-400 transition-colors"
                  >
                    <ImagePlus className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          )}

          {imageSource === 'upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-surface-200 hover:border-surface-200'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-surface-400" />
              <p className="text-surface-400">
                {isDragActive ? 'Drop image here' : 'Drag & drop or click to upload'}
              </p>
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
                  <p className="text-sm mt-1">Add images to <code className="bg-surface-100 px-1 rounded">avatars/</code> folder</p>
                </div>
              ) : (
                <div className="grid grid-cols-8 gap-2 max-h-[400px] overflow-auto">
                  {avatars.map((avatar) => {
                    const isSelected = referenceImages.some((f) => f.name === avatar.filename)
                    return (
                      <button
                        key={avatar.filename}
                        onClick={() => selectAvatar(avatar)}
                        className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-200'
                        }`}
                      >
                        <img
                          src={assetUrl(avatar.url)}
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
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
            <div>
              <label className="block text-xs text-surface-400 mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full bg-surface-100 border border-surface-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-surface-400 mb-1">Images per Prompt</label>
              <select
                value={numImagesPerPrompt}
                onChange={(e) => setNumImagesPerPrompt(Number(e.target.value))}
                className="w-full bg-surface-100 border border-surface-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-surface-400 mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-surface-100 border border-surface-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {RESOLUTIONS.map((res) => (
                  <option key={res} value={res}>{res}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-surface-400 mb-1">Format</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="w-full bg-surface-100 border border-surface-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {OUTPUT_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleBatchGenerate}
          disabled={
            batchLoading ||
            referenceImages.length === 0 ||
            (promptSource === 'generated' ? selectedPrompts.size === 0 : !customPromptJson.trim())
          }
          className="w-full bg-success hover:bg-success-hover disabled:bg-surface-200 disabled:cursor-not-allowed text-white rounded-lg px-6 py-4 font-medium transition-all flex items-center justify-center gap-2"
        >
          {batchLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating {batchProgress?.completedImages || 0}/{batchProgress?.totalImages || (promptSource === 'custom' ? customPromptCount : selectedPrompts.size)}...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Generate {promptSource === 'custom' ? customPromptCount : selectedPrompts.size} Image{(promptSource === 'custom' ? customPromptCount : selectedPrompts.size) !== 1 ? 's' : ''}
            </>
          )}
        </button>

        {batchError && (
          <div className={`rounded-lg p-4 flex items-start gap-3 ${
            batchError.type === 'warning'
              ? 'bg-warning-muted/50 border border-warning/40'
              : 'bg-danger-muted/50 border border-danger/40'
          }`}>
            {batchError.type === 'warning' ? (
              <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            ) : !navigator.onLine ? (
              <WifiOff className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={batchError.type === 'warning' ? 'text-warning' : 'text-danger'}>
                {batchError.message}
              </p>
              {batchError.action && (
                <button
                  onClick={batchError.action.onClick}
                  className={`mt-2 text-sm underline ${
                    batchError.type === 'warning' ? 'text-warning hover:text-warning-hover' : 'text-danger hover:text-danger-hover'
                  }`}
                >
                  {batchError.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => setBatchError(null)}
              className="text-surface-400 hover:text-surface-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {uploadError && (
          <div className="bg-danger-muted/50 border border-danger/40 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <p className="flex-1 text-danger">{uploadError}</p>
            <button
              onClick={() => setUploadError(null)}
              className="text-surface-400 hover:text-surface-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {batchProgress && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Generation Progress</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs text-white ${
                  batchProgress.status === 'completed'
                    ? 'bg-success'
                    : batchProgress.status === 'failed'
                    ? 'bg-danger'
                    : 'bg-warning'
                }`}>
                  {batchProgress.status.toUpperCase()}
                </span>
                <span className="text-sm text-surface-400">
                  {batchProgress.progress}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3">
              {batchProgress.images.map((img) => (
                <button
                  key={img.index}
                  onClick={() => img.status === 'completed' && img.url && setPreviewImage(img.url)}
                  className={`aspect-[9/16] rounded-lg border-2 flex items-center justify-center ${
                    img.status === 'completed'
                      ? 'border-success bg-success/10 cursor-pointer hover:border-success-hover hover:scale-105 transition-all'
                      : img.status === 'generating'
                      ? 'border-warning bg-warning/10'
                      : img.status === 'failed'
                      ? 'border-danger bg-danger/10'
                      : 'border-surface-200 bg-surface-100'
                  }`}
                >
                  {img.status === 'completed' && img.url ? (
                    <img src={assetUrl(img.url!)} alt={`Generated ${img.index + 1}`} className="w-full h-full object-cover rounded-lg" />
                  ) : img.status === 'generating' ? (
                    <Loader2 className="w-6 h-6 animate-spin text-warning" />
                  ) : img.status === 'failed' ? (
                    <XCircle className="w-6 h-6 text-danger" />
                  ) : (
                    <Image className="w-6 h-6 text-surface-400" />
                  )}
                </button>
              ))}
            </div>

            {batchProgress.status === 'completed' && (
              <div className="mt-4 pt-4 border-t border-surface-100 flex justify-end">
                <button
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
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-100 hover:bg-surface-200 rounded-lg text-sm"
                >
                  <FolderOpen className="w-4 h-4" />
                  Open Folder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
