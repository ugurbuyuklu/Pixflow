import { create } from 'zustand'
import { PROMPT_GENERATE_DEFAULT, PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../constants/limits'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo, GeneratedPrompt, ResearchData, VarietyScore } from '../types'
import { parseError } from '../types'

interface GenerationProgress {
  step: 'research' | 'prompts' | 'done'
  completed: number
  total: number
  startedAt: number
}

export interface AnalyzeEntry {
  file: File
  preview: string
  loading: boolean
  prompt: GeneratedPrompt | null
  error: ErrorInfo | null
  copied: boolean
}

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
  generationProgress: GenerationProgress | null

  promptMode: 'concept' | 'image'
  analyzeEntries: AnalyzeEntry[]
  analyzeError: ErrorInfo | null

  referenceImage: File | null
  referencePreview: string | null

  setConcept: (concept: string) => void
  setCount: (count: number) => void
  setPromptMode: (mode: 'concept' | 'image') => void
  setSelectedIndex: (index: number | null) => void
  setEditingPromptText: (text: string) => void
  setReferenceImage: (file: File | null) => void

  generate: () => Promise<void>
  cancelGenerate: () => void
  copyPrompt: () => Promise<void>
  saveEdit: (text: string) => Promise<void>

  addAnalyzeFiles: (files: File[]) => void
  removeAnalyzeEntry: (index: number) => void
  clearAnalyzeEntries: () => void
  analyzeEntry: (index: number) => Promise<void>
  analyzeAllEntries: () => Promise<void>
  copyAnalyzedEntry: (index: number) => Promise<void>

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
  generationProgress: null,

  promptMode: 'concept',
  analyzeEntries: [],
  analyzeError: null,

  referenceImage: null,
  referencePreview: null,

  setConcept: (concept) => set({ concept }),
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

  setReferenceImage: (file) => {
    const prev = get().referencePreview
    if (prev) URL.revokeObjectURL(prev)
    set({
      referenceImage: file,
      referencePreview: file ? URL.createObjectURL(file) : null,
    })
  },

  generate: async () => {
    const { concept, count, referenceImage } = get()
    if (!concept.trim() && referenceImage) {
      get().addAnalyzeFiles([referenceImage])
      get().setReferenceImage(null)
      set({ promptMode: 'image' })
      get().analyzeAllEntries()
      return
    }
    if (!concept.trim()) {
      set({ error: { message: 'Please enter a concept first.', type: 'warning' } })
      return
    }

    abortController?.abort()
    abortController = new AbortController()
    const startedAt = Date.now()

    set({
      loading: true,
      error: null,
      prompts: [],
      selectedIndex: null,
      research: null,
      varietyScore: null,
      generationProgress: { step: 'research', completed: 0, total: count, startedAt },
    })

    let response: Response | undefined
    try {
      const fetchOptions: RequestInit = {
        method: 'POST',
        signal: abortController.signal,
      }

      if (referenceImage) {
        const formData = new FormData()
        formData.append('concept', concept)
        formData.append('count', String(count))
        formData.append('stream', 'true')
        formData.append('referenceImage', referenceImage)
        fetchOptions.body = formData
      } else {
        fetchOptions.headers = { 'Content-Type': 'application/json' }
        fetchOptions.body = JSON.stringify({ concept, count, stream: true })
      }

      response = await authFetch(apiUrl('/api/prompts/generate'), fetchOptions)

      if (!response.ok) {
        const raw = await response.json().catch(() => ({}))
        throw new Error(getApiError(raw, `HTTP ${response.status}`))
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let finalData: {
        prompts: GeneratedPrompt[]
        research: ResearchData | null
        varietyScore: VarietyScore | null
      } | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ') && currentEvent) {
            const payload = JSON.parse(line.slice(6))
            if (currentEvent === 'research') {
              set({ research: payload, generationProgress: { step: 'prompts', completed: 0, total: count, startedAt } })
            } else if (currentEvent === 'progress') {
              set({
                generationProgress: { step: 'prompts', completed: payload.completed, total: payload.total, startedAt },
              })
            } else if (currentEvent === 'done') {
              finalData = payload
            } else if (currentEvent === 'error') {
              throw new Error(payload.message)
            }
            currentEvent = ''
          }
        }
      }

      if (finalData) {
        set({
          prompts: finalData.prompts,
          research: finalData.research,
          varietyScore: finalData.varietyScore,
          selectedIndex: finalData.prompts.length > 0 ? 0 : null,
          editingPromptText: finalData.prompts.length > 0 ? JSON.stringify(finalData.prompts[0], null, 2) : '',
          generationProgress: { step: 'done', completed: count, total: count, startedAt },
        })
      }
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

  analyzeEntry: async (index) => {
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
    await Promise.all(pending.map(({ index }) => get().analyzeEntry(index)))
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
    const prev = get().referencePreview
    if (prev) URL.revokeObjectURL(prev)
    set({
      concept: '',
      prompts: [],
      selectedIndex: null,
      editingPromptText: '',
      error: null,
      research: null,
      varietyScore: null,
      analyzeEntries: [],
      analyzeError: null,
      referenceImage: null,
      referencePreview: null,
    })
  },
}))
