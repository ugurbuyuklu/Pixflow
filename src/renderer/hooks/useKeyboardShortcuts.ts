import { useEffect } from 'react'
import { useNavigationStore, type TabId } from '../stores/navigationStore'
import { useGenerationStore } from '../stores/generationStore'
import { useAvatarStore } from '../stores/avatarStore'

const TAB_ORDER: TabId[] = ['prompts', 'generate', 'avatars', 'machine', 'history']

export function useKeyboardShortcuts() {
  const navigate = useNavigationStore((s) => s.navigate)
  const setPreviewImage = useGenerationStore((s) => s.setPreviewImage)
  const setFullSizeAvatarUrl = useAvatarStore((s) => s.setFullSizeAvatarUrl)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

      if (e.metaKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        navigate(TAB_ORDER[Number(e.key) - 1])
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
