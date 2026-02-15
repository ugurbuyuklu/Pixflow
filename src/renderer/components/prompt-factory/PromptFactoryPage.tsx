import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle,
  Code,
  Copy,
  Eye,
  Lightbulb,
  Loader2,
  Pencil,
  Save,
  ScanSearch,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { useGenerationStore } from '../../stores/generationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import type { GeneratedPrompt } from '../../types'
import { StepHeader } from '../asset-monster/StepHeader'
import { Button } from '../ui/Button'
import { ConfirmationDialog } from '../ui/ConfirmationDialog'
import { Input } from '../ui/Input'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { Slider } from '../ui/Slider'
import { StatusBanner } from '../ui/StatusBanner'

function _extractMood(prompt: GeneratedPrompt): string {
  return prompt.lighting?.mood || prompt.effects?.atmosphere || 'N/A'
}

const PROMPT_SECTIONS: { key: keyof GeneratedPrompt; label: string }[] = [
  { key: 'style', label: 'Style' },
  { key: 'pose', label: 'Pose' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'set_design', label: 'Set Design' },
  { key: 'outfit', label: 'Outfit' },
  { key: 'camera', label: 'Camera' },
  { key: 'hairstyle', label: 'Hairstyle' },
  { key: 'makeup', label: 'Makeup' },
  { key: 'effects', label: 'Effects' },
]

interface VisualFieldConfig {
  label: string
  path: string[]
  multiline?: boolean
  array?: boolean
}

const VISUAL_EDIT_FIELDS: Array<{ key: keyof GeneratedPrompt; label: string; fields: VisualFieldConfig[] }> = [
  { key: 'style', label: 'Style', fields: [{ label: 'Style', path: ['style'], multiline: true }] },
  {
    key: 'pose',
    label: 'Pose',
    fields: [
      { label: 'Framing', path: ['pose', 'framing'], multiline: true },
      { label: 'Body Position', path: ['pose', 'body_position'], multiline: true },
      { label: 'Arms', path: ['pose', 'arms'], multiline: true },
      { label: 'Posture', path: ['pose', 'posture'], multiline: true },
      { label: 'Expression (Facial)', path: ['pose', 'expression', 'facial'], multiline: true },
      { label: 'Expression (Eyes)', path: ['pose', 'expression', 'eyes'], multiline: true },
      { label: 'Expression (Mouth)', path: ['pose', 'expression', 'mouth'], multiline: true },
    ],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    fields: [
      { label: 'Setup', path: ['lighting', 'setup'], multiline: true },
      { label: 'Key Light', path: ['lighting', 'key_light'], multiline: true },
      { label: 'Fill Light', path: ['lighting', 'fill_light'], multiline: true },
      { label: 'Shadows', path: ['lighting', 'shadows'], multiline: true },
      { label: 'Mood', path: ['lighting', 'mood'], multiline: true },
    ],
  },
  {
    key: 'set_design',
    label: 'Set Design',
    fields: [
      { label: 'Backdrop', path: ['set_design', 'backdrop'], multiline: true },
      { label: 'Surface', path: ['set_design', 'surface'], multiline: true },
      { label: 'Props (comma separated)', path: ['set_design', 'props'], array: true, multiline: true },
      { label: 'Atmosphere', path: ['set_design', 'atmosphere'], multiline: true },
    ],
  },
  {
    key: 'outfit',
    label: 'Outfit',
    fields: [
      { label: 'Main', path: ['outfit', 'main'], multiline: true },
      { label: 'Underneath', path: ['outfit', 'underneath'], multiline: true },
      { label: 'Accessories', path: ['outfit', 'accessories'], multiline: true },
      { label: 'Styling', path: ['outfit', 'styling'], multiline: true },
    ],
  },
  {
    key: 'camera',
    label: 'Camera',
    fields: [
      { label: 'Lens', path: ['camera', 'lens'] },
      { label: 'Aperture', path: ['camera', 'aperture'] },
      { label: 'Angle', path: ['camera', 'angle'], multiline: true },
      { label: 'Focus', path: ['camera', 'focus'], multiline: true },
      { label: 'Distortion', path: ['camera', 'distortion'] },
    ],
  },
  {
    key: 'hairstyle',
    label: 'Hairstyle',
    fields: [
      { label: 'Style', path: ['hairstyle', 'style'], multiline: true },
      { label: 'Parting', path: ['hairstyle', 'parting'] },
      { label: 'Details', path: ['hairstyle', 'details'], multiline: true },
      { label: 'Finish', path: ['hairstyle', 'finish'] },
    ],
  },
  {
    key: 'makeup',
    label: 'Makeup',
    fields: [
      { label: 'Style', path: ['makeup', 'style'], multiline: true },
      { label: 'Skin', path: ['makeup', 'skin'], multiline: true },
      { label: 'Eyes', path: ['makeup', 'eyes'], multiline: true },
      { label: 'Lips', path: ['makeup', 'lips'], multiline: true },
    ],
  },
  {
    key: 'effects',
    label: 'Effects',
    fields: [
      { label: 'Vignette', path: ['effects', 'vignette'], multiline: true },
      { label: 'Color Grade', path: ['effects', 'color_grade'], multiline: true },
      { label: 'Contrast', path: ['effects', 'contrast'] },
      { label: 'Lens Flare', path: ['effects', 'lens_flare'], multiline: true },
      { label: 'Atmosphere', path: ['effects', 'atmosphere'], multiline: true },
      { label: 'Grain', path: ['effects', 'grain'] },
    ],
  },
]

