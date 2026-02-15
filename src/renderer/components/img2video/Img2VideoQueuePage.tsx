import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import {
  ASPECT_RATIOS,
  composePrompt,
  DURATIONS,
  IMG2IMG_ASPECT_RATIOS,
  IMG2IMG_FORMATS,
  IMG2IMG_RESOLUTIONS,
  type QueueItem,
  useImg2VideoQueueStore,
  type WorkflowType,
} from '../../stores/img2videoQueueStore'
import { createOutputHistoryId, useOutputHistoryStore } from '../../stores/outputHistoryStore'
import { StepHeader } from '../asset-monster/StepHeader'
import { PreviousGenerationsPanel } from '../shared/PreviousGenerationsPanel'
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

const resolveArtifactUrl = (item: QueueItem): string | undefined =>
  item.result?.localPath || item.result?.videoUrl || item.result?.imageUrl || item.imageUrl

const collectCompletedForWorkflow = (
  queueItems: Record<string, QueueItem>,
  workflowType: WorkflowType,
  excludeIds: Set<string>,
) =>
  Object.values(queueItems).filter(
    (item) => item.workflowType === workflowType && item.status === 'completed' && !excludeIds.has(item.id),
  )

const VIDEO_ASPECT_CLASS_BY_RATIO: Record<string, string> = {
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '3:4': 'aspect-[3/4]',
  '4:5': 'aspect-[4/5]',
  '5:4': 'aspect-[5/4]',
  '3:2': 'aspect-[3/2]',
  '2:3': 'aspect-[2/3]',
  '21:9': 'aspect-[21/9]',
}

export default function Img2VideoQueuePage() {
  const { queueItems, queueOrder } = useImg2VideoQueueStore()
  const [activeTab, setActiveTab] = useState<ImageLabTab>('img2img')

  // Auto-switch to tab with content only when queue items change (not on tab change)
  const prevQueueOrderRef = useRef(queueOrder)
  useEffect(() => {
    if (prevQueueOrderRef.current === queueOrder) return
    prevQueueOrderRef.current = queueOrder
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

  const modeStep = (
    <div className="bg-surface-50 rounded-lg p-4 space-y-4">
      <StepHeader stepNumber={1} title="Mode" />
      <SegmentedTabs
        ariaLabel="Image Lab workflow"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'img2img', label: 'img2img', icon: <Image className="w-4 h-4" /> },
          { id: 'img2video', label: 'img2video', icon: <Film className="w-4 h-4" /> },
          { id: 'startEnd', label: 'Start2End', icon: <ArrowRight className="w-4 h-4" /> },
        ]}
        className="w-full"
      />
    </div>
  )

  return (
    <div className="space-y-6">
      {activeTab === 'img2img' && <Img2ImgContent modeStep={modeStep} />}
      {activeTab === 'img2video' && <Img2VideoContent modeStep={modeStep} />}
      {activeTab === 'startEnd' && <StartEndContent modeStep={modeStep} />}
    </div>
  )
}

// ============================================================================
// IMG2IMG TAB
// ============================================================================

