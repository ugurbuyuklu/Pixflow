import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Image,
  Loader2,
  Play,
  ThumbsDown,
  ThumbsUp,
  Upload,
  X,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import {
  ASPECT_RATIOS,
  DURATIONS,
  IMG2IMG_ASPECT_RATIOS,
  IMG2IMG_FORMATS,
  IMG2IMG_RESOLUTIONS,
  type QueueItem,
  useImg2VideoQueueStore,
} from '../../stores/img2videoQueueStore'
import { Button } from '../ui/Button'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { StatusPill } from '../ui/StatusPill'
import { Textarea } from '../ui/Textarea'
import { CameraPresetCards } from './CameraPresetCards'
import { DownloadToolbar } from './DownloadToolbar'
import { LoadingGrid } from './LoadingGrid'
import { SelectableResultCard } from './SelectableResultCard'
import { SelectableThumbnail } from './SelectableThumbnail'

type ImageLabTab = 'img2img' | 'img2video' | 'startEnd'

export default function Img2VideoQueuePage() {
  const { queueItems, queueOrder } = useImg2VideoQueueStore()
  const [activeTab, setActiveTab] = useState<ImageLabTab>('img2img')

  // Auto-switch to tab with content when current tab is empty
  useEffect(() => {
    const counts = {
      img2img: queueOrder.filter((id) => queueItems[id]?.workflowType === 'img2img').length,
      img2video: queueOrder.filter((id) => queueItems[id]?.workflowType === 'img2video').length,
      startEnd: queueOrder.filter((id) => queueItems[id]?.workflowType === 'startEnd').length,
    }
    if (counts[activeTab] === 0) {
      if (counts.img2img > 0) setActiveTab('img2img')
      else if (counts.img2video > 0) setActiveTab('img2video')
      else if (counts.startEnd > 0) setActiveTab('startEnd')
    }
  }, [queueItems, queueOrder, activeTab])

  const workflowTabs = (
    <SegmentedTabs
      ariaLabel="Image Lab workflow"
      value={activeTab}
      onChange={setActiveTab}
      items={[
        { id: 'img2img', label: 'img2img', icon: <Image className="w-4 h-4" /> },
        { id: 'img2video', label: 'img2video', icon: <Film className="w-4 h-4" /> },
        { id: 'startEnd', label: 'start / end', icon: <ArrowRight className="w-4 h-4" /> },
      ]}
      className="w-full"
    />
  )

  return (
    <div className="space-y-6">
      {activeTab === 'img2img' && <Img2ImgContent tabs={workflowTabs} />}
      {activeTab === 'img2video' && <Img2VideoContent tabs={workflowTabs} />}
      {activeTab === 'startEnd' && <StartEndContent tabs={workflowTabs} />}
    </div>
  )
}

// ============================================================================
// IMG2IMG TAB
// ============================================================================

