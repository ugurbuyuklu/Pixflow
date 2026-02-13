import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../../lib/api'
import { notify } from '../../lib/toast'
import { useCaptionsPresetStore } from '../../stores/captionsPresetStore'
import { StepHeader } from '../asset-monster/StepHeader'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

const FONT_OPTIONS = [
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Arial', label: 'Arial' },
]

type AspectBucket = '9:16' | '4:5' | '1:1'

interface CaptionSentenceSegment {
  id: string
  start: number
  end: number
  text: string
  enabled: boolean
}

const SAFE_ZONE_CONFIG: Record<
  AspectBucket,
  { baseWidth: number; baseHeight: number; top: number; bottom: number; right: number }
> = {
  '9:16': { baseWidth: 1080, baseHeight: 1920, top: 108, bottom: 320, right: 180 },
  '4:5': { baseWidth: 1080, baseHeight: 1350, top: 90, bottom: 90, right: 130 },
  '1:1': { baseWidth: 1080, baseHeight: 1080, top: 60, bottom: 60, right: 120 },
}

const toRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return hex
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const clampValue = (value: number, min: number, max: number) =>
  Number.isNaN(value) ? min : Math.min(Math.max(value, min), max)

const parseNumericInput = (value: string, fallback: number): number => {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return fallback
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clampProviderYOffset = (value: number): number => clampValue(value, -200, 200)

const formatSegmentTimestamp = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

const normalizeFontWeight = (weight: 'normal' | 'bold' | 'black' | undefined): 'normal' | 'bold' => {
  if (weight === 'normal') return 'normal'
  return 'bold'
}

const toCssFontWeight = (weight: 'normal' | 'bold'): React.CSSProperties['fontWeight'] => {
  if (weight === 'bold') return 700
  return 400
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
        {label.replace(/\s*color\s*/i, '')}
      </span>
      <label
        className="relative w-5 h-5 border border-surface-200 bg-surface-0 cursor-pointer overflow-hidden"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </label>
    </div>
  )
}

