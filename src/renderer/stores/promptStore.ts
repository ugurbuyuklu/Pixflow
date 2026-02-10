import { create } from 'zustand'
import { PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../constants/limits'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo, GeneratedPrompt, ResearchData, VarietyScore } from '../types'
import { parseError } from '../types'

interface GenerationProgress {
  step: 'quick_prompt' | 'research' | 'research_complete' | 'enriching' | 'done'
  completed: number
  total: number
  startedAt: number
  message?: string
}

export interface AnalyzeEntry {
  file: File
  preview: string
  loading: boolean
  prompt: GeneratedPrompt | null
  error: ErrorInfo | null
  copied: boolean
}

export interface ConceptEntry {
  id: string
  value: string
}

export interface QualityMetrics {
  overall_score: number
  variety_score: VarietyScore
  specificity_score: number
  completeness_score: number
  detail_scores: {
    outfit_detail: number
    lighting_detail: number
    pose_detail: number
    set_design_detail: number
  }
  individual_scores?: number[]
  issues: string[]
  strengths: string[]
}

interface PromptState {
  concepts: ConceptEntry[]
  count: number
  loading: boolean
  prompts: GeneratedPrompt[]
  selectedIndex: number | null
  editingPromptText: string
  promptSaving: boolean
  error: ErrorInfo | null
  copied: boolean
  research: ResearchData | null
  varietyScore: VarietyScore | null
  qualityMetrics: QualityMetrics | null
  generationProgress: GenerationProgress | null

  promptMode: 'concept' | 'image'
  analyzeEntries: AnalyzeEntry[]
  analyzeTheme: string
  analyzeError: ErrorInfo | null

  updateConcept: (index: number, value: string) => void
  addConcept: () => void
  duplicateConcept: (index: number) => void
  removeConcept: (index: number) => void
  setConcepts: (concepts: string[] | ConceptEntry[]) => void
  setCount: (count: number) => void
  setPromptMode: (mode: 'concept' | 'image') => void
  setSelectedIndex: (index: number | null) => void
  setEditingPromptText: (text: string) => void

  generate: () => Promise<void>
  cancelGenerate: () => void
  copyPrompt: () => Promise<void>
  saveEdit: (text: string) => Promise<void>

  addAnalyzeFiles: (files: File[]) => void
  removeAnalyzeEntry: (index: number) => void
  clearAnalyzeEntries: () => void
  setAnalyzeTheme: (theme: string) => void
  analyzeEntry: (index: number) => Promise<void>
  analyzeAllEntries: () => Promise<void>
  copyAnalyzedEntry: (index: number) => Promise<void>
  updateAnalyzeEntryPrompt: (index: number, prompt: GeneratedPrompt) => void

  setPrompts: (prompts: GeneratedPrompt[], selectedIndex?: number) => void
  reset: () => void
}

let abortController: AbortController | null = null
let eventSource: EventSource | null = null

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export const usePromptStore = create<PromptState>()((set, get) => ({
  concepts: [{ id: generateId(), value: '' }],
  count: 1,
  loading: false,
  prompts: [],
  selectedIndex: null,
  editingPromptText: '',
  promptSaving: false,
  error: null,
  copied: false,
  research: null,
  varietyScore: null,
  qualityMetrics: null,
  generationProgress: null,

  promptMode: 'concept',
  analyzeEntries: [],
  analyzeTheme: '',
  analyzeError: null,

  updateConcept: (index, value) =>
    set((state) => {
      if (index < 0 || index >= state.concepts.length) return state
      const updated = [...state.concepts]
      updated[index] = { ...updated[index], value }
      return { concepts: updated }
    }),
  addConcept: () => set((state) => ({ concepts: [...state.concepts, { id: generateId(), value: '' }] })),
  duplicateConcept: (index) =>
    set((state) => {
      const source = state.concepts[index]
      return {
        concepts: [...state.concepts, { id: generateId(), value: source?.value ?? '' }],
      }
    }),
  removeConcept: (index) =>
    set((state) => {
      if (state.concepts.length <= 1) return state
      return { concepts: state.concepts.filter((_, i) => i !== index) }
    }),
  setConcepts: (concepts) =>
    set({
      concepts:
        concepts.length > 0
          ? concepts.map((c) => (typeof c === 'string' ? { id: generateId(), value: c } : c))
          : [{ id: generateId(), value: '' }],
    }),
  setCount: (count) =>
    set({
      count: Math.max(PROMPT_GENERATE_MIN, Math.min(PROMPT_GENERATE_MAX, count)),
    }),
  setPromptMode: (promptMode) => set({ promptMode }),
  setSelectedIndex: (index) => {
    const { prompts } = get()
    if (index !== null && prompts[index]) {
      set({ selectedIndex: index, editingPromptText: JSON.stringify(prompts[index], null, 2) })
    } else {
      set({ selectedIndex: index })
    }
  },
  setEditingPromptText: (editingPromptText) => set({ editingPromptText }),

  generate: async () => {
    const { concepts, count } = get()
    const concept = concepts.find((c) => c.value.trim())?.value.trim()

    if (!concept) {
      set({ error: { message: 'Please enter a concept.', type: 'warning' } })
      return
    }

    // Cancel previous generation
    eventSource?.close()
    eventSource = null
    abortController?.abort()
    abortController = null

    const startedAt = Date.now()

    set({
      loading: true,
      error: null,
      prompts: Array(count).fill(null), // Pre-allocate array for progressive population
      selectedIndex: null,
      research: null,
      varietyScore: null,
      qualityMetrics: null,
      generationProgress: { step: 'quick_prompt', completed: 0, total: count, startedAt },
    })

    try {
      // Build URL with query params for GET (EventSource requires GET)
      const url = apiUrl(`/api/prompts/generate?concept=${encodeURIComponent(concept)}&count=${count}&stream=true`)

      eventSource = new EventSource(url)

      // Handle prompt events (progressive population)
      eventSource.addEventListener('prompt', (e: MessageEvent) => {
        const { prompt, index, quick, enriched } = JSON.parse(e.data)

        set((state) => {
          const prompts = [...state.prompts]
          prompts[index] = {
            ...prompt,
            _quick: quick, // Internal flag for UI
            _enriched: enriched,
          }

          const completed = prompts.filter((p) => p !== null).length

          return {
            prompts,
            selectedIndex: state.selectedIndex === null && completed > 0 ? 0 : state.selectedIndex,
            editingPromptText:
              state.selectedIndex === null && completed > 0
                ? JSON.stringify(prompts[0], null, 2)
                : state.editingPromptText,
            generationProgress: {
              step: enriched ? 'enriching' : state.generationProgress?.step || 'quick_prompt',
              completed,
              total: count,
              startedAt: state.generationProgress?.startedAt || Date.now(),
            },
          }
        })
      })

      // Handle research completion
      eventSource.addEventListener('research', (e: MessageEvent) => {
        const research = JSON.parse(e.data)
        set({
          research,
          generationProgress: {
            step: 'research_complete',
            completed: get().prompts.filter((p) => p !== null).length,
            total: count,
            startedAt: get().generationProgress?.startedAt || Date.now(),
          },
        })
      })

      // Handle status updates
      eventSource.addEventListener('status', (e: MessageEvent) => {
        const { step, message } = JSON.parse(e.data)
        set((state) => ({
          generationProgress: {
            ...state.generationProgress!,
            step,
            message,
          },
        }))
      })

      // Handle progress updates
      eventSource.addEventListener('progress', (e: MessageEvent) => {
        const { step, completed, total, message } = JSON.parse(e.data)
        set((state) => ({
          generationProgress: {
            step,
            completed,
            total,
            startedAt: state.generationProgress?.startedAt || Date.now(),
            message,
          },
        }))
      })

      // Handle completion
      eventSource.addEventListener('done', (e: MessageEvent) => {
        const { varietyScore, qualityMetrics, individualScores } = JSON.parse(e.data)

        // Assign individual scores to prompts
        const updatedPrompts = get().prompts.map((prompt, i) => {
          if (!prompt) return prompt
          return {
            ...prompt,
            quality_score: individualScores?.[i] ?? qualityMetrics?.overall_score ?? 0
          }
        })

        set({
          prompts: updatedPrompts,
          varietyScore,
          qualityMetrics,
          loading: false,
          generationProgress: {
            step: 'done',
            completed: count,
            total: count,
            startedAt: get().generationProgress?.startedAt || Date.now(),
          },
        })

        eventSource?.close()
        eventSource = null
      })

      // Handle errors
      eventSource.addEventListener('error', () => {
        console.error('[Prompt Store] SSE error or connection closed')

        const currentPrompts = get().prompts.filter((p) => p !== null)

        if (currentPrompts.length > 0) {
          // Partial success - keep what we have
          set({
            loading: false,
            error: {
              message: 'Connection lost. Keeping generated prompts.',
              type: 'warning',
            },
          })
        } else {
          // Total failure
          set({
            loading: false,
            error: {
              message: 'Generation failed. Please try again.',
              type: 'error',
            },
          })
        }

        eventSource?.close()
        eventSource = null
      })
    } catch (err) {
      const errorInfo = parseError(err)
      set({ error: errorInfo, loading: false })
      eventSource?.close()
      eventSource = null
    }
  },

  cancelGenerate: () => {
    eventSource?.close()
    eventSource = null
    abortController?.abort()
    abortController = null
    set({ loading: false, generationProgress: null })
  },

  copyPrompt: async () => {
    const { selectedIndex, prompts } = get()
    if (selectedIndex === null || !prompts[selectedIndex]) return
    await navigator.clipboard.writeText(JSON.stringify(prompts[selectedIndex], null, 2))
    set({ copied: true })
    setTimeout(() => set({ copied: false }), 2000)
  },

  saveEdit: async (text) => {
    const { selectedIndex, prompts } = get()
    if (selectedIndex === null) return

    set({ promptSaving: true })
    try {
      let parsed: GeneratedPrompt
      try {
        parsed = JSON.parse(text)
      } catch {
        const res = await authFetch(apiUrl('/api/prompts/text-to-json'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Failed to convert text to JSON'))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ prompt: GeneratedPrompt }>(raw)
        parsed = data.prompt
      }

      const updated = [...prompts]
      updated[selectedIndex] = parsed
      set({ prompts: updated, editingPromptText: JSON.stringify(parsed, null, 2) })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ promptSaving: false })
    }
  },

  addAnalyzeFiles: (files) => {
    const newEntries: AnalyzeEntry[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      loading: false,
      prompt: null,
      error: null,
      copied: false,
    }))
    set((state) => ({ analyzeEntries: [...state.analyzeEntries, ...newEntries], analyzeError: null }))
  },

  removeAnalyzeEntry: (index) => {
    set((state) => {
      const entry = state.analyzeEntries[index]
      if (entry?.preview.startsWith('blob:')) URL.revokeObjectURL(entry.preview)
      return { analyzeEntries: state.analyzeEntries.filter((_, i) => i !== index) }
    })
  },

  clearAnalyzeEntries: () => {
    for (const e of get().analyzeEntries) {
      if (e.preview.startsWith('blob:')) URL.revokeObjectURL(e.preview)
    }
    set({ analyzeEntries: [], analyzeError: null })
  },

  setAnalyzeTheme: (theme) => set({ analyzeTheme: theme }),

  analyzeEntry: async (index) => {
    const { analyzeTheme } = get()
    const entry = get().analyzeEntries[index]
    if (!entry || entry.loading) return

    set((state) => {
      const updated = [...state.analyzeEntries]
      updated[index] = { ...updated[index], loading: true, error: null, prompt: null }
      return { analyzeEntries: updated }
    })

    try {
      const formData = new FormData()
      formData.append('image', entry.file)
      if (analyzeTheme.trim()) {
        formData.append('theme', analyzeTheme.trim())
      }

      const res = await authFetch(apiUrl('/api/generate/analyze-image'), {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Image analysis failed'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ prompt: GeneratedPrompt }>(raw)
      set((state) => {
        const updated = [...state.analyzeEntries]
        updated[index] = { ...updated[index], loading: false, prompt: data.prompt }
        return { analyzeEntries: updated }
      })
    } catch (err) {
      set((state) => {
        const updated = [...state.analyzeEntries]
        updated[index] = { ...updated[index], loading: false, error: parseError(err) }
        return { analyzeEntries: updated }
      })
    }
  },

  analyzeAllEntries: async () => {
    const { analyzeEntries } = get()
    const pending = analyzeEntries
      .map((e, i) => ({ entry: e, index: i }))
      .filter(({ entry }) => !entry.prompt && !entry.loading)

    if (pending.length === 0) return

    // Mark all pending entries as loading first to prevent double-analysis
    set((state) => {
      const updated = [...state.analyzeEntries]
      for (const { index } of pending) {
        updated[index] = { ...updated[index], loading: true, error: null }
      }
      return { analyzeEntries: updated }
    })

    // Then analyze all in parallel
    await Promise.allSettled(
      pending.map(async ({ index }) => {
        const entry = get().analyzeEntries[index]
        if (!entry) return

        try {
          const formData = new FormData()
          formData.append('image', entry.file)

          const res = await authFetch(apiUrl('/api/generate/analyze-image'), {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const raw = await res.json().catch(() => ({}))
            throw new Error(getApiError(raw, 'Image analysis failed'))
          }

          const raw = await res.json()
          const data = unwrapApiData<{ prompt: GeneratedPrompt }>(raw)
          set((state) => {
            const updated = [...state.analyzeEntries]
            updated[index] = { ...updated[index], loading: false, prompt: data.prompt }
            return { analyzeEntries: updated }
          })
        } catch (err) {
          set((state) => {
            const updated = [...state.analyzeEntries]
            updated[index] = { ...updated[index], loading: false, error: parseError(err) }
            return { analyzeEntries: updated }
          })
        }
      }),
    )
  },

  copyAnalyzedEntry: async (index) => {
    const entry = get().analyzeEntries[index]
    if (!entry?.prompt) return
    await navigator.clipboard.writeText(JSON.stringify(entry.prompt, null, 2))
    set((state) => {
      const updated = [...state.analyzeEntries]
      updated[index] = { ...updated[index], copied: true }
      return { analyzeEntries: updated }
    })
    setTimeout(() => {
      set((state) => {
        const updated = [...state.analyzeEntries]
        if (updated[index]) updated[index] = { ...updated[index], copied: false }
        return { analyzeEntries: updated }
      })
    }, 2000)
  },

  updateAnalyzeEntryPrompt: (index, prompt) => {
    set((state) => {
      const updated = [...state.analyzeEntries]
      updated[index] = { ...updated[index], prompt }
      return { analyzeEntries: updated }
    })
  },

  setPrompts: (prompts, selectedIndex = 0) => {
    set({
      prompts,
      selectedIndex: prompts.length > 0 ? selectedIndex : null,
      editingPromptText: prompts[selectedIndex] ? JSON.stringify(prompts[selectedIndex], null, 2) : '',
      error: null,
    })
  },

  reset: () => {
    for (const e of get().analyzeEntries) {
      if (e.preview.startsWith('blob:')) URL.revokeObjectURL(e.preview)
    }
    set({
      concepts: [{ id: generateId(), value: '' }],
      count: 1,
      prompts: [],
      selectedIndex: null,
      editingPromptText: '',
      error: null,
      research: null,
      varietyScore: null,
      analyzeEntries: [],
      analyzeError: null,
    })
  },
}))
