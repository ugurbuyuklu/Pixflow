import { useCallback, useEffect, useRef } from 'react'
import { ASPECT_DIMENSIONS, type BlendMode, type ComposeLayer, useComposeStore } from '../../stores/composeStore'

const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  screen: 'screen',
  multiply: 'multiply',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
}

interface MediaRef {
  layerId: string
  element: HTMLImageElement | HTMLVideoElement
  type: 'image' | 'video'
}

export function ComposeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRefs = useRef<Map<string, MediaRef>>(new Map())
  const animFrameRef = useRef<number>(0)
  const playStartRef = useRef<number>(0)
  const playOffsetRef = useRef<number>(0)

  const layers = useComposeStore((s) => s.layers)
  const aspectRatio = useComposeStore((s) => s.aspectRatio)
  const isPlaying = useComposeStore((s) => s.isPlaying)
  const playbackTime = useComposeStore((s) => s.playbackTime)
  const setPlaybackTime = useComposeStore((s) => s.setPlaybackTime)
  const setIsPlaying = useComposeStore((s) => s.setIsPlaying)
  const totalDuration = useComposeStore((s) => s.totalDuration)

  const dims = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['9:16']

  const ensureMediaRef = useCallback((layer: ComposeLayer) => {
    const existing = mediaRefs.current.get(layer.id)
    if (existing && existing.layerId === layer.id) return existing

    if (layer.mediaType === 'image') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = layer.mediaUrl
      const ref: MediaRef = { layerId: layer.id, element: img, type: 'image' }
      mediaRefs.current.set(layer.id, ref)
      return ref
    }

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.src = layer.mediaUrl
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.load()
    const ref: MediaRef = { layerId: layer.id, element: video, type: 'video' }
    mediaRefs.current.set(layer.id, ref)
    return ref
  }, [])

  const drawFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const layer of layers) {
        if (!layer.visible) continue
        if (time < layer.startTime || time >= layer.startTime + layer.duration) continue

        const ref = ensureMediaRef(layer)
        if (!ref) continue

        const localTime = time - layer.startTime

        if (ref.type === 'video') {
          const videoEl = ref.element as HTMLVideoElement
          const targetTime = Math.min(localTime, videoEl.duration || layer.duration)
          if (Math.abs(videoEl.currentTime - targetTime) > 0.15) {
            videoEl.currentTime = targetTime
          }
        }

        ctx.save()
        ctx.globalAlpha = layer.opacity
        ctx.globalCompositeOperation = BLEND_MAP[layer.blendMode]

        try {
          ctx.drawImage(ref.element, 0, 0, canvas.width, canvas.height)
        } catch {
          // media not ready yet
        }

        ctx.restore()
      }
    },
    [layers, ensureMediaRef],
  )

  useEffect(() => {
    for (const layer of layers) {
      ensureMediaRef(layer)
    }

    const currentIds = new Set(layers.map((l) => l.id))
    for (const [id] of mediaRefs.current) {
      if (!currentIds.has(id)) mediaRefs.current.delete(id)
    }
  }, [layers, ensureMediaRef])

  // biome-ignore lint/correctness/useExhaustiveDependencies: layers and aspectRatio intentionally trigger redraw
  useEffect(() => {
    drawFrame(playbackTime)
  }, [playbackTime, drawFrame, layers, aspectRatio])

  const playbackTimeRef = useRef(playbackTime)
  playbackTimeRef.current = playbackTime

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animFrameRef.current)
      return
    }

    const duration = totalDuration()
    if (duration <= 0) {
      setIsPlaying(false)
      return
    }

    const initialTime = playbackTimeRef.current
    playStartRef.current = performance.now()
    playOffsetRef.current = initialTime

    for (const layer of layers) {
      const ref = mediaRefs.current.get(layer.id)
      if (ref?.type === 'video') {
        const videoEl = ref.element as HTMLVideoElement
        const localTime = initialTime - layer.startTime
        if (localTime >= 0 && localTime < layer.duration) {
          videoEl.currentTime = localTime
          void videoEl.play()
        }
      }
    }

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) / 1000
      const currentTime = playOffsetRef.current + elapsed

      if (currentTime >= duration) {
        setPlaybackTime(0)
        setIsPlaying(false)
        return
      }

      setPlaybackTime(currentTime)
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      for (const [, ref] of mediaRefs.current) {
        if (ref.type === 'video') (ref.element as HTMLVideoElement).pause()
      }
    }
  }, [isPlaying, totalDuration, setPlaybackTime, setIsPlaying, layers])

  const containerAspect = dims.width / dims.height
  const maxW = containerAspect >= 1 ? '100%' : `${containerAspect * 100}%`

  return (
    <div
      className="flex justify-center bg-surface-900 rounded-xl p-2"
      style={{ aspectRatio: `${dims.width}/${dims.height}`, maxWidth: maxW }}
    >
      <canvas
        ref={canvasRef}
        width={dims.width}
        height={dims.height}
        className="w-full h-full rounded-lg"
        style={{ objectFit: 'contain' }}
      />
    </div>
  )
}
