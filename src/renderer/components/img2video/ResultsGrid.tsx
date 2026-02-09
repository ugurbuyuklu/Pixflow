import { Download, Play } from 'lucide-react'
import React, { useState } from 'react'
import { assetUrl } from '../../lib/api'
import type { QueueItem } from '../../stores/img2videoQueueStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface ResultsGridProps {
  items: QueueItem[]
  onSelectItem: (id: string) => void
  onDownloadAll: () => void
}

export function ResultsGrid({ items, onSelectItem, onDownloadAll }: ResultsGridProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set())
  const [comparisonMode, setComparisonMode] = useState(false)

  const completedItems = items.filter((item) => item.status === 'completed' && item.result)
  const failedItems = items.filter((item) => item.status === 'failed')

  const toggleComparison = (id: string) => {
    const newSet = new Set(selectedForComparison)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      if (newSet.size >= 4) {
        // Max 4 for comparison
        return
      }
      newSet.add(id)
    }
    setSelectedForComparison(newSet)
  }

  if (completedItems.length === 0 && failedItems.length === 0) {
    return null
  }

  return (
    <div className="mt-6 pt-6 border-t border-surface-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-surface-900">Results</h3>
          <Badge variant="success">{completedItems.length} completed</Badge>
          {failedItems.length > 0 && <Badge variant="danger">{failedItems.length} failed</Badge>}
        </div>
        <div className="flex gap-2">
          {completedItems.length >= 2 && (
            <Button
              variant={comparisonMode ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                setComparisonMode(!comparisonMode)
                if (!comparisonMode) {
                  setSelectedForComparison(new Set())
                }
              }}
            >
              {comparisonMode ? 'Exit Compare Mode' : 'Compare Mode'}
            </Button>
          )}
          {completedItems.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onDownloadAll}>
              Download All
            </Button>
          )}
        </div>
      </div>

      {/* Comparison View */}
      {comparisonMode && selectedForComparison.size > 0 && (
        <div className="mb-4 p-4 bg-surface-100 rounded-lg">
          <p className="text-sm text-surface-600 mb-3">
            Selected {selectedForComparison.size}/4 videos for comparison
          </p>
          <div className={`grid gap-4 ${selectedForComparison.size === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {Array.from(selectedForComparison).map((itemId) => {
              const item = items.find((i) => i.id === itemId)
              if (!item?.result) return null

              return (
                <div key={item.id} className="space-y-2">
                  <video
                    controls
                    loop
                    className="w-full rounded-lg border border-surface-300"
                    src={assetUrl(item.result.videoUrl)}
                  />
                  <div className="text-xs text-surface-600 space-y-1">
                    <p className="font-medium truncate">{item.prompt || 'No prompt'}</p>
                    <div className="flex gap-2">
                      <Badge variant="secondary" size="sm">
                        {item.settings.duration}s
                      </Badge>
                      <Badge variant="secondary" size="sm">
                        {item.settings.aspectRatio}
                      </Badge>
                      {Object.values(item.presets).flat().length > 0 && (
                        <Badge variant="secondary" size="sm">
                          +{Object.values(item.presets).flat().length} presets
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Grid View */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {completedItems.map((item) => {
          const isSelected = selectedForComparison.has(item.id)

          return (
            <div
              key={item.id}
              className={`
                group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer
                ${
                  comparisonMode
                    ? isSelected
                      ? 'border-brand bg-brand/5'
                      : 'border-surface-200 hover:border-surface-300'
                    : 'border-surface-200 hover:border-brand/50'
                }
              `}
              onClick={() => {
                if (comparisonMode) {
                  toggleComparison(item.id)
                } else {
                  onSelectItem(item.id)
                }
              }}
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-surface-100 flex items-center justify-center relative">
                <video
                  src={assetUrl(item.result!.videoUrl)}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  onMouseEnter={(e) => {
                    e.currentTarget.play().catch(() => {})
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.pause()
                    e.currentTarget.currentTime = 0
                  }}
                />
                {!comparisonMode && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                )}
                {comparisonMode && isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-brand text-white rounded-full flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="p-2 bg-surface-100 space-y-1">
                <p className="text-xs text-surface-600 line-clamp-2 min-h-[2rem]">
                  {item.prompt || 'No prompt'}
                </p>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="secondary" size="sm">
                    {item.settings.duration}s
                  </Badge>
                  <Badge variant="secondary" size="sm">
                    {item.settings.aspectRatio}
                  </Badge>
                  {Object.values(item.presets).flat().length > 0 && (
                    <Badge variant="secondary" size="sm">
                      +{Object.values(item.presets).flat().length}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Failed Items */}
        {failedItems.map((item) => (
          <div
            key={item.id}
            className="relative rounded-lg overflow-hidden border-2 border-danger/30 bg-danger/5 cursor-pointer"
            onClick={() => onSelectItem(item.id)}
          >
            <div className="aspect-video bg-danger/10 flex items-center justify-center">
              <p className="text-danger text-sm font-medium">Failed</p>
            </div>
            <div className="p-2 bg-surface-100">
              <p className="text-xs text-danger line-clamp-2">{item.error}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
