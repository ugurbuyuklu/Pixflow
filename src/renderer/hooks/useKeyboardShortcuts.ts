import { useEffect } from 'react'
import { useAvatarStore } from '../stores/avatarStore'
import { useGenerationStore } from '../stores/generationStore'
import { type TabId, useNavigationStore } from '../stores/navigationStore'

const TAB_ORDER: TabId[] = [
  'home',
  'prompts',
  'generate',
  'lifetime',
  'img2video',
  'avatars',
  'captions',
  'machine',
  'history',
]

export function useKeyboardShortcuts() {
  const navigate = useNavigationStore((s) => s.navigate)
  const setPreviewImage = useGenerationStore((s) => s.setPreviewImage)
  const setFullSizeAvatarUrl = useAvatarStore((s) => s.setFullSizeAvatarUrl)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return

      if (e.metaKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = Number(e.key) - 1
        if (TAB_ORDER[idx]) navigate(TAB_ORDER[idx])
        return
      }

      if (e.key === 'Escape') {
        setPreviewImage(null)
        setFullSizeAvatarUrl(null)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, setPreviewImage, setFullSizeAvatarUrl])
}
