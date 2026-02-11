import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Copy,
  ImagePlus,
  Layers,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Save,
  ScanSearch,
  Sparkles,
  Star,
  Tags,
  Timer,
  Trash2,
  Upload,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../../constants/limits'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { useGenerationStore } from '../../stores/generationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import type { GeneratedPrompt } from '../../types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Slider } from '../ui/Slider'

function extractMood(prompt: GeneratedPrompt): string {
  return prompt.lighting?.mood || prompt.effects?.atmosphere || 'N/A'
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
    error,
    copied,
    research,
    varietyScore,
    qualityMetrics,
    promptMode,
    analyzeEntries,
    analyzeTheme,
    updateConcept,
    addConcept,
    duplicateConcept,
    removeConcept,
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

  const handleSendToMonster = () => {
    generationStore.selectAllPrompts(prompts.length)
    generationStore.setImageSource('upload')
    navigate('generate')
  }

  const analyzeDropzone = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    onDrop: (accepted) => {
      if (accepted.length > 0) addAnalyzeFiles(accepted)
    },
  })

  const anyLoading = analyzeEntries.some((e) => e.loading)
  const analyzedCount = analyzeEntries.filter((e) => e.prompt).length
  const allAnalyzed = analyzeEntries.length > 0 && analyzedCount === analyzeEntries.length

  if (promptMode === 'image') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost-muted" size="md" onClick={() => setPromptMode('concept')}>
            Create Prompts
          </Button>
          <Button variant="primary" size="md" onClick={() => setPromptMode('image')}>
            Image to Prompt
          </Button>
        </div>

        {/* Context Input - FULLY OPTIONAL */}
        <div className="mb-4">
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
          <div
            {...analyzeDropzone.getRootProps()}
            className={`bg-surface-50 rounded-xl p-12 text-center border-2 border-dashed transition-colors cursor-pointer ${
              analyzeDropzone.isDragActive
                ? 'border-brand-400 bg-brand-600/5'
                : 'border-surface-100 hover:border-surface-200'
            }`}
          >
            <input {...analyzeDropzone.getInputProps()} />
            <ScanSearch className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-400 text-lg mb-2">Drop images here or click to upload</p>
            <p className="text-surface-300 text-sm">Upload one or more images to extract prompts via GPT-4o Vision</p>
          </div>
        ) : (
          <>
            {/* Header + actions */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                Images ({analyzeEntries.length}){analyzedCount > 0 && ` · ${analyzedCount} analyzed`}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Upload className="w-3.5 h-3.5" />}
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
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={clearAnalyzeEntries}
                >
                  Clear All
                </Button>
              </div>
            </div>

            {/* Drag & drop zone covering entire card area */}
            <div
              {...analyzeDropzone.getRootProps()}
              className={`rounded-xl p-4 border-2 border-dashed transition-colors ${
                analyzeDropzone.isDragActive
                  ? 'border-brand-400 bg-brand-600/5'
                  : 'border-surface-100 hover:border-surface-200 bg-surface-50'
              }`}
            >
              <input {...analyzeDropzone.getInputProps()} />
              <div className="space-y-3">
              {analyzeEntries.map((entry, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries reorder via remove only
                  key={i}
                  className="bg-surface-50 rounded-xl p-3 flex gap-3"
                  onClick={(e) => e.stopPropagation()}
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
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {entry.error && (
                      <div className="flex items-center gap-2 p-2 bg-danger-muted/30 border border-danger/30 rounded-lg text-danger text-xs">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
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
                          icon={editSaving ? undefined : editSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
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
            </div>

            {/* Analyze All + Send actions */}
            <div className="bg-surface-50 rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              {!allAnalyzed && (
                <Button
                  variant="primary"
                  size="lg"
                  icon={anyLoading ? undefined : <ScanSearch className="w-5 h-5" />}
                  loading={anyLoading}
                  onClick={analyzeAllEntries}
                  disabled={anyLoading}
                  className="w-full"
                >
                  {anyLoading
                    ? `Analyzing ${analyzeEntries.filter((e) => e.loading).length}...`
                    : `Analyze ${analyzeEntries.filter((e) => !e.prompt).length} Image${analyzeEntries.filter((e) => !e.prompt).length !== 1 ? 's' : ''}`}
                </Button>
              )}
              {analyzedCount > 0 && (
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    size="md"
                    icon={<Layers className="w-4 h-4" />}
                    onClick={() => {
                      const analyzed = analyzeEntries.filter((e) => e.prompt).map((e) => e.prompt!)
                      setPrompts(analyzed, analyzed.length - 1)
                      setPromptMode('concept')
                    }}
                    className="flex-1"
                  >
                    Use in Factory ({analyzedCount})
                  </Button>
                  <Button
                    variant="success"
                    size="md"
                    icon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => {
                      const analyzed = analyzeEntries.filter((e) => e.prompt).map((e) => e.prompt!)
                      setPrompts(analyzed, analyzed.length - 1)
                      generationStore.selectAllPrompts(analyzed.length)
                      generationStore.setImageSource('upload')
                      navigate('generate')
                    }}
                    className="flex-1"
                  >
                    Asset Monster ({analyzedCount})
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[35%_65%] gap-6 h-[calc(100vh-12rem)]">
      {/* LEFT PANEL - Inputs & Controls */}
      <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col gap-4 overflow-hidden">
        {/* Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPromptMode('concept')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              promptMode === 'concept'
                ? 'bg-brand-600 text-white'
                : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
            }`}
          >
            Create Prompts
          </button>
          <button
            onClick={() => setPromptMode('image')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              promptMode === 'image'
                ? 'bg-brand-600 text-white'
                : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
            }`}
          >
            Image to Prompt
          </button>
        </div>

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
            <Button variant="secondary" size="lg" icon={<X className="w-5 h-5" />} onClick={cancelGenerate} className="w-full">
              Cancel
            </Button>
          ) : (
            <Button
              variant="primary"
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

        {/* Progress Indicator */}
        {loading && generationProgress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-300 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {generationProgress.step === 'quick_prompt' && 'Generating preview...'}
                {generationProgress.step === 'research' && `Researching "${activeConcepts[0]?.value || 'concept'}"...`}
                {generationProgress.step === 'research_complete' && 'Research complete, generating prompts...'}
                {generationProgress.step === 'enriching' &&
                  `Enriching prompt ${generationProgress.completed}/${generationProgress.total}...`}
                {generationProgress.step === 'done' && 'Complete!'}
                {generationProgress.message && ` — ${generationProgress.message}`}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-surface-400">
                <Timer className="w-3.5 h-3.5" />
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

        {/* Compact Research Insights */}
        {research && (
          <div className="space-y-3 text-xs border-t border-surface-200/50 pt-4">
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-surface-900">
                <Lightbulb className="w-4 h-4 text-warning" />
                Key Insights
              </h4>
              <ul className="space-y-1 text-surface-500">
                {research.insights?.slice(0, 3).map((insight, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-success mt-0.5">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
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
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Outputs */}
      <div className="flex flex-col gap-4 overflow-hidden">
        {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-danger-muted/30 border border-danger/30 rounded-xl text-danger">
          {error.message.includes('network') || error.message.includes('fetch') ? (
            <WifiOff className="w-5 h-5 flex-shrink-0" />
          ) : error.message.includes('timeout') || error.message.includes('Timeout') ? (
            <Clock className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm">{error.message}</span>
          {error.action && (
            <Button
              variant="ghost-danger"
              size="sm"
              onClick={error.action.onClick}
              className="ml-auto bg-danger/30 text-danger hover:bg-danger/50"
            >
              {error.action.label}
            </Button>
          )}
        </div>
      )}

      {/* 5x2 Numbered Grid */}
      {(prompts.length > 0 || loading) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-600">Prompts</h3>
            {prompts.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => {
                  usePromptStore.setState({ prompts: [], selectedIndex: 0 })
                }}
              >
                Clear All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-3">
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
                className={`
                  aspect-square rounded-lg p-3 flex flex-col items-center justify-center
                  text-lg font-semibold transition-all relative
                  ${
                    isSelected
                      ? 'bg-brand-600 text-white ring-2 ring-brand-500'
                      : prompt
                        ? 'bg-surface-100 text-surface-900 hover:bg-surface-200'
                        : isLoading
                          ? 'bg-surface-200/30 animate-pulse'
                          : 'bg-surface-50 text-surface-300'
                  }
                `}
              >
                <span className="text-2xl mb-1">{i + 1}</span>
                {prompt && prompt.quality_score !== undefined && (
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`text-xs font-bold ${
                        isSelected
                          ? 'text-white'
                          : prompt.quality_score >= 80
                            ? 'text-success'
                            : prompt.quality_score >= 60
                              ? 'text-warning'
                              : 'text-danger'
                      }`}
                    >
                      {prompt.quality_score}
                    </span>
                    <div className="flex gap-1">
                      {prompt._enriched && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-success'}`} title="Enhanced" />
                      )}
                    </div>
                  </div>
                )}
              </button>
            )
          })}
          </div>
        </div>
      )}

      {/* Selected Prompt Details */}
      {selectedIndex !== null && prompts[selectedIndex] && (
        <div className="flex-1 bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-surface-900">Prompt #{selectedIndex + 1}</h3>
              {prompts[selectedIndex].quality_score !== undefined && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20">
                  <span className="text-xl font-bold text-brand-500">
                    {prompts[selectedIndex].quality_score}
                  </span>
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
                variant="success"
                size="sm"
                icon={<ArrowRight className="w-4 h-4" />}
                onClick={handleSendToMonster}
              >
                Send to Monster
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={promptSaving ? undefined : <Check className="w-3.5 h-3.5" />}
                loading={promptSaving}
                onClick={() => saveEdit(editingPromptText)}
              >
                Save
              </Button>
            </div>
          </div>
          <textarea
            value={
              editingPromptText ?? (selectedIndex != null ? JSON.stringify(prompts[selectedIndex], null, 2) : '')
            }
            onChange={(e) => setEditingPromptText(e.target.value)}
            className="flex-1 min-h-0 w-full bg-surface-50/50 border border-surface-200 rounded-lg p-4 text-xs text-surface-500 font-mono resize-none focus:outline-none focus:border-brand-500 transition-colors whitespace-pre-wrap"
            spellCheck={false}
          />
        </div>
      )}
      </div>
    </div>
  )
}
