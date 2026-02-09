import { useRef, useState, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src: string
  className?: string
}

export function AudioPlayer({ src, className = '' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return

    const bounds = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const percent = x / bounds.width
    audio.currentTime = percent * duration
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* biome-ignore lint/a11y/useMediaCaption: AI-generated audio, no captions available */}
      <audio ref={audioRef} src={src} />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-600 hover:bg-brand-500 flex items-center justify-center transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-surface-900" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 text-surface-900 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Time */}
      <span className="text-xs text-surface-400 font-mono min-w-[35px]">
        {formatTime(currentTime)}
      </span>

      {/* Progress Bar */}
      <div
        className="flex-1 h-1.5 bg-surface-200 rounded-full cursor-pointer relative group"
        onClick={handleSeek}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleSeek(e as unknown as React.MouseEvent<HTMLDivElement>)
          }
        }}
      >
        {/* Progress Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-brand-600 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
        {/* Hover Effect */}
        <div className="absolute inset-0 rounded-full group-hover:bg-surface-300/30 transition-colors" />
      </div>

      {/* Duration */}
      <span className="text-xs text-surface-400 font-mono min-w-[35px]">
        {formatTime(duration)}
      </span>
    </div>
  )
}
