import { create } from 'zustand'
import { usePromptStore } from './promptStore'

export type TabId =
  | 'home'
  | 'prompts'
  | 'generate'
  | 'lifetime'
  | 'img2video'
  | 'avatars'
  | 'captions'
  | 'machine'
  | 'history'

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
  sidebarCollapsed: boolean
  sidebarManuallyToggled: boolean
  hasSelectedCategory: boolean
  pendingNavigationPerf: PendingNavigationPerf | null
  navigate: (tab: TabId, options?: NavigationOptions) => void
  toggleSidebarCollapsed: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  consumePendingNavigationPerf: () => PendingNavigationPerf | null
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activeTab: 'home',
  sidebarCollapsed: true,
  sidebarManuallyToggled: false,
  hasSelectedCategory: false,
  pendingNavigationPerf: null,

  navigate: (tab, options) => {
    set((state) => {
      if (state.activeTab === tab) return state
      const shouldExpand = !state.hasSelectedCategory && tab !== 'home'
      return {
        activeTab: tab,
        hasSelectedCategory: state.hasSelectedCategory || tab !== 'home',
        sidebarCollapsed: shouldExpand ? false : state.sidebarCollapsed,
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

  toggleSidebarCollapsed: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
      sidebarManuallyToggled: true,
      hasSelectedCategory: state.hasSelectedCategory || !state.sidebarCollapsed,
    })),

  setSidebarCollapsed: (collapsed) =>
    set((state) => ({
      sidebarCollapsed: collapsed,
      hasSelectedCategory: state.hasSelectedCategory || !collapsed,
    })),

  consumePendingNavigationPerf: () => {
    const current = useNavigationStore.getState().pendingNavigationPerf
    if (current) set({ pendingNavigationPerf: null })
    return current
  },
}))
