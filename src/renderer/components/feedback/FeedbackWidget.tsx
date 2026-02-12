import { MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import { notify } from '../../lib/toast'
import { useFeedbackStore } from '../../stores/feedbackStore'
import { useProductStore } from '../../stores/productStore'
import { Button } from '../ui/Button'

const CATEGORIES = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'other', label: 'Other' },
]

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('improvement')
  const [content, setContent] = useState('')
  const { submitting, submit } = useFeedbackStore()
  const activeProduct = useProductStore((s) => s.activeProduct)

  const handleSubmit = async () => {
    if (!content.trim()) return
    const ok = await submit(content.trim(), category, activeProduct?.id)
    if (ok) {
      notify.success('Feedback submitted!')
      setContent('')
      setCategory('improvement')
      setOpen(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {open && (
        <div className="absolute bottom-14 right-0 w-80 bg-surface-50 border border-surface-100 rounded-xl shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
            <span className="text-sm font-semibold text-surface-900">Send Feedback</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-surface-400 hover:text-surface-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                    category === c.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-100 text-surface-500 hover:text-surface-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tell us what you think..."
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg bg-surface-0 border border-surface-200 px-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
            <Button onClick={handleSubmit} loading={submitting} disabled={!content.trim()} size="sm" className="w-full">
              Submit
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${
          open ? 'bg-surface-200 text-surface-700' : 'bg-brand-600 text-white hover:bg-brand-500'
        }`}
      >
        {open ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
      </button>
    </div>
  )
}
