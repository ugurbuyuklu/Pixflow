import { Download } from 'lucide-react'

interface DownloadToolbarProps {
  onDownloadAll: () => void
  onDownloadSelected?: () => void
  selectedCount?: number
  showDownloadAll?: boolean
}

export function DownloadToolbar({
  onDownloadAll,
  onDownloadSelected,
  selectedCount = 0,
  showDownloadAll = true,
}: DownloadToolbarProps) {
  return (
    <div className="flex gap-2">
      {showDownloadAll && (
        <button
          type="button"
          onClick={onDownloadAll}
          className="px-3 py-1.5 rounded-lg bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3 h-3" />
          Download All
        </button>
      )}
      {selectedCount > 0 && onDownloadSelected && (
        <button
          type="button"
          onClick={onDownloadSelected}
          className="px-3 py-1.5 rounded-lg bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3 h-3" />
          Download {selectedCount}
        </button>
      )}
    </div>
  )
}
