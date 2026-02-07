import { useState, useRef, useEffect } from 'react'
import { User, LogOut, KeyRound } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui/Button'

export function UserMenu() {
  const { user, logout, changePassword } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleChangePassword = async () => {
    setPwError(null)
    const err = await changePassword(currentPw, newPw)
    if (err) {
      setPwError(err)
    } else {
      setPwSuccess(true)
      setTimeout(() => {
        setChangingPassword(false)
        setPwSuccess(false)
        setCurrentPw('')
        setNewPw('')
      }, 1500)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-surface-400 hover:text-surface-900 transition-colors rounded-lg hover:bg-surface-100"
      >
        <User className="w-4 h-4" />
        <span className="text-sm">{user?.name || 'User'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-surface-50 border border-surface-100 rounded-xl shadow-xl z-50 py-1">
          <div className="px-3 py-2 border-b border-surface-100">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-surface-400">{user?.email}</p>
          </div>

          {changingPassword ? (
            <div className="px-3 py-3 space-y-2">
              <input
                type="password"
                placeholder="Current password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full bg-surface-100 border border-surface-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full bg-surface-100 border border-surface-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {pwError && <p className="text-xs text-danger">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-success">Password changed!</p>}
              <div className="flex gap-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={!currentPw || !newPw}
                  size="sm"
                  className="flex-1"
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setChangingPassword(false); setPwError(null); setCurrentPw(''); setNewPw('') }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setChangingPassword(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-600 hover:bg-surface-100 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                Change Password
              </button>
              <button
                onClick={() => { setOpen(false); logout() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
