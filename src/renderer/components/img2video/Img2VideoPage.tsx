import JSZip from 'jszip'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Film,
  Loader2,
  Pencil,
  Play,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import React from 'react'
import { useDropzone } from 'react-dropzone'
import { assetUrl } from '../../lib/api'
import { ASPECT_RATIOS, DURATIONS, useImg2VideoStore, VIDEO_PRESETS } from '../../stores/img2videoStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

export default function Img2VideoPage() {
  const {
    entries,
    duration,
    aspectRatio,
    jobs,
    generating,
    uploading,
    error,
    removeEntry,
    clearEntries,
    setEntryPrompt,
    applyPromptToAll,
    setDuration,
    setAspectRatio,
    setPreset,
    clearPresets,
    setError,
    uploadFiles,
    generateAll,
    regenerateSingle,
    cancelJob,
    cancelGenerate,
  } = useImg2VideoStore()

  const [editingIndex, setEditingIndex] = React.useState<number | null>(null)
  const [editingPrompt, setEditingPrompt] = React.useState('')
  const [cameraControlOpen, setCameraControlOpen] = React.useState<Record<number, boolean>>({})

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,  // Only block during upload, not generation
    onDrop: (accepted) => {
      if (accepted.length > 0) uploadFiles(accepted)
    },
  })

  const completedJobs = jobs.filter((j) => j.status === 'completed')
  const failedJobs = jobs.filter((j) => j.status === 'failed')
  const allPromptsSet = entries.length > 0 && entries.every((e) => e.prompt.trim())

  // Count pending jobs (entries without jobs or with pending/failed status)
  const pendingCount = entries.filter((_, i) => {
    const job = jobs[i]
    return !job || job.status === 'pending' || job.status === 'failed'
  }).length

  const handleDownload = async (localPath: string) => {
    try {
      const url = assetUrl(localPath)
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = localPath.split('/').pop() || 'video.mp4'
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Failed to download video:', err)
    }
  }

  const handleDownloadAll = async () => {
    if (completedJobs.length === 0) return

    // Single video: direct download
    if (completedJobs.length === 1) {
      const job = completedJobs[0]
      if (job.localPath) await handleDownload(job.localPath)
      return
    }

    // Multiple videos: create ZIP
    const zip = new JSZip()
    await Promise.all(
      completedJobs.map(async (job, index) => {
        if (!job.localPath) return
        const res = await fetch(assetUrl(job.localPath))
        const blob = await res.blob()
        const fileName = job.localPath.split('/').pop() || `video_${String(index + 1).padStart(2, '0')}.mp4`
        zip.file(fileName, blob)
      }),
    )

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const blobUrl = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = 'img2video_videos.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }

  const openFilePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp'
    input.onchange = () => {
      if (input.files?.length) uploadFiles(Array.from(input.files))
    }
    input.click()
  }

  const handleAddMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    openFilePicker()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Film className="w-7 h-7 text-brand-400" />
        <h1 className="text-2xl font-bold">Img2Video</h1>
        <span className="text-surface-400 text-sm">Kling AI v2.5 Turbo Pro</span>
      </div>

      {entries.length === 0 && jobs.length === 0 ? (
        <div
          {...getRootProps()}
          className={`bg-surface-50 rounded-xl p-12 text-center border-2 border-dashed transition-colors cursor-pointer ${
            isDragActive ? 'border-brand-400 bg-brand-600/5' : 'border-surface-100 hover:border-surface-200'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-brand-400 mx-auto mb-4 animate-spin" />
              <p className="text-surface-400 text-lg">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-surface-300 mx-auto mb-4" />
              <p className="text-surface-400 text-lg mb-2">Drop images here or click to upload</p>
              <p className="text-surface-300 text-sm">
                Or select images in Asset Monster and click &quot;Send to Img2Video&quot;
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Per-image cards with individual prompts */}
          {entries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                  Images & Prompts ({entries.length})
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Upload className="w-3.5 h-3.5" />}
                    onClick={handleAddMoreClick}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Add More'}
                  </Button>
                  <Button
                    variant="ghost-danger"
                    size="xs"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={clearEntries}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              {entries.map((entry, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries reorder via remove only
                  key={i}
                  className="bg-surface-50 rounded-xl overflow-hidden"
                >
                  <div className="p-3 flex gap-3">
                    <div className="w-20 shrink-0 relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-100">
                      <img src={assetUrl(entry.url)} alt={`Source ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-surface-400">Image {i + 1}</span>
                        <div className="flex items-center gap-1">
                          {entry.prompt.trim() && entries.length > 1 && (
                            <Button
                              variant="ghost-muted"
                              size="xs"
                              icon={<Copy className="w-3 h-3" />}
                              onClick={() => applyPromptToAll(entry.prompt)}
                              title="Apply this prompt to all images"
                            >
                              Apply to all
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeEntry(i)}
                            className="p-1 text-surface-300 hover:text-danger transition-colors rounded"
                            title="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={entry.prompt}
                        onChange={(e) => setEntryPrompt(i, e.target.value)}
                        placeholder="Describe the motion (e.g., 'person slowly turns head and smiles at camera')"
                        className="w-full bg-surface-0 border border-surface-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none flex-1"
                        rows={3}
                      />
                    </div>
                  </div>

                  {/* Camera Control Panel */}
                  <div className="border-t border-surface-100">
                    <button
                      type="button"
                      onClick={() =>
                        setCameraControlOpen((prev) => ({
                          ...prev,
                          [i]: !prev[i],
                        }))
                      }
                      className="w-full flex items-center justify-between p-3 hover:bg-surface-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                          Camera Control
                        </h3>
                        {Object.keys(entry.presets).length > 0 && (
                          <Badge variant="primary" className="text-xs">
                            {Object.keys(entry.presets).length}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {Object.keys(entry.presets).length > 0 && (
                          <Button
                            variant="ghost-muted"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              clearPresets(i)
                            }}
                          >
                            Clear
                          </Button>
                        )}
                        {cameraControlOpen[i] ? (
                          <ChevronUp className="w-4 h-4 text-surface-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-surface-400" />
                        )}
                      </div>
                    </button>
                    {cameraControlOpen[i] && (
                      <div className="p-3 pt-0 space-y-2">
                        {VIDEO_PRESETS.map((category) => (
                          <div key={category.key}>
                            <p className="text-xs text-surface-300 mb-1">{category.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {category.options.map((option) => (
                                <button
                                  type="button"
                                  key={option}
                                  onClick={() => setPreset(i, category.key, option)}
                                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                    entry.presets[category.key] === option
                                      ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/50'
                                      : 'bg-surface-100 text-surface-400 hover:bg-surface-200'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Source images with editable prompts after generation */}
          {(generating || jobs.some((j) => j.status === 'completed')) && (
            <div className="bg-surface-50 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider mb-3">
                Source Images ({entries.length})
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {entries.map((entry, i) => {
                  const job = jobs[i]
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static during generation
                    <div key={i} className="bg-surface-0 rounded-lg overflow-hidden border border-surface-100">
                    <div className="relative aspect-[9/16] bg-surface-100">
                      <img src={assetUrl(entry.url)} alt={`Source ${i + 1}`} className="w-full h-full object-cover" />
                      {job && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {job.status === 'generating' && (
                            <>
                              <div className="bg-black/60 rounded-full p-3">
                                <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                              </div>
                              <button
                                type="button"
                                onClick={() => cancelJob(i)}
                                className="absolute top-2 right-2 bg-danger/80 hover:bg-danger rounded-full p-1.5 transition-colors"
                                title="Cancel generation"
                              >
                                <X className="w-4 h-4 text-white" />
                              </button>
                            </>
                          )}
                          {job.status === 'completed' && (
                            <div className="bg-success/80 rounded-full p-2">
                              <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                          )}
                          {job.status === 'failed' && (
                            <div className="bg-danger/80 rounded-full p-2">
                              <XCircle className="w-5 h-5 text-white" />
                            </div>
                          )}
                        </div>
                      )}
                      {/* Queued indicator for entries without jobs */}
                      {!job && generating && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-surface-800/80 rounded-full px-3 py-1.5">
                            <span className="text-xs font-medium text-surface-200">Queued</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-2">
                      {editingIndex === i ? (
                        <>
                          <textarea
                            value={editingPrompt}
                            onChange={(e) => setEditingPrompt(e.target.value)}
                            className="w-full h-20 text-xs bg-surface-50 border border-surface-200 rounded p-2 resize-none focus:outline-none focus:border-brand-500"
                            placeholder="Describe the video..."
                          />
                          <div className="flex gap-1">
                            <Button
                              variant="success"
                              size="xs"
                              onClick={() => {
                                setEntryPrompt(i, editingPrompt)
                                setEditingIndex(null)
                              }}
                              className="flex-1"
                            >
                              Save
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => setEditingIndex(null)} className="flex-1">
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-surface-500 line-clamp-2">{entry.prompt || 'No prompt'}</p>
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Pencil className="w-3 h-3" />}
                            onClick={() => {
                              setEditingIndex(i)
                              setEditingPrompt(entry.prompt)
                            }}
                            className="w-full"
                          >
                            Edit Prompt
                          </Button>
                          {job?.status === 'completed' && (
                            <Button
                              variant="secondary"
                              size="xs"
                              icon={<Play className="w-3 h-3" />}
                              onClick={() => regenerateSingle(i)}
                              className="w-full mt-1"
                            >
                              Generate Again
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Settings + Generate */}
          {!generating && jobs.every((j) => j.status !== 'completed') && (
            <div className="bg-surface-50 rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  options={DURATIONS.map((d) => ({ value: d, label: `${d} seconds` }))}
                />
                <Select
                  label="Aspect Ratio"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
                />
              </div>
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="w-5 h-5" />}
                onClick={generateAll}
                disabled={!allPromptsSet || pendingCount === 0}
                className="w-full"
              >
                {completedJobs.length > 0
                  ? `Generate ${pendingCount} More Video${pendingCount !== 1 ? 's' : ''}`
                  : `Generate ${pendingCount} Video${pendingCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div className="bg-surface-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                  <span className="text-sm font-medium">
                    Generating {jobs.filter((j) => j.status === 'completed').length}/{jobs.length}...
                  </span>
                </div>
                <Button variant="danger" size="xs" onClick={cancelGenerate}>
                  Cancel
                </Button>
              </div>
              <div className="w-full bg-surface-100 rounded-full h-2">
                <div
                  className="bg-brand-400 h-2 rounded-full transition-all"
                  style={{
                    width: `${(jobs.filter((j) => j.status === 'completed' || j.status === 'failed').length / jobs.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {completedJobs.length > 0 && (
            <div className="bg-surface-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                  Generated Videos ({completedJobs.length})
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="xs" icon={<Upload className="w-3.5 h-3.5" />} onClick={openFilePicker}>
                    Add More
                  </Button>
                  {completedJobs.length > 1 && (
                    <Button
                      variant="success"
                      size="xs"
                      icon={<Download className="w-3.5 h-3.5" />}
                      onClick={handleDownloadAll}
                    >
                      Download All
                    </Button>
                  )}
                  <Button
                    variant="ghost-danger"
                    size="xs"
                    onClick={() => {
                      clearEntries()
                    }}
                  >
                    Start Over
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {completedJobs.map((job) => (
                  <div
                    key={job.localPath}
                    className="bg-surface-0 rounded-lg overflow-hidden border border-surface-100"
                  >
                    {/* biome-ignore lint/a11y/useMediaCaption: AI-generated content, no captions available */}
                    <video controls src={assetUrl(job.localPath!)} className="w-full aspect-video" />
                    <div className="p-2 flex items-center justify-between">
                      <Badge variant="success">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ready
                      </Badge>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => handleDownload(job.localPath!)}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failures */}
          {failedJobs.length > 0 && !generating && (
            <div className="bg-danger-muted/50 border border-danger/40 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-danger font-medium">{failedJobs.length} video(s) failed</p>
                  {failedJobs.map((job) => (
                    <p key={job.imageUrl} className="text-sm text-danger/80 mt-1">
                      {job.error}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className={`rounded-lg p-4 flex items-start gap-3 ${
                error.type === 'warning'
                  ? 'bg-warning-muted/50 border border-warning/40'
                  : 'bg-danger-muted/50 border border-danger/40'
              }`}
            >
              <AlertCircle
                className={`w-5 h-5 shrink-0 mt-0.5 ${error.type === 'warning' ? 'text-warning' : 'text-danger'}`}
              />
              <p className={`flex-1 ${error.type === 'warning' ? 'text-warning' : 'text-danger'}`}>{error.message}</p>
              <Button
                variant="ghost-muted"
                size="xs"
                aria-label="Dismiss"
                icon={<X className="w-4 h-4" />}
                onClick={() => setError(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
