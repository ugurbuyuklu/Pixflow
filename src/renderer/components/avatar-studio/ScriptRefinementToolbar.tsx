import { Redo, Undo } from 'lucide-react'

interface ScriptRefinementToolbarProps {
  onImprove: () => void
  onShorter: () => void
  onLonger: () => void
  onDuration: (duration: number) => void
  onUndo: () => void
  onRedo: () => void
  isGenerating: boolean
  canUndo: boolean
  canRedo: boolean
  targetDuration: number
  onTargetDurationChange: (duration: number) => void
}

export function ScriptRefinementToolbar({
  onImprove,
  onShorter,
  onLonger,
  onDuration,
  onUndo,
  onRedo,
  isGenerating,
  canUndo,
  canRedo,
  targetDuration,
  onTargetDurationChange,
}: ScriptRefinementToolbarProps) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onImprove}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
        >
          Improved
        </button>
        <button
          type="button"
          onClick={onShorter}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
        >
          Shorter
        </button>
        <button
          type="button"
          onClick={onLonger}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
        >
          Longer
        </button>
        <div className="w-px h-4 bg-surface-300" />
        <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-200 text-surface-900">
          <input
            type="number"
            value={targetDuration}
            onChange={(e) => onTargetDurationChange(Number(e.target.value))}
            min={5}
            max={120}
            className="w-8 bg-transparent text-surface-900 outline-none"
          />
          <span>sec.</span>
        </div>
        <button
          type="button"
          onClick={() => onDuration(targetDuration)}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-900 disabled:opacity-50"
        >
          Duration
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-600 hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded bg-surface-200 hover:bg-surface-300 text-surface-600 hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
