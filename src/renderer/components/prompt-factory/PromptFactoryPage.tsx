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
  ScanSearch,
  Sparkles,
  Star,
  Tags,
  Timer,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../../constants/limits'
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
  const concept = usePromptStore.getState().concept
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
    concept,
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
    promptMode,
    analyzeEntries,
    setConcept,
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
    analyzeEntry,
    analyzeAllEntries,
    copyAnalyzedEntry,
    setPrompts,
    generationProgress,
    referenceImage,
    referencePreview,
    setReferenceImage,
  } = promptStore

  const [elapsed, setElapsed] = useState(0)
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)
  const refImageInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!generationProgress || generationProgress.step === 'done') return
    const tick = () => setElapsed(Math.floor((Date.now() - generationProgress.startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [generationProgress])

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
            <p className="text-surface-300 text-sm">Upload one or more images to extract prompts via Gemini 3 Flash</p>
          </div>
        ) : (
          <>
            {/* Header + actions */}
            <div className="flex items-center justify-between">
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

            {/* Per-image cards */}
            <div className="space-y-3">
              {analyzeEntries.map((entry, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries reorder via remove only
                  key={i}
                  className="bg-surface-50 rounded-xl p-3 flex gap-3"
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

                    {entry.prompt && !entry.error && (
                      <p className="text-xs text-surface-500 truncate">{entry.prompt.style || 'Analyzed'}</p>
                    )}

                    {entry.loading && <p className="text-xs text-brand-400">Analyzing with Gemini 3 Flash...</p>}

                    {expandedEntry === i && entry.prompt && (
                      <pre className="overflow-y-auto max-h-60 text-xs text-surface-500 bg-surface-100 rounded-lg p-3 whitespace-pre-wrap break-words">
                        {JSON.stringify(entry.prompt, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Analyze All + Send actions */}
            <div className="bg-surface-50 rounded-xl p-4 space-y-3">
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
                      setPrompts(analyzed)
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
                      setPrompts(analyzed)
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
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="primary" size="md" onClick={() => setPromptMode('concept')}>
          Create Prompts
        </Button>
        <Button variant="ghost-muted" size="md" onClick={() => setPromptMode('image')}>
          Image to Prompt
        </Button>
      </div>

      {/* Input Area */}
      <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
        <input
          ref={refImageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setReferenceImage(file)
            e.target.value = ''
          }}
        />
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Input
              label="Concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && concept.trim() && generate()}
              placeholder="e.g., Christmas, Halloween, Summer Beach..."
            />
          </div>
          {referencePreview ? (
            <div className="relative group">
              <img
                src={referencePreview}
                alt="Reference"
                className="w-10 h-10 rounded-lg object-cover border border-surface-200"
              />
              <button
                type="button"
                onClick={() => setReferenceImage(null)}
                className="absolute -top-1.5 -right-1.5 bg-danger rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refImageInput.current?.click()}
              title="Add reference image for style guidance"
              className="w-10 h-10 border-2 border-dashed border-surface-200 rounded-lg flex items-center justify-center text-surface-400 hover:border-brand-500 hover:text-brand-400 transition-colors shrink-0"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
          )}
          <div className="w-48">
            <Slider
              label="Prompts"
              displayValue={count}
              min={PROMPT_GENERATE_MIN}
              max={PROMPT_GENERATE_MAX}
              value={count}
              onChange={(e) => setCount(Number(e.currentTarget.value))}
            />
          </div>
          <div>
            {loading ? (
              <Button variant="danger" size="lg" icon={<X className="w-5 h-5" />} onClick={cancelGenerate}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon={<Sparkles className="w-5 h-5" />}
                onClick={generate}
                disabled={!concept.trim() && !referenceImage}
              >
                Generate
              </Button>
            )}
          </div>
        </div>

        {loading && generationProgress && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-300 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {generationProgress.step === 'research'
                  ? 'Researching trends & competitors...'
                  : `Generating prompts (${generationProgress.completed}/${generationProgress.total})...`}
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
                        : i < generationProgress.completed + (generationProgress.step === 'research' ? 0 : 2)
                          ? 'bg-brand-500 w-full animate-pulse'
                          : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

      {/* Research Insights */}
      {research && (
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-warning" />
                <h3 className="text-sm font-semibold text-surface-900">Key Insights</h3>
              </div>
              <ul className="space-y-1.5">
                {research.insights?.map((insight, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    key={i}
                    className="text-xs text-surface-500 flex items-start gap-2"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tags className="w-5 h-5 text-brand-400" />
                <h3 className="text-sm font-semibold text-surface-900">Sub-themes</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {research.subThemes?.map((theme, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    key={i}
                    className="px-2.5 py-1 bg-brand-600/20 text-brand-300 rounded-full text-xs"
                  >
                    {theme}
                  </span>
                ))}
              </div>
              {varietyScore && (
                <div className="mt-4 p-3 bg-surface-50/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-surface-400">Variety Score</span>
                    <span className={`text-xs font-medium ${varietyScore.passed ? 'text-success' : 'text-danger'}`}>
                      {varietyScore.passed ? 'Passed' : 'Low Variety'}
                    </span>
                  </div>
                  <div className="text-xs text-surface-400 space-y-0.5">
                    <div>{varietyScore.aesthetics_used.length} aesthetics</div>
                    <div>{varietyScore.emotions_used.length} emotions</div>
                    <div>{varietyScore.lighting_setups_used.length} lighting setups</div>
                    {varietyScore.has_duplicates && <div className="text-danger">Duplicate combinations detected</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompts Grid */}
      {prompts.length > 0 && (
        <div className="grid grid-cols-3 gap-6 h-[calc(100vh-420px)] min-h-[320px]">
          {/* Prompt List */}
          <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-900">Prompts ({prompts.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
              {prompts.map((prompt, i) => (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  key={i}
                  className={`w-full text-left p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                    selectedIndex === i
                      ? 'bg-brand-600/30 border border-brand-500/50'
                      : 'bg-surface-200/30 hover:bg-surface-200/50'
                  }`}
                  onClick={() => setSelectedIndex(i)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-surface-900 truncate">
                      #{i + 1} — {prompt.style?.split(' ').slice(0, 5).join(' ') || 'Untitled'}
                    </div>
                    <div className="text-xs text-surface-400 mt-0.5">{extractMood(prompt)}</div>
                  </div>
                  <Button
                    variant="ghost-warning"
                    size="xs"
                    aria-label="Add to favorites"
                    icon={<Star className="w-4 h-4" />}
                    onClick={(e) => {
                      e.stopPropagation()
                      addToFavorites(prompt, generateFavoriteName(prompt, i))
                    }}
                    className="flex-shrink-0"
                  />
                </button>
              ))}
            </div>
            <Button
              variant="success"
              size="md"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={handleSendToMonster}
              className="w-full"
            >
              Send to Monster
            </Button>
          </div>

          {/* Preview + Edit */}
          <div className="col-span-2 bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-900">Prompt #{(selectedIndex ?? 0) + 1}</h3>
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
                    const prompt = prompts[selectedIndex ?? 0]
                    if (prompt) addToFavorites(prompt, generateFavoriteName(prompt, selectedIndex ?? 0))
                  }}
                />
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
        </div>
      )}
    </div>
  )
}
