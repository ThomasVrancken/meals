import { useState } from 'react'
import { Sheet } from '../common/Sheet'

const RATINGS = [
  { key: 'up', emoji: '😋', label: 'Loved it' },
  { key: 'meh', emoji: '😐', label: 'It was fine' },
  { key: 'down', emoji: '🙁', label: 'Not again' },
]

function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset()
  const local = new Date(d.getTime() - tz * 60000)
  return local.toISOString().slice(0, 10)
}

// Rating up/meh/down, note, date — used from a recipe card's "Cooked ✓"
// quick action and from the recipe detail sheet.
export function CookedSheet({ onClose, onConfirm, title }) {
  const [rating, setRating] = useState(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm({ rating, note: note.trim() || undefined, cookedAt: date })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} title="How was it?">
      <p className="text-ink-500 text-sm mb-4">
        Logging <span className="font-medium text-ink-700">{title}</span> as cooked
      </p>
      <div className="flex gap-2 mb-4">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRating(rating === r.key ? null : r.key)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
              rating === r.key ? 'border-tomato-400 bg-tomato-50' : 'border-ink-100 bg-white'
            }`}
          >
            <span className="text-2xl">{r.emoji}</span>
            <span className="text-xs font-medium text-ink-600">{r.label}</span>
          </button>
        ))}
      </div>
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Date</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 mb-4"
      />
      <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Note (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. added extra chili, will do again"
        rows={3}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none mb-4"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="w-full py-3.5 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </Sheet>
  )
}
