import { ChevronDown, ChevronUp, Loader2, Minus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { OutputHistoryEntry, OutputHistoryStatus } from '../../stores/outputHistoryStore'
import { useOutputHistoryStore } from '../../stores/outputHistoryStore'
import { Button } from '../ui/Button'

const STORAGE_KEY = 'pixflow_job_monitor_collapsed'
const MAX_VISIBLE = 50

const EXCLUDED_CATEGORY_STRINGS = new Set([
  // Not currently part of OutputHistoryCategory, but keep this future-proof.
  'competitors',
  'competitor_report',
  'history',
  'library',
])

const STATUS_STYLE: Record<OutputHistoryStatus, { label: string; text: string; dot: string; icon?: 'spinner' }> = {
  running: { label: 'RUNNING', text: 'text-warning', dot: 'bg-warning border-warning', icon: 'spinner' },
  completed: { label: 'DONE', text: 'text-success', dot: 'bg-success border-success' },
  failed: { label: 'FAILED', text: 'text-danger', dot: 'bg-danger border-danger' },
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join(' ')
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function JobMonitorWidget() {
  const entries = useOutputHistoryStore((s) => s.entries)
  const remove = useOutputHistoryStore((s) => s.remove)

  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  const visible = useMemo(() => {
    const filtered = entries.filter((e) => !EXCLUDED_CATEGORY_STRINGS.has(String(e.category)))
    return filtered.slice(0, MAX_VISIBLE)
  }, [entries])

  const runningCount = useMemo(() => visible.filter((e) => e.status === 'running').length, [visible])

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Jobs</span>
          <span className="text-[11px] text-surface-400">
            {runningCount > 0 ? `${runningCount} running` : 'idle'} · {visible.length}/{MAX_VISIBLE}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost-muted"
          size="xs"
          icon={collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand job monitor' : 'Collapse job monitor'}
        />
      </div>
    </div>
  )

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-[45] no-drag pointer-events-none">
        <div className="pointer-events-auto w-[260px] rounded-xl border border-surface-100 bg-surface-0 shadow-lg">
          <div className="px-3 py-2">{header}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[45] no-drag pointer-events-none">
      <div className="pointer-events-auto w-[360px] max-w-[min(360px,calc(100vw-16px))] rounded-xl border border-surface-100 bg-surface-0 shadow-lg">
        <div className="px-3 py-2 border-b border-surface-100">{header}</div>

        <div className="max-h-[340px] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-3 text-xs text-surface-400">No jobs yet.</div>
          ) : (
            <div className="p-2 space-y-2">
              {visible.map((entry) => (
                <JobRow key={entry.id} entry={entry} onRemove={() => remove(entry.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function JobRow({ entry, onRemove }: { entry: OutputHistoryEntry; onRemove: () => void }) {
  const style = STATUS_STYLE[entry.status]
  const time = new Date(entry.updatedAt || entry.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="rounded-lg border border-surface-100 bg-surface-50 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full border-2 ${style.dot}`} />
            <div className="min-w-0">
              <div className="text-xs text-surface-900 truncate">{entry.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-surface-400">
                <span className="truncate">{formatCategory(String(entry.category))}</span>
                <span>·</span>
                <span className={style.text}>{style.label}</span>
                <span>·</span>
                <span>{time}</span>
              </div>
            </div>
          </div>

          {entry.message && <div className="mt-1 text-[11px] text-surface-400 line-clamp-2">{entry.message}</div>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {style.icon === 'spinner' && <Loader2 className="w-4 h-4 animate-spin text-warning" />}
          <Button
            variant="ghost-muted"
            size="xs"
            icon={<Minus className="w-3 h-3" />}
            onClick={onRemove}
            aria-label="Remove job"
          />
        </div>
      </div>
    </div>
  )
}
