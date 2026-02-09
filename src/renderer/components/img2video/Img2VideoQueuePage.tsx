import { ChevronDown, ChevronUp, Download, Loader2, Play, Plus, Settings, Trash2, Upload, X } from 'lucide-react'
import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import { ASPECT_RATIOS, DURATIONS, useImg2VideoQueueStore } from '../../stores/img2videoQueueStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { CameraPresetCards } from './CameraPresetCards'
import { ResultsGrid } from './ResultsGrid'

export default function Img2VideoQueuePage() {
  const {
    queueItems,
    queueOrder,
    selectedId,
    globalSettings,
    generating,
    uploading,
    error,
    addItems,
    removeItem,
    selectItem,
    setItemPrompt,
    setItemSettings,
    setItemPresets,
    queueItem,
    queueAll,
    generateQueue,
    pauseQueue,
    retryFailed,
    clearFailed,
    clearCompleted,
    uploadFiles,
  } = useImg2VideoQueueStore()

  const [promptExpanded, setPromptExpanded] = useState(true)
  const [presetsExpanded, setPresetsExpanded] = useState(false)

  const selectedItem = selectedId ? queueItems[selectedId] : null

  // Dropzone for workspace uploads
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
    noClick: true,
    noKeyboard: true,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        await uploadFiles(acceptedFiles)
      }
    },
  })

  const openFilePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length > 0) {
        await uploadFiles(files)
      }
    }
    input.click()
  }

  const handleDownloadAll = () => {
    const completedItems = queueOrder.map((id) => queueItems[id]).filter((item) => item.status === 'completed' && item.result)

    for (const item of completedItems) {
      if (!item.result) continue
      const a = document.createElement('a')
      a.href = assetUrl(item.result.localPath)
      a.download = item.result.localPath.split('/').pop() || 'video.mp4'
      a.click()
    }
  }

  // Queue stats
  const queuedCount = queueOrder.filter((id) => queueItems[id].status === 'queued').length
  const generatingCount = queueOrder.filter((id) => queueItems[id].status === 'generating').length
  const completedCount = queueOrder.filter((id) => queueItems[id].status === 'completed').length
  const failedCount = queueOrder.filter((id) => queueItems[id].status === 'failed').length

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Queue Panel - Left 30% */}
      <div className="w-[30%] bg-surface-50 rounded-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Queue ({queueOrder.length})</h2>
          <Button variant="ghost" size="xs" icon={<Plus className="w-4 h-4" />} onClick={openFilePicker}>
            Add
          </Button>
        </div>

        {/* Queue Controls */}
        <div className="flex flex-col gap-2 mb-4">
          <Button
            variant="primary"
            size="sm"
            icon={generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            onClick={generating ? pauseQueue : queuedCount > 0 ? generateQueue : queueAll}
            disabled={uploading || (queueOrder.length === 0)}
            className="w-full"
          >
            {generating ? 'Pause Queue' : queuedCount > 0 ? `Run Queue (${queuedCount})` : 'Queue All & Run'}
          </Button>

          {failedCount > 0 && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={retryFailed}
                className="flex-1"
              >
                Retry Failed ({failedCount})
              </Button>
              <Button
                variant="ghost-danger"
                size="xs"
                onClick={clearFailed}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {completedCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearCompleted}
            >
              Clear Completed ({completedCount})
            </Button>
          )}
        </div>

        {/* Queue Items */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {queueOrder.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-400 text-sm">
              <Upload className="w-8 h-8 mb-2 opacity-50" />
              <p>No images in queue</p>
              <p className="text-xs mt-1">Click Add or drag & drop</p>
            </div>
          ) : (
            queueOrder.map((id) => {
              const item = queueItems[id]
              const isSelected = selectedId === id

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectItem(id)}
                  className={`w-full text-left p-2 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 bg-surface-0 hover:border-brand-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Thumbnail */}
                    <div className="w-12 h-16 rounded overflow-hidden bg-surface-100 flex-shrink-0">
                      <img
                        src={assetUrl(item.imageUrl)}
                        alt="Queue item"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            item.status === 'completed'
                              ? 'success'
                              : item.status === 'generating'
                                ? 'warning'
                                : item.status === 'failed'
                                  ? 'danger'
                                  : item.status === 'queued'
                                    ? 'primary'
                                    : 'default'
                          }
                          className="text-xs"
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-surface-500 truncate">
                        {item.prompt || 'No prompt'}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-surface-400">{item.settings.duration}s</span>
                        <span className="text-xs text-surface-400">•</span>
                        <span className="text-xs text-surface-400">{item.settings.aspectRatio}</span>
                      </div>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeItem(id)
                      }}
                      className="flex-shrink-0 p-1 rounded hover:bg-danger/20 transition-colors"
                      title="Remove from queue"
                    >
                      <X className="w-4 h-4 text-surface-400 hover:text-danger" />
                    </button>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Workspace - Right 70% */}
      <div className="flex-1 bg-surface-50 rounded-xl p-6 flex flex-col overflow-hidden" {...getRootProps()}>
        <input {...getInputProps()} />

        {selectedItem ? (
          <>
            {/* Prompt Section */}
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="flex items-center justify-between w-full mb-2"
              >
                <h3 className="text-sm font-semibold">Motion Prompt</h3>
                {promptExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {promptExpanded && (
                <textarea
                  value={selectedItem.prompt}
                  onChange={(e) => setItemPrompt(selectedItem.id, e.target.value)}
                  placeholder="Describe the video motion..."
                  className="w-full h-20 text-sm bg-surface-0 border border-surface-200 rounded-lg p-3 resize-none focus:outline-none focus:border-brand-500"
                />
              )}
            </div>

            {/* Settings */}
            <div className="mb-3 flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-surface-400 mb-1 block">Duration</label>
                <Select
                  value={selectedItem.settings.duration}
                  onChange={(value) => setItemSettings(selectedItem.id, { duration: value })}
                  options={DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
                  size="sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-surface-400 mb-1 block">Aspect Ratio</label>
                <Select
                  value={selectedItem.settings.aspectRatio}
                  onChange={(value) => setItemSettings(selectedItem.id, { aspectRatio: value })}
                  options={ASPECT_RATIOS.map((ar) => ({ value: ar, label: ar }))}
                  size="sm"
                />
              </div>
            </div>

            {/* Camera Presets */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setPresetsExpanded(!presetsExpanded)}
                className="flex items-center justify-between w-full mb-2"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Camera Controls</h3>
                  {Object.values(selectedItem.presets).flat().length > 0 && (
                    <span className="px-1.5 py-0.5 bg-brand/20 text-brand text-[10px] font-semibold rounded">
                      {Object.values(selectedItem.presets).flat().length}
                    </span>
                  )}
                </div>
                {presetsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {presetsExpanded && (
                <div className="max-h-48 overflow-y-auto overscroll-contain pr-2 -mr-2">
                  <CameraPresetCards
                    selectedPresets={selectedItem.presets}
                    onPresetsChange={(presets) => setItemPresets(selectedItem.id, presets)}
                  />
                </div>
              )}
            </div>

            {/* Videos in Progress */}
            {queueOrder.filter((id) => queueItems[id].status === 'generating').length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2">Videos in Progress</h3>
                <div className="space-y-2">
                  {queueOrder
                    .filter((id) => queueItems[id].status === 'generating')
                    .slice(0, 3)
                    .map((id) => {
                      const item = queueItems[id]
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-3 p-2 bg-surface-100 rounded-lg"
                          onClick={() => selectItem(id)}
                        >
                          <div className="w-12 h-12 rounded overflow-hidden bg-surface-200 shrink-0">
                            <img src={assetUrl(item.imageUrl)} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-surface-700 truncate">
                              {item.prompt || 'No prompt'}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Loader2 className="w-3 h-3 animate-spin text-brand" />
                              <span className="text-[10px] text-surface-400">Generating...</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Generated Videos */}
            {queueOrder.filter((id) => queueItems[id].status === 'completed').length > 0 && (
              <div className="mb-4 flex-1 overflow-hidden flex flex-col">
                <h3 className="text-sm font-semibold mb-2">Generated Videos</h3>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                  <div className="grid grid-cols-2 gap-2">
                    {queueOrder
                      .filter((id) => queueItems[id].status === 'completed')
                      .slice(0, 6)
                      .map((id) => {
                        const item = queueItems[id]
                        return (
                          <div
                            key={id}
                            className="relative aspect-video rounded-lg overflow-hidden bg-surface-100 cursor-pointer group"
                            onClick={() => selectItem(id)}
                          >
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
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <Play className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto pt-4 border-t border-surface-200 flex gap-2">
              {selectedItem.status === 'draft' && (
                <Button
                  variant="primary"
                  icon={<Play className="w-4 h-4" />}
                  onClick={() => {
                    queueItem(selectedItem.id)
                  }}
                  disabled={!selectedItem.prompt.trim()}
                  className="flex-1"
                >
                  Queue Item
                </Button>
              )}
              {selectedItem.status === 'completed' && selectedItem.result && (
                <Button
                  variant="success"
                  icon={<Download className="w-4 h-4" />}
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = assetUrl(selectedItem.result!.localPath)
                    a.download = selectedItem.result!.localPath.split('/').pop() || 'video.mp4'
                    a.click()
                  }}
                  className="flex-1"
                >
                  Download Video
                </Button>
              )}
            </div>

            {/* Error */}
            {selectedItem.status === 'failed' && selectedItem.error && (
              <div className="mt-3 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <p className="text-sm text-danger">{selectedItem.error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-surface-400">
            {isDragActive ? (
              <>
                <Upload className="w-16 h-16 mb-4 text-brand-400" />
                <p className="text-lg font-medium text-brand-400">Drop images here</p>
              </>
            ) : (
              <>
                <Settings className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Select an item from queue</p>
                <p className="text-sm mt-2">Or drag & drop images to add</p>
              </>
            )}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg">
            <p className="text-sm text-danger">{error.message}</p>
          </div>
        )}

        {/* Results Grid */}
        <ResultsGrid
          items={queueOrder.map((id) => queueItems[id])}
          onSelectItem={selectItem}
          onDownloadAll={handleDownloadAll}
        />
      </div>
    </div>
  )
}