function getPathValue(target: unknown, path: string[]): unknown {
  let cursor: unknown = target
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

function setPathValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]
    const next = cursor[key]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[path[path.length - 1]] = value
}

function formatValue(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') return val || null
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : null
  if (typeof val === 'object') {
    const parts = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => {
        const formatted = formatValue(v)
        return formatted ? `${k.replace(/_/g, ' ')}: ${formatted}` : null
      })
      .filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }
  return String(val)
}

function PromptPreview({
  prompt,
  editable = false,
  onFieldChange,
}: {
  prompt: GeneratedPrompt
  editable?: boolean
  onFieldChange?: (path: string[], value: string, array?: boolean) => void
}) {
  if (editable) {
    return (
      <div className="space-y-4 overflow-y-auto">
        {VISUAL_EDIT_FIELDS.map((section) => (
          <div key={section.key} className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">{section.label}</span>
            <div className="grid grid-cols-1 gap-2">
              {section.fields.map((field) => {
                const raw = getPathValue(prompt, field.path)
                const value = Array.isArray(raw)
                  ? raw.join(', ')
                  : typeof raw === 'string'
                    ? raw
                    : raw == null
                      ? ''
                      : String(raw)
                return (
                  <div key={field.path.join('.')} className="space-y-1">
                    <span className="text-[11px] text-surface-400">{field.label}</span>
                    {field.multiline ? (
                      <textarea
                        value={value}
                        onChange={(e) => {
                          onFieldChange?.(field.path, e.target.value, field.array)
                          e.target.style.height = 'auto'
                          e.target.style.height = `${e.target.scrollHeight}px`
                        }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto'
                            el.style.height = `${el.scrollHeight}px`
                          }
                        }}
                        aria-label={field.label}
                        className="w-full bg-surface-100 border border-surface-200 rounded-lg px-2.5 py-2 text-xs text-surface-700 focus:outline-none focus:border-brand-500 resize-none overflow-hidden"
                        spellCheck={false}
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(e) => onFieldChange?.(field.path, e.target.value, field.array)}
                        aria-label={field.label}
                        className="w-full bg-surface-100 border border-surface-200 rounded-lg px-2.5 py-2 text-xs text-surface-700 focus:outline-none focus:border-brand-500"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto">
      {PROMPT_SECTIONS.map(({ key, label }) => {
        const val = prompt[key]
        if (val == null) return null
        if (typeof val === 'string') {
          if (!val) return null
          return (
            <div key={key}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">{label}</span>
              <p className="text-sm text-surface-700 mt-0.5">{val}</p>
            </div>
          )
        }
        const obj = val as Record<string, unknown>
        const entries = Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v != null && v !== '')
        if (entries.length === 0) return null
        return (
          <div key={key}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">{label}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {entries.map(([k, v]) => {
                const formatted = formatValue(v)
                if (!formatted) return null
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-100 text-xs text-surface-600"
                  >
                    <span className="font-medium text-surface-400">{k.replace(/_/g, ' ')}:</span> {formatted}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function generateFavoriteName(prompt: GeneratedPrompt, index: number): string {
  const concepts = usePromptStore.getState().concepts
  const concept = concepts.find((c) => c.value.trim())?.value || ''
  const styleWords = prompt.style?.split(' ').slice(0, 4).join(' ')
  if (concept) return `${concept} #${index + 1}`
  if (styleWords) return styleWords.length > 35 ? `${styleWords.slice(0, 35)}...` : styleWords
  return `Prompt ${index + 1} (${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`
}

export default function PromptFactoryPage() {
  const promptStore = usePromptStore()
  const generationStore = useGenerationStore()
  const { addToFavorites } = useHistoryStore()
  const { navigate } = useNavigationStore()

  const {
    concepts,
    count,
    loading,
    prompts,
    selectedIndex,
    editingPromptText,
    promptSaving,
    promptSaved,
    error,
    copied,
    research,
    qualityMetrics,
    promptMode,
    analyzeEntries,
    analyzeTheme,
    updateConcept,
    setCount,
    setPromptMode,
    setSelectedIndex,
    setEditingPromptText,
    generate,
    cancelGenerate,
    copyPrompt,
    saveEdit,
    addAnalyzeFiles,
    removeAnalyzeEntry,
    clearAnalyzeEntries,
    setAnalyzeTheme,
    analyzeEntry,
    analyzeAllEntries,
    copyAnalyzedEntry,
    updateAnalyzeEntryPrompt,
    setPrompts,
    generationProgress,
  } = promptStore

  const activeConcepts = concepts.filter((c) => c.value.trim())

  const [elapsed, setElapsed] = useState(0)
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmClearImages, setConfirmClearImages] = useState(false)
  const [confirmClearPrompts, setConfirmClearPrompts] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const completedPromptIndexes = prompts.reduce<number[]>((acc, prompt, index) => {
    if (prompt) acc.push(index)
    return acc
  }, [])
  const completedPromptCount = completedPromptIndexes.length
  const selectedPrompt = selectedIndex !== null ? prompts[selectedIndex] : null
  const visualDraftPrompt = useMemo(() => {
    if (!selectedPrompt) return null
    if (!editingPromptText?.trim()) return selectedPrompt
    try {
      return JSON.parse(editingPromptText) as GeneratedPrompt
    } catch {
      return selectedPrompt
    }
  }, [selectedPrompt, editingPromptText])

  const handleVisualFieldChange = (path: string[], rawValue: string, isArray?: boolean) => {
    if (!selectedPrompt) return
    const base = visualDraftPrompt ? (JSON.parse(JSON.stringify(visualDraftPrompt)) as Record<string, unknown>) : {}
    const nextValue = isArray
      ? rawValue
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : rawValue
    setPathValue(base, path, nextValue)
    setEditingPromptText(JSON.stringify(base, null, 2))
  }

  const progressStartedAt = generationProgress?.startedAt ?? 0
  const progressDone = !generationProgress || generationProgress.step === 'done'
  useEffect(() => {
    if (progressDone || !progressStartedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - progressStartedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [progressDone, progressStartedAt])

  // Cleanup blob URLs on unmount to prevent memory leaks
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional cleanup on unmount only, reads current store state in cleanup
  useEffect(() => {
    return () => {
      const currentRefPreview = promptStore.referencePreview
      const currentAnalyzeEntries = promptStore.analyzeEntries
      if (currentRefPreview) URL.revokeObjectURL(currentRefPreview)
      for (const entry of currentAnalyzeEntries) {
        if (entry.preview.startsWith('blob:')) URL.revokeObjectURL(entry.preview)
      }
    }
  }, [])

  const applyMonsterSelection = (indexes: number[]) => {
    generationStore.deselectAllPrompts()
    indexes.forEach((index) => {
      generationStore.togglePromptSelection(index)
    })
    generationStore.setImageSource('upload')
    navigate('generate')
  }

  const handleSendAllToMonster = () => {
    if (completedPromptIndexes.length === 0) return
    applyMonsterSelection(completedPromptIndexes)
  }

  const analyzeDropzone = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    noClick: analyzeEntries.length > 0,
    onDrop: (accepted) => {
      if (accepted.length > 0) addAnalyzeFiles(accepted)
    },
  })

  const anyLoading = analyzeEntries.some((e) => e.loading)
  const analyzedCount = analyzeEntries.filter((e) => e.prompt).length
  const pendingAnalyzeCount = analyzeEntries.filter((e) => !e.prompt).length
  const promptModeTabs: { id: 'concept' | 'image'; label: string; icon: JSX.Element }[] = [
    { id: 'concept', label: 'Create Prompts', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'image', label: 'Image to Prompt', icon: <ScanSearch className="w-4 h-4" /> },
  ]

  if (promptMode === 'image') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:h-[calc(100vh-12rem)]">
        {/* LEFT PANEL - Inputs & Controls */}
        <div className="xl:col-span-1 self-start bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col gap-4 overflow-visible xl:overflow-hidden">
          <StepHeader stepNumber={1} title="Create Prompts" />
          <SegmentedTabs value={promptMode} items={promptModeTabs} onChange={setPromptMode} ariaLabel="Prompt mode" />

          {/* Context Input - OPTIONAL */}
          <div>
            <Input
              label="Context (optional)"
              value={analyzeTheme}
              onChange={(e) => setAnalyzeTheme(e.target.value)}
              placeholder="e.g., vampire theme, valentine's day, cyberpunk, minimalist fashion..."
            />
            <p className="text-xs text-surface-400 mt-1.5">
              Optional: Add context to guide the analysis. Leave empty for standard analysis.
            </p>
          </div>

          {analyzeEntries.length === 0 ? (
            <>
              <div
                {...analyzeDropzone.getRootProps()}
                className={`bg-surface-50 rounded-xl p-10 text-center border-2 border-dashed transition-colors cursor-pointer ${
                  analyzeDropzone.isDragActive
                    ? 'border-brand-400 bg-brand-600/5'
                    : 'border-surface-100 hover:border-surface-200'
                }`}
              >
                <input {...analyzeDropzone.getInputProps()} />
                <ScanSearch className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-400 text-base mb-1">Drop images here or click to upload</p>
                <p className="text-surface-300 text-sm">
                  Upload one or more images to extract prompts via GPT-4o Vision
                </p>
              </div>
              <Button variant="lime" size="lg" icon={<ScanSearch className="w-5 h-5" />} disabled className="w-full">
                Generate Prompts
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                  Images ({analyzeEntries.length}){analyzedCount > 0 && ` · ${analyzedCount} analyzed`}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Upload className="w-4 h-4" />}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.multiple = true
                      input.accept = 'image/jpeg,image/png,image/webp'
                      input.onchange = () => {
                        if (input.files?.length) addAnalyzeFiles(Array.from(input.files))
                      }
                      input.click()
                    }}
                  >
                    Add More
                  </Button>
                  <Button
                    variant="ghost-danger"
                    size="xs"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setConfirmClearImages(true)}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div
                {...analyzeDropzone.getRootProps()}
                className={`rounded-xl p-4 border-2 border-dashed transition-colors ${
                  analyzeDropzone.isDragActive
                    ? 'border-brand-400 bg-brand-600/5'
                    : 'border-surface-100 hover:border-surface-200 bg-surface-50'
                }`}
              >
                <input {...analyzeDropzone.getInputProps()} />
                <div className="text-xs text-surface-400 text-center">
                  Drop more images here to add them to the batch.
                </div>
              </div>

              <Button
                variant="lime"
                size="lg"
                icon={anyLoading ? undefined : <ScanSearch className="w-5 h-5" />}
                loading={anyLoading}
                onClick={analyzeAllEntries}
                disabled={anyLoading || pendingAnalyzeCount === 0}
                className="w-full"
              >
                {anyLoading
                  ? `Generating ${analyzeEntries.filter((e) => e.loading).length}...`
                  : pendingAnalyzeCount > 0
                    ? `Generate ${pendingAnalyzeCount} Prompt${pendingAnalyzeCount === 1 ? '' : 's'}`
                    : 'Generated'}
              </Button>

              <div className="bg-surface-50 rounded-xl p-4 space-y-3">
                {analyzedCount > 0 && (
                  <Button
                    variant="purple"
                    size="md"
                    icon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => {
                      const analyzed = analyzeEntries.filter((e) => e.prompt).map((e) => e.prompt!)
                      setPrompts(analyzed, analyzed.length - 1)
                      generationStore.selectAllPrompts(analyzed.length)
                      generationStore.setImageSource('upload')
                      navigate('generate')
                    }}
                    className="w-full"
                  >
                    Send to Monster ({analyzedCount})
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL - Outputs */}
        <div className="xl:col-span-2 flex flex-col gap-4 overflow-visible xl:overflow-hidden">
          <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
            <StepHeader stepNumber={2} title="Generated Prompts" />
            {analyzeEntries.length === 0 ? (
              <div className="text-sm text-surface-400">No outputs yet. Upload images on the left to analyze.</div>
            ) : (
              <div className="text-sm text-surface-400">Analyzed prompts appear below.</div>
            )}
          </div>
          {analyzeEntries.length === 0 ? (
            <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex items-center justify-center text-sm text-surface-400">
              No outputs yet. Upload images on the left to analyze.
            </div>
          ) : (
            <div className="space-y-3">
              {analyzeEntries.map((entry, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries reorder via remove only
                  key={i}
                  className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-3 flex gap-3"
                >
                  <div className="w-20 shrink-0 relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-100">
                    <img src={entry.preview} alt={`Analyze ${i + 1}`} className="w-full h-full object-cover" />
                    {entry.prompt && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-success/80 rounded-full p-1.5">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                    {entry.loading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-surface-400">Image {i + 1}</span>
                      <div className="flex items-center gap-1">
                        {!entry.prompt && !entry.loading && (
                          <Button
                            variant="primary"
                            size="xs"
                            icon={<ScanSearch className="w-3 h-3" />}
                            onClick={() => analyzeEntry(i)}
                          >
                            Analyze
                          </Button>
                        )}
                        {entry.prompt && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={
                                entry.copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />
                              }
                              onClick={() => copyAnalyzedEntry(i)}
                            />
                            <Button
                              variant="ghost-muted"
                              size="xs"
                              icon={<Pencil className="w-3 h-3" />}
                              onClick={() => {
                                if (editingEntry === i) {
                                  setEditingEntry(null)
                                  setEditError(null)
                                } else {
                                  setEditingEntry(i)
                                  setEditingText(JSON.stringify(entry.prompt, null, 2))
                                  setEditError(null)
                                }
                              }}
                            >
                              {editingEntry === i ? 'Cancel' : 'Edit'}
                            </Button>
                            <Button
                              variant="ghost-muted"
                              size="xs"
                              onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}
                            >
                              {expandedEntry === i ? 'Collapse' : 'View'}
                            </Button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAnalyzeEntry(i)}
                          className="p-1 text-surface-300 hover:text-danger transition-colors rounded"
                          title="Remove image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {entry.error && (
                      <div className="flex items-center gap-2 p-2 bg-danger-muted/30 border border-danger/30 rounded-lg text-danger text-xs">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {entry.error.message}
                      </div>
                    )}

                    {entry.prompt && !entry.error && editingEntry !== i && (
                      <p className="text-xs text-surface-500 break-words">{entry.prompt.style || 'Analyzed'}</p>
                    )}

                    {entry.loading && <p className="text-xs text-brand-400">Analyzing with GPT-4o Vision...</p>}

                    {editingEntry === i && entry.prompt && (
                      <div className="space-y-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full h-48 bg-surface-100 border border-surface-200 rounded-lg p-3 text-xs text-surface-500 font-mono resize-y focus:outline-none focus:border-brand-500 transition-colors whitespace-pre-wrap"
                          spellCheck={false}
                        />
                        {editError && (
                          <p className="text-danger text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {editError}
                          </p>
                        )}
                        <Button
                          variant={editSaved ? 'primary' : 'lime'}
                          size="xs"
                          icon={
                            editSaving ? undefined : editSaved ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )
                          }
                          loading={editSaving}
                          disabled={editSaving || editSaved}
                          onClick={async () => {
                            setEditSaving(true)
                            setEditError(null)
                            setEditSaved(false)
                            try {
                              let parsed: GeneratedPrompt
                              try {
                                parsed = JSON.parse(editingText)
                              } catch {
                                const res = await authFetch(apiUrl('/api/prompts/text-to-json'), {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: editingText }),
                                })
                                if (!res.ok) {
                                  const raw = await res.json().catch(() => ({}))
                                  throw new Error(getApiError(raw, 'Failed to convert text'))
                                }
                                const raw = await res.json()
                                parsed = unwrapApiData<{ prompt: GeneratedPrompt }>(raw).prompt
                              }
                              updateAnalyzeEntryPrompt(i, parsed)
                              setEditingEntry(null)
                              setEditSaved(true)
                              setTimeout(() => setEditSaved(false), 2000)
                            } catch (err) {
                              setEditError(err instanceof Error ? err.message : 'Save failed')
                            } finally {
                              setEditSaving(false)
                            }
                          }}
                        >
                          {editSaved ? 'Saved!' : 'Save Changes'}
                        </Button>
                      </div>
                    )}

                    {expandedEntry === i && editingEntry !== i && entry.prompt && (
                      <pre className="overflow-y-auto max-h-60 text-xs text-surface-500 bg-surface-100 rounded-lg p-3 whitespace-pre-wrap break-words">
                        {JSON.stringify(entry.prompt, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:h-[calc(100vh-12rem)]">
      {/* LEFT PANEL - Inputs & Controls */}
      <div className="xl:col-span-1 self-start bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col gap-4 overflow-visible xl:overflow-hidden">
        <StepHeader stepNumber={1} title="Create Prompts" />
        {/* Mode Toggle */}
        <SegmentedTabs value={promptMode} items={promptModeTabs} onChange={setPromptMode} ariaLabel="Prompt mode" />

        {/* Input Section */}
        <Input
          label="Concept"
          value={concepts[0]?.value || ''}
          onChange={(e) => updateConcept(0, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && activeConcepts.length > 0 && generate()}
          placeholder="e.g., Christmas, Halloween, Summer Beach..."
        />

        <Slider
          label="Number of Prompts"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          min={1}
          max={10}
          displayValue={count}
        />

        {/* Generate Button */}
        <div className="pt-2 border-t border-surface-200/50">
          {loading ? (
            <Button
              variant="secondary"
              size="lg"
              icon={<X className="w-5 h-5" />}
              onClick={cancelGenerate}
              className="w-full"
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="lg"
              icon={<Sparkles className="w-5 h-5" />}
              onClick={generate}
              disabled={activeConcepts.length === 0}
              className="w-full"
            >
              Generate {count}
            </Button>
          )}
        </div>

        {/* Key Insights — shown after generation */}
        {research && (
          <div className="space-y-3 text-xs border-t border-surface-200/50 pt-4">
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-surface-900">
                <Lightbulb className="w-4 h-4 text-warning" />
                Key Insights
              </h4>
              {(() => {
                const insightKeyCounts = new Map<string, number>()
                return (
                  <ul className="space-y-1 text-surface-500">
                    {research.insights?.slice(0, 3).map((insight) => {
                      const count = (insightKeyCounts.get(insight) ?? 0) + 1
                      insightKeyCounts.set(insight, count)
                      const key = count === 1 ? insight : `${insight}-${count}`
                      return (
                        <li key={key} className="flex items-start gap-1.5">
                          <span className="text-success mt-0.5">•</span>
                          <span>{insight}</span>
                        </li>
                      )
                    })}
                  </ul>
                )
              })()}
            </div>

            {qualityMetrics && (
              <div className="p-2 bg-surface-50 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-surface-400">Quality</span>
                  <span
                    className={`font-bold ${
                      (qualityMetrics.overall_score ?? 0) >= 80
                        ? 'text-success'
                        : (qualityMetrics.overall_score ?? 0) >= 60
                          ? 'text-warning'
                          : 'text-danger'
                    }`}
                  >
                    {qualityMetrics.overall_score ?? 0}/100
                  </span>
                </div>
              </div>
            )}

            {research.grounding && (
              <div className="p-2 bg-surface-50 rounded text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-surface-400">Research Mode</span>
                  <span className="font-semibold text-surface-700">
                    {research.grounding.effectiveMode === 'web' ? 'Web-grounded' : 'Model-only'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-400">Sources</span>
                  <span className="text-surface-700">{research.grounding.sources}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-400">Grounding Score</span>
                  <span className="text-surface-700">{research.grounding.groundingScore}/100</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Outputs */}
      <div className="xl:col-span-2 flex flex-col gap-4 overflow-visible xl:overflow-hidden">
        <div className="flex-1 bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <StepHeader stepNumber={2} title="Generated Prompts" />
            {completedPromptCount > 0 && (
              <Button
                variant="ghost-danger"
                size="xs"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setConfirmClearPrompts(true)}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Numbered Card Grid — single row of 10 */}
          {(prompts.length > 0 || loading) && (
            <div className="grid grid-cols-10 gap-2">
              {Array.from({ length: count }).map((_, i) => {
                const prompt = prompts[i]
                const isSelected = selectedIndex === i
                const isLoading = loading && !prompt

                return (
                  <button
                    type="button"
                    // biome-ignore lint/suspicious/noArrayIndexKey: static ordered slots
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-semibold transition-all relative ${
                      isSelected
                        ? 'bg-brand-600 text-white ring-2 ring-brand-500'
                        : prompt
                          ? 'bg-surface-100 text-surface-900 hover:bg-surface-200'
                          : isLoading
                            ? 'bg-surface-200/30 animate-pulse'
                            : 'bg-surface-50 text-surface-300'
                    }`}
                  >
                    <span className="text-lg">{i + 1}</span>
                    {prompt?._enriched && (
                      <span
                        className={`absolute top-1 right-1 w-2 h-2 rounded-full border ${
                          isSelected ? 'bg-white border-white/70' : 'bg-success border-success/60'
                        }`}
                        title="Enhanced"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {!loading && completedPromptCount > 0 && (
            <Button
              variant="lime"
              size="lg"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={handleSendAllToMonster}
              className="w-full"
            >
              Send All to Monster
            </Button>
          )}

          {/* Progress Indicator */}
          {loading && generationProgress && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-brand-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.step === 'quick_prompt' && 'Generating prompts...'}
                  {generationProgress.step === 'research' &&
                    `Researching "${activeConcepts[0]?.value || 'concept'}"...`}
                  {generationProgress.step === 'research_complete' && 'Research complete, generating prompts...'}
                  {generationProgress.step === 'enriching' &&
                    `Enriching prompt ${generationProgress.completed}/${generationProgress.total}...`}
                  {generationProgress.step === 'done' && 'Complete!'}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-400">
                  <Timer className="w-4 h-4" />
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </div>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: generationProgress.total }, (_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static ordered slots
                    key={i}
                    className="flex-1 h-2 rounded-full overflow-hidden bg-surface-200/50"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        i < generationProgress.completed
                          ? 'bg-success w-full'
                          : i < generationProgress.completed + (generationProgress.step === 'quick_prompt' ? 1 : 2)
                            ? 'bg-brand-500 w-full animate-pulse'
                            : 'w-0'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <StatusBanner
              type={error.type}
              message={error.message}
              actionLabel={error.action?.label}
              onAction={error.action?.onClick}
            />
          )}

          {/* Generating placeholder — when loading but no prompt selected yet */}
          {loading && (selectedIndex === null || !prompts[selectedIndex]) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-surface-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <p className="text-sm">Generating prompts, please wait...</p>
            </div>
          )}

          {/* Selected Prompt Details */}
          {selectedIndex !== null && prompts[selectedIndex] && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-surface-900">Prompt #{selectedIndex + 1}</h3>
                  {prompts[selectedIndex].quality_score !== undefined && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20">
                      <span className="text-xl font-bold text-brand-500">{prompts[selectedIndex].quality_score}</span>
                      <span className="text-xs text-brand-400">/100</span>
                      {prompts[selectedIndex]._enriched && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/20 text-success ml-1">
                          Enhanced
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-200/50 transition-colors"
                    title={showRawJson ? 'Visual preview' : 'Raw JSON'}
                  >
                    {showRawJson ? <Eye className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Copy prompt"
                    icon={copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    onClick={copyPrompt}
                  />
                  <Button
                    variant="ghost-warning"
                    size="xs"
                    aria-label="Add to favorites"
                    icon={<Star className="w-4 h-4" />}
                    onClick={() => {
                      const prompt = prompts[selectedIndex]
                      if (prompt) addToFavorites(prompt, generateFavoriteName(prompt, selectedIndex))
                    }}
                  />
                  <Button
                    variant={promptSaved ? 'primary' : 'lime'}
                    size="sm"
                    icon={
                      promptSaving ? undefined : promptSaved ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )
                    }
                    loading={promptSaving}
                    disabled={promptSaving || promptSaved}
                    onClick={() => saveEdit(editingPromptText)}
                  >
                    {promptSaved ? 'Saved!' : 'Save'}
                  </Button>
                </div>
              </div>
              {showRawJson ? (
                <textarea
                  value={
                    editingPromptText ?? (selectedIndex != null ? JSON.stringify(prompts[selectedIndex], null, 2) : '')
                  }
                  onChange={(e) => setEditingPromptText(e.target.value)}
                  className="flex-1 min-h-0 w-full bg-surface-50/50 border border-surface-200 rounded-lg p-4 text-xs text-surface-500 font-mono resize-none focus:outline-none focus:border-brand-500 transition-colors whitespace-pre-wrap"
                  spellCheck={false}
                />
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto bg-surface-50/50 border border-surface-200 rounded-lg p-4">
                  <PromptPreview
                    prompt={visualDraftPrompt || prompts[selectedIndex]}
                    editable
                    onFieldChange={handleVisualFieldChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={confirmClearImages}
        onClose={() => setConfirmClearImages(false)}
        onConfirm={clearAnalyzeEntries}
        title="Clear all images?"
        description={`This will remove ${analyzeEntries.length} image${analyzeEntries.length === 1 ? '' : 's'} and cannot be undone.`}
        confirmLabel="Clear All"
      />
      <ConfirmationDialog
        open={confirmClearPrompts}
        onClose={() => setConfirmClearPrompts(false)}
        onConfirm={() => usePromptStore.setState({ prompts: [], selectedIndex: 0 })}
        title="Clear all prompts?"
        description={`This will remove ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} and cannot be undone.`}
        confirmLabel="Clear All"
      />
    </div>
  )
}
