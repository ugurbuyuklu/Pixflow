import { AlertCircle, CheckCircle, Copy, Download, Film, Loader2, Play, Trash2, Upload, X, XCircle } from 'lucide-react'
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
    selectedPresets,
    setPreset,
    clearPresets,
    setError,
    uploadFiles,
    generateAll,
    cancelGenerate,
  } = useImg2VideoStore()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: generating || uploading,
    onDrop: (accepted) => {
      if (accepted.length > 0) uploadFiles(accepted)
    },
  })

  const completedJobs = jobs.filter((j) => j.status === 'completed')
  const failedJobs = jobs.filter((j) => j.status === 'failed')
  const allPromptsSet = entries.length > 0 && entries.every((e) => e.prompt.trim())

  const handleDownload = (localPath: string) => {
    const link = document.createElement('a')
    link.href = assetUrl(localPath)
    link.download = localPath.split('/').pop() || 'video.mp4'
    link.click()
  }

  const handleDownloadAll = () => {
    for (const job of completedJobs) {
      if (job.localPath) handleDownload(job.localPath)
    }
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
          {!generating && jobs.every((j) => j.status !== 'completed') && (
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
                    disabled={uploading}
                    onClick={openFilePicker}
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
                  className="bg-surface-50 rounded-xl p-3 flex gap-3"
                >
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
              ))}
            </div>
          )}

          {/* Camera & Shot Presets */}
          {!generating && jobs.every((j) => j.status !== 'completed') && entries.length > 0 && (
            <div className="bg-surface-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                  Camera & Shot Presets
                </h2>
                {Object.keys(selectedPresets).length > 0 && (
                  <Button variant="ghost-muted" size="xs" onClick={clearPresets}>
                    Clear
                  </Button>
                )}
              </div>
              {VIDEO_PRESETS.map((category) => (
                <div key={category.key}>
                  <p className="text-xs text-surface-300 mb-1.5">{category.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {category.options.map((option) => (
                      <button
                        type="button"
                        key={option}
                        onClick={() => setPreset(category.key, option)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          selectedPresets[category.key] === option
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

          {/* Source images row during generation */}
          {(generating || jobs.some((j) => j.status === 'completed')) && (
            <div className="bg-surface-50 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider mb-3">
                Source Images ({entries.length})
              </h2>
              <div className="grid grid-cols-8 gap-2">
                {entries.map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static during generation
                  <div key={i} className="relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-100">
                    <img src={assetUrl(entry.url)} alt={`Source ${i + 1}`} className="w-full h-full object-cover" />
                    {jobs[i] && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {jobs[i].status === 'generating' && (
                          <div className="bg-black/60 rounded-full p-2">
                            <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                          </div>
                        )}
                        {jobs[i].status === 'completed' && (
                          <div className="bg-success/80 rounded-full p-2">
                            <CheckCircle className="w-5 h-5 text-white" />
                          </div>
                        )}
                        {jobs[i].status === 'failed' && (
                          <div className="bg-danger/80 rounded-full p-2">
                            <XCircle className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
                disabled={!allPromptsSet}
                className="w-full"
              >
                Generate {entries.length} Video{entries.length !== 1 ? 's' : ''}
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
