import DiffMatchPatch from 'diff-match-patch'
import { useMemo } from 'react'

interface ScriptDiffViewProps {
  oldText: string
  newText: string
  className?: string
}

export function ScriptDiffView({ oldText, newText, className = '' }: ScriptDiffViewProps) {
  const diffElements = useMemo(() => {
    const dmp = new DiffMatchPatch()
    const diffs = dmp.diff_main(oldText, newText)
    dmp.diff_cleanupSemantic(diffs)

    return diffs.map((diff, index) => {
      const [operation, text] = diff

      if (operation === 0) {
        // No change
        return (
          <span key={index} className="text-surface-900">
            {text}
          </span>
        )
      }

      if (operation === 1) {
        // Addition
        return (
          <span
            key={index}
            className="bg-success-muted/40 text-surface-900 underline decoration-success decoration-2 relative group"
            title="Added text"
          >
            {text}
            <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block px-2 py-1 text-xs bg-surface-800 text-surface-100 rounded whitespace-nowrap">
              Added
            </span>
          </span>
        )
      }

      if (operation === -1) {
        // Deletion
        return (
          <span
            key={index}
            className="bg-danger-muted/40 text-surface-600 line-through decoration-danger decoration-2 relative group"
            title="Removed text"
          >
            {text}
            <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block px-2 py-1 text-xs bg-surface-800 text-surface-100 rounded whitespace-nowrap">
              Removed
            </span>
          </span>
        )
      }

      return null
    })
  }, [oldText, newText])

  return (
    <div className={`p-3 rounded-lg bg-surface-100 border border-surface-300 whitespace-pre-wrap break-words text-sm leading-relaxed ${className}`}>
      {diffElements}
    </div>
  )
}
