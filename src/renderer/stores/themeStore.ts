import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'

interface ThemeState {
  mode: ThemeMode
  paletteOverride: string | null

  init: () => void
  toggleMode: () => void
  setMode: (mode: ThemeMode) => void
  setPaletteOverride: (slug: string | null) => void
}

function applyMode(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  mode: 'dark',
  paletteOverride: null,

  init: () => {
    const saved = localStorage.getItem('pixflow_theme') as ThemeMode | null
    const mode = saved === 'light' ? 'light' : 'dark'
    const paletteOverride = localStorage.getItem('pixflow_palette_override')
    applyMode(mode)
    set({ mode, paletteOverride })
  },

  toggleMode: () => {
    const next = get().mode === 'dark' ? 'light' : 'dark'
    localStorage.setItem('pixflow_theme', next)
    applyMode(next)
    set({ mode: next })
  },

  setMode: (mode) => {
    localStorage.setItem('pixflow_theme', mode)
    applyMode(mode)
    set({ mode })
  },

  setPaletteOverride: (slug) => {
    if (slug) {
      localStorage.setItem('pixflow_palette_override', slug)
    } else {
      localStorage.removeItem('pixflow_palette_override')
    }
    set({ paletteOverride: slug })
  },
}))
