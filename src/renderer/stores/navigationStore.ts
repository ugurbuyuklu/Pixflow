import { create } from 'zustand'
import { usePromptStore } from './promptStore'

export type TabId = 'prompts' | 'generate' | 'img2video' | 'avatars' | 'machine' | 'history'

interface NavigationOptions {
  promptMode?: 'concept' | 'image'
  analyzeFiles?: File[]
}

interface PendingNavigationPerf {
  fromTab: TabId
  toTab: TabId
  startedAtMs: number
}

interface NavigationState {
  activeTab: TabId
  pendingNavigationPerf: PendingNavigationPerf | null
  navigate: (tab: TabId, options?: NavigationOptions) => void
  consumePendingNavigationPerf: () => PendingNavigationPerf | null
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activeTab: 'prompts',
  pendingNavigationPerf: null,

  navigate: (tab, options) => {
    set((state) => {
      if (state.activeTab === tab) return state
      return {
        activeTab: tab,
        pendingNavigationPerf: {
          fromTab: state.activeTab,
          toTab: tab,
          startedAtMs: globalThis.performance?.now?.() ?? Date.now(),
        },
      }
    })

    if (options?.promptMode) {
      usePromptStore.getState().setPromptMode(options.promptMode)
    }

    if (options?.analyzeFiles?.length) {
      usePromptStore.getState().addAnalyzeFiles(options.analyzeFiles)
    }
  },

  consumePendingNavigationPerf: () => {
    const current = useNavigationStore.getState().pendingNavigationPerf
    if (current) set({ pendingNavigationPerf: null })
    return current
  },
}))
