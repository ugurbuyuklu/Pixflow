import { Download, FolderOpen } from 'lucide-react'
import { assetUrl } from '../../lib/api'
import type { OutputHistoryArtifact, OutputHistoryEntry } from '../../stores/outputHistoryStore'
import { Button } from '../ui/Button'

interface PreviousGenerationsPanelProps {
  entries: OutputHistoryEntry[]
  onDeleteEntry: (id: string) => void
  onClear: () => void
  title?: string
}

const STATUS_STYLES: Record<
  OutputHistoryEntry['status'],
  { dot: string; label: string; text: string; border: string }
> = {
  running: {
    dot: 'bg-warning border-warning',
    label: 'RUNNING',
    text: 'text-warning',
    border: 'border-warning/40',
  },
  completed: {
    dot: 'bg-success border-success',
    label: 'COMPLETED',
    text: 'text-success',
    border: 'border-success/40',
  },
  failed: {
    dot: 'bg-danger border-danger',
    label: 'FAILED',
    text: 'text-danger',
    border: 'border-danger/40',
  },
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  return cleaned.replace(/^-+|-+$/g, '') || 'output'
}

function inferExtension(artifact: OutputHistoryArtifact): string {
  if (!artifact.url) return ''
  const raw = artifact.url.split('?')[0] || ''
  const ext = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1).toLowerCase() : ''
  if (ext) return ext
  if (artifact.type === 'video') return 'mp4'
  if (artifact.type === 'audio') return 'mp3'
  if (artifact.type === 'image') return 'png'
  if (artifact.type === 'folder') return ''
  if (artifact.type === 'text') return 'txt'
  return ''
}

async function downloadArtifact(artifact: OutputHistoryArtifact): Promise<void> {
  if (!artifact.url) return
  try {
    const target = assetUrl(artifact.url)
    const response = await fetch(target)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    const ext = inferExtension(artifact)
    const base = sanitizeFileName(artifact.label)
    a.download = ext ? `${base}.${ext}` : base
    a.click()
    URL.revokeObjectURL(blobUrl)
  } catch {
    const a = document.createElement('a')
    a.href = assetUrl(artifact.url)
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }
}

export function PreviousGenerationsPanel({
  entries,
  onDeleteEntry,
  onClear,
  title = 'Previous Generations',
}: PreviousGenerationsPanelProps) {
  if (entries.length === 0) return null

  return (
    <div className="bg-surface-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">{title}</h3>
        <Button variant="ghost-muted" size="xs" onClick={onClear}>
          Clear
        </Button>
      </div>

      <div className="space-y-3">
        {entries.map((entry, idx) => {
          const statusStyle = STATUS_STYLES[entry.status]
          const mediaArtifacts = entry.artifacts.filter((artifact) => artifact.type !== 'text' || artifact.url)
          return (
            <div key={entry.id} className={`bg-surface-0 rounded-lg border p-3 ${statusStyle.border}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-3 h-3 rounded-full border-2 ${statusStyle.dot}`} />
                    <span className="text-xs text-surface-400 truncate">
                      Run {entries.length - idx} - {entry.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-surface-400">
                    <span>{new Date(entry.startedAt).toLocaleString()}</span>
                    <span>·</span>
                    <span className={statusStyle.text}>{statusStyle.label}</span>
                  </div>
                </div>

                <Button variant="ghost-danger" size="xs" onClick={() => onDeleteEntry(entry.id)}>
                  Delete
                </Button>
              </div>

              {entry.message && <p className="text-xs text-surface-400 mb-2">{entry.message}</p>}

              {mediaArtifacts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mediaArtifacts.map((artifact) => (
                    <div key={artifact.id} className="rounded-md border border-surface-200 bg-surface-50 p-2">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[11px] font-semibold text-surface-400 truncate">{artifact.label}</p>
                        {artifact.url && artifact.type !== 'folder' && (
                          <Button
                            variant="ghost-muted"
                            size="xs"
                            icon={<Download className="w-3 h-3" />}
                            onClick={() => downloadArtifact(artifact)}
                          >
                            Download
                          </Button>
                        )}
                      </div>

                      {artifact.type === 'video' && artifact.url && (
                        // biome-ignore lint/a11y/useMediaCaption: archived generated videos have no caption tracks
                        <video controls src={assetUrl(artifact.url)} className="w-full rounded-md bg-black" />
                      )}
                      {artifact.type === 'image' && artifact.url && (
                        <img src={assetUrl(artifact.url)} alt={artifact.label} className="w-full rounded-md" />
                      )}
                      {artifact.type === 'audio' && artifact.url && (
                        // biome-ignore lint/a11y/useMediaCaption: archived generated audio has no caption tracks
                        <audio controls src={assetUrl(artifact.url)} className="w-full" />
                      )}
                      {artifact.type === 'folder' && artifact.url && (
                        <a
                          href={assetUrl(artifact.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-surface-500 underline"
                        >
                          <FolderOpen className="w-3 h-3" />
                          Open Folder
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