export default function CaptionsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoPreviewRef = useRef<HTMLDivElement>(null)
  const captionOverlayRef = useRef<HTMLDivElement>(null)
  const { presets, load, create, update, remove } = useCaptionsPresetStore()
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [presetName, setPresetName] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [fontName, setFontName] = useState('Poppins')
  const [fontSize, setFontSize] = useState(72)
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('bold')
  const [fontColor, setFontColor] = useState('#ffffff')
  const [highlightColor, setHighlightColor] = useState('#7c3aed')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [backgroundColor, setBackgroundColor] = useState('#000000')
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.35)
  const [position, setPosition] = useState<'bottom' | 'center' | 'top'>('bottom')
  const [xOffset, setXOffset] = useState(0)
  const [yOffset, setYOffset] = useState(200)
  const [yOffsetTouched, setYOffsetTouched] = useState(false)
  const [wordsPerSubtitle, setWordsPerSubtitle] = useState(4)
  const [enableAnimation, setEnableAnimation] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [renderingSelection, setRenderingSelection] = useState(false)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null)
  const [sentenceSegments, setSentenceSegments] = useState<CaptionSentenceSegment[]>([])
  const [inputVideoMeta, setInputVideoMeta] = useState<{ width: number; height: number } | null>(null)
  const [videoPreviewHeight, setVideoPreviewHeight] = useState(0)
  const [captionOverlayHeight, setCaptionOverlayHeight] = useState(0)
  const [isDraggingCaption, setIsDraggingCaption] = useState(false)
  const dragStartYRef = useRef(0)
  const dragStartOffsetRef = useRef(0)
  const dragPointerIdRef = useRef<number | null>(null)
  const previousPositionRef = useRef<'bottom' | 'center' | 'top'>('bottom')

  const fontOptions = useMemo(() => {
    const hasCustom = fontName && !FONT_OPTIONS.some((opt) => opt.value === fontName)
    return hasCustom ? [{ value: fontName, label: fontName }, ...FONT_OPTIONS] : FONT_OPTIONS
  }, [fontName])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const previewUrl = useMemo(() => {
    if (!videoFile) return ''
    return URL.createObjectURL(videoFile)
  }, [videoFile])

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const canSubmit = Boolean(videoFile || videoUrl.trim())
  const enabledSegments = useMemo(() => sentenceSegments.filter((segment) => segment.enabled), [sentenceSegments])
  const hasSegmentSelection = sentenceSegments.length > 0
  const hasExcludedSegments = hasSegmentSelection && enabledSegments.length < sentenceSegments.length
  const canRenderFromSelection = Boolean(sourceVideoUrl && enabledSegments.length > 0)
  const resolvedLanguage = undefined
  const directVideoUrl =
    !videoFile && videoUrl.trim() && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(videoUrl.trim()) ? videoUrl.trim() : ''
  const inputPreviewSource = previewUrl || directVideoUrl

  const currentSettings = useMemo(
    () => ({
      language: 'auto',
      fontName,
      fontSize,
      fontWeight,
      fontColor,
      highlightColor,
      strokeWidth,
      strokeColor,
      backgroundColor,
      backgroundOpacity,
      position,
      xOffset,
      yOffset,
      wordsPerSubtitle,
      enableAnimation,
    }),
    [
      fontName,
      fontSize,
      fontWeight,
      fontColor,
      highlightColor,
      strokeWidth,
      strokeColor,
      backgroundColor,
      backgroundOpacity,
      position,
      xOffset,
      yOffset,
      wordsPerSubtitle,
      enableAnimation,
    ],
  )

  const aspectBucket: AspectBucket = useMemo(() => {
    if (!inputVideoMeta) return '9:16'
    const ratio = inputVideoMeta.width / inputVideoMeta.height
    const candidates: { id: AspectBucket; ratio: number }[] = [
      { id: '9:16', ratio: 9 / 16 },
      { id: '4:5', ratio: 4 / 5 },
      { id: '1:1', ratio: 1 },
    ]
    let best = candidates[0]
    let bestDiff = Math.abs(ratio - best.ratio)
    for (const candidate of candidates.slice(1)) {
      const diff = Math.abs(ratio - candidate.ratio)
      if (diff < bestDiff) {
        best = candidate
        bestDiff = diff
      }
    }
    return best.id
  }, [inputVideoMeta])

  const safeOffsets = useMemo(() => {
    const config = SAFE_ZONE_CONFIG[aspectBucket]
    const heightBasis = inputVideoMeta?.height ?? config.baseHeight
    const widthBasis = inputVideoMeta?.width ?? config.baseWidth
    const scaleY = heightBasis / config.baseHeight
    const scaleX = widthBasis / config.baseWidth
    return {
      top: config.top * scaleY,
      bottom: config.bottom * scaleY,
      right: config.right * scaleX,
      baseHeight: config.baseHeight,
      baseWidth: config.baseWidth,
    }
  }, [aspectBucket, inputVideoMeta])

  const effectiveYOffset = useMemo(() => {
    if (position === 'bottom') return clampProviderYOffset(Math.max(yOffset, safeOffsets.bottom))
    if (position === 'top') return clampProviderYOffset(Math.max(yOffset, safeOffsets.top))
    return clampProviderYOffset(yOffset)
  }, [position, yOffset, safeOffsets])

  const videoPreviewScale = useMemo(() => {
    if (!videoPreviewHeight) return 1
    const basis = inputVideoMeta?.height ?? safeOffsets.baseHeight
    return videoPreviewHeight / basis
  }, [videoPreviewHeight, inputVideoMeta, safeOffsets.baseHeight])

  const previewBackground = useMemo(
    () => toRgba(backgroundColor, backgroundOpacity),
    [backgroundColor, backgroundOpacity],
  )

  const apiPreviewStyle = useMemo(() => {
    // Match output math: font size scales by rendered preview height / source video height.
    const sourceHeight = inputVideoMeta?.height ?? safeOffsets.baseHeight
    const scale = sourceHeight > 0 && videoPreviewHeight > 0 ? videoPreviewHeight / sourceHeight : 0.25
    const scaledFontSize = Math.max(1, Number((fontSize * scale).toFixed(2)))
    const scaledStroke = Math.max(0, Number((strokeWidth * scale).toFixed(2)))
    const shadow = scaledStroke > 0 ? `0 0 0 ${scaledStroke}px ${strokeColor}` : 'none'
    return {
      fontFamily: fontName,
      fontSize: `${scaledFontSize}px`,
      fontWeight: toCssFontWeight(fontWeight),
      color: fontColor,
      textShadow: shadow,
      lineHeight: 1.15,
    } as React.CSSProperties
  }, [
    fontName,
    fontSize,
    fontWeight,
    fontColor,
    strokeWidth,
    strokeColor,
    inputVideoMeta,
    safeOffsets.baseHeight,
    videoPreviewHeight,
  ])

  const apiPreviewOverlayPosition = useMemo(() => {
    const widthBasis = inputVideoMeta?.width ?? safeOffsets.baseWidth
    const heightBasis = inputVideoMeta?.height ?? safeOffsets.baseHeight
    const maxShiftRatio = Math.max(0.08, 0.5 - safeOffsets.right / widthBasis)
    const xRatio = clampValue(xOffset / widthBasis, -maxShiftRatio, maxShiftRatio)
    const scaleY = heightBasis > 0 && videoPreviewHeight > 0 ? videoPreviewHeight / heightBasis : 0
    const yPx = scaleY > 0 ? clampProviderYOffset(yOffset) * scaleY : 0
    if (position === 'top') {
      return {
        left: `${50 + xRatio * 100}%`,
        top: `${Math.max(4, 4 + yPx)}px`,
        transform: 'translateX(-50%)',
      } as React.CSSProperties
    }
    if (position === 'center') {
      const centerShift = -yPx
      return {
        left: `${50 + xRatio * 100}%`,
        top: '50%',
        transform: `translate(-50%, calc(-50% + ${centerShift}px))`,
      } as React.CSSProperties
    }
    return {
      left: `${50 + xRatio * 100}%`,
      bottom: `${Math.max(6, 6 + yPx)}px`,
      transform: 'translateX(-50%)',
    } as React.CSSProperties
  }, [
    position,
    xOffset,
    yOffset,
    inputVideoMeta,
    safeOffsets.baseWidth,
    safeOffsets.baseHeight,
    safeOffsets.right,
    videoPreviewHeight,
  ])

  const { clampedYOffset } = useMemo(() => {
    if (!videoPreviewScale || !videoPreviewHeight) {
      return { clampedYOffset: effectiveYOffset }
    }

    const previewSafeTop = safeOffsets.top * videoPreviewScale
    const previewSafeBottom = safeOffsets.bottom * videoPreviewScale
    const previewOffsetPx = effectiveYOffset * videoPreviewScale
    const captionHeight = Math.min(captionOverlayHeight || 0, videoPreviewHeight)
    const minTop = previewSafeTop
    const maxTop = videoPreviewHeight - previewSafeBottom - captionHeight
    const centerTop = videoPreviewHeight / 2 - captionHeight / 2

    if (maxTop < minTop) {
      return {
        clampedYOffset: effectiveYOffset,
      }
    }

    if (position === 'center') {
      const rawTop = centerTop + previewOffsetPx
      const boundedTop = clampValue(rawTop, minTop, maxTop)
      return {
        clampedYOffset: (boundedTop - centerTop) / videoPreviewScale,
      }
    }

    if (position === 'top') {
      const boundedTop = clampValue(previewOffsetPx, minTop, maxTop)
      return {
        clampedYOffset: boundedTop / videoPreviewScale,
      }
    }

    // bottom
    const rawTop = videoPreviewHeight - captionHeight - previewOffsetPx
    const boundedTop = clampValue(rawTop, minTop, maxTop)
    return {
      clampedYOffset: (videoPreviewHeight - captionHeight - boundedTop) / videoPreviewScale,
    }
  }, [
    captionOverlayHeight,
    effectiveYOffset,
    position,
    safeOffsets.bottom,
    safeOffsets.top,
    videoPreviewHeight,
    videoPreviewScale,
  ])
  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => String(p.id) === presetId)
      if (!preset) return
      const p = preset.prompt
      setFontName(p.fontName ?? 'Poppins')
      setFontSize(p.fontSize ?? 72)
      setFontWeight(normalizeFontWeight(p.fontWeight as 'normal' | 'bold' | 'black' | undefined))
      setFontColor(p.fontColor ?? '#ffffff')
      setHighlightColor(p.highlightColor ?? '#7c3aed')
      setStrokeWidth(p.strokeWidth ?? 2)
      setStrokeColor(p.strokeColor ?? '#000000')
      setBackgroundColor(p.backgroundColor ?? '#000000')
      setBackgroundOpacity(p.backgroundOpacity ?? 0.35)
      setPosition((p.position as 'top' | 'center' | 'bottom') ?? 'bottom')
      setXOffset(p.xOffset ?? 0)
      setYOffset(clampProviderYOffset(p.yOffset ?? 0))
      setYOffsetTouched(true)
      setWordsPerSubtitle(p.wordsPerSubtitle ?? 4)
      setEnableAnimation(Boolean(p.enableAnimation))
      setPresetName(preset.name)
    },
    [presets],
  )

  useEffect(() => {
    if (selectedPresetId) applyPreset(selectedPresetId)
  }, [selectedPresetId, applyPreset])

  const clearSelectedVideo = () => {
    setVideoFile(null)
    setVideoUrl('')
    setInputVideoMeta(null)
    setYOffsetTouched(false)
    setSourceVideoUrl(null)
    setSentenceSegments([])
    setTranscription(null)
    setOutputUrl(null)
  }

  const openFilePicker = () => {
    const input = fileInputRef.current
    if (!input) return
    input.value = ''
    const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker
    if (typeof picker === 'function') picker.call(input)
    else input.click()
  }

  useEffect(() => {
    if (!inputPreviewSource || yOffsetTouched) return
    const next = position === 'bottom' ? 200 : position === 'top' ? safeOffsets.top : 0
    setYOffset(clampProviderYOffset(Math.round(next)))
  }, [inputPreviewSource, yOffsetTouched, position, safeOffsets.top])

  useEffect(() => {
    const previous = previousPositionRef.current
    if (previous === position) return
    previousPositionRef.current = position
    if (!inputPreviewSource) return
    const next = position === 'center' ? 0 : position === 'bottom' ? 200 : safeOffsets.top
    setYOffset(clampProviderYOffset(Math.round(next)))
    setYOffsetTouched(false)
  }, [inputPreviewSource, position, safeOffsets.top])

  useEffect(() => {
    if (!inputPreviewSource) {
      setVideoPreviewHeight(0)
      return
    }
    if (!videoPreviewRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry?.contentRect?.height) {
        setVideoPreviewHeight(entry.contentRect.height)
      }
    })
    observer.observe(videoPreviewRef.current)
    return () => observer.disconnect()
  }, [inputPreviewSource])

  useEffect(() => {
    if (!inputPreviewSource) {
      setCaptionOverlayHeight(0)
      return
    }
    if (!captionOverlayRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry?.contentRect?.height) {
        setCaptionOverlayHeight(entry.contentRect.height)
      }
    })
    observer.observe(captionOverlayRef.current)
    return () => observer.disconnect()
  }, [inputPreviewSource])

  useEffect(() => {
    if (!isDraggingCaption) return
    const handleMove = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) return
      const scale = videoPreviewScale || 1
      const delta = (event.clientY - dragStartYRef.current) / scale
      // Keep drag direction intuitive for each anchor:
      // top/center: drag down -> larger offset, bottom: drag down -> smaller offset.
      const directionalDelta = position === 'bottom' || position === 'center' ? -delta : delta
      setYOffset(clampProviderYOffset(dragStartOffsetRef.current + directionalDelta))
      setYOffsetTouched(true)
    }
    const handleUp = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) return
      setIsDraggingCaption(false)
      dragPointerIdRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isDraggingCaption, videoPreviewScale, position])

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setOutputUrl(null)
    setTranscription(null)
    try {
      let res: Response
      const submitYOffset = clampProviderYOffset(Math.round(clampedYOffset))
      const submitXOffset = Math.round(xOffset)
      if (videoFile) {
        const formData = new FormData()
        formData.append('video', videoFile)
        if (resolvedLanguage) formData.append('language', resolvedLanguage)
        formData.append('fontName', fontName)
        formData.append('fontSize', String(fontSize))
        formData.append('fontWeight', fontWeight)
        formData.append('fontColor', fontColor)
        formData.append('highlightColor', highlightColor)
        formData.append('strokeWidth', String(strokeWidth))
        formData.append('strokeColor', strokeColor)
        formData.append('backgroundColor', backgroundColor)
        formData.append('backgroundOpacity', String(backgroundOpacity))
        formData.append('position', position)
        formData.append('xOffset', String(submitXOffset))
        formData.append('yOffset', String(submitYOffset))
        formData.append('wordsPerSubtitle', String(wordsPerSubtitle))
        formData.append('enableAnimation', enableAnimation ? 'true' : 'false')
        res = await authFetch(apiUrl('/api/captions/auto-subtitle'), {
          method: 'POST',
          body: formData,
        })
      } else {
        res = await authFetch(apiUrl('/api/captions/auto-subtitle'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: videoUrl.trim(),
            language: resolvedLanguage,
            fontName,
            fontSize,
            fontWeight,
            fontColor,
            highlightColor,
            strokeWidth,
            strokeColor,
            backgroundColor,
            backgroundOpacity,
            position,
            xOffset: submitXOffset,
            yOffset: submitYOffset,
            wordsPerSubtitle,
            enableAnimation,
          }),
        })
      }
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to generate captions'))
      }
      const raw = await res.json()
      const data = unwrapApiData<{
        videoUrl: string
        sourceVideoUrl?: string
        transcription?: string
        segments?: Array<{ id?: string; start?: number; end?: number; text?: string }>
      }>(raw)
      setOutputUrl(data.videoUrl)
      setTranscription(data.transcription || null)
      setSourceVideoUrl(data.sourceVideoUrl || directVideoUrl || null)
      const parsedSegments = (data.segments || [])
        .map((segment, index) => {
          const start = Number(segment.start)
          const end = Number(segment.end)
          const text = typeof segment.text === 'string' ? segment.text.trim() : ''
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null
          return {
            id: segment.id || `seg-${index + 1}`,
            start,
            end,
            text,
            enabled: true,
          } as CaptionSentenceSegment
        })
        .filter((segment): segment is CaptionSentenceSegment => Boolean(segment))
      setSentenceSegments(parsedSegments)
      notify.success('Captions generated')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to generate captions')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSentenceSegment = (segmentId: string) => {
    setSentenceSegments((prev) =>
      prev.map((segment) => (segment.id === segmentId ? { ...segment, enabled: !segment.enabled } : segment)),
    )
  }

  const setAllSentenceSegmentsEnabled = (enabled: boolean) => {
    setSentenceSegments((prev) => prev.map((segment) => ({ ...segment, enabled })))
  }

  const handleRenderSelected = async () => {
    if (!canRenderFromSelection || renderingSelection || !sourceVideoUrl) return
    setRenderingSelection(true)
    try {
      const response = await authFetch(apiUrl('/api/captions/render-selected'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: sourceVideoUrl,
          segments: enabledSegments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text,
          })),
          fontName,
          fontSize,
          fontWeight,
          fontColor,
          strokeWidth,
          strokeColor,
          backgroundColor,
          backgroundOpacity,
          position,
          xOffset: Math.round(xOffset),
          yOffset: Math.round(yOffset),
        }),
      })

      if (!response.ok) {
        const raw = await response.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to render selected captions'))
      }

      const raw = await response.json()
      const data = unwrapApiData<{ videoUrl: string }>(raw)
      setOutputUrl(data.videoUrl)
      setTranscription(enabledSegments.map((segment) => segment.text).join(' '))
      notify.success('Rendered with selected sentences')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to render selected captions')
    } finally {
      setRenderingSelection(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-surface-50 rounded-lg p-4 space-y-4">
            <StepHeader stepNumber={1} title="Preview & Presets" />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-lg border border-surface-200 bg-surface-0 p-4 space-y-3">
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Preview</p>
                {inputPreviewSource ? (
                  <div
                    ref={videoPreviewRef}
                    className="relative w-full rounded-lg overflow-hidden border border-surface-200 bg-surface-0"
                  >
                    <button
                      type="button"
                      className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-900/70 text-surface-50 hover:bg-surface-900"
                      onClick={clearSelectedVideo}
                      title="Remove video"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <video
                      src={inputPreviewSource}
                      className="block w-full h-auto object-contain bg-black"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(event) => {
                        void event.currentTarget.play().catch(() => {})
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.pause()
                        event.currentTarget.currentTime = 0
                      }}
                      onLoadedMetadata={(event) => {
                        const element = event.currentTarget
                        if (element.videoWidth && element.videoHeight) {
                          setInputVideoMeta({ width: element.videoWidth, height: element.videoHeight })
                        }
                      }}
                    />
                    <div
                      ref={captionOverlayRef}
                      className="absolute left-1/2 z-10 w-[78%] max-w-[calc(100%-20px)] px-2.5 py-2 rounded-lg"
                      style={{
                        ...apiPreviewOverlayPosition,
                        backgroundColor: previewBackground,
                      }}
                    >
                      <p className="text-center whitespace-normal break-words" style={apiPreviewStyle}>
                        This is a{' '}
                        <span style={{ color: highlightColor, fontWeight: apiPreviewStyle.fontWeight }}>preview</span>{' '}
                        subtitle.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="border-2 border-dashed border-surface-200 rounded-lg p-6 text-center">
                      <p className="text-sm text-surface-400">Drop a video here or choose a file</p>
                      <Button
                        variant="primary"
                        size="md"
                        className="mt-3"
                        onClick={(event) => {
                          event.stopPropagation()
                          openFilePicker()
                        }}
                      >
                        Choose Video
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setVideoFile(file)
                          setVideoUrl('')
                          setInputVideoMeta(null)
                          setYOffsetTouched(false)
                          setSourceVideoUrl(null)
                          setSentenceSegments([])
                          setTranscription(null)
                          setOutputUrl(null)
                        }}
                      />
                      {videoFile && <p className="text-xs text-surface-400 mt-2">{videoFile.name}</p>}
                    </div>
                    <label
                      htmlFor="captions-video-url-input"
                      className="text-xs font-semibold text-surface-400 uppercase tracking-wider"
                    >
                      Or paste a video URL
                    </label>
                    <div className="relative">
                      <Input
                        id="captions-video-url-input"
                        placeholder="https://..."
                        value={videoUrl}
                        onChange={(e) => {
                          setVideoUrl(e.target.value)
                          setInputVideoMeta(null)
                          if (e.target.value.trim()) {
                            setVideoFile(null)
                            setYOffsetTouched(false)
                            setSourceVideoUrl(null)
                            setSentenceSegments([])
                            setTranscription(null)
                            setOutputUrl(null)
                          }
                        }}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md text-surface-400 hover:text-surface-900 hover:bg-surface-100 transition"
                        onClick={() => {
                          if (!videoUrl.trim()) return
                          setVideoFile(null)
                          setInputVideoMeta(null)
                          setYOffsetTouched(false)
                          setSourceVideoUrl(null)
                          setSentenceSegments([])
                          setTranscription(null)
                          setOutputUrl(null)
                        }}
                        disabled={!videoUrl.trim()}
                        title="Use URL"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <Select
                    label="Preset"
                    value={selectedPresetId}
                    onChange={(e) => {
                      const value = e.target.value
                      setSelectedPresetId(value)
                      if (value) applyPreset(value)
                    }}
                    options={[
                      { value: '', label: 'Select preset' },
                      ...presets.map((preset) => ({ value: String(preset.id), label: preset.name })),
                    ]}
                  />
                  <Input
                    label="Preset Name"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="e.g., TikTok Bold"
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        if (!presetName.trim()) {
                          notify.error('Preset name is required')
                          return
                        }
                        const created = await create(presetName.trim(), null, currentSettings)
                        if (created) {
                          setSelectedPresetId(String(created.id))
                          notify.success('Preset saved')
                        } else {
                          notify.error('Failed to save preset')
                        }
                      }}
                    >
                      Save Preset
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!selectedPresetId}
                      onClick={async () => {
                        if (!selectedPresetId) return
                        const ok = await update(Number(selectedPresetId), {
                          name: presetName.trim() || undefined,
                          settings: currentSettings,
                        })
                        if (ok) notify.success('Preset updated')
                        else notify.error('Failed to update preset')
                      }}
                    >
                      Update
                    </Button>
                    <Button
                      variant="ghost-danger"
                      size="sm"
                      disabled={!selectedPresetId}
                      onClick={async () => {
                        if (!selectedPresetId) return
                        const ok = await remove(Number(selectedPresetId))
                        if (ok) {
                          setSelectedPresetId('')
                          notify.success('Preset deleted')
                        } else {
                          notify.error('Failed to delete preset')
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-50 rounded-lg p-4 space-y-4">
            <StepHeader stepNumber={2} title="Caption Settings" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Position"
                value={position}
                onChange={(e) => setPosition(e.target.value as 'top' | 'center' | 'bottom')}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'center', label: 'Center' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
              />
              <Select
                label="Font"
                value={fontName}
                onChange={(e) => setFontName(e.target.value)}
                options={fontOptions}
              />
              <Input
                label="Font Size"
                type="number"
                min={12}
                max={80}
                value={fontSize}
                onChange={(e) => setFontSize(parseNumericInput(e.target.value, fontSize))}
              />
              <Select
                label="Font Weight"
                value={fontWeight}
                onChange={(e) => setFontWeight(e.target.value as 'normal' | 'bold')}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'bold', label: 'Bold' },
                ]}
              />
              <Input
                label="Stroke Width"
                type="number"
                min={0}
                max={10}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseNumericInput(e.target.value, strokeWidth))}
              />
              <Input
                label="Background Opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={backgroundOpacity}
                onChange={(e) =>
                  setBackgroundOpacity(clampValue(parseNumericInput(e.target.value, backgroundOpacity), 0, 1))
                }
              />
              <Input
                label="X Offset"
                type="number"
                value={xOffset}
                onChange={(e) => setXOffset(parseNumericInput(e.target.value, xOffset))}
              />
              <Input
                label="Y Offset"
                type="number"
                min={-200}
                max={200}
                value={yOffset}
                onChange={(e) => {
                  const next = clampProviderYOffset(parseNumericInput(e.target.value, yOffset))
                  setYOffset(next)
                  setYOffsetTouched(true)
                }}
              />
              <Input
                label="Words Per Subtitle"
                type="number"
                min={1}
                max={12}
                value={wordsPerSubtitle}
                onChange={(e) =>
                  setWordsPerSubtitle(
                    Math.max(1, Math.min(12, Math.round(parseNumericInput(e.target.value, wordsPerSubtitle)))),
                  )
                }
              />
              <Select
                label="Animation"
                value={enableAnimation ? 'on' : 'off'}
                onChange={(e) => setEnableAnimation(e.target.value === 'on')}
                options={[
                  { value: 'on', label: 'Enabled' },
                  { value: 'off', label: 'Disabled' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ColorField label="Font Color" value={fontColor} onChange={setFontColor} />
              <ColorField label="Highlight Color" value={highlightColor} onChange={setHighlightColor} />
              <ColorField label="Stroke Color" value={strokeColor} onChange={setStrokeColor} />
              <ColorField label="Background Color" value={backgroundColor} onChange={setBackgroundColor} />
            </div>
          </div>

          <div className="bg-surface-50 rounded-lg p-4 space-y-4">
            <StepHeader stepNumber={3} title="Sentence Selection" />
            {!hasSegmentSelection && (
              <div className="rounded-lg border border-surface-200 bg-surface-0 p-4 text-sm text-surface-500">
                Generate captions once to load sentence-level controls.
              </div>
            )}
            {hasSegmentSelection && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-surface-400">
                    {enabledSegments.length}/{sentenceSegments.length} sentences enabled
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAllSentenceSegmentsEnabled(true)}>
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAllSentenceSegmentsEnabled(false)}>
                      Clear All
                    </Button>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {sentenceSegments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      className={`w-full text-left rounded-lg border p-3 transition ${
                        segment.enabled
                          ? 'border-surface-200 bg-surface-0 hover:border-primary/50'
                          : 'border-surface-200/50 bg-surface-100/50 opacity-70'
                      }`}
                      onClick={() => toggleSentenceSegment(segment.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-surface-900 flex-1">{segment.text}</p>
                        <span className="text-xs text-surface-400 whitespace-nowrap">
                          {formatSegmentTimestamp(segment.start)} - {formatSegmentTimestamp(segment.end)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            {submitting ? 'Generating...' : 'Generate Captioned Video'}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={handleRenderSelected}
            disabled={!canRenderFromSelection || !hasExcludedSegments || renderingSelection}
            loading={renderingSelection}
          >
            {renderingSelection ? 'Applying Selection...' : 'Apply Selected Sentences'}
          </Button>
        </div>

        <div className="bg-surface-50 rounded-lg p-4 space-y-4">
          <StepHeader stepNumber={4} title="Output" />
          <div className="space-y-3">
            {outputUrl && (
              // biome-ignore lint/a11y/useMediaCaption: generated preview videos do not have captions yet
              <video controls src={outputUrl} className="w-full rounded-lg border border-surface-200" />
            )}
            {!outputUrl && (
              <div className="rounded-lg border border-surface-200 bg-surface-0 p-6 text-sm text-surface-500">
                Captioned video will appear here.
              </div>
            )}
            {outputUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = outputUrl
                  a.download = 'captioned-video.mp4'
                  a.click()
                }}
              >
                Download Captioned Video
              </Button>
            )}
            {transcription && (
              <div className="rounded-lg border border-surface-200 bg-surface-0 p-4 text-xs text-surface-500 whitespace-pre-wrap">
                {transcription}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
