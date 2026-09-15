import { useState } from 'react'
import { Sheet } from '../common/Sheet'

// Optional-reason prompt shown before a thumbs-down / dismiss. Skippable.
export function DismissSheet({ onClose, onConfirm, title }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const confirm = async (skip) => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm(skip ? '' : reason.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} title="Not feeling it?">
      <p className="text-ink-500 text-sm mb-3">
        Optional: why not <span className="font-medium text-ink-700">{title}</span>? Helps future ideas.
      </p>
      <textarea
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. too much chopping, not keen on eggplant…"
        rows={3}
        className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none mb-4"
      />
      <div className="flex gap-2">
        <button
          onClick={() => confirm(true)}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl font-medium text-ink-600 bg-ink-50 active:bg-ink-100 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={() => confirm(false)}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </Sheet>
  )
}
