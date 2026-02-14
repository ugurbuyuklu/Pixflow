import { Film, RefreshCw, Sparkles, Upload, X } from 'lucide-react'
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { notify } from '../../lib/toast'
import { StepHeader } from '../asset-monster/StepHeader'
import { Button } from '../ui/Button'
import { SegmentedTabs } from '../ui/navigation/SegmentedTabs'
import { ProgressBar } from '../ui/ProgressBar'
import { Slider } from '../ui/Slider'

interface LifetimeFrame {
  age: number
  imageUrl: string
}

interface LifetimeTransition {
  fromAge: number
  toAge: number
  videoUrl: string
}

interface LifetimeVideoJobStatus {
  status: 'queued' | 'running' | 'completed' | 'failed'
  sessionId?: string
  error?: string
  progress?: {
    total: number
    completed: number
    currentStep: string
    message: string
  }
  transitions?: LifetimeTransition[]
  finalVideoUrl?: string
  finalVideoDurationSec?: number
}

interface LifetimeRunStatus {
  status: 'queued' | 'running' | 'completed' | 'failed'
  sessionId?: string
  error?: string
  sourceFrameUrl?: string
  progress?: {
    total: number
    completed: number
    currentAge: number | null
    message: string
  }
  frames?: LifetimeFrame[]
  earlyTransitionsStarted?: number
  earlyTransitionsCompleted?: number
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
  const [babyFile, setBabyFile] = useState<File | null>(null)
  const [babyImageUrl, setBabyImageUrl] = useState('')
  const [backgroundMode, setBackgroundMode] = useState<LifetimeBackgroundMode>('white_bg')
  const [genderHint, setGenderHint] = useState<LifetimeGenderHint>('auto')
  const [running, setRunning] = useState(false)
  const [creatingVideos, setCreatingVideos] = useState(false)
  const [regeneratingAge, setRegeneratingAge] = useState<number | null>(null)
  const [runMessage, setRunMessage] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [sourceFrameUrl, setSourceFrameUrl] = useState('')
  const [progress, setProgress] = useState(0)
  const [frames, setFrames] = useState<LifetimeFrame[]>([])
  const [transitions, setTransitions] = useState<LifetimeTransition[]>([])
  const [videoDurationSec, setVideoDurationSec] = useState(VIDEO_DURATION_DEFAULT_SEC)
  const [finalVideoUrl, setFinalVideoUrl] = useState('')
  const [finalVideoDurationSec, setFinalVideoDurationSec] = useState(0)
  const [hasRequestedVideoCreation, setHasRequestedVideoCreation] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoProgressMessage, setVideoProgressMessage] = useState('')
  const [earlyTransitionsStarted, setEarlyTransitionsStarted] = useState(0)
  const [earlyTransitionsCompleted, setEarlyTransitionsCompleted] = useState(0)

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

  const hasAllGeneratedFrames = useMemo(() => {
    const hasAllAges = LIFETIME_AGES.every((age) => frames.some((frame) => frame.age === age && !!frame.imageUrl))
    if (backgroundMode !== 'white_bg') return hasAllAges
    const hasSource = !!sourceFrameUrl || frames.some((frame) => frame.age === 0 && !!frame.imageUrl)
    return hasSource && hasAllAges
  }, [frames, backgroundMode, sourceFrameUrl])
  const shouldShowLifetimeFrames = running || !!sourceFrameUrl || frames.length > 0

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

  const resetLifetimeResults = (options?: { preserveVideoOutput?: boolean }) => {
    const preserveVideoOutput = options?.preserveVideoOutput === true
    if (runPollRef.current) {
      window.clearInterval(runPollRef.current)
      runPollRef.current = null
    }
    activeJobIdRef.current = null
    setRunMessage('')
    setProgress(0)
    setSessionId('')
    setSourceFrameUrl('')
    setFrames([])
    setEarlyTransitionsStarted(0)
    setEarlyTransitionsCompleted(0)
    setVideoDurationSec(VIDEO_DURATION_DEFAULT_SEC)
    if (!preserveVideoOutput) {
      setTransitions([])
      setFinalVideoUrl('')
      setFinalVideoDurationSec(0)
      setHasRequestedVideoCreation(false)
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
        if (data.frames) {
          setFrames(data.frames)
        }
        if (data.sourceFrameUrl) {
          setSourceFrameUrl(data.sourceFrameUrl)
        }
        if (typeof data.earlyTransitionsStarted === 'number') {
          setEarlyTransitionsStarted(data.earlyTransitionsStarted)
        }
        if (typeof data.earlyTransitionsCompleted === 'number') {
          setEarlyTransitionsCompleted(data.earlyTransitionsCompleted)
        }

        if (data.status === 'completed') {
          if (activeJobIdRef.current !== jobId) return
          if (runPollRef.current) {
            window.clearInterval(runPollRef.current)
            runPollRef.current = null
          }
          activeJobIdRef.current = null
          setRunning(false)
          setSessionId(data.sessionId || '')
          setRunMessage('Frame generation completed')
          setProgress(100)
          notify.success('Lifetime frames generated')
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
          notify.error(data.error || 'Failed to generate lifetime frames')
        }
      } catch (error) {
        if (activeJobIdRef.current !== jobId) return
        if (runPollRef.current) {
          window.clearInterval(runPollRef.current)
          runPollRef.current = null
        }
        activeJobIdRef.current = null
        setRunning(false)
        notify.error(error instanceof Error ? error.message : 'Failed to track frame generation')
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
        if (data.progress) {
          const pct = data.progress.total > 0 ? Math.round((data.progress.completed / data.progress.total) * 100) : 0
          setVideoProgress(pct)
          setVideoProgressMessage(data.progress.message || '')
        }
        if (data.transitions) setTransitions(data.transitions)

        if (data.status === 'completed') {
          if (activeVideoJobIdRef.current !== jobId) return
          stopPolling()
          setCreatingVideos(false)
          setVideoProgress(100)
          setVideoProgressMessage('Lifetime video created')
          setFinalVideoUrl(data.finalVideoUrl || '')
          setFinalVideoDurationSec(data.finalVideoDurationSec || 0)
          notify.success('Lifetime videos created')
          return
        }

        if (data.status === 'failed') {
          if (activeVideoJobIdRef.current !== jobId) return
          stopPolling()
          setCreatingVideos(false)
          setVideoProgressMessage('Video creation failed')
          notify.error(data.error || 'Failed to create lifetime videos')
        }
      } catch (error) {
        if (activeVideoJobIdRef.current !== jobId) return
        pollFailures += 1
        if (pollFailures >= 3) {
          stopPolling()
          setCreatingVideos(false)
          notify.error(error instanceof Error ? error.message : 'Failed to track video creation')
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
    resetLifetimeResults({ preserveVideoOutput: creatingVideos })
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
    if (creatingVideos) {
      notify.error('Please wait until current lifetime video generation is complete')
      return
    }

    if (runPollRef.current) {
      window.clearInterval(runPollRef.current)
      runPollRef.current = null
    }
    activeJobIdRef.current = null

    setRunning(true)
    setRunMessage('Queued')
    setProgress(0)
    setSessionId('')
    setSourceFrameUrl('')
    setTransitions([])
    setFrames([])
    setVideoDurationSec(VIDEO_DURATION_DEFAULT_SEC)
    setFinalVideoUrl('')
    setFinalVideoDurationSec(0)
    setHasRequestedVideoCreation(false)

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
      notify.error(message)
      setRunning(false)
    }
  }

  const handleRegenerateFrame = async (age: number) => {
    if (!sessionId) {
      notify.error('Generate lifetime frames first')
      return
    }

    setRegeneratingAge(age)
    setHasRequestedVideoCreation(false)
    setFinalVideoUrl('')
    setFinalVideoDurationSec(0)
    try {
      const res = await authFetch(apiUrl('/api/lifetime/regenerate-frame'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, age, genderHint }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to regenerate frame'))
      }

      const raw = await res.json().catch(() => ({}))
      const data = unwrapApiData<{
        sourceFrameUrl?: string
        frames: LifetimeFrame[]
        transitions: LifetimeTransition[]
        finalVideoUrl?: string
      }>(raw)
      if (data.sourceFrameUrl) {
        setSourceFrameUrl(data.sourceFrameUrl)
      }
      setFrames(data.frames || [])
      setTransitions(data.transitions || [])
      setFinalVideoUrl(data.finalVideoUrl || '')
      setFinalVideoDurationSec(0)
      if (age === 0) {
        notify.success('Source frame regenerated. Generate frames again to rebuild ages.')
      } else {
        notify.success(`Age ${age} frame regenerated`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate frame'
      notify.error(message)
    } finally {
      setRegeneratingAge(null)
    }
  }

  const handleCreateVideos = async () => {
    if (!sessionId || !hasAllGeneratedFrames) {
      notify.error(
        backgroundMode === 'white_bg'
          ? 'You need source + 9 age frames before creating videos'
          : 'You need 9 lifetime frames before creating videos',
      )
      return
    }
    setCreatingVideos(true)
    setHasRequestedVideoCreation(true)
    setTransitions([])
    setFinalVideoUrl('')
    setFinalVideoDurationSec(0)
    setVideoProgress(0)
    setVideoProgressMessage('Queued')
    try {
      const res = await authFetch(apiUrl('/api/lifetime/create-videos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, targetDurationSec: videoDurationSec }),
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
      const message = err instanceof Error ? err.message : 'Failed to create lifetime videos'
      notify.error(message)
      setCreatingVideos(false)
    }
  }

  return (
    <div className="space-y-6">
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
                    resetLifetimeResults({ preserveVideoOutput: creatingVideos })
                  }}
                  onPaste={handlePasteUrlInput}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-surface-200 bg-surface-0 px-3 py-2 text-sm text-surface-500 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
                />
              </label>
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
                        resetLifetimeResults({ preserveVideoOutput: creatingVideos })
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
                  resetLifetimeResults({ preserveVideoOutput: creatingVideos })
                  e.target.value = ''
                }}
              />

              <p className="text-sm text-surface-500">
                {backgroundMode === 'white_bg'
                  ? 'Generate 10 frames total (source baby + 9 age frames). Then create lifetime videos as a second step.'
                  : 'Generate 9 age-progressed frames first. Then create lifetime videos as a second step.'}
              </p>

              <Button
                variant="lime"
                className="w-full"
                size="lg"
                icon={running ? undefined : <Sparkles className="w-4 h-4" />}
                loading={running}
                disabled={creatingVideos}
                onClick={handleRun}
              >
                {running ? 'Generating frames...' : 'Generate frames'}
              </Button>
              {running && <ProgressBar value={progress} label={runMessage || 'Generating lifetime frames'} />}
              {running && earlyTransitionsStarted > 0 && (
                <p className="text-xs text-surface-400 mt-1">
                  Transition videos: {earlyTransitionsCompleted}/{earlyTransitionsStarted} ready
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-surface-50 rounded-lg p-4">
            <StepHeader stepNumber={2} title="Lifetime Frames" />
            {!shouldShowLifetimeFrames ? (
              <p className="text-sm text-surface-500">Frames will appear here after generation.</p>
            ) : (
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
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          icon={<RefreshCw className="w-3 h-3" />}
                          loading={regeneratingAge === frame.age}
                          disabled={
                            running ||
                            creatingVideos ||
                            (frame.age === 0 ? !sessionId : !frame.imageUrl) ||
                            (regeneratingAge !== null && regeneratingAge !== frame.age)
                          }
                          scrollToTopOnClick={false}
                          onClick={() => handleRegenerateFrame(frame.age)}
                        >
                          Regenerate
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {hasAllGeneratedFrames && (
            <div className="bg-surface-50 rounded-lg p-4 space-y-4">
              <StepHeader stepNumber={3} title="Video Duration" />
              <Slider
                label="Final Duration"
                min={VIDEO_DURATION_MIN_SEC}
                max={VIDEO_DURATION_MAX_SEC}
                step={1}
                value={videoDurationSec}
                displayValue={`${videoDurationSec}s`}
                onChange={(event) => setVideoDurationSec(Number(event.target.value))}
              />
              <Button variant="lime" className="w-full" size="lg" loading={creatingVideos} onClick={handleCreateVideos}>
                {creatingVideos ? 'Creating Lifetime Videos...' : 'Create lifetime videos'}
              </Button>
              {creatingVideos && (
                <ProgressBar value={videoProgress} label={videoProgressMessage || 'Creating lifetime videos'} />
              )}
            </div>
          )}

          {hasRequestedVideoCreation && (
            <div className="bg-surface-50 rounded-lg p-4 space-y-4">
              <StepHeader stepNumber={4} title="Output Videos" />
              {!finalVideoUrl && transitions.length === 0 && creatingVideos ? (
                <p className="text-sm text-surface-500">Generating transitions...</p>
              ) : (
                <div className="space-y-4">
                  {transitions.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                        Transitions ({transitions.length}/9)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {transitions.map((t) => (
                          <div key={`${t.fromAge}-${t.toAge}`} className="rounded-lg border border-surface-200 p-2">
                            <div className="text-xs font-medium text-surface-500 mb-1">
                              Age {t.fromAge} → {t.toAge}
                            </div>
                            {/* biome-ignore lint/a11y/useMediaCaption: generated preview videos don't provide caption tracks */}
                            <video src={assetUrl(t.videoUrl)} controls className="w-full rounded-md bg-black" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {finalVideoUrl && (
                    <div className="rounded-lg border border-surface-200 p-3">
                      <div className="text-sm font-semibold mb-2 inline-flex items-center gap-2">
                        <Film className="w-4 h-4 text-brand-500" />
                        Final Lifetime Video
                      </div>
                      {/* biome-ignore lint/a11y/useMediaCaption: generated preview videos don't provide caption tracks */}
                      <video src={assetUrl(finalVideoUrl)} controls className="w-full rounded-lg bg-black" />
                      <p className="mt-2 text-xs text-surface-500">
                        {finalVideoDurationSec > 0 ? `${finalVideoDurationSec}s` : '5s'} · no audio
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
