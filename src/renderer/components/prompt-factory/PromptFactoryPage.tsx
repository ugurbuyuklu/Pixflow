import {
  Sparkles, Copy, Check, CheckCircle, Lightbulb, Tags, Upload,
  Loader2, AlertCircle, X, WifiOff, Clock, ScanSearch, ArrowRight,
  Star, Layers,
} from 'lucide-react'
import { assetUrl } from '../../lib/api'
import { usePromptStore } from '../../stores/promptStore'
import { useGenerationStore } from '../../stores/generationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useNavigationStore } from '../../stores/navigationStore'
import type { GeneratedPrompt } from '../../types'
import { PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../../constants/limits'

function extractMood(prompt: GeneratedPrompt): string {
  return prompt.lighting?.mood || prompt.effects?.atmosphere || 'N/A'
}

function generateFavoriteName(prompt: GeneratedPrompt, index: number): string {
  const concept = usePromptStore.getState().concept
  const styleWords = prompt.style?.split(' ').slice(0, 4).join(' ')
  if (concept) return `${concept} #${index + 1}`
  if (styleWords) return styleWords.length > 35 ? styleWords.slice(0, 35) + '...' : styleWords
  return `Prompt ${index + 1} (${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`
}

export default function PromptFactoryPage() {
  const promptStore = usePromptStore()
  const generationStore = useGenerationStore()
  const { addToFavorites } = useHistoryStore()
  const { navigate } = useNavigationStore()

  const {
    concept, count, loading, prompts, selectedIndex, editingPromptText,
    promptSaving, error, copied, research, varietyScore,
    promptMode, analyzePreview, analyzeLoading,
    analyzedPrompt, analyzeError, analyzeCopied,
    setConcept, setCount, setPromptMode, setSelectedIndex, setEditingPromptText,
    generate, cancelGenerate, copyPrompt, saveEdit, setAnalyzeImage,
    analyzeCurrentImage, copyAnalyzed, setPrompts,
  } = promptStore

  const handleSendToMonster = () => {
    generationStore.selectAllPrompts(prompts.length)
    generationStore.setImageSource('upload')
    navigate('generate')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzeImage(file, URL.createObjectURL(file))
  }

  if (promptMode === 'image') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setPromptMode('concept')}
            className="px-4 py-2 text-sm font-medium text-surface-400 hover:text-surface-900 transition-colors"
          >
            Concept to Prompts
          </button>
          <button
            onClick={() => setPromptMode('image')}
            className="px-4 py-2 text-sm font-medium text-surface-900 bg-gradient-to-r from-brand-600 to-brand-500 rounded-lg"
          >
            Image to Prompt
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left: Upload */}
          <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch className="w-5 h-5 text-brand-400" />
              <h3 className="text-lg font-semibold text-surface-900">Analyze Image</h3>
            </div>

            <div className="relative">
              {analyzePreview ? (
                <div className="relative">
                  <img
                    src={analyzePreview.startsWith('blob:') ? analyzePreview : assetUrl(analyzePreview)}
                    alt="Preview"
                    className="w-full aspect-[9/16] object-cover rounded-lg"
                  />
                  <button
                    onClick={() => setAnalyzeImage(null, null)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-surface-900 hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full aspect-[9/16] border-2 border-dashed border-surface-200 rounded-lg cursor-pointer hover:border-brand-500 transition-colors">
                  <Upload className="w-8 h-8 text-surface-400 mb-2" />
                  <span className="text-sm text-surface-400">Drop image or click to upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            <button
              onClick={analyzeCurrentImage}
              disabled={!analyzePreview || analyzeLoading}
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 text-surface-900 font-medium rounded-lg hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {analyzeLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <ScanSearch className="w-5 h-5" />
                  Analyze Image
                </>
              )}
            </button>

            {analyzeError && (
              <div className="flex items-center gap-2 p-3 bg-danger-muted/30 border border-danger/30 rounded-lg text-danger text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {analyzeError.message}
              </div>
            )}
          </div>

          {/* Right: Result */}
          <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-surface-900">Generated Prompt</h3>
              {analyzedPrompt && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyAnalyzed}
                    className="p-1.5 text-surface-400 hover:text-surface-900 transition-colors"
                  >
                    {analyzeCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            {analyzedPrompt ? (
              <>
                <pre className="flex-1 overflow-y-auto text-xs text-surface-500 bg-surface-50/50 rounded-lg p-4 whitespace-pre-wrap break-words mb-4">
                  {JSON.stringify(analyzedPrompt, null, 2)}
                </pre>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPrompts([analyzedPrompt])
                      setPromptMode('concept')
                    }}
                    className="flex-1 py-2.5 bg-surface-200 text-surface-900 font-medium rounded-lg hover:bg-surface-100 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <Layers className="w-4 h-4" />
                    Use in Factory
                  </button>
                  <button
                    onClick={() => {
                      setPrompts([analyzedPrompt])
                      navigate('generate')
                    }}
                    className="flex-1 py-2.5 bg-success text-white font-medium rounded-lg hover:bg-success-hover transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Asset Monster
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">
                Upload and analyze an image to generate a prompt
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setPromptMode('concept')}
          className="px-4 py-2 text-sm font-medium text-surface-900 bg-gradient-to-r from-brand-600 to-brand-500 rounded-lg"
        >
          Concept to Prompts
        </button>
        <button
          onClick={() => setPromptMode('image')}
          className="px-4 py-2 text-sm font-medium text-surface-400 hover:text-surface-900 transition-colors"
        >
          Image to Prompt
        </button>
      </div>

      {/* Input Area */}
      <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-surface-500 mb-2">Concept</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g., Christmas, Halloween, Summer Beach..."
              className="w-full px-4 py-3 bg-surface-50/50 border border-surface-200 rounded-lg text-surface-900 placeholder-surface-400 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium text-surface-500 mb-2">
              Prompts: {count}
            </label>
            <input
              type="range"
              min={PROMPT_GENERATE_MIN}
              max={PROMPT_GENERATE_MAX}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
          </div>
          <div>
            {loading ? (
              <button
                onClick={cancelGenerate}
                className="px-6 py-3 bg-danger text-white font-medium rounded-lg hover:bg-danger-hover transition-all flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            ) : (
              <button
                onClick={generate}
                disabled={!concept.trim()}
                className="px-6 py-3 bg-gradient-to-r from-brand-600 to-brand-500 text-surface-900 font-medium rounded-lg hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Generate
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-3 text-brand-300 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Researching &amp; generating prompts...
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
            <button
              onClick={error.action.onClick}
              className="ml-auto px-3 py-1 bg-danger/30 text-danger rounded hover:bg-danger/50 transition-colors text-sm"
            >
              {error.action.label}
            </button>
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
                  <li key={i} className="text-xs text-surface-500 flex items-start gap-2">
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
                  <span key={i} className="px-2.5 py-1 bg-brand-600/20 text-brand-300 rounded-full text-xs">
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
                    {varietyScore.has_duplicates && (
                      <div className="text-danger">Duplicate combinations detected</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompts Grid */}
      {prompts.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {/* Prompt List */}
          <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-900">Prompts ({prompts.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {prompts.map((prompt, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
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
                    <div className="text-xs text-surface-400 mt-0.5">
                      {extractMood(prompt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      addToFavorites(prompt, generateFavoriteName(prompt, i))
                    }}
                    className="p-1 text-surface-400 hover:text-warning transition-colors flex-shrink-0"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleSendToMonster}
              className="w-full py-3 bg-success text-white font-medium rounded-lg hover:bg-success-hover transition-all flex items-center justify-center gap-2 text-sm"
            >
              <ArrowRight className="w-4 h-4" />
              Send to Monster
            </button>
          </div>

          {/* Preview + Edit */}
          <div className="col-span-2 bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-900">
                Prompt #{(selectedIndex ?? 0) + 1}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyPrompt}
                  className="p-1.5 text-surface-400 hover:text-surface-900 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    const prompt = prompts[selectedIndex ?? 0]
                    if (prompt) addToFavorites(prompt, generateFavoriteName(prompt, selectedIndex ?? 0))
                  }}
                  className="p-1.5 text-surface-400 hover:text-warning transition-colors"
                >
                  <Star className="w-4 h-4" />
                </button>
                <button
                  onClick={() => saveEdit(editingPromptText)}
                  disabled={promptSaving}
                  className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-brand-500 text-surface-900 text-sm font-medium rounded-lg hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {promptSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>
            <textarea
              value={editingPromptText ?? (selectedIndex != null ? JSON.stringify(prompts[selectedIndex], null, 2) : '')}
              onChange={(e) => setEditingPromptText(e.target.value)}
              className="flex-1 w-full bg-surface-50/50 border border-surface-200 rounded-lg p-4 text-xs text-surface-500 font-mono resize-none focus:outline-none focus:border-brand-500 transition-colors whitespace-pre-wrap"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
