import { Check, Download, Loader2, Play, Trash2, Upload, X } from 'lucide-react'
import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import { ASPECT_RATIOS, DURATIONS, useImg2VideoQueueStore, type WorkflowType } from '../../stores/img2videoQueueStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Textarea } from '../ui/Textarea'
import { CameraPresetCards } from './CameraPresetCards'

type ImageLabTab = 'img2img' | 'img2video'

export default function Img2VideoQueuePage() {
  const [activeTab, setActiveTab] = useState<ImageLabTab>('img2img')

  return (
    <div className="space-y-6">
      {/* Tab Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('img2img')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'img2img'
              ? 'bg-brand-600 text-white'
              : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
          }`}
        >
          Img2Img
        </button>
        <button
          onClick={() => setActiveTab('img2video')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'img2video'
              ? 'bg-brand-600 text-white'
              : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
          }`}
        >
          Img2Video
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'img2img' ? <Img2ImgContent /> : <Img2VideoContent />}
    </div>
  )
}

// ============================================================================
// IMG2IMG TAB
// ============================================================================

function Img2ImgContent() {
  const {
    queueItems,
    queueOrder,
    selectedId,
    uploading,
    selectItem,
    setItemPrompt,
    setImg2ImgSettings,
    transformImage,
    removeItem,
    uploadFiles,
  } = useImg2VideoQueueStore()

  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())

  // Filter for img2img items only
  const img2imgItems = queueOrder
    .map((id) => queueItems[id])
    .filter((item) => item.workflowType === 'img2img')
  const selectedItem = selectedId && queueItems[selectedId]?.workflowType === 'img2img' ? queueItems[selectedId] : null

  // Stats
  const totalCount = img2imgItems.length
  const completedCount = img2imgItems.filter((item) => item.status === 'completed').length
  const failedCount = img2imgItems.filter((item) => item.status === 'failed').length
  const generatingCount = img2imgItems.filter((item) => item.status === 'generating').length

  // Dropzone for img2img uploads
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        await uploadFiles(acceptedFiles)
        // Mark uploaded items as img2img
        const uploadedIds = Object.keys(queueItems).slice(-acceptedFiles.length)
        uploadedIds.forEach((id) => {
          if (queueItems[id]) {
            queueItems[id].workflowType = 'img2img'
          }
        })
      }
    },
  })

  const toggleResultSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSet = new Set(selectedResults)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedResults(newSet)
  }

  const downloadSelected = () => {
    for (const id of selectedResults) {
      const item = queueItems[id]
      if (item?.result?.imageUrl) {
        const a = document.createElement('a')
        a.href = assetUrl(item.result.localPath)
        a.download = item.result.localPath.split('/').pop() || 'transformed.png'
        a.click()
      }
    }
    setSelectedResults(new Set())
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {/* Step 1: Select Images */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              1
            </span>
            Select Images
          </h2>
          <div
            {...getRootProps()}
            className={`min-h-[200px] border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <input {...getInputProps()} />
            {img2imgItems.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-500 mb-2">SELECTED IMAGES</p>
                <div className="grid grid-cols-4 gap-2">
                  {img2imgItems.map((item) => {
                    const isSelected = selectedId === item.id
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          selectItem(item.id)
                        }}
                        className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all group ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-200'
                        }`}
                      >
                        <img src={assetUrl(item.imageUrl)} className="w-full h-full object-cover" alt="" />
                        <Badge
                          variant={
                            item.status === 'completed'
                              ? 'success'
                              : item.status === 'failed'
                                ? 'danger'
                                : item.status === 'generating'
                                  ? 'primary'
                                  : 'secondary'
                          }
                          className="absolute top-1 right-1 text-[10px]"
                        >
                          {item.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeItem(item.id)
                          }}
                          className="absolute top-1 left-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <Upload className="w-12 h-12 mb-3 text-surface-400" />
                <p className="text-surface-400 text-sm">
                  {isDragActive ? 'Drop images here' : 'Drag & drop images or click to browse'}
                </p>
                <p className="text-xs text-surface-400 mt-1">JPEG, PNG, WebP • Max 10MB each</p>
              </div>
            )}
          </div>
          {/* Queue stats */}
          {img2imgItems.length > 0 && (
            <div className="flex gap-2 mt-3 text-xs">
              <Badge variant="primary">{totalCount} Total</Badge>
              {completedCount > 0 && <Badge variant="success">{completedCount} Completed</Badge>}
              {failedCount > 0 && <Badge variant="danger">{failedCount} Failed</Badge>}
            </div>
          )}
        </div>

        {/* Step 2: Transformation Prompt */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              2
            </span>
            Transformation Prompt
          </h2>
          <Textarea
            value={selectedItem?.prompt || ''}
            onChange={(e) => selectedItem && setItemPrompt(selectedItem.id, e.target.value)}
            placeholder="Describe how to transform this image... (e.g., 'turn into a watercolor painting', 'make it look like a cartoon')"
            rows={4}
            className="w-full"
          />
        </div>

        {/* Step 3: Settings */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="space-y-3">
            {/* Strength Slider */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Strength{' '}
                <span className="text-surface-400">{selectedItem?.img2imgSettings?.strength || 0.75}</span>
              </label>
              <Slider
                value={selectedItem?.img2imgSettings?.strength || 0.75}
                onChange={(value) => selectedItem && setImg2ImgSettings(selectedItem.id, { strength: value })}
                min={0.1}
                max={1.0}
                step={0.05}
              />
            </div>
            {/* Guidance Scale Slider */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Guidance Scale{' '}
                <span className="text-surface-400">{selectedItem?.img2imgSettings?.guidance || 7.5}</span>
              </label>
              <Slider
                value={selectedItem?.img2imgSettings?.guidance || 7.5}
                onChange={(value) => selectedItem && setImg2ImgSettings(selectedItem.id, { guidance: value })}
                min={1}
                max={20}
                step={0.5}
              />
            </div>
          </div>
        </div>

        {/* Step 4: Generate Actions */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              4
            </span>
            Actions
          </h2>
          {selectedItem?.status === 'draft' && (
            <Button
              variant="success"
              icon={<Play className="w-4 h-4" />}
              onClick={() => selectedItem && transformImage(selectedItem.id)}
              disabled={!selectedItem.prompt.trim()}
              className="w-full"
            >
              Transform Image
            </Button>
          )}
          {selectedItem?.status === 'generating' && (
            <Button variant="secondary" icon={<Loader2 className="w-4 h-4 animate-spin" />} disabled className="w-full">
              Transforming...
            </Button>
          )}
          {selectedItem?.status === 'completed' && selectedItem.result && (
            <Button
              variant="primary"
              icon={<Download className="w-4 h-4" />}
              onClick={() => {
                if (selectedItem.result) {
                  const a = document.createElement('a')
                  a.href = assetUrl(selectedItem.result.localPath)
                  a.download = selectedItem.result.localPath.split('/').pop() || 'transformed.png'
                  a.click()
                }
              }}
              className="w-full"
            >
              Download Result
            </Button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Selected Item Preview */}
        {selectedItem ? (
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Selected Image</h2>
            <div className="space-y-3">
              <div className="aspect-[9/16] max-w-xs mx-auto rounded-lg overflow-hidden border border-surface-200">
                <img src={assetUrl(selectedItem.imageUrl)} className="w-full h-full object-cover" alt="" />
              </div>
              <Badge
                variant={
                  selectedItem.status === 'completed'
                    ? 'success'
                    : selectedItem.status === 'failed'
                      ? 'danger'
                      : selectedItem.status === 'generating'
                        ? 'primary'
                        : 'secondary'
                }
              >
                {selectedItem.status}
              </Badge>
              <p className="text-xs text-surface-400 line-clamp-2">{selectedItem.prompt || 'No prompt'}</p>
              <div className="flex gap-2 text-xs text-surface-400">
                <span>Strength: {selectedItem.img2imgSettings?.strength || 0.75}</span>
                <span>•</span>
                <span>Guidance: {selectedItem.img2imgSettings?.guidance || 7.5}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-50/50 rounded-lg p-8 text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-surface-300 opacity-50" />
            <p className="text-surface-400">Select an image from Step 2</p>
            <p className="text-xs text-surface-400 mt-2">Or upload images to get started</p>
          </div>
        )}

        {/* Images in Progress */}
        {generatingCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Images in Progress</h3>
            <div className="space-y-2">
              {img2imgItems
                .filter((item) => item.status === 'generating')
                .slice(0, 3)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 bg-surface-100 rounded">
                    <Loader2 className="w-4 h-4 animate-spin text-brand" />
                    <span className="text-xs text-surface-600 truncate flex-1">{item.prompt}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Generated Images */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Generated Images</h3>
              {selectedResults.size > 0 && (
                <Button
                  variant="primary"
                  size="xs"
                  icon={<Download className="w-3 h-3" />}
                  onClick={downloadSelected}
                >
                  Download {selectedResults.size}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {img2imgItems
                .filter((item) => item.status === 'completed')
                .map((item) => {
                  const isSelected = selectedResults.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={`relative aspect-square rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
                        isSelected ? 'border-brand' : 'border-transparent'
                      }`}
                      onClick={() => selectItem(item.id)}
                    >
                      <img
                        src={assetUrl(item.result?.imageUrl || item.imageUrl)}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                      <button
                        type="button"
                        onClick={(e) => toggleResultSelection(item.id, e)}
                        className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-900/80 flex items-center justify-center hover:bg-surface-900 transition-colors z-10"
                      >
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-brand" />
                        ) : (
                          <div className="w-3 h-3 border-2 border-surface-300 rounded" />
                        )}
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// IMG2VIDEO TAB
// ============================================================================

function Img2VideoContent() {
  const {
    queueItems,
    queueOrder,
    selectedId,
    generating,
    uploading,
    selectItem,
    setItemPrompt,
    setItemSettings,
    setItemPresets,
    queueItem,
    generateQueue,
    pauseQueue,
    retryFailed,
    clearFailed,
    removeItem,
    uploadFiles,
  } = useImg2VideoQueueStore()

  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())

  // Filter for img2video items only
  const img2videoItems = queueOrder
    .map((id) => queueItems[id])
    .filter((item) => item.workflowType === 'img2video')
  const selectedItem =
    selectedId && queueItems[selectedId]?.workflowType === 'img2video' ? queueItems[selectedId] : null

  // Stats
  const totalCount = img2videoItems.length
  const queuedCount = img2videoItems.filter((item) => item.status === 'queued').length
  const completedCount = img2videoItems.filter((item) => item.status === 'completed').length
  const failedCount = img2videoItems.filter((item) => item.status === 'failed').length
  const generatingCount = img2videoItems.filter((item) => item.status === 'generating').length

  // Dropzone for img2video uploads
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        await uploadFiles(acceptedFiles)
        // Mark uploaded items as img2video
        const uploadedIds = Object.keys(queueItems).slice(-acceptedFiles.length)
        uploadedIds.forEach((id) => {
          if (queueItems[id]) {
            queueItems[id].workflowType = 'img2video'
          }
        })
      }
    },
  })

  const toggleVideoSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSet = new Set(selectedVideos)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedVideos(newSet)
  }

  const downloadSelected = () => {
    for (const id of selectedVideos) {
      const item = queueItems[id]
      if (item?.result?.videoUrl) {
        const a = document.createElement('a')
        a.href = assetUrl(item.result.localPath)
        a.download = item.result.localPath.split('/').pop() || 'video.mp4'
        a.click()
      }
    }
    setSelectedVideos(new Set())
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {/* Step 1: Select Images */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              1
            </span>
            Select Images
          </h2>
          <div
            {...getRootProps()}
            className={`min-h-[200px] border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <input {...getInputProps()} />
            {img2videoItems.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-500 mb-2">SELECTED IMAGES</p>
                <div className="grid grid-cols-4 gap-2">
                  {img2videoItems.map((item) => {
                    const isSelected = selectedId === item.id
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          selectItem(item.id)
                        }}
                        className={`relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all group ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-200'
                        }`}
                      >
                        <img src={assetUrl(item.imageUrl)} className="w-full h-full object-cover" alt="" />
                        <Badge
                          variant={
                            item.status === 'completed'
                              ? 'success'
                              : item.status === 'failed'
                                ? 'danger'
                                : item.status === 'generating'
                                  ? 'primary'
                                  : 'secondary'
                          }
                          className="absolute top-1 right-1 text-[10px]"
                        >
                          {item.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeItem(item.id)
                          }}
                          className="absolute top-1 left-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <Upload className="w-12 h-12 mb-3 text-surface-400" />
                <p className="text-surface-400 text-sm">
                  {isDragActive ? 'Drop images here' : 'Drag & drop images or click to browse'}
                </p>
                <p className="text-xs text-surface-400 mt-1">JPEG, PNG, WebP • Max 10MB each</p>
              </div>
            )}
          </div>
          {/* Queue stats and controls */}
          {img2videoItems.length > 0 && (
            <>
              <div className="flex gap-2 mt-3 text-xs">
                <Badge variant="primary">{totalCount} Total</Badge>
                {completedCount > 0 && <Badge variant="success">{completedCount} Completed</Badge>}
                {failedCount > 0 && <Badge variant="danger">{failedCount} Failed</Badge>}
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  variant={generating ? 'danger' : 'success'}
                  icon={generating ? <X className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  onClick={generating ? pauseQueue : generateQueue}
                  disabled={queuedCount === 0 && !generating}
                  className="flex-1"
                >
                  {generating ? 'Pause Queue' : `Run Queue${queuedCount > 0 ? ` (${queuedCount})` : ''}`}
                </Button>
                {failedCount > 0 && (
                  <>
                    <Button variant="warning" size="sm" onClick={retryFailed}>
                      Retry ({failedCount})
                    </Button>
                    <Button variant="danger" size="sm" onClick={clearFailed}>
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Step 2: Motion Prompt */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              2
            </span>
            Motion Prompt
          </h2>
          <Textarea
            value={selectedItem?.prompt || ''}
            onChange={(e) => selectedItem && setItemPrompt(selectedItem.id, e.target.value)}
            placeholder="Describe the video motion... (e.g., 'camera zooms in slowly', 'gentle pan from left to right')"
            rows={4}
          />
        </div>

        {/* Step 3: Settings */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Aspect Ratio"
              value={selectedItem?.settings.aspectRatio || '9:16'}
              onChange={(e) => selectedItem && setItemSettings(selectedItem.id, { aspectRatio: e.target.value })}
              options={ASPECT_RATIOS.map((ar) => ({ value: ar, label: ar }))}
            />
            <Select
              label="Duration"
              value={selectedItem?.settings.duration || '5'}
              onChange={(e) => selectedItem && setItemSettings(selectedItem.id, { duration: e.target.value })}
              options={DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
            />
          </div>
        </div>

        {/* Step 4: Camera Controls */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              4
            </span>
            Camera Controls
            {selectedItem && Object.values(selectedItem.presets).flat().length > 0 && (
              <span className="px-1.5 py-0.5 bg-brand/20 text-brand text-[10px] font-semibold rounded">
                {Object.values(selectedItem.presets).flat().length}
              </span>
            )}
          </h2>
          <CameraPresetCards
            selectedPresets={selectedItem?.presets || {}}
            onPresetsChange={(presets) => selectedItem && setItemPresets(selectedItem.id, presets)}
          />
        </div>

        {/* Step 5: Generate Actions */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              5
            </span>
            Actions
          </h2>
          {selectedItem?.status === 'draft' && (
            <Button
              variant="primary"
              icon={<Play className="w-4 h-4" />}
              onClick={() => selectedItem && queueItem(selectedItem.id)}
              disabled={!selectedItem.prompt.trim()}
              className="w-full"
            >
              Queue Item
            </Button>
          )}
          {selectedItem?.status === 'completed' && selectedItem.result && (
            <Button
              variant="success"
              icon={<Download className="w-4 h-4" />}
              onClick={() => {
                if (selectedItem.result) {
                  const a = document.createElement('a')
                  a.href = assetUrl(selectedItem.result.localPath)
                  a.download = selectedItem.result.localPath.split('/').pop() || 'video.mp4'
                  a.click()
                }
              }}
              className="w-full"
            >
              Download Video
            </Button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Selected Item Preview */}
        {selectedItem ? (
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Selected Item</h2>
            <div className="space-y-3">
              <div className="aspect-[9/16] max-w-xs mx-auto rounded-lg overflow-hidden border border-surface-200">
                <img src={assetUrl(selectedItem.imageUrl)} className="w-full h-full object-cover" alt="" />
              </div>
              <Badge
                variant={
                  selectedItem.status === 'completed'
                    ? 'success'
                    : selectedItem.status === 'failed'
                      ? 'danger'
                      : selectedItem.status === 'generating'
                        ? 'primary'
                        : 'secondary'
                }
              >
                {selectedItem.status}
              </Badge>
              <p className="text-xs text-surface-400 line-clamp-2">{selectedItem.prompt || 'No prompt'}</p>
              <div className="flex gap-2 text-xs text-surface-400">
                <span>{selectedItem.settings.duration}s</span>
                <span>•</span>
                <span>{selectedItem.settings.aspectRatio}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-50/50 rounded-lg p-8 text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-surface-300 opacity-50" />
            <p className="text-surface-400">Select an image from Step 2</p>
            <p className="text-xs text-surface-400 mt-2">Or upload images to get started</p>
          </div>
        )}

        {/* Videos in Progress */}
        {generatingCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Videos in Progress</h3>
            <div className="space-y-2">
              {img2videoItems
                .filter((item) => item.status === 'generating')
                .slice(0, 3)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 bg-surface-100 rounded">
                    <Loader2 className="w-4 h-4 animate-spin text-brand" />
                    <span className="text-xs text-surface-600 truncate flex-1">{item.prompt}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Generated Videos */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Generated Videos</h3>
              {selectedVideos.size > 0 && (
                <Button
                  variant="primary"
                  size="xs"
                  icon={<Download className="w-3 h-3" />}
                  onClick={downloadSelected}
                >
                  Download {selectedVideos.size}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {img2videoItems
                .filter((item) => item.status === 'completed')
                .map((item) => {
                  const isSelected = selectedVideos.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={`relative aspect-video rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
                        isSelected ? 'border-brand' : 'border-transparent'
                      }`}
                      onClick={() => selectItem(item.id)}
                    >
                      <video
                        src={assetUrl(item.result?.videoUrl || '')}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause()
                          e.currentTarget.currentTime = 0
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <Play className="w-6 h-6 text-white" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => toggleVideoSelection(item.id, e)}
                        className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-900/80 flex items-center justify-center hover:bg-surface-900 transition-colors z-10"
                      >
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-brand" />
                        ) : (
                          <div className="w-3 h-3 border-2 border-surface-300 rounded" />
                        )}
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
