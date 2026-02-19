import { Check, Download, Film, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { notify } from '../../lib/toast'
import {
  createOutputHistoryId,
  selectPreviousGenerations,
  useOutputHistoryStore,
} from '../../stores/outputHistoryStore'
import { StepHeader } from '../asset-monster/StepHeader'
import { PreviousGenerationsPanel } from '../shared/PreviousGenerationsPanel'
import { Button } from '../ui/Button'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { ProgressBar } from '../ui/ProgressBar'
import { Slider } from '../ui/Slider'
import { StatusBanner } from '../ui/StatusBanner'

interface LifetimeFrame {
  age: number
  imageUrl: string
}

interface TransitionStatus {
  fromAge: number
  toAge: number
  status: 'pending' | 'in_progress' | 'completed'
}

type AssemblyStage = 'idle' | 'editing' | 'adjusting_time' | 'finalizing' | 'done'

interface LifetimeVideoJobStatus {
  status: 'queued' | 'running' | 'completed' | 'failed'
  sessionId?: string
  outputDirUrl?: string
  outputDirLocal?: string
  error?: string
  progress?: {
    total: number
    completed: number
    currentStep: string
    message: string
  }
  assemblyStage?: AssemblyStage
  finalVideoUrl?: string
  finalVideoDurationSec?: number
}

interface LifetimeRunStatus {
  status: 'queued' | 'running' | 'completed' | 'failed'
  sessionId?: string
  outputDirUrl?: string
  outputDirLocal?: string
  error?: string
  sourceFrameUrl?: string
  progress?: {
    total: number
    completed: number
    currentAge: number | null
    message: string
  }
  frames?: LifetimeFrame[]
  earlyTransitionStatuses?: TransitionStatus[]
}

type LifetimeBackgroundMode = 'white_bg' | 'natural_bg'
type LifetimeGenderHint = 'auto' | 'male' | 'female'
const LIFETIME_AGES = [7, 12, 18, 25, 35, 45, 55, 65, 75]
const LIFETIME_DISPLAY_AGES = [0, ...LIFETIME_AGES]
const VIDEO_DURATION_MIN_SEC = 8
const VIDEO_DURATION_MAX_SEC = 45
const VIDEO_DURATION_DEFAULT_SEC = 12

const BACKGROUND_MODE_OPTIONS = [
  { id: 'white_bg' as const, label: 'White BG' },
  { id: 'natural_bg' as const, label: 'Natural BG' },
]

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeLifetimeErrorMessage(message: string): string {
  const raw = message.trim()
  if (!raw) return 'Failed to generate lifetime images'

  // Collapse accidental repeated concatenations.
  const legacy = 'Failed to run Lifetime pipeline'
  if (raw.includes(legacy)) {
    const count = raw.split(legacy).length - 1
    if (count >= 1) return 'Failed to generate lifetime images'
  }

  return raw
}

export default function LifetimePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const runPollRef = useRef<number | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const videoPollRef = useRef<number | null>(null)
  const activeVideoJobIdRef = useRef<string | null>(null)
  const activeLifetimeHistoryIdRef = useRef<string | null>(null)
  const autoVideoTriggeredRef = useRef(false)
  const [babyFile, setBabyFile] = useState<File | null>(null)
  const [babyImageUrl, setBabyImageUrl] = useState('')
  const [backgroundMode, setBackgroundMode] = useState<LifetimeBackgroundMode>('white_bg')
  const [genderHint, setGenderHint] = useState<LifetimeGenderHint>('auto')
  const [running, setRunning] = useState(false)
  const [creatingVideos, setCreatingVideos] = useState(false)
  const [runMessage, setRunMessage] = useState('')
  const [runError, setRunError] = useState<string | null>(null)
  const [sourceFrameUrl, setSourceFrameUrl] = useState('')
  const [progress, setProgress] = useState(0)
  const [frames, setFrames] = useState<LifetimeFrame[]>([])
  const [videoDurationSec, setVideoDurationSec] = useState(VIDEO_DURATION_DEFAULT_SEC)
  const [outputSessionId, setOutputSessionId] = useState('')
  const [outputDirUrl, setOutputDirUrl] = useState('')
  const [outputDirLocal, setOutputDirLocal] = useState('')
  const [finalVideoUrl, setFinalVideoUrl] = useState('')
  const [finalVideoDurationSec, setFinalVideoDurationSec] = useState(0)
  const [transitionStatuses, setTransitionStatuses] = useState<TransitionStatus[]>([])
  const [assemblyStage, setAssemblyStage] = useState<AssemblyStage>('idle')
  const outputHistoryEntries = useOutputHistoryStore((state) => state.entries)
  const upsertHistory = useOutputHistoryStore((state) => state.upsert)
  const patchHistory = useOutputHistoryStore((state) => state.patch)
  const removeHistory = useOutputHistoryStore((state) => state.remove)
  const removeManyHistory = useOutputHistoryStore((state) => state.removeMany)
  const historyEntries = useMemo(
    () => selectPreviousGenerations(outputHistoryEntries, 'lifetime'),
    [outputHistoryEntries],
  )

  const inputPreviewUrl = useMemo(() => {
    if (babyFile) return URL.createObjectURL(babyFile)
    if (babyImageUrl && isHttpUrl(babyImageUrl)) return babyImageUrl
    return ''
  }, [babyFile, babyImageUrl])

  const displayFrames = useMemo(() => {
    const byAge = new Map(frames.map((frame) => [frame.age, frame]))
    const sourceFromFrames = byAge.get(0)?.imageUrl || ''
    const resolvedSourceImage = sourceFrameUrl || sourceFromFrames
    const hasAnyAgeFrame = frames.some((frame) => frame.age > 0 && !!frame.imageUrl)
    const canShowAges = backgroundMode === 'white_bg' ? !!resolvedSourceImage || (!running && hasAnyAgeFrame) : true
    return LIFETIME_DISPLAY_AGES.map((age) => {
      if (age === 0) {
        if (resolvedSourceImage) return { age: 0, imageUrl: resolvedSourceImage }
        return { age: 0, imageUrl: '' }
      }
      if (!canShowAges) return { age, imageUrl: '' }
      return byAge.get(age) || { age, imageUrl: '' }
    })
  }, [frames, sourceFrameUrl, backgroundMode, running])

  const shouldShowLifetimeFrames = running || !!sourceFrameUrl || frames.length > 0
  const hasAnyTransitionStarted = transitionStatuses.some((t) => t.status !== 'pending')
  const inProgressTransitions = transitionStatuses.filter((t) => t.status === 'in_progress')
  const completedTransitions = transitionStatuses.filter((t) => t.status === 'completed')

  useEffect(() => {
    return () => {
      if (inputPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(inputPreviewUrl)
    }
  }, [inputPreviewUrl])

  useEffect(() => {
    return () => {
      if (runPollRef.current) window.clearInterval(runPollRef.current)
      activeJobIdRef.current = null
      if (videoPollRef.current) window.clearInterval(videoPollRef.current)
      activeVideoJobIdRef.current = null
    }
  }, [])

  const resetLifetimeResults = () => {
    if (runPollRef.current) {
      window.clearInterval(runPollRef.current)
      runPollRef.current = null
    }
    activeJobIdRef.current = null
    if (videoPollRef.current) {
      window.clearInterval(videoPollRef.current)
      videoPollRef.current = null
    }
    activeVideoJobIdRef.current = null
    autoVideoTriggeredRef.current = false
    setRunning(false)
    setCreatingVideos(false)
    setRunMessage('')
    setProgress(0)
    setSourceFrameUrl('')
    setFrames([])
    setOutputSessionId('')
    setOutputDirUrl('')
    setOutputDirLocal('')
    setTransitionStatuses([])
    setAssemblyStage('idle')
    setFinalVideoUrl('')
    setFinalVideoDurationSec(0)
  }

  const triggerVideoCreation = async (completedSessionId: string) => {
    if (autoVideoTriggeredRef.current) return
    autoVideoTriggeredRef.current = true
    setCreatingVideos(true)
    setAssemblyStage('idle')
    setFinalVideoUrl('')
    setFinalVideoDurationSec(0)
    try {
      const res = await authFetch(apiUrl('/api/lifetime/create-videos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: completedSessionId, targetDurationSec: videoDurationSec }),
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to create lifetime videos'))
      }
      const raw = await res.json().catch(() => ({}))
      const data = unwrapApiData<{ jobId: string }>(raw)
      if (!data.jobId) throw new Error('Video job id missing from server response')
      startVideoPolling(data.jobId)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to create lifetime videos')
      autoVideoTriggeredRef.current = false
      setCreatingVideos(false)
    }
  }

  const startRunPolling = (jobId: string) => {
    if (runPollRef.current) {
      window.clearInterval(runPollRef.current)
      runPollRef.current = null
    }
    activeJobIdRef.current = jobId

    const poll = async () => {
      if (activeJobIdRef.current !== jobId) return
      try {
        const res = await authFetch(apiUrl(`/api/lifetime/run-status/${encodeURIComponent(jobId)}`))
        if (activeJobIdRef.current !== jobId) return
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `Failed to check generation status (${res.status})`))
        }

        const raw = await res.json().catch(() => ({}))
        const data = unwrapApiData<LifetimeRunStatus>(raw)
        const progressData = data.progress
        if (progressData) {
          const pct = progressData.total > 0 ? Math.round((progressData.completed / progressData.total) * 100) : 0
          setProgress(pct)
          setRunMessage(progressData.message || '')
        }
        if (data.frames) setFrames(data.frames)
        if (data.sourceFrameUrl) setSourceFrameUrl(data.sourceFrameUrl)
        if (data.outputDirUrl) setOutputDirUrl(data.outputDirUrl)
        if (data.outputDirLocal) setOutputDirLocal(data.outputDirLocal)
        if (data.earlyTransitionStatuses) setTransitionStatuses(data.earlyTransitionStatuses)

        if (data.status === 'completed') {
          if (activeJobIdRef.current !== jobId) return
          if (runPollRef.current) {
            window.clearInterval(runPollRef.current)
            runPollRef.current = null
          }
          activeJobIdRef.current = null
          setRunning(false)
          const resolvedSessionId = data.sessionId || ''
          setOutputSessionId(resolvedSessionId)
          if (data.outputDirUrl) setOutputDirUrl(data.outputDirUrl)
          if (data.outputDirLocal) setOutputDirLocal(data.outputDirLocal)
          setRunMessage('Frame generation completed')
          setProgress(100)
          if (activeLifetimeHistoryIdRef.current) {
            patchHistory(activeLifetimeHistoryIdRef.current, {
              status: 'running',
              message: 'Frames completed, creating final video...',
            })
          }
          if (resolvedSessionId) {
            void triggerVideoCreation(resolvedSessionId)
          }
          return
        }

        if (data.status === 'failed') {
          if (activeJobIdRef.current !== jobId) return
          if (runPollRef.current) {
            window.clearInterval(runPollRef.current)
            runPollRef.current = null
          }
          activeJobIdRef.current = null
          setRunning(false)
          setRunMessage('Frame generation failed')
          if (activeLifetimeHistoryIdRef.current) {
            patchHistory(activeLifetimeHistoryIdRef.current, {
              status: 'failed',
              message: data.error || 'Failed to generate lifetime frames',
            })
            activeLifetimeHistoryIdRef.current = null
          }
          notify.error(data.error || 'Failed to generate lifetime frames')
          setRunError(data.error || 'Failed to generate lifetime frames')
        }
      } catch (error) {
        if (activeJobIdRef.current !== jobId) return
        if (runPollRef.current) {
          window.clearInterval(runPollRef.current)
          runPollRef.current = null
        }
        activeJobIdRef.current = null
        setRunning(false)
        if (activeLifetimeHistoryIdRef.current) {
          patchHistory(activeLifetimeHistoryIdRef.current, {
            status: 'failed',
            message: error instanceof Error ? error.message : 'Failed to track frame generation',
          })
          activeLifetimeHistoryIdRef.current = null
        }
        notify.error(error instanceof Error ? error.message : 'Failed to track frame generation')
        setRunError(error instanceof Error ? error.message : 'Failed to track frame generation')
      }
    }

    void poll()
    runPollRef.current = window.setInterval(() => {
      void poll()
    }, 1800)
  }

  const startVideoPolling = (jobId: string) => {
    if (videoPollRef.current) {
      window.clearInterval(videoPollRef.current)
      videoPollRef.current = null
    }
    activeVideoJobIdRef.current = jobId
    let pollFailures = 0

    const stopPolling = () => {
      if (videoPollRef.current) {
        window.clearInterval(videoPollRef.current)
        videoPollRef.current = null
      }
      activeVideoJobIdRef.current = null
    }

    const poll = async () => {
      if (activeVideoJobIdRef.current !== jobId) return
      try {
        const res = await authFetch(apiUrl(`/api/lifetime/create-videos-status/${encodeURIComponent(jobId)}`))
        if (activeVideoJobIdRef.current !== jobId) return
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `Failed to check video creation status (${res.status})`))
        }
        pollFailures = 0

        const raw = await res.json().catch(() => ({}))
        const data = unwrapApiData<LifetimeVideoJobStatus>(raw)
        if (data.outputDirUrl) setOutputDirUrl(data.outputDirUrl)
        if (data.outputDirLocal) setOutputDirLocal(data.outputDirLocal)
        if (data.assemblyStage) setAssemblyStage(data.assemblyStage)
        if (data.assemblyStage && data.assemblyStage !== 'idle') {
          setTransitionStatuses((prev) =>
            prev.length > 0 ? prev.map((t) => ({ ...t, status: 'completed' as const })) : prev,
          )
        }

        if (data.status === 'completed') {
          if (activeVideoJobIdRef.current !== jobId) return
          stopPolling()
          setCreatingVideos(false)
          setAssemblyStage('done')
          setFinalVideoUrl(data.finalVideoUrl || '')
          setFinalVideoDurationSec(data.finalVideoDurationSec || 0)
          if (activeLifetimeHistoryIdRef.current) {
            const sessionLink = data.sessionId || outputSessionId
            const resolvedOutputDirUrl = data.outputDirUrl || outputDirUrl
            const resolvedOutputDirLocal = data.outputDirLocal || outputDirLocal
            patchHistory(activeLifetimeHistoryIdRef.current, {
              status: 'completed',
              message: `Final video ready (${data.finalVideoDurationSec || 0}s)`,
              artifacts: [
                ...(data.finalVideoUrl
                  ? [
                      {
                        id: `${activeLifetimeHistoryIdRef.current}_video`,
                        label: 'Lifetime Video',
                        type: 'video' as const,
                        url: data.finalVideoUrl,
                      },
                    ]
                  : []),
                ...(sessionLink && resolvedOutputDirUrl
                  ? [
                      {
                        id: `${activeLifetimeHistoryIdRef.current}_folder`,
                        label: resolvedOutputDirLocal || 'Output Folder',
                        type: 'folder' as const,
                        url: resolvedOutputDirUrl,
                      },
                    ]
                  : []),
              ],
            })
            activeLifetimeHistoryIdRef.current = null
          }
          notify.success('Lifetime video created')
          return
        }

        if (data.status === 'failed') {
          if (activeVideoJobIdRef.current !== jobId) return
          stopPolling()
          setCreatingVideos(false)
          setAssemblyStage('idle')
          if (activeLifetimeHistoryIdRef.current) {
            patchHistory(activeLifetimeHistoryIdRef.current, {
              status: 'failed',
              message: data.error || 'Failed to create lifetime videos',
            })
            activeLifetimeHistoryIdRef.current = null
          }
          notify.error(data.error || 'Failed to create lifetime videos')
          setRunError(data.error || 'Failed to create lifetime videos')
        }
      } catch (error) {
        if (activeVideoJobIdRef.current !== jobId) return
        pollFailures += 1
        if (pollFailures >= 3) {
          stopPolling()
          setCreatingVideos(false)
          if (activeLifetimeHistoryIdRef.current) {
            patchHistory(activeLifetimeHistoryIdRef.current, {
              status: 'failed',
              message: error instanceof Error ? error.message : 'Failed to track video creation',
            })
            activeLifetimeHistoryIdRef.current = null
          }
          notify.error(error instanceof Error ? error.message : 'Failed to track video creation')
          setRunError(error instanceof Error ? error.message : 'Failed to track video creation')
        }
      }
    }

    void poll()
    videoPollRef.current = window.setInterval(() => {
      void poll()
    }, 1800)
  }

  const handlePasteUrlInput = (event: ClipboardEvent<HTMLInputElement>) => {
    const items = event.clipboardData?.items
    if (!items) return

    const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'))
    if (!imageItem) return

    const blob = imageItem.getAsFile()
    if (!blob) return

    event.preventDefault()
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
    const file = new File([blob], `clipboard_${Date.now()}.${extension}`, { type: blob.type })
    setBabyFile(file)
    setBabyImageUrl('')
    resetLifetimeResults()
    notify.success('Image pasted from clipboard')
  }

  const handleRun = async () => {
    if (!babyFile && !babyImageUrl) {
      notify.error('Please upload a baby photo or paste an image URL first')
      return
    }
    if (!babyFile && babyImageUrl && !isHttpUrl(babyImageUrl)) {
      notify.error('Please enter a valid image URL (http/https)')
      return
    }
    if (running || creatingVideos) {
      notify.error('Please wait until current generation is complete')
      return
    }

    const historyId = createOutputHistoryId('lifetime')
    activeLifetimeHistoryIdRef.current = historyId
    upsertHistory({
      id: historyId,
      category: 'lifetime',
      title: `Lifetime (${backgroundMode === 'white_bg' ? 'White BG' : 'Natural BG'})`,
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      message: 'Generating lifetime frames...',
      artifacts: [],
    })

    resetLifetimeResults()
    setRunning(true)
    setRunMessage('Queued')
    setRunError(null)

    try {
      const formData = new FormData()
      if (babyFile) {
        formData.append('babyImage', babyFile)
      } else if (babyImageUrl) {
        formData.append('babyImageUrl', babyImageUrl)
      }
      formData.append('backgroundMode', backgroundMode)
      formData.append('genderHint', genderHint)

      const res = await authFetch(apiUrl('/api/lifetime/run'), {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const raw = await res.json().catch(async () => {
          const textBody = await res.text().catch(() => '')
          return textBody ? { details: textBody } : null
        })
        const fallback = `Failed to generate lifetime images (${res.status})`
        throw new Error(normalizeLifetimeErrorMessage(getApiError(raw, fallback)))
      }

      const raw = await res.json().catch(() => ({}))
      const data = unwrapApiData<{ jobId: string }>(raw)
      if (!data.jobId) {
        throw new Error('Lifetime job id missing from server response')
      }
      startRunPolling(data.jobId)
    } catch (err) {
      const message = normalizeLifetimeErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate lifetime images',
      )
      if (activeLifetimeHistoryIdRef.current) {
        patchHistory(activeLifetimeHistoryIdRef.current, {
          status: 'failed',
          message,
        })
        activeLifetimeHistoryIdRef.current = null
      }
      notify.error(message)
      setRunning(false)
    }
  }

  const downloadableFrames = displayFrames.filter((f) => f.imageUrl)

  const handleDownloadAllFrames = async () => {
    for (const frame of downloadableFrames) {
      const url = assetUrl(frame.imageUrl)
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `lifetime_${frame.age === 0 ? 'baby' : `age_${frame.age}`}.jpg`
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  const showFinalVideoSection = completedTransitions.length > 0 || creatingVideos || assemblyStage !== 'idle'

  return (
    <div className="space-y-6">
      {runError && <StatusBanner type="error" message={runError} onDismiss={() => setRunError(null)} />}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-4">
            <SegmentedTabs
              value={backgroundMode}
              items={BACKGROUND_MODE_OPTIONS}
              onChange={setBackgroundMode}
              ariaLabel="Lifetime background mode"
            />
          </div>

          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={1} title="Input Image" />
            <div className="space-y-4">
              <Button
                variant="secondary"
                className="w-full"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </Button>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Paste URL</span>
                <input
                  type="url"
                  value={babyImageUrl}
                  onChange={(e) => {
                    setBabyImageUrl(e.target.value)
                    setBabyFile(null)
                    resetLifetimeResults()
                  }}
                  onPaste={handlePasteUrlInput}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-surface-200 bg-surface-0 px-3 py-2 text-sm text-surface-500 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
                />
              </label>
              {inputPreviewUrl && (
                <div className="rounded-lg border border-surface-200 bg-surface-0 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                      Selected Image
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBabyFile(null)
                        setBabyImageUrl('')
                        resetLifetimeResults()
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-surface-200 bg-surface-100 px-2 py-1 text-[10px] font-medium text-surface-400 hover:bg-surface-200 hover:text-surface-100 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                  <div className="w-full overflow-hidden rounded-md border border-surface-200 bg-surface-100 p-2 flex items-center justify-center">
                    <img
                      src={inputPreviewUrl}
                      alt="Selected input preview"
                      className="max-w-full max-h-56 w-auto h-auto object-contain rounded-sm"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Gender</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={genderHint === 'male' ? 'purple' : 'secondary'}
                    className="w-full border-0 shadow-none"
                    onClick={() => setGenderHint('male')}
                    scrollToTopOnClick={false}
                  >
                    Male
                  </Button>
                  <Button
                    variant={genderHint === 'female' ? 'purple' : 'secondary'}
                    className="w-full border-0 shadow-none"
                    onClick={() => setGenderHint('female')}
                    scrollToTopOnClick={false}
                  >
                    Female
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setBabyFile(file)
                  setBabyImageUrl('')
                  resetLifetimeResults()
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={2} title="Video Duration" />
            <Slider
              label="Final Duration"
              min={VIDEO_DURATION_MIN_SEC}
              max={VIDEO_DURATION_MAX_SEC}
              step={1}
              value={videoDurationSec}
              displayValue={`${videoDurationSec}s`}
              onChange={(event) => setVideoDurationSec(Number(event.target.value))}
            />
            <div className="pt-4 mt-4 border-t border-surface-200/60">
              <Button
                variant="lime"
                className="w-full"
                size="lg"
                icon={running ? undefined : <Sparkles className="w-4 h-4" />}
                loading={running || creatingVideos}
                disabled={running || creatingVideos}
                onClick={handleRun}
              >
                {running || creatingVideos ? 'Generating...' : 'Generate Lifetime Video'}
              </Button>
            </div>
          </div>
          {running && <ProgressBar value={progress} label={runMessage || 'Generating lifetime frames'} />}
        </div>

        <div className="space-y-6">
          {shouldShowLifetimeFrames && (
            <div className="bg-surface-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <StepHeader stepNumber={3} title="Lifetime Frames" />
                {downloadableFrames.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAllFrames}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-surface-400 hover:text-surface-500 hover:bg-surface-200 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download All
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <div className="flex gap-3 min-w-max">
                    {displayFrames.map((frame) => (
                      <div key={`age-${frame.age}`} className="w-32 shrink-0 space-y-2">
                        <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider text-center">
                          {frame.age === 0 ? 'Baby' : `Age ${frame.age}`}
                        </div>
                        <div className="rounded-lg overflow-hidden border border-surface-200 bg-surface-0 aspect-[9/16]">
                          {frame.imageUrl ? (
                            <img
                              src={assetUrl(frame.imageUrl)}
                              alt={frame.age === 0 ? 'Baby' : `Age ${frame.age}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full animate-pulse bg-gradient-to-b from-surface-100 to-surface-200" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasAnyTransitionStarted && (
            <div data-output-category="lifetime" className="bg-surface-50 rounded-lg p-4 space-y-4">
              <StepHeader stepNumber={4} title="Neighbor Videos" />
              {inProgressTransitions.length > 0 ? (
                <div className="space-y-2">
                  {inProgressTransitions.map((t) => (
                    <div
                      key={`${t.fromAge}-${t.toAge}`}
                      className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2"
                    >
                      <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />
                      <span className="text-sm text-surface-500">
                        Age {t.fromAge} → {t.toAge}
                      </span>
                      <span className="text-xs text-surface-400 ml-auto">Generating...</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  <span>
                    All videos generated and saved to{' '}
                    {outputDirUrl ? (
                      <a
                        href={assetUrl(outputDirUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-green-700"
                      >
                        {outputDirLocal || 'local folder'}
                      </a>
                    ) : (
                      'local folder'
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {showFinalVideoSection && (
            <div data-output-category="lifetime" className="bg-surface-50 rounded-lg p-4 space-y-4">
              <StepHeader stepNumber={5} title="Final Video" />
              {!finalVideoUrl && (
                <div className="space-y-2">
                  {assemblyStage === 'idle' &&
                    completedTransitions.map((t) => (
                      <div
                        key={`done-${t.fromAge}-${t.toAge}`}
                        className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2"
                      >
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-sm text-surface-500">
                          Age {t.fromAge} → {t.toAge}
                        </span>
                        <span className="text-xs text-surface-400 ml-auto">Ready</span>
                      </div>
                    ))}
                  {(assemblyStage === 'idle' || assemblyStage === 'editing') && creatingVideos && (
                    <div className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2">
                      <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />
                      <span className="text-sm text-surface-500">Editing videos</span>
                    </div>
                  )}
                  {assemblyStage === 'adjusting_time' && (
                    <div className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2">
                      <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />
                      <span className="text-sm text-surface-500">Adjusting time</span>
                    </div>
                  )}
                  {assemblyStage === 'finalizing' && (
                    <div className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3 py-2">
                      <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />
                      <span className="text-sm text-surface-500">Finalizing</span>
                    </div>
                  )}
                </div>
              )}
              {finalVideoUrl && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    Complete
                  </div>
                  <div className="rounded-lg border border-surface-200 p-3 max-w-sm">
                    <div className="text-sm font-semibold mb-2 inline-flex items-center gap-2">
                      <Film className="w-4 h-4 text-brand-500" />
                      Lifetime Video
                    </div>
                    {/* biome-ignore lint/a11y/useMediaCaption: generated preview videos don't provide caption tracks */}
                    <video src={assetUrl(finalVideoUrl)} controls className="w-full rounded-lg bg-black" />
                    <p className="mt-2 text-xs text-surface-500">
                      {finalVideoDurationSec > 0 ? `${finalVideoDurationSec}s` : '5s'} · no audio
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <PreviousGenerationsPanel
            entries={historyEntries}
            onDeleteEntry={removeHistory}
            onClear={() => removeManyHistory(historyEntries.map((entry) => entry.id))}
          />
        </div>
      </div>
    </div>
  )
}
