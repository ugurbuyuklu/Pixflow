import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { GeneratedPrompt, ResearchData, VarietyScore, ErrorInfo } from '../types'
import { parseError } from '../types'
import { PROMPT_GENERATE_DEFAULT, PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../constants/limits'

interface PromptState {
  concept: string
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

  promptMode: 'concept' | 'image'
  analyzeImage: File | null
  analyzePreview: string | null
  analyzeLoading: boolean
  analyzedPrompt: GeneratedPrompt | null
  analyzeError: ErrorInfo | null
  analyzeCopied: boolean

  setConcept: (concept: string) => void
  setCount: (count: number) => void
  setPromptMode: (mode: 'concept' | 'image') => void
  setSelectedIndex: (index: number | null) => void
  setEditingPromptText: (text: string) => void

  generate: () => Promise<void>
  cancelGenerate: () => void
  copyPrompt: () => Promise<void>
  saveEdit: (text: string) => Promise<void>

  setAnalyzeImage: (file: File | null, preview: string | null) => void
  analyzeCurrentImage: () => Promise<void>
  copyAnalyzed: () => Promise<void>

  setPrompts: (prompts: GeneratedPrompt[], selectedIndex?: number) => void
  reset: () => void
}

let abortController: AbortController | null = null

export const usePromptStore = create<PromptState>()((set, get) => ({
  concept: '',
  count: PROMPT_GENERATE_DEFAULT,
  loading: false,
  prompts: [],
  selectedIndex: null,
  editingPromptText: '',
  promptSaving: false,
  error: null,
  copied: false,
  research: null,
  varietyScore: null,

  promptMode: 'concept',
  analyzeImage: null,
  analyzePreview: null,
  analyzeLoading: false,
  analyzedPrompt: null,
  analyzeError: null,
  analyzeCopied: false,

  setConcept: (concept) => set({ concept }),
  setCount: (count) => set({
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
    const { concept, count } = get()
    if (!concept.trim()) {
      set({ error: { message: 'Please enter a concept first.', type: 'warning' } })
      return
    }

    abortController?.abort()
    abortController = new AbortController()

    set({
      loading: true,
      error: null,
      prompts: [],
      selectedIndex: null,
      research: null,
      varietyScore: null,
    })

    let response: Response | undefined
    try {
      response = await authFetch(apiUrl('/api/prompts/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, count }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const raw = await response.json().catch(() => ({}))
        throw new Error(getApiError(raw, `HTTP ${response.status}`))
      }

      const raw = await response.json()
      const data = unwrapApiData<{
        prompts: GeneratedPrompt[]
        research: ResearchData | null
        varietyScore: VarietyScore | null
      }>(raw)
      set({
        prompts: data.prompts,
        research: data.research,
        varietyScore: data.varietyScore,
        selectedIndex: data.prompts.length > 0 ? 0 : null,
        editingPromptText: data.prompts.length > 0 ? JSON.stringify(data.prompts[0], null, 2) : '',
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const errorInfo = parseError(err, response)
      if (response?.status === 429) {
        errorInfo.action = { label: 'Retry', onClick: () => get().generate() }
      }
      set({ error: errorInfo })
    } finally {
      set({ loading: false })
      abortController = null
    }
  },

  cancelGenerate: () => {
    abortController?.abort()
    abortController = null
    set({ loading: false })
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

  setAnalyzeImage: (file, preview) => {
    const old = get().analyzePreview
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
    set({
      analyzeImage: file,
      analyzePreview: preview,
      analyzedPrompt: null,
      analyzeError: null,
    })
  },

  analyzeCurrentImage: async () => {
    const { analyzeImage } = get()
    if (!analyzeImage) return

    set({ analyzeLoading: true, analyzeError: null, analyzedPrompt: null })

    try {
      const formData = new FormData()
      formData.append('image', analyzeImage)

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
      set({ analyzedPrompt: data.prompt })
    } catch (err) {
      set({ analyzeError: parseError(err) })
    } finally {
      set({ analyzeLoading: false })
    }
  },

  copyAnalyzed: async () => {
    const { analyzedPrompt } = get()
    if (!analyzedPrompt) return
    await navigator.clipboard.writeText(JSON.stringify(analyzedPrompt, null, 2))
    set({ analyzeCopied: true })
    setTimeout(() => set({ analyzeCopied: false }), 2000)
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
    const old = get().analyzePreview
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
    set({
      concept: '',
      prompts: [],
      selectedIndex: null,
      editingPromptText: '',
      error: null,
      research: null,
      varietyScore: null,
      analyzeImage: null,
      analyzePreview: null,
      analyzedPrompt: null,
      analyzeError: null,
    })
  },
}))
