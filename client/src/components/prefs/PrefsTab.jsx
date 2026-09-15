import { useEffect, useState } from 'react'
import { TopBar } from '../common/TopBar'
import { useData } from '../../context/DataContext'
import { api } from '../../services/api'

const FIELDS = [
  { key: 'cookingStyle', label: 'How we cook' },
  { key: 'likes', label: 'We like' },
  { key: 'dislikes', label: "We don't like" },
  { key: 'shopping', label: 'Shopping' },
  { key: 'learned', label: 'Learned from feedback' },
]

function timeAgo(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function PrefsTab() {
  const { preferences, refreshPreferences, prefsHistory, refreshPrefsHistory } = useData()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (preferences && !draft) setDraft(preferences)
  }, [preferences, draft])

  useEffect(() => {
    refreshPrefsHistory()
  }, [refreshPrefsHistory])

  const dirty =
    draft && preferences && FIELDS.some((f) => (draft[f.key] || '') !== (preferences[f.key] || ''))

  const save = async () => {
    if (saving || !dirty) return
    setSaving(true)
    setSaved(false)
    try {
      const patch = {}
      FIELDS.forEach((f) => {
        if ((draft[f.key] || '') !== (preferences[f.key] || '')) patch[f.key] = draft[f.key]
      })
      await api.updatePreferences(patch)
      await Promise.all([refreshPreferences(), refreshPrefsHistory()])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!draft) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Preferences" />
        <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar title="Preferences" />
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-24">
        <p className="text-ink-400 text-xs mb-4 -mt-1">Or just tell the chat — it can update these too.</p>

        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">
                {f.label}
              </label>
              <textarea
                value={draft[f.key] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                rows={f.key === 'learned' ? 5 : 4}
                className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm leading-relaxed outline-none focus:border-tomato-400 resize-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={save}
          disabled={!dirty || saving}
          className="w-full mt-5 py-3.5 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-40"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>

        {prefsHistory.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-ink-700 mb-2">Recent changes</h2>
            <div className="space-y-2">
              {prefsHistory.slice(0, 20).map((c, i) => (
                <div key={c.id || i} className="bg-white rounded-xl shadow-card px-4 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-ink-600 capitalize">{c.updatedBy}</span>
                    <span className="text-xs text-ink-400">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-ink-600">{c.summary || (c.changedFields || []).join(', ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
