import { Check } from 'lucide-react'
import { VIDEO_PRESETS } from '../../stores/img2videoQueueStore'

interface CameraPresetCardsProps {
  selectedPresets: Record<string, string[]>
  onPresetsChange: (presets: Record<string, string[]>) => void
}

export function CameraPresetCards({ selectedPresets, onPresetsChange }: CameraPresetCardsProps) {
  const handleToggle = (category: string, preset: string) => {
    const current = selectedPresets[category] || []
    const isSelected = current.includes(preset)

    let newSelection: string[]
    if (isSelected) {
      // Deselect
      newSelection = current.filter((p) => p !== preset)
    } else {
      // Select
      const categoryDef = VIDEO_PRESETS[category]
      const maxSelections = categoryDef?.multiSelect ? 3 : 1

      if (categoryDef?.multiSelect === false) {
        // Single-select: replace existing
        newSelection = [preset]
      } else if (current.length >= maxSelections) {
        // Multi-select: enforce max limit by removing oldest
        newSelection = [...current.slice(1), preset]
      } else {
        newSelection = [...current, preset]
      }
    }

    onPresetsChange({
      ...selectedPresets,
      [category]: newSelection,
    })
  }

  return (
    <div className="space-y-2.5">
      {Object.entries(VIDEO_PRESETS).map(([category, config]) => (
        <div key={category}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-surface-400 font-semibold uppercase tracking-wider">
              {config.label}
            </p>
            <span className="text-[10px] text-surface-300 font-medium">
              {config.multiSelect ? 'up to 3' : 'select one'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {config.presets.map((preset) => {
              const isSelected = (selectedPresets[category] || []).includes(preset)

              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleToggle(category, preset)}
                  className={`
                    relative px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
                    ${
                      isSelected
                        ? 'bg-brand/20 text-brand ring-1 ring-brand/50'
                        : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                    }
                  `}
                >
                  {preset}
                  {isSelected && <Check className="inline-block ml-1 w-3 h-3" />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
