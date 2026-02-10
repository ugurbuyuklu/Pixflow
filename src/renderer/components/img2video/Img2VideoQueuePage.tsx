import { Check, ChevronLeft, ChevronRight, Download, Loader2, Play, ThumbsDown, ThumbsUp, Trash2, Upload, X } from 'lucide-react'
import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import { ASPECT_RATIOS, DURATIONS, IMG2IMG_ASPECT_RATIOS, IMG2IMG_RESOLUTIONS, IMG2IMG_FORMATS, useImg2VideoQueueStore, type WorkflowType } from '../../stores/img2videoQueueStore'
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
          img2img
        </button>
        <button
          onClick={() => setActiveTab('img2video')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'img2video'
              ? 'bg-brand-600 text-white'
              : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
          }`}
        >
          img2video
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
    transformBatch,
    removeItem,
    uploadFiles,
  } = useImg2VideoQueueStore()

  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [batchPrompt, setBatchPrompt] = useState('')
  const [batchSettings, setBatchSettings] = useState({
    aspectRatio: '1:1',
    numberOfOutputs: 1,
    resolution: '1K',
    format: 'PNG',
  })
  const [modalImage, setModalImage] = useState<string | null>(null)
  const [modalItemId, setModalItemId] = useState<string | null>(null)
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set())
  const [dislikedItems, setDislikedItems] = useState<Set<string>>(new Set())

  // Filter for img2img items only
  const img2imgItems = queueOrder
    .map((id) => queueItems[id])
    .filter((item) => item.workflowType === 'img2img')

  // Separate reference items (draft/generating) from completed outputs
  const referenceItems = img2imgItems.filter((item) => item.status === 'draft' || item.status === 'generating')
  const completedItems = img2imgItems.filter((item) => item.status === 'completed')

  const selectedItem = selectedId && queueItems[selectedId]?.workflowType === 'img2img' ? queueItems[selectedId] : null

  // Stats
  const totalCount = img2imgItems.length
  const completedCount = completedItems.length
  const failedCount = img2imgItems.filter((item) => item.status === 'failed').length
  const generatingCount = img2imgItems.filter((item) => item.status === 'generating').length

  // Dropzone for img2img uploads
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 4,
    disabled: uploading || referenceItems.length >= 4,
    onDrop: async (acceptedFiles) => {
      const remainingSlots = 4 - referenceItems.length
      const filesToUpload = acceptedFiles.slice(0, remainingSlots)
      if (filesToUpload.length > 0) {
        await uploadFiles(filesToUpload, 'img2img')
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
            {referenceItems.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-500 mb-2">SELECTED IMAGES</p>
                <div className="grid grid-cols-4 gap-2">
                  {referenceItems.map((item) => {
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
                          {isSelected && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                removeItem(item.id)
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-surface-900/80 hover:bg-danger rounded-full flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3 text-white" />
                            </div>
                          )}
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

        {/* Step 2: Prompt */}
        <div className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              2
            </span>
            Prompt
          </h2>
          <Textarea
            value={batchPrompt}
            onChange={(e) => setBatchPrompt(e.target.value)}
            placeholder="Describe how to transform these images... (e.g., 'photo of the 5 friends in paris. eiffel tower behind them. sunny day, golden hour.')"
            rows={4}
            className="w-full"
          />
        </div>

        {/* Step 3: Settings */}
        <div className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Aspect Ratio"
              value={batchSettings.aspectRatio}
              onChange={(e) => setBatchSettings({ ...batchSettings, aspectRatio: e.target.value })}
              options={IMG2IMG_ASPECT_RATIOS.map((ar) => ({ value: ar, label: ar }))}
            />
            <div>
              <label className="text-sm font-medium mb-1 block">
                Number of Outputs <span className="text-surface-400">{batchSettings.numberOfOutputs}</span>
              </label>
              <Slider
                value={batchSettings.numberOfOutputs}
                onChange={(e) => setBatchSettings({ ...batchSettings, numberOfOutputs: Number(e.target.value) })}
                min={1}
                max={4}
                step={1}
              />
              <p className="text-xs text-surface-400 mt-1">
                Using {referenceItems.length} reference {referenceItems.length === 1 ? 'image' : 'images'} to generate {batchSettings.numberOfOutputs} {batchSettings.numberOfOutputs === 1 ? 'output' : 'outputs'}
              </p>
            </div>
            <Select
              label="Resolution"
              value={batchSettings.resolution}
              onChange={(e) => setBatchSettings({ ...batchSettings, resolution: e.target.value })}
              options={IMG2IMG_RESOLUTIONS.map((res) => ({ value: res, label: res }))}
            />
            <Select
              label="Format"
              value={batchSettings.format}
              onChange={(e) => setBatchSettings({ ...batchSettings, format: e.target.value })}
              options={IMG2IMG_FORMATS.map((fmt) => ({ value: fmt, label: fmt }))}
            />
          </div>
        </div>

        {/* Step 4: Generate Actions */}
        <div className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              4
            </span>
            Actions
          </h2>
          {generatingCount === 0 && (
            <button
              onClick={() => {
                const ids = referenceItems.map((item) => item.id)
                transformBatch(ids, batchPrompt, batchSettings)
              }}
              disabled={!batchPrompt.trim() || referenceItems.length === 0}
              className="w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-surface-300 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Transform {referenceItems.length} {referenceItems.length === 1 ? 'Image' : 'Images'}
            </button>
          )}
          {generatingCount > 0 && (
            <button disabled className="w-full px-4 py-2.5 rounded-lg bg-surface-300 cursor-not-allowed text-surface-600 font-medium flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Transforming {generatingCount} {generatingCount === 1 ? 'Image' : 'Images'}...
            </button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Images in Progress */}
        {generatingCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Generating...</h3>
            <div className="grid grid-cols-2 gap-3">
              {img2imgItems
                .filter((item) => item.status === 'generating')
                .map((item) => (
                  <div key={item.id} className="relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-200">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                         style={{ backgroundSize: '200% 100%' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Step 5: Generated Images */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-xs text-white">
                  5
                </span>
                Generated Images
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    completedItems.forEach((item) => {
                      if (item?.result?.imageUrl) {
                        const a = document.createElement('a')
                        a.href = assetUrl(item.result.localPath)
                        a.download = item.result.localPath.split('/').pop() || 'transformed.png'
                        a.click()
                      }
                    })
                  }}
                  className="px-3 py-1.5 rounded-lg bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download All
                </button>
                {selectedResults.size > 0 && (
                  <button
                    onClick={downloadSelected}
                    className="px-3 py-1.5 rounded-lg bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download {selectedResults.size}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {completedItems.map((item) => {
                  const isSelected = selectedResults.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
                        isSelected ? 'border-brand' : 'border-transparent'
                      }`}
                      onClick={(e) => {
                        // Don't select when clicking checkbox or action buttons
                        if ((e.target as HTMLElement).closest('button')) return
                        selectItem(item.id)
                      }}
                    >
                      <img
                        src={assetUrl(item.result?.imageUrl || item.imageUrl)}
                        className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                        alt=""
                        onClick={(e) => {
                          e.stopPropagation()
                          setModalImage(assetUrl(item.result?.imageUrl || item.imageUrl))
                          setModalItemId(item.id)
                        }}
                      />

                      {/* Selection checkbox */}
                      <button
                        type="button"
                        onClick={(e) => toggleResultSelection(item.id, e)}
                        className={`absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center transition-colors z-10 ${
                          isSelected
                            ? 'bg-brand-600 hover:bg-brand-700'
                            : 'bg-surface-900/50 hover:bg-surface-900/70'
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <div className="w-3.5 h-3.5 border-2 border-white/70 rounded" />
                        )}
                      </button>

                      {/* Like/Dislike indicator */}
                      {(likedItems.has(item.id) || dislikedItems.has(item.id)) && (
                        <div className="absolute bottom-2 left-2 z-10">
                          {likedItems.has(item.id) && (
                            <div className="bg-secondary-600 rounded-full p-1.5">
                              <ThumbsUp className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          {dislikedItems.has(item.id) && (
                            <div className="bg-danger rounded-full p-1.5">
                              <ThumbsDown className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {modalImage && modalItemId && (() => {
        const completedItems = img2imgItems.filter((item) => item.status === 'completed')
        const currentIndex = completedItems.findIndex((item) => item.id === modalItemId)
        const currentItem = completedItems[currentIndex]
        const hasPrev = currentIndex > 0
        const hasNext = currentIndex < completedItems.length - 1

        const goToPrev = () => {
          if (hasPrev) {
            const prevItem = completedItems[currentIndex - 1]
            setModalImage(assetUrl(prevItem.result?.imageUrl || prevItem.imageUrl))
            setModalItemId(prevItem.id)
          }
        }

        const goToNext = () => {
          if (hasNext) {
            const nextItem = completedItems[currentIndex + 1]
            setModalImage(assetUrl(nextItem.result?.imageUrl || nextItem.imageUrl))
            setModalItemId(nextItem.id)
          }
        }

        const handleDownload = () => {
          if (currentItem?.result?.localPath) {
            const a = document.createElement('a')
            a.href = assetUrl(currentItem.result.localPath)
            a.download = currentItem.result.localPath.split('/').pop() || 'image.png'
            a.click()
          }
        }

        return (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setModalImage(null)
              setModalItemId(null)
            }}
          >
            {/* Close button - top left */}
            <button
              type="button"
              onClick={() => {
                setModalImage(null)
                setModalItemId(null)
              }}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-brand-600/80 hover:bg-brand-700 flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Download button - top right */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDownload()
              }}
              className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-secondary-600 hover:bg-secondary-700 flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium">Download</span>
            </button>

            {/* Prev button */}
            {hasPrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrev()
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-brand-600/80 hover:bg-brand-700 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-8 h-8 text-white" />
              </button>
            )}

            {/* Next button */}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goToNext()
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-brand-600/80 hover:bg-brand-700 flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-8 h-8 text-white" />
              </button>
            )}

            {/* Image */}
            <img
              src={modalImage}
              className="max-w-full max-h-full object-contain"
              alt="Preview"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Like/Dislike buttons - bottom center */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  if (!currentItem?.id) return
                  const newLiked = new Set(likedItems)
                  const newDisliked = new Set(dislikedItems)

                  if (likedItems.has(currentItem.id)) {
                    // Toggle off like
                    newLiked.delete(currentItem.id)
                  } else {
                    // Add like and remove dislike if exists
                    newLiked.add(currentItem.id)
                    newDisliked.delete(currentItem.id)
                  }

                  setLikedItems(newLiked)
                  setDislikedItems(newDisliked)
                }}
                className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                  currentItem && likedItems.has(currentItem.id)
                    ? 'bg-secondary-600 hover:bg-secondary-700'
                    : 'bg-secondary-600/80 hover:bg-secondary-700'
                }`}
              >
                <ThumbsUp className="w-5 h-5 text-white" />
                <span className="text-white font-medium">
                  {currentItem && likedItems.has(currentItem.id) ? 'Liked' : 'Like'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentItem?.id) return
                  const newLiked = new Set(likedItems)
                  const newDisliked = new Set(dislikedItems)

                  if (dislikedItems.has(currentItem.id)) {
                    // Toggle off dislike
                    newDisliked.delete(currentItem.id)
                  } else {
                    // Add dislike and remove like if exists
                    newDisliked.add(currentItem.id)
                    newLiked.delete(currentItem.id)
                  }

                  setLikedItems(newLiked)
                  setDislikedItems(newDisliked)
                }}
                className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                  currentItem && dislikedItems.has(currentItem.id)
                    ? 'bg-danger hover:bg-danger'
                    : 'bg-danger/80 hover:bg-danger'
                }`}
              >
                <ThumbsDown className="w-5 h-5 text-white" />
                <span className="text-white font-medium">
                  {currentItem && dislikedItems.has(currentItem.id) ? 'Disliked' : 'Dislike'}
                </span>
              </button>
            </div>
          </div>
        )
      })()}
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
    maxFiles: 4,
    disabled: uploading || img2videoItems.length >= 4,
    onDrop: async (acceptedFiles) => {
      const remainingSlots = 4 - img2videoItems.length
      const filesToUpload = acceptedFiles.slice(0, remainingSlots)
      if (filesToUpload.length > 0) {
        await uploadFiles(filesToUpload, 'img2video')
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
                        {isSelected && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              removeItem(item.id)
                            }}
                            className="absolute top-1 right-1 w-5 h-5 bg-surface-900/80 hover:bg-danger rounded-full flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3 text-white" />
                          </div>
                        )}
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

        {/* Step 2: Prompt */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              2
            </span>
            Prompt
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
        {/* Videos in Progress */}
        {generatingCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Generating...</h3>
            <div className="grid grid-cols-2 gap-3">
              {img2videoItems
                .filter((item) => item.status === 'generating')
                .map((item) => (
                  <div key={item.id} className="relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-200">
                    <img
                      src={assetUrl(item.imageUrl)}
                      className="w-full h-full object-cover opacity-30"
                      alt=""
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                         style={{ backgroundSize: '200% 100%' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    </div>
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