function Img2ImgContent({ tabs }: { tabs: React.ReactNode }) {
  const { queueItems, queueOrder, selectedId, uploading, selectItem, transformBatch, removeItem, uploadFiles } =
    useImg2VideoQueueStore()

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
  const img2imgItems = queueOrder.map((id) => queueItems[id]).filter((item) => item.workflowType === 'img2img')

  // Separate reference items (draft/generating) from completed outputs
  const referenceItems = img2imgItems.filter((item) => item.status === 'draft' || item.status === 'generating')
  const completedItems = img2imgItems.filter((item) => item.status === 'completed')

  const _selectedItem = selectedId && queueItems[selectedId]?.workflowType === 'img2img' ? queueItems[selectedId] : null

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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
          <div className="mb-4">{tabs}</div>
          <div
            {...getRootProps()}
            className={`min-h-[200px] border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
              isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <input {...getInputProps()} />
            {referenceItems.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-500 mb-2">SELECTED IMAGES</p>
                <div className="grid grid-cols-4 gap-2">
                  {referenceItems.map((item) => (
                    <SelectableThumbnail
                      key={item.id}
                      id={item.id}
                      imageUrl={item.imageUrl}
                      isSelected={selectedId === item.id}
                      onSelect={selectItem}
                      onRemove={removeItem}
                    />
                  ))}
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
              <StatusPill status="neutral" size="xs" label={`${totalCount} Total`} />
              {completedCount > 0 && <StatusPill status="completed" size="xs" label={`${completedCount} Completed`} />}
              {failedCount > 0 && <StatusPill status="failed" size="xs" label={`${failedCount} Failed`} />}
            </div>
          )}
        </div>

        {/* Step 2: Prompt */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
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
        <div
          className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Aspect Ratio"
              value={batchSettings.aspectRatio}
              onChange={(e) => setBatchSettings({ ...batchSettings, aspectRatio: e.target.value })}
              options={IMG2IMG_ASPECT_RATIOS.map((ar) => ({ value: ar, label: ar }))}
            />
            <div>
              <span className="text-sm font-medium mb-1 block">
                Number of Outputs <span className="text-surface-400">{batchSettings.numberOfOutputs}</span>
              </span>
              <Slider
                value={batchSettings.numberOfOutputs}
                onChange={(e) => setBatchSettings({ ...batchSettings, numberOfOutputs: Number(e.target.value) })}
                min={1}
                max={4}
                step={1}
              />
              <p className="text-xs text-surface-400 mt-1">
                Using {referenceItems.length} reference {referenceItems.length === 1 ? 'image' : 'images'} to generate{' '}
                {batchSettings.numberOfOutputs} {batchSettings.numberOfOutputs === 1 ? 'output' : 'outputs'}
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
        <div
          className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              4
            </span>
            Actions
          </h2>
          {generatingCount === 0 && (
            <button
              type="button"
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
            <button
              type="button"
              disabled
              className="w-full px-4 py-2.5 rounded-lg bg-surface-300 cursor-not-allowed text-surface-600 font-medium flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Transforming {generatingCount} {generatingCount === 1 ? 'Image' : 'Images'}...
            </button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Images in Progress */}
        <LoadingGrid items={img2imgItems.filter((item) => item.status === 'generating')} />

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
              <DownloadToolbar
                onDownloadAll={() => {
                  completedItems.forEach((item) => {
                    if (item?.result?.imageUrl) {
                      const a = document.createElement('a')
                      a.href = assetUrl(item.result.localPath)
                      a.download = item.result.localPath.split('/').pop() || 'transformed.png'
                      a.click()
                    }
                  })
                }}
                onDownloadSelected={downloadSelected}
                selectedCount={selectedResults.size}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {completedItems.map((item) => (
                <SelectableResultCard
                  key={item.id}
                  id={item.id}
                  imageUrl={item.imageUrl}
                  resultUrl={item.result?.imageUrl}
                  isSelected={selectedResults.has(item.id)}
                  isLiked={likedItems.has(item.id)}
                  isDisliked={dislikedItems.has(item.id)}
                  onSelect={selectItem}
                  onToggleSelection={toggleResultSelection}
                  onOpenModal={(url, id) => {
                    setModalImage(url)
                    setModalItemId(id)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {modalImage &&
        modalItemId &&
        (() => {
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
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Close preview"
                className="absolute inset-0"
                onClick={() => {
                  setModalImage(null)
                  setModalItemId(null)
                }}
              />
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
              <img src={modalImage} className="max-w-full max-h-full object-contain" alt="Preview" />

              {/* Like/Dislike buttons - bottom center */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
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

function Img2VideoContent({ tabs }: { tabs: React.ReactNode }) {
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
  const img2videoItems = queueOrder.map((id) => queueItems[id]).filter((item) => item.workflowType === 'img2video')
  const selectedItem =
    selectedId && queueItems[selectedId]?.workflowType === 'img2video' ? queueItems[selectedId] : null

  // Stats
  const totalCount = img2videoItems.length
  const queuedCount = img2videoItems.filter((item) => item.status === 'queued').length
  const completedCount = img2videoItems.filter((item) => item.status === 'completed').length
  const failedCount = img2videoItems.filter((item) => item.status === 'failed').length
  const _generatingCount = img2videoItems.filter((item) => item.status === 'generating').length

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

  const toggleVideoSelection = (id: string) => {
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
          <div className="mb-4">{tabs}</div>
          <div
            {...getRootProps()}
            className={`min-h-[200px] border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
              isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-surface-200 hover:border-surface-300'
            }`}
          >
            <input {...getInputProps()} />
            {img2videoItems.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-500 mb-2">SELECTED IMAGES</p>
                <div className="grid grid-cols-4 gap-2">
                  {img2videoItems.map((item) => (
                    <SelectableThumbnail
                      key={item.id}
                      id={item.id}
                      imageUrl={item.imageUrl}
                      isSelected={selectedId === item.id}
                      onSelect={selectItem}
                      onRemove={removeItem}
                    />
                  ))}
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
                <StatusPill status="neutral" size="xs" label={`${totalCount} Total`} />
                {completedCount > 0 && (
                  <StatusPill status="completed" size="xs" label={`${completedCount} Completed`} />
                )}
                {failedCount > 0 && <StatusPill status="failed" size="xs" label={`${failedCount} Failed`} />}
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
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
        <LoadingGrid items={img2videoItems.filter((item) => item.status === 'generating')} />

        {/* Generated Videos */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Generated Videos</h3>
              {selectedVideos.size > 0 && (
                <Button variant="primary" size="xs" icon={<Download className="w-3 h-3" />} onClick={downloadSelected}>
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
                    <button
                      type="button"
                      key={item.id}
                      className={`relative aspect-video rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
                        isSelected ? 'border-brand' : 'border-transparent'
                      }`}
                      onClick={() => {
                        selectItem(item.id)
                        toggleVideoSelection(item.id)
                      }}
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
                      <div className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-900/80 flex items-center justify-center z-10">
                        {isSelected ? (
                          <Check className="w-4 h-4 text-brand" />
                        ) : (
                          <div className="w-3 h-3 border-2 border-surface-300 rounded" />
                        )}
                      </div>
                    </button>
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
// START/END TAB
// ============================================================================

function FrameDropZone({
  label,
  imageUrl,
  onDrop,
  onClear,
  disabled,
}: {
  label: string
  imageUrl: string | null
  onDrop: (file: File) => void
  onClear: () => void
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file?.type.startsWith('image/')) onDrop(file)
    },
    [disabled, onDrop],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onDrop(file)
      e.target.value = ''
    },
    [onDrop],
  )

  if (imageUrl) {
    return (
      <div className="flex-1 relative group">
        <p className="text-xs font-medium text-surface-500 mb-2">{label}</p>
        <div className="aspect-video rounded-lg overflow-hidden bg-surface-100 border-2 border-brand-500/30">
          <img src={assetUrl(imageUrl)} alt={label} className="w-full h-full object-cover" />
        </div>
        <button
          type="button"
          onClick={onClear}
          className="absolute top-7 right-1 bg-surface-900/70 hover:bg-danger rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1">
      <p className="text-xs font-medium text-surface-500 mb-2">{label}</p>
      <button
        type="button"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
        className={`w-full aspect-video border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-surface-200'
            : 'border-surface-300 hover:border-brand-500 hover:bg-brand-500/5'
        }`}
      >
        <Upload className="w-8 h-8 text-surface-400" />
        <p className="text-xs text-surface-400 text-center px-2">Drop image or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </button>
    </div>
  )
}

function StartEndContent({ tabs }: { tabs: React.ReactNode }) {
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
    uploadStartEndFiles,
  } = useImg2VideoQueueStore()

  const [startFile, setStartFile] = useState<{ file: File; preview: string } | null>(null)
  const [endFile, setEndFile] = useState<{ file: File; preview: string } | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())

  // Filter for startEnd items only
  const startEndItems = queueOrder
    .map((id) => queueItems[id])
    .filter((item): item is QueueItem => !!item && item.workflowType === 'startEnd')
  const selectedItem = selectedId && queueItems[selectedId]?.workflowType === 'startEnd' ? queueItems[selectedId] : null

  const draftItems = startEndItems.filter((item) => item.status === 'draft')
  const queuedCount = startEndItems.filter((item) => item.status === 'queued').length
  const completedItems = startEndItems.filter((item) => item.status === 'completed')
  const failedCount = startEndItems.filter((item) => item.status === 'failed').length

  // Clean up previews on unmount only
  const startPreviewRef = useRef<string | null>(null)
  const endPreviewRef = useRef<string | null>(null)
  startPreviewRef.current = startFile?.preview ?? null
  endPreviewRef.current = endFile?.preview ?? null
  useEffect(() => {
    return () => {
      if (startPreviewRef.current) URL.revokeObjectURL(startPreviewRef.current)
      if (endPreviewRef.current) URL.revokeObjectURL(endPreviewRef.current)
    }
  }, [])

  const handleUploadPair = async () => {
    if (!startFile || !endFile) return
    await uploadStartEndFiles(startFile.file, endFile.file)
    URL.revokeObjectURL(startFile.preview)
    URL.revokeObjectURL(endFile.preview)
    setStartFile(null)
    setEndFile(null)
  }

  const toggleVideoSelection = (id: string) => {
    const newSet = new Set(selectedVideos)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {/* Step 1: Upload Start & End Frames */}
        <div className="bg-surface-50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              1
            </span>
            Start & End Frames
          </h2>
          <div className="mb-4">{tabs}</div>

          {/* Pending upload area */}
          {draftItems.length === 0 && (
            <>
              <div className="flex gap-3">
                <FrameDropZone
                  label="START FRAME"
                  imageUrl={startFile?.preview ?? null}
                  onDrop={(file) => setStartFile({ file, preview: URL.createObjectURL(file) })}
                  onClear={() => {
                    if (startFile) URL.revokeObjectURL(startFile.preview)
                    setStartFile(null)
                  }}
                  disabled={uploading}
                />
                <div className="flex items-center justify-center pt-6">
                  <ArrowRight className="w-5 h-5 text-surface-400" />
                </div>
                <FrameDropZone
                  label="END FRAME"
                  imageUrl={endFile?.preview ?? null}
                  onDrop={(file) => setEndFile({ file, preview: URL.createObjectURL(file) })}
                  onClear={() => {
                    if (endFile) URL.revokeObjectURL(endFile.preview)
                    setEndFile(null)
                  }}
                  disabled={uploading}
                />
              </div>
              {startFile && endFile && (
                <Button
                  variant="primary"
                  icon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  onClick={handleUploadPair}
                  disabled={uploading}
                  className="w-full mt-4"
                >
                  {uploading ? 'Uploading...' : 'Upload Pair'}
                </Button>
              )}
            </>
          )}

          {/* Existing draft/queued items */}
          {draftItems.length > 0 && (
            <div className="space-y-3">
              {draftItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2 rounded-lg border-2 transition-colors ${
                    selectedId === item.id
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-transparent hover:bg-surface-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectItem(item.id)}
                    className="flex gap-2 items-center flex-1 min-w-0 cursor-pointer"
                  >
                    {item.startEndImages && (
                      <>
                        <img
                          src={assetUrl(item.startEndImages.startImageUrl)}
                          alt="Start"
                          className="w-16 aspect-video rounded object-cover"
                        />
                        <ArrowRight className="w-4 h-4 text-surface-400 shrink-0" />
                        <img
                          src={assetUrl(item.startEndImages.endImageUrl)}
                          alt="End"
                          className="w-16 aspect-video rounded object-cover"
                        />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-surface-400 hover:text-danger shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setStartFile(null)
                  setEndFile(null)
                }}
                className="text-xs text-brand-500 hover:text-brand-600 font-medium"
              >
                + Add another pair
              </button>
            </div>
          )}

          {/* Queue stats */}
          {startEndItems.length > 0 && (
            <>
              <div className="flex gap-2 mt-3 text-xs">
                <StatusPill status="neutral" size="xs" label={`${startEndItems.length} Total`} />
                {completedItems.length > 0 && (
                  <StatusPill status="completed" size="xs" label={`${completedItems.length} Completed`} />
                )}
                {failedCount > 0 && <StatusPill status="failed" size="xs" label={`${failedCount} Failed`} />}
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              2
            </span>
            Prompt
          </h2>
          <Textarea
            value={selectedItem?.prompt || ''}
            onChange={(e) => selectedItem && setItemPrompt(selectedItem.id, e.target.value)}
            placeholder="Describe the transition... (e.g., 'smooth morphing transition between two poses, cinematic lighting')"
            rows={4}
          />
        </div>

        {/* Step 3: Settings */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
              3
            </span>
            Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
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

        {/* Step 5: Actions */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
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
        <LoadingGrid items={startEndItems.filter((item) => item.status === 'generating')} />

        {/* Generated Videos */}
        {completedItems.length > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Generated Videos</h3>
              {selectedVideos.size > 0 && (
                <Button variant="primary" size="xs" icon={<Download className="w-3 h-3" />} onClick={downloadSelected}>
                  Download {selectedVideos.size}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {completedItems.map((item) => {
                const isSelected = selectedVideos.has(item.id)
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`relative aspect-video rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
                      isSelected ? 'border-brand' : 'border-transparent'
                    }`}
                    onClick={() => {
                      selectItem(item.id)
                      toggleVideoSelection(item.id)
                    }}
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
                    <div className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-900/80 flex items-center justify-center z-10">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-brand" />
                      ) : (
                        <div className="w-3 h-3 border-2 border-surface-300 rounded" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
