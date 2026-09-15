import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Sheet } from '../common/Sheet'

const RATINGS = [
  { key: 'up', emoji: '😋' },
  { key: 'meh', emoji: '😐' },
  { key: 'down', emoji: '🙁' },
]

function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset()
  const local = new Date(d.getTime() - tz * 60000)
  return local.toISOString().slice(0, 10)
}

// Used both for "+ We ate something" (entry = null) and for editing an
// existing entry (entry given, with a delete option).
export function HistoryEntrySheet({ entry, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(entry?.title || '')
  const [date, setDate] = useState(entry?.cookedAt || todayISO())
  const [rating, setRating] = useState(entry?.rating || null)
  const [note, setNote] = useState(entry?.note || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await onSave({ title: title.trim(), cookedAt: date, rating, note: note.trim() || undefined })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} title={entry ? 'Edit entry' : 'We ate something'}>
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">What</label>
      <input
        autoFocus={!entry}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Leftover pizza"
        disabled={Boolean(entry?.recipeId)}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 mb-4 disabled:opacity-60"
      />
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Date</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 mb-4"
      />
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Rating</label>
      <div className="flex gap-2 mb-4">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRating(rating === r.key ? null : r.key)}
            className={`flex-1 py-2.5 rounded-2xl text-2xl border transition-colors ${
              rating === r.key ? 'border-tomato-400 bg-tomato-50' : 'border-ink-100 bg-white'
            }`}
          >
            {r.emoji}
          </button>
        ))}
      </div>
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Note (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none mb-4"
      />
      <div className="flex gap-2">
        {entry && (
          <button
            onClick={remove}
            disabled={busy}
            aria-label="Delete"
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-tomato-50 text-tomato-600 active:bg-tomato-100 disabled:opacity-50"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          onClick={save}
          disabled={busy || !title.trim()}
          className="flex-1 py-3.5 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-50"
        >
          {busy ? 'Saving…' : entry ? 'Save changes' : 'Add to history'}
        </button>
      </div>
    </Sheet>
  )
}
