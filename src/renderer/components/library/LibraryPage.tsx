import { Copy, History, Loader2, Star, ThumbsUp, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { assetUrl } from '../../lib/api'
import { useHistoryStore } from '../../stores/historyStore'
import { useImageRatingsStore } from '../../stores/imageRatingsStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { usePromptStore } from '../../stores/promptStore'
import type { GeneratedImageRecord, GeneratedPrompt } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { VirtualizedGrid } from '../ui/VirtualizedGrid'
import { VirtualizedList } from '../ui/VirtualizedList'

export default function LibraryPage() {
  const {
    entries,
    favorites,
    loading,
    selectedPrompt,
    favoriteAdded,
    setSelectedPrompt,
    loadAll,
    addToFavorites,
    removeFromFavorites,
  } = useHistoryStore()
  const { likedImages, loadLikedImages, loading: loadingImages } = useImageRatingsStore()
  const { setPrompts, setConcepts } = usePromptStore()
  const { navigate } = useNavigationStore()
  const [selectedImage, setSelectedImage] = useState<GeneratedImageRecord | null>(null)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    loadLikedImages()
  }, [loadLikedImages])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
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
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">No favorites yet</div>
          ) : (
            <VirtualizedList
              items={favorites}
              itemHeight={64}
              className="flex-1"
              getKey={(fav) => fav.id}
              renderItem={(fav) => (
                <div className="pb-2">
                  <button
                    type="button"
                    className="group h-14 w-full text-left flex items-center justify-between p-3 bg-surface-200/30 rounded-lg hover:bg-surface-200/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedPrompt(fav.prompt)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Star className="w-4 h-4 text-warning flex-shrink-0" />
                      <span className="text-sm text-surface-500 truncate">{fav.name}</span>
                    </div>
                    <Button
                      variant="ghost-danger"
                      size="xs"
                      aria-label="Remove from favorites"
                      icon={<Trash2 className="w-4 h-4" />}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromFavorites(fav.id)
                      }}
                      className="opacity-0 group-hover:opacity-100"
                    />
                  </button>
                </div>
              )}
            />
          )}
        </div>

        {/* Liked Images */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <ThumbsUp className="w-5 h-5 text-success" />
            <h3 className="text-lg font-semibold text-surface-900">Liked Images</h3>
            <span className="text-sm text-surface-400">({likedImages.length})</span>
          </div>

          {loadingImages ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
            </div>
          ) : likedImages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-surface-400 text-sm">No liked images yet</p>
            </div>
          ) : (
            <VirtualizedGrid
              items={likedImages}
              columns={2}
              itemHeight={220}
              itemAspectRatio={9 / 16}
              gap={8}
              className="flex-1"
              getKey={(img) => img.id}
              renderItem={(img) => (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImage(img)
                    setSelectedPrompt(null)
                  }}
                  className={`h-full w-full rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    selectedImage?.id === img.id
                      ? 'border-success ring-2 ring-success/30'
                      : 'border-transparent hover:border-success/50'
                  }`}
                >
                  <img src={assetUrl(img.url)} alt={img.concept} className="w-full h-full object-cover" />
                </button>
              )}
            />
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
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">No history yet</div>
          ) : (
            <VirtualizedList
              items={entries}
              itemHeight={88}
              className="flex-1"
              getKey={(entry) => entry.id}
              renderItem={(entry) => (
                <div className="pb-2">
                  <button
                    type="button"
                    className="h-20 w-full text-left p-3 bg-surface-200/30 rounded-lg hover:bg-surface-200/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedPrompt(entry.prompts[0])}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-surface-900">{entry.concept}</span>
                      <span className="text-xs text-surface-400">{entry.prompts.length} prompts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-400">{new Date(entry.createdAt).toLocaleDateString()}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPrompts(entry.prompts as GeneratedPrompt[])
                          setConcepts([entry.concept])
                          navigate('prompts')
                        }}
                        className="px-2 text-brand-300 bg-brand-600/30 hover:bg-brand-600/50"
                      >
                        Load All
                      </Button>
                    </div>
                  </button>
                </div>
              )}
            />
          )}
        </div>

        {/* Preview */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-900">Preview</h3>
            {selectedImage && (
              <div className="flex items-center gap-2">
                <Badge variant="success">
                  <ThumbsUp className="w-3 h-3" />
                </Badge>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Star className="w-4 h-4" />}
                  onClick={() => addToFavorites(selectedImage.prompt, `From ${selectedImage.concept}`)}
                  title="Add prompt to favorites"
                >
                  Favorite Prompt
                </Button>
              </div>
            )}
            {selectedPrompt && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Copy prompt"
                  icon={<Copy className="w-4 h-4" />}
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedPrompt, null, 2))}
                />
                <Button
                  variant="ghost-warning"
                  size="xs"
                  aria-label="Add to favorites"
                  icon={<Star className="w-4 h-4" />}
                  onClick={() => {
                    const styleWords = selectedPrompt.style?.split(' ').slice(0, 4).join(' ') || 'Untitled'
                    addToFavorites(selectedPrompt, styleWords)
                  }}
                />
              </div>
            )}
          </div>
          {selectedImage ? (
            <div className="flex-1 overflow-y-auto space-y-4">
              <img
                src={assetUrl(selectedImage.url)}
                alt={selectedImage.concept}
                className="w-full rounded-lg border border-surface-200"
              />
              <div className="space-y-2">
                <div className="text-xs text-surface-400">
                  <p>
                    <strong>Concept:</strong> {selectedImage.concept}
                  </p>
                  <p>
                    <strong>Generated:</strong> {new Date(selectedImage.generatedAt).toLocaleString()}
                  </p>
                  {selectedImage.aspectRatio && (
                    <p>
                      <strong>Aspect Ratio:</strong> {selectedImage.aspectRatio}
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Source Prompt:</h4>
                  <pre className="text-xs bg-surface-50/50 rounded-lg p-3 overflow-auto max-h-64 border border-surface-200">
                    {JSON.stringify(selectedImage.prompt, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : selectedPrompt ? (
            <pre className="flex-1 overflow-y-auto text-xs text-surface-500 bg-surface-50/50 rounded-lg p-4 whitespace-pre-wrap break-words">
              {JSON.stringify(selectedPrompt, null, 2)}
            </pre>
          ) : (
            <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">
              Select an item to preview
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
