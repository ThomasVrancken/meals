import { X } from 'lucide-react'

// Full-screen-ish bottom sheet used for recipe detail, cooked form, edit
// form, dismiss-reason prompt, etc. `full` makes it cover almost the whole
// viewport (for recipe detail); otherwise it hugs its content from the
// bottom.
export function Sheet({ onClose, children, title, full = false }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end animate-fade-in">
      <div className="absolute inset-0 sheet-backdrop" onClick={onClose} />
      <div
        className={`relative bg-paper rounded-t-3xl shadow-sheet flex flex-col animate-slide-up safe-bottom ${
          full ? 'h-[94dvh]' : 'max-h-[88dvh]'
        }`}
      >
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
          <div className="mx-auto w-9 h-1 rounded-full bg-ink-100 absolute left-1/2 -translate-x-1/2 top-2" />
          {title ? <h2 className="text-lg font-bold text-ink-800 pt-1">{title}</h2> : <span />}
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-ink-50 active:bg-ink-100 text-ink-600 shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}
