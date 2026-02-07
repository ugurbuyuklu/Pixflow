import { useEffect } from 'react'
import { Star, History, Copy, Trash2, Loader2 } from 'lucide-react'
import { useHistoryStore } from '../../stores/historyStore'
import { usePromptStore } from '../../stores/promptStore'
import { useNavigationStore } from '../../stores/navigationStore'
import type { GeneratedPrompt } from '../../types'

export default function LibraryPage() {
  const {
    entries, favorites, loading, selectedPrompt, favoriteAdded,
    setSelectedPrompt, loadAll, addToFavorites, removeFromFavorites,
  } = useHistoryStore()
  const { setPrompts, setConcept } = usePromptStore()
  const { navigate } = useNavigationStore()

  useEffect(() => { loadAll() }, [loadAll])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
        {/* Favorites */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-semibold text-surface-900">Favorites</h3>
            <span className="text-sm text-surface-400">({favorites.length})</span>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
            </div>
          ) : favorites.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">
              No favorites yet
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="group flex items-center justify-between p-3 bg-surface-200/30 rounded-lg hover:bg-surface-200/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedPrompt(fav.prompt)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Star className="w-4 h-4 text-warning flex-shrink-0" />
                    <span className="text-sm text-surface-500 truncate">{fav.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromFavorites(fav.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-surface-400 hover:text-danger transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-brand-400" />
            <h3 className="text-lg font-semibold text-surface-900">History</h3>
            <span className="text-sm text-surface-400">({entries.length})</span>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">
              No history yet
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-surface-200/30 rounded-lg hover:bg-surface-200/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedPrompt(entry.prompts[0])}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-surface-900">{entry.concept}</span>
                    <span className="text-xs text-surface-400">{entry.prompts.length} prompts</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-400">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPrompts(entry.prompts as GeneratedPrompt[])
                        setConcept(entry.concept)
                        navigate('prompts')
                      }}
                      className="text-xs px-2 py-1 bg-brand-600/30 text-brand-300 rounded hover:bg-brand-600/50 transition-colors"
                    >
                      Load All
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-900">Preview</h3>
            {selectedPrompt && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedPrompt, null, 2))}
                  className="p-1.5 text-surface-400 hover:text-surface-900 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const styleWords = selectedPrompt.style?.split(' ').slice(0, 4).join(' ') || 'Untitled'
                    addToFavorites(selectedPrompt, styleWords)
                  }}
                  className="p-1.5 text-surface-400 hover:text-warning transition-colors"
                >
                  <Star className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {selectedPrompt ? (
            <pre className="flex-1 overflow-y-auto text-xs text-surface-500 bg-surface-50/50 rounded-lg p-4 whitespace-pre-wrap break-words">
              {JSON.stringify(selectedPrompt, null, 2)}
            </pre>
          ) : (
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">
              Select a prompt to preview
            </div>
          )}
        </div>
      </div>

      {favoriteAdded && (
        <div className="fixed bottom-6 right-6 bg-success text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in">
          Added to favorites!
        </div>
      )}
    </div>
  )
}
