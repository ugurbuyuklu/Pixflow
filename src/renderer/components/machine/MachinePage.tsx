import {
  AlertCircle,
  Check,
  CheckCircle,
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { assetUrl } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'
import { useMachineStore } from '../../stores/machineStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'

const STEP_LABELS = {
  prompts: 'Generate Prompts',
  images: 'Generate Images',
  script: 'Write Script',
  tts: 'Text-to-Speech',
  lipsync: 'Lipsync Video',
} as const

const STEP_ORDER = ['prompts', 'images', 'script', 'tts', 'lipsync'] as const

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DURATION_OPTIONS = [
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '45', label: '45s' },
  { value: '60', label: '60s' },
]

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'dramatic', label: 'Dramatic' },
]

export default function MachinePage() {
  const machineRefInputRef = useRef<HTMLInputElement>(null)

  const {
    step,
    failedStep,
    error,
    concept,
    promptCount,
    refPreviews,
    scriptDuration,
    scriptTone,
    selectedVoice,
    selectedAvatar,
    prompts,
    batchProgress,
    script,
    audioUrl,
    videoUrl,
    setConcept,
    setPromptCount,
    setScriptDuration,
    setScriptTone,
    setSelectedVoice,
    setSelectedAvatar,
    addRefImages,
    removeRefImage,
    run,
    cancel,
  } = useMachineStore()

  const { avatars, avatarsLoading, voices, voicesLoading } = useAvatarStore()

  useEffect(() => {
    const { loadAvatars, loadVoices } = useAvatarStore.getState()
    loadAvatars()
    loadVoices()
  }, [])

  return (
    <div className="space-y-6">
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
            onClick={() => useMachineStore.setState({ error: null })}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
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
            <div className="bg-surface-50 rounded-lg p-4 text-sm text-surface-400">
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

      {step === 'idle' && (
        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-warning" />
              The Machine
            </h2>
            <Input
              label="Concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. Christmas, Halloween, Summer Beach..."
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-surface-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-brand-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                  Prompt Generation
                </h3>
                <Slider
                  label="Number of Prompts"
                  displayValue={promptCount}
                  min={2}
                  max={12}
                  value={promptCount}
                  onChange={(e) => setPromptCount(Number(e.currentTarget.value))}
                />
                <div className="flex justify-between text-xs text-surface-400 mt-1">
                  <span>2</span>
                  <span>6</span>
                  <span>12</span>
                </div>
              </div>

              <div className="bg-surface-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <span className="bg-surface-200 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    +
                  </span>
                  Additional People
                  <span className="text-xs text-surface-400 font-normal">(Optional)</span>
                </h3>
                <p className="text-xs text-surface-400 mb-3">
                  Selected avatar is used as the main reference. Add extra people for couple/family concepts.
                </p>
                <input
                  ref={machineRefInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addRefImages(Array.from(e.target.files).slice(0, 3))
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
                    {refPreviews.length < 3 && (
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
                    <span className="text-xs">Add extra people for couple/family (max 3)</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-surface-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-brand-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                  Avatar for Video
                </h3>
                {avatarsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-surface-400" />
                  </div>
                ) : avatars.length === 0 ? (
                  <p className="text-sm text-surface-400 py-4 text-center">
                    No avatars. Go to the Avatars tab to generate or upload some.
                  </p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {avatars.map((avatar) => (
                      <button
                        type="button"
                        key={avatar.filename}
                        onClick={() => setSelectedAvatar(selectedAvatar?.filename === avatar.filename ? null : avatar)}
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

              <div className="bg-surface-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-brand-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">4</span>
                  Voiceover
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Duration"
                    value={String(scriptDuration)}
                    onChange={(e) => setScriptDuration(Number(e.target.value))}
                    options={DURATION_OPTIONS}
                  />
                  <Select
                    label="Tone"
                    value={scriptTone}
                    onChange={(e) => setScriptTone(e.target.value as typeof scriptTone)}
                    options={TONE_OPTIONS}
                  />
                </div>
                <div className="mt-3">
                  {voicesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-surface-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
                    </div>
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
              </div>
            </div>
          </div>

          <Button
            variant="warning"
            size="lg"
            onClick={() => run()}
            disabled={!concept.trim() || !selectedAvatar || !selectedVoice}
            icon={<Zap className="w-6 h-6" />}
            className="w-full py-4 text-lg font-semibold"
          >
            Run The Machine
          </Button>
        </div>
      )}

      {step !== 'idle' && step !== 'error' && step !== 'done' && (
        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-warning" />
              Running The Machine
              <span className="text-sm text-surface-400 ml-auto">Concept: {concept}</span>
            </h2>

            <div className="space-y-4">
              {STEP_ORDER.map((s, i) => {
                const currentIdx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number])
                const isActive = step === s
                const isDone = i < currentIdx
                const isPending = i > currentIdx

                return (
                  <div key={s} className={`flex items-center gap-4 p-3 rounded-lg ${isActive ? 'bg-surface-100' : ''}`}>
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
                        <div className="mt-1">
                          <div className="w-full bg-surface-200 rounded-full h-2">
                            <div
                              className="bg-warning h-2 rounded-full transition-all"
                              style={{
                                width: `${batchProgress.totalImages > 0 ? (batchProgress.completedImages / batchProgress.totalImages) * 100 : 0}%`,
                              }}
                            />
                          </div>
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
          </div>

          <Button variant="danger" onClick={cancel} icon={<X className="w-5 h-5" />} className="w-full py-3">
            Cancel
          </Button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success" />
              Pipeline Complete!
              <span className="text-sm text-surface-400 ml-auto">{concept}</span>
            </h2>

            {batchProgress && batchProgress.images.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-surface-400 mb-3">
                  Generated Images ({batchProgress.images.filter((i) => i.status === 'completed').length})
                </h3>
                <div className="grid grid-cols-6 gap-2">
                  {batchProgress.images
                    .filter((i) => i.status === 'completed' && i.url)
                    .map((img) => (
                      <div key={img.index} className="aspect-[9/16] rounded-lg overflow-hidden bg-surface-100">
                        <img
                          src={assetUrl(img.url!)}
                          alt={`Generated result ${img.index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {script && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-surface-400 mb-2">Voiceover Script</h3>
                <div className="bg-surface-100 rounded-lg p-3 text-sm text-surface-500 max-h-32 overflow-auto whitespace-pre-wrap">
                  {script}
                </div>
              </div>
            )}

            {audioUrl && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-surface-400 mb-2">Audio</h3>
                {/* biome-ignore lint/a11y/useMediaCaption: AI-generated audio, no captions available */}
                <audio controls src={assetUrl(audioUrl)} className="w-full" />
              </div>
            )}

            {videoUrl && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-surface-400 mb-2">Avatar Video</h3>
                <div className="flex gap-4 items-start">
                  {/* biome-ignore lint/a11y/useMediaCaption: AI-generated video, no captions available */}
                  <video controls src={assetUrl(videoUrl)} className="max-w-sm rounded-lg" />
                  <a
                    href={assetUrl(videoUrl)}
                    download
                    className="flex items-center gap-2 px-4 py-2 bg-success text-white hover:bg-success-hover rounded-lg font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Video
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <Button
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
              icon={<RefreshCw className="w-5 h-5" />}
              className="flex-1 py-3"
            >
              Run Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
