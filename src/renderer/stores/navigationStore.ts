import { create } from 'zustand'
import { usePromptStore } from './promptStore'

export type TabId = 'prompts' | 'generate' | 'img2video' | 'avatars' | 'machine' | 'history'

interface NavigationOptions {
  promptMode?: 'concept' | 'image'
  analyzeFiles?: File[]
}

interface NavigationState {
  activeTab: TabId
  navigate: (tab: TabId, options?: NavigationOptions) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activeTab: 'prompts',

  navigate: (tab, options) => {
    set({ activeTab: tab })

    if (options?.promptMode) {
      usePromptStore.getState().setPromptMode(options.promptMode)
    }

    if (options?.analyzeFiles?.length) {
      usePromptStore.getState().addAnalyzeFiles(options.analyzeFiles)
    }
  },
}))
