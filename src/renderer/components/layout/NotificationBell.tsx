import { Bell, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'

export function NotificationBell({
  compact = false,
  className = '',
  buttonClassName = '',
}: {
  compact?: boolean
  className?: string
  buttonClassName?: string
}) {
  const { notifications, unreadCount, load, markRead, markAllRead } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleOpen = () => {
    setOpen(!open)
    if (!open) load()
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className={`relative text-surface-400 hover:text-surface-900 transition-colors rounded-lg hover:bg-surface-100 ${
          compact ? 'w-11 h-11 inline-flex items-center justify-center p-0' : 'p-2'
        } ${buttonClassName}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger rounded-full text-[10px] flex items-center justify-center font-medium text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-surface-50 border border-surface-100 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-100">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-surface-400 py-6">No notifications</p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-100 transition-colors ${
                    n.read ? 'text-surface-400' : 'text-surface-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{n.title}</p>
                      <p className="text-xs text-surface-400 truncate">{n.body}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
