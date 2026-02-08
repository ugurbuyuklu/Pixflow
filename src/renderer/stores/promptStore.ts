import { create } from 'zustand'
import { PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../constants/limits'
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

export interface ConceptEntry {
  id: string
  value: string
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
  generationProgress: GenerationProgress | null

  promptMode: 'concept' | 'image'
  analyzeEntries: AnalyzeEntry[]
  analyzeError: ErrorInfo | null

  referenceImage: File | null
  referencePreview: string | null

  updateConcept: (index: number, value: string) => void
  addConcept: () => void
  duplicateConcept: (index: number) => void
  removeConcept: (index: number) => void
  setConcepts: (concepts: string[] | ConceptEntry[]) => void
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
  updateAnalyzeEntryPrompt: (index: number, prompt: GeneratedPrompt) => void

  setPrompts: (prompts: GeneratedPrompt[], selectedIndex?: number) => void
  reset: () => void
}

let abortController: AbortController | null = null

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
  generationProgress: null,

  promptMode: 'concept',
  analyzeEntries: [],
  analyzeError: null,

  referenceImage: null,
  referencePreview: null,

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
      return { concepts: [...state.concepts, { id: generateId(), value: source?.value ?? '' }] }
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

  setReferenceImage: (file) => {
    const prev = get().referencePreview
    if (prev) URL.revokeObjectURL(prev)
    set({
      referenceImage: file,
      referencePreview: file ? URL.createObjectURL(file) : null,
    })
  },

  generate: async () => {
    const { concepts, count, referenceImage } = get()
    const activeConcepts = concepts.filter((c) => c.value.trim()).map((c) => c.value)

    if (activeConcepts.length === 0 && referenceImage) {
      get().addAnalyzeFiles([referenceImage])
      get().setReferenceImage(null)
      set({ promptMode: 'image' })
      get().analyzeAllEntries()
      return
    }
    if (activeConcepts.length === 0) {
      set({ error: { message: 'Please enter at least one concept.', type: 'warning' } })
      return
    }

    abortController?.abort()
    abortController = new AbortController()
    const startedAt = Date.now()
    const totalPrompts = activeConcepts.length * count

    set({
      loading: true,
      error: null,
      prompts: [],
      selectedIndex: null,
      research: null,
      varietyScore: null,
      generationProgress: { step: 'research', completed: 0, total: totalPrompts, startedAt },
    })

    const allPrompts: GeneratedPrompt[] = []
    let lastResearch: ResearchData | null = null
    let lastVarietyScore: VarietyScore | null = null
    let lastResponse: Response | undefined

    try {
      for (const concept of activeConcepts) {
        if (abortController.signal.aborted) return

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

        lastResponse = await authFetch(apiUrl('/api/prompts/generate'), fetchOptions)

        if (!lastResponse.ok) {
          const raw = await lastResponse.json().catch(() => ({}))
          throw new Error(getApiError(raw, `HTTP ${lastResponse.status}`))
        }

        const reader = lastResponse.body?.getReader()
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
              let payload: Record<string, unknown>
              try {
                payload = JSON.parse(line.slice(6))
              } catch {
                currentEvent = ''
                continue
              }
              if (currentEvent === 'research') {
                set({
                  research: payload,
                  generationProgress: { step: 'prompts', completed: allPrompts.length, total: totalPrompts, startedAt },
                })
              } else if (currentEvent === 'progress') {
                set({
                  generationProgress: {
                    step: 'prompts',
                    completed: allPrompts.length + payload.completed,
                    total: totalPrompts,
                    startedAt,
                  },
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
          allPrompts.push(...finalData.prompts)
          lastResearch = finalData.research
          lastVarietyScore = finalData.varietyScore
          set({ prompts: [...allPrompts] })
        }
      }

      set({
        prompts: allPrompts,
        research: lastResearch,
        varietyScore: lastVarietyScore,
        selectedIndex: allPrompts.length > 0 ? 0 : null,
        editingPromptText: allPrompts.length > 0 ? JSON.stringify(allPrompts[0], null, 2) : '',
        generationProgress: { step: 'done', completed: totalPrompts, total: totalPrompts, startedAt },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const errorInfo = parseError(err, lastResponse)
      if (lastResponse?.status === 429) {
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
    const prev = get().referencePreview
    if (prev) URL.revokeObjectURL(prev)
    set({
      concepts: [{ id: generateId(), value: '' }],
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