function Img2ImgContent({ modeStep }: { modeStep: React.ReactNode }) {
  const { queueItems, queueOrder, selectedId, uploading, selectItem, transformBatch, removeItem, uploadFiles } =
    useImg2VideoQueueStore()
  const activeHistoryIdRef = useRef<string | null>(null)

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
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => outputHistoryEntries.filter((entry) => entry.category === 'img2img'),
    [outputHistoryEntries],
  )

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

  const handleTransformBatch = async () => {
    const ids = referenceItems.map((item) => item.id)
    if (!batchPrompt.trim() || ids.length === 0) return

    const beforeCompletedIds = new Set(
      Object.values(useImg2VideoQueueStore.getState().queueItems)
        .filter((item) => item.workflowType === 'img2img' && item.status === 'completed')
        .map((item) => item.id),
    )

    const historyId = createOutputHistoryId('img2img')
    activeHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'img2img',
      title: `img2img (${ids.length} input, ${batchSettings.numberOfOutputs} output)`,
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Transforming images...',
      artifacts: [],
    })

    await transformBatch(ids, batchPrompt, batchSettings)
    if (activeHistoryIdRef.current !== historyId) return

    const state = useImg2VideoQueueStore.getState()
    const newlyCompleted = collectCompletedForWorkflow(state.queueItems, 'img2img', beforeCompletedIds)
    const failedCount = ids.filter((id) => state.queueItems[id]?.status === 'failed').length

    if (newlyCompleted.length > 0) {
      patchHistory(historyId, {
        status: 'completed',
        message:
          failedCount > 0
            ? `${newlyCompleted.length} output completed, ${failedCount} failed`
            : `${newlyCompleted.length} output completed`,
        artifacts: newlyCompleted
          .map((item) => ({
            id: `${historyId}_${item.id}`,
            label: `Output ${item.id.slice(-4)}`,
            type: 'image' as const,
            url: resolveArtifactUrl(item),
          }))
          .filter((artifact) => Boolean(artifact.url)),
      })
    } else {
      patchHistory(historyId, {
        status: 'failed',
        message: 'No output image generated',
        artifacts: [],
      })
    }

    activeHistoryIdRef.current = null
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {modeStep}
        {/* Step 2: Select Images */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Select Images" />
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
          {img2imgItems.length > 0 && (
            <div className="flex gap-2 mt-3 text-xs">
              <StatusPill status="neutral" size="xs" label={`${totalCount} Total`} />
              {completedCount > 0 && <StatusPill status="completed" size="xs" label={`${completedCount} Completed`} />}
              {failedCount > 0 && <StatusPill status="failed" size="xs" label={`${failedCount} Failed`} />}
            </div>
          )}
        </div>

        {/* Step 3: Prompt */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <StepHeader stepNumber={3} title="Prompt" />
          <Textarea
            value={batchPrompt}
            onChange={(e) => setBatchPrompt(e.target.value)}
            placeholder="Describe how to transform these images... (e.g., 'photo of the 5 friends in paris. eiffel tower behind them. sunny day, golden hour.')"
            rows={4}
            className="w-full"
          />
        </div>

        {/* Step 4: Settings */}
        <div
          className={`bg-surface-50 rounded-lg p-4 ${img2imgItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <StepHeader stepNumber={4} title="Settings" />
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
          <div className="pt-4 mt-4 border-t border-surface-200/60">
            {generatingCount === 0 && (
              <button
                type="button"
                onClick={handleTransformBatch}
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
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Images in Progress */}
        <LoadingGrid items={img2imgItems.filter((item) => item.status === 'generating')} />

        {/* Step 5: Final Outputs */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-xs text-white">
                  5
                </span>
                Final Outputs
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
        <PreviousGenerationsPanel
          entries={historyEntries}
          onDeleteEntry={removeHistory}
          onClear={() => removeManyHistory(historyEntries.map((entry) => entry.id))}
        />
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

function Img2VideoContent({ modeStep }: { modeStep: React.ReactNode }) {
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
    removeItem,
    uploadFiles,
  } = useImg2VideoQueueStore()
  const activeHistoryIdRef = useRef<string | null>(null)
  const [cameraControlsOpen, setCameraControlsOpen] = useState(false)

  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => outputHistoryEntries.filter((entry) => entry.category === 'img2video'),
    [outputHistoryEntries],
  )

  // Filter for img2video items only
  const img2videoItems = queueOrder.map((id) => queueItems[id]).filter((item) => item.workflowType === 'img2video')
  const selectedItem =
    selectedId && queueItems[selectedId]?.workflowType === 'img2video' ? queueItems[selectedId] : null

  // Stats
  const totalCount = img2videoItems.length
  const completedCount = img2videoItems.filter((item) => item.status === 'completed').length
  const failedCount = img2videoItems.filter((item) => item.status === 'failed').length

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

  const handleGenerateVideosBatch = async () => {
    if (generating) return

    const candidates = img2videoItems.filter(
      (item) =>
        item.prompt.trim() &&
        (item.status === 'draft' || item.status === 'queued' || item.status === 'failed' || item.status === 'paused'),
    )

    if (candidates.length === 0) return

    for (const item of candidates) {
      if (item.status !== 'queued') {
        queueItem(item.id)
      }
    }

    const queuedIds = useImg2VideoQueueStore.getState().queueOrder.filter((id) => {
      const item = useImg2VideoQueueStore.getState().queueItems[id]
      return item?.workflowType === 'img2video' && item.status === 'queued'
    })
    if (queuedIds.length === 0) return

    const beforeCompletedIds = new Set(
      Object.values(useImg2VideoQueueStore.getState().queueItems)
        .filter((item) => item.workflowType === 'img2video' && item.status === 'completed')
        .map((item) => item.id),
    )

    const historyId = createOutputHistoryId('img2video')
    activeHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'img2video',
      title: `img2video batch (${queuedIds.length} item${queuedIds.length === 1 ? '' : 's'})`,
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Generating videos...',
      artifacts: [],
    })

    await generateQueue()
    if (activeHistoryIdRef.current !== historyId) return

    const state = useImg2VideoQueueStore.getState()
    const newlyCompleted = collectCompletedForWorkflow(state.queueItems, 'img2video', beforeCompletedIds)
    const failedCount = queuedIds.filter((id) => state.queueItems[id]?.status === 'failed').length

    if (newlyCompleted.length > 0) {
      patchHistory(historyId, {
        status: 'completed',
        message:
          failedCount > 0
            ? `${newlyCompleted.length} completed, ${failedCount} failed`
            : `${newlyCompleted.length} video${newlyCompleted.length === 1 ? '' : 's'} completed`,
        artifacts: newlyCompleted
          .map((item) => ({
            id: `${historyId}_${item.id}`,
            label: `Video ${item.id.slice(-4)}`,
            type: 'video' as const,
            url: resolveArtifactUrl(item),
          }))
          .filter((artifact) => Boolean(artifact.url)),
      })
    } else {
      patchHistory(historyId, {
        status: 'failed',
        message: 'No completed output in this run',
        artifacts: [],
      })
    }

    activeHistoryIdRef.current = null
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {modeStep}
        {/* Step 2: Select Images */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Select Images" />
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
          {/* Queue stats */}
          {img2videoItems.length > 0 && (
            <div className="flex gap-2 mt-3 text-xs">
              <StatusPill status="neutral" size="xs" label={`${totalCount} Total`} />
              {completedCount > 0 && <StatusPill status="completed" size="xs" label={`${completedCount} Completed`} />}
              {failedCount > 0 && <StatusPill status="failed" size="xs" label={`${failedCount} Failed`} />}
            </div>
          )}
        </div>

        {/* Step 3: Prompt */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <StepHeader stepNumber={3} title="Prompt" />
          <Textarea
            value={selectedItem?.prompt || ''}
            onChange={(e) => selectedItem && setItemPrompt(selectedItem.id, e.target.value)}
            placeholder="Describe the video motion... (e.g., 'camera zooms in slowly', 'gentle pan from left to right')"
            rows={4}
          />
          {selectedItem && Object.values(selectedItem.presets).flat().length > 0 && (
            <div className="mt-2 px-3 py-2 bg-surface-100 rounded-lg border border-surface-200/60">
              <p className="text-[10px] font-medium text-surface-400 mb-1">FINAL PROMPT</p>
              <p className="text-xs text-surface-300 break-words">
                {composePrompt(selectedItem.prompt || '', selectedItem.presets)}
              </p>
            </div>
          )}
        </div>

        {/* Step 4: Camera Controls */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
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
            <Button
              variant="ghost-muted"
              size="xs"
              onClick={() => setCameraControlsOpen((prev) => !prev)}
              icon={cameraControlsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            >
              {cameraControlsOpen ? 'Hide' : 'Show'}
            </Button>
          </div>
          {cameraControlsOpen && (
            <CameraPresetCards
              selectedPresets={selectedItem?.presets || {}}
              onPresetsChange={(presets) => selectedItem && setItemPresets(selectedItem.id, presets)}
            />
          )}
        </div>

        {/* Step 5: Settings */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <StepHeader stepNumber={5} title="Settings" />
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
          <div className="pt-4 mt-4 border-t border-surface-200/60">
            <Button
              variant="lime"
              icon={generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              onClick={handleGenerateVideosBatch}
              disabled={generating || !img2videoItems.some((item) => item.prompt.trim())}
              className="w-full"
            >
              {generating ? 'Generating Videos...' : 'Generate Videos'}
            </Button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        {/* Videos in Progress */}
        <LoadingGrid items={img2videoItems.filter((item) => item.status === 'generating')} />

        {/* Generated Videos */}
        {completedCount > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={6} title="Generated Videos" />
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-surface-400">{completedCount} completed</div>
              <DownloadToolbar
                onDownloadAll={() => {
                  img2videoItems
                    .filter((item) => item.status === 'completed' && item.result?.localPath)
                    .forEach((item) => {
                      const a = document.createElement('a')
                      a.href = assetUrl(item.result!.localPath)
                      a.download = item.result!.localPath.split('/').pop() || 'video.mp4'
                      a.click()
                    })
                }}
                onDownloadSelected={downloadSelected}
                selectedCount={selectedVideos.size}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {img2videoItems
                .filter((item) => item.status === 'completed')
                .map((item) => {
                  const isSelected = selectedVideos.has(item.id)
                  const ratio = item.settings?.aspectRatio || '9:16'
                  const aspectClass = VIDEO_ASPECT_CLASS_BY_RATIO[ratio] || 'aspect-video'
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`relative ${aspectClass} rounded-lg overflow-hidden bg-surface-100 cursor-pointer group border-2 transition-colors ${
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
        <PreviousGenerationsPanel
          entries={historyEntries}
          onDeleteEntry={removeHistory}
          onClear={() => removeManyHistory(historyEntries.map((entry) => entry.id))}
        />
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

function StartEndContent({ modeStep }: { modeStep: React.ReactNode }) {
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
    removeItem,
    uploadStartEndFiles,
  } = useImg2VideoQueueStore()
  const activeHistoryIdRef = useRef<string | null>(null)

  const [startFile, setStartFile] = useState<{ file: File; preview: string } | null>(null)
  const [endFile, setEndFile] = useState<{ file: File; preview: string } | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const [cameraControlsOpen, setCameraControlsOpen] = useState(false)
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => outputHistoryEntries.filter((entry) => entry.category === 'startend'),
    [outputHistoryEntries],
  )

  const startEndItems = queueOrder
    .map((id) => queueItems[id])
    .filter((item): item is QueueItem => !!item && item.workflowType === 'startEnd')
  const selectedItem = selectedId && queueItems[selectedId]?.workflowType === 'startEnd' ? queueItems[selectedId] : null

  const draftItems = startEndItems.filter((item) => item.status === 'draft')
  const completedItems = startEndItems.filter((item) => item.status === 'completed')
  const generatingItems = startEndItems.filter((item) => item.status === 'generating')
  const queuedItems = startEndItems.filter((item) => item.status === 'queued')

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

  // Auto-upload when both files are selected
  const uploadingRef = useRef(false)
  useEffect(() => {
    if (!startFile || !endFile || uploadingRef.current) return
    uploadingRef.current = true
    const doUpload = async () => {
      const oldDraftIds = draftItems.map((d) => d.id)
      const newId = await uploadStartEndFiles(startFile.file, endFile.file)
      if (newId) {
        for (const id of oldDraftIds) removeItem(id)
      }
      URL.revokeObjectURL(startFile.preview)
      URL.revokeObjectURL(endFile.preview)
      setStartFile(null)
      setEndFile(null)
      uploadingRef.current = false
    }
    doUpload()
  }, [startFile, endFile, uploadStartEndFiles, draftItems, removeItem])

  const handleGenerateVideo = async () => {
    if (!selectedItem || !selectedItem.prompt.trim() || generating) return

    const beforeCompletedIds = new Set(
      Object.values(useImg2VideoQueueStore.getState().queueItems)
        .filter((item) => item.workflowType === 'startEnd' && item.status === 'completed')
        .map((item) => item.id),
    )

    const historyId = createOutputHistoryId('startend')
    activeHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'startend',
      title: 'Start2End video',
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Generating transition video...',
      artifacts: [],
    })

    queueItem(selectedItem.id)
    await generateQueue()
    if (activeHistoryIdRef.current !== historyId) return

    const state = useImg2VideoQueueStore.getState()
    const newlyCompleted = collectCompletedForWorkflow(state.queueItems, 'startEnd', beforeCompletedIds)
    const selectedItemStatus = state.queueItems[selectedItem.id]?.status

    if (newlyCompleted.length > 0) {
      patchHistory(historyId, {
        status: 'completed',
        message: `${newlyCompleted.length} video completed`,
        artifacts: newlyCompleted
          .map((item) => ({
            id: `${historyId}_${item.id}`,
            label: `Transition ${item.id.slice(-4)}`,
            type: 'video' as const,
            url: resolveArtifactUrl(item),
          }))
          .filter((artifact) => Boolean(artifact.url)),
      })
    } else {
      patchHistory(historyId, {
        status: 'failed',
        message:
          selectedItemStatus === 'paused'
            ? 'Paused by user'
            : state.queueItems[selectedItem.id]?.error || 'No completed output in this run',
        artifacts: [],
      })
    }

    activeHistoryIdRef.current = null
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

  const isGenerating = generating || generatingItems.length > 0

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT COLUMN: INPUTS */}
      <div className="space-y-6">
        {modeStep}
        {/* Step 2: Start & End Frames */}
        <div className="bg-surface-50 rounded-lg p-4">
          <StepHeader stepNumber={2} title="Start & End Frames" />

          <div className="flex gap-3">
            <FrameDropZone
              label="START FRAME"
              imageUrl={startFile?.preview ?? selectedItem?.startEndImages?.startImageUrl ?? null}
              onDrop={(file) => setStartFile({ file, preview: URL.createObjectURL(file) })}
              onClear={() => {
                if (startFile) {
                  URL.revokeObjectURL(startFile.preview)
                  setStartFile(null)
                }
                if (endFile) {
                  URL.revokeObjectURL(endFile.preview)
                  setEndFile(null)
                }
                if (selectedItem?.status === 'draft') removeItem(selectedItem.id)
              }}
              disabled={uploading}
            />
            <div className="flex items-center justify-center pt-6">
              <ArrowRight className="w-5 h-5 text-surface-400" />
            </div>
            <FrameDropZone
              label="END FRAME"
              imageUrl={endFile?.preview ?? selectedItem?.startEndImages?.endImageUrl ?? null}
              onDrop={(file) => setEndFile({ file, preview: URL.createObjectURL(file) })}
              onClear={() => {
                if (startFile) {
                  URL.revokeObjectURL(startFile.preview)
                  setStartFile(null)
                }
                if (endFile) {
                  URL.revokeObjectURL(endFile.preview)
                  setEndFile(null)
                }
                if (selectedItem?.status === 'draft') removeItem(selectedItem.id)
              }}
              disabled={uploading}
            />
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 mt-3 text-sm text-surface-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading frames...
            </div>
          )}
        </div>

        {/* Step 3: Prompt */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <StepHeader stepNumber={3} title="Prompt" />
          <Textarea
            value={selectedItem?.prompt || ''}
            onChange={(e) => selectedItem && setItemPrompt(selectedItem.id, e.target.value)}
            placeholder="Describe the transition... (e.g., 'smooth morphing transition between two poses, cinematic lighting')"
            rows={4}
          />
          {selectedItem && Object.values(selectedItem.presets).flat().length > 0 && (
            <div className="mt-2 px-3 py-2 bg-surface-100 rounded-lg border border-surface-200/60">
              <p className="text-[10px] font-medium text-surface-400 mb-1">FINAL PROMPT</p>
              <p className="text-xs text-surface-300 break-words">
                {composePrompt(selectedItem.prompt || '', selectedItem.presets)}
              </p>
            </div>
          )}
        </div>

        {/* Step 4: Camera Controls */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
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
            <Button
              variant="ghost-muted"
              size="xs"
              onClick={() => setCameraControlsOpen((prev) => !prev)}
              icon={cameraControlsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            >
              {cameraControlsOpen ? 'Hide' : 'Show'}
            </Button>
          </div>
          {cameraControlsOpen && (
            <CameraPresetCards
              selectedPresets={selectedItem?.presets || {}}
              onPresetsChange={(presets) => selectedItem && setItemPresets(selectedItem.id, presets)}
            />
          )}
        </div>

        {/* Step 5: Settings */}
        <div className={`bg-surface-50 rounded-lg p-4 ${!selectedItem ? 'opacity-50 pointer-events-none' : ''}`}>
          <StepHeader stepNumber={5} title="Settings" />
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
          <div className="pt-4 mt-4 border-t border-surface-200/60">
            <Button
              variant="lime"
              icon={isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              onClick={handleGenerateVideo}
              disabled={!selectedItem || !selectedItem.prompt.trim() || isGenerating}
              className="w-full"
            >
              {isGenerating ? 'Generating...' : 'Generate Video'}
            </Button>
          </div>
        </div>
        {selectedItem?.status === 'failed' && selectedItem.error && (
          <div className="mt-2 px-3 py-2 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-xs text-danger">{selectedItem.error}</p>
          </div>
        )}
        {(selectedItem?.status === 'generating' || selectedItem?.status === 'queued') && (
          <div className="mt-2 flex items-center gap-2 text-xs text-surface-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating video, this may take a few minutes...
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: OUTPUTS */}
      <div className="space-y-6">
        <LoadingGrid items={[...queuedItems, ...generatingItems]} />

        {completedItems.length > 0 && (
          <div className="bg-surface-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm text-white">
                  5
                </span>
                Final Outputs ({completedItems.length})
              </h2>
              {selectedVideos.size > 0 && (
                <Button variant="primary" size="xs" icon={<Download className="w-3 h-3" />} onClick={downloadSelected}>
                  Download {selectedVideos.size}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {completedItems.map((item) => {
                const isSelected = selectedVideos.has(item.id)
                return (
                  <div key={item.id} className="space-y-2">
                    <button
                      type="button"
                      className={`relative w-full aspect-video rounded-lg overflow-hidden bg-surface-100 group border-2 transition-colors cursor-pointer ${
                        isSelected ? 'border-brand' : 'border-surface-200'
                      }`}
                      onClick={() => {
                        selectItem(item.id)
                        toggleVideoSelection(item.id)
                      }}
                    >
                      <video
                        src={assetUrl(item.result?.localPath || '')}
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
                        <Play className="w-8 h-8 text-white" />
                      </div>
                      <div className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-900/80 flex items-center justify-center">
                        {isSelected ? (
                          <Check className="w-4 h-4 text-brand" />
                        ) : (
                          <div className="w-3 h-3 border-2 border-surface-300 rounded" />
                        )}
                      </div>
                    </button>
                    <Button
                      variant="primary"
                      size="xs"
                      icon={<Download className="w-3 h-3" />}
                      onClick={() => {
                        if (item.result?.localPath) {
                          const a = document.createElement('a')
                          a.href = assetUrl(item.result.localPath)
                          a.download = item.result.localPath.split('/').pop() || 'video.mp4'
                          a.click()
                        }
                      }}
                      className="w-full"
                    >
                      Download
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <PreviousGenerationsPanel
          entries={historyEntries}
          onDeleteEntry={removeHistory}
          onClear={() => removeManyHistory(historyEntries.map((entry) => entry.id))}
        />
      </div>
    </div>
  )
}
