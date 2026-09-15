import { useState } from 'react'
import { Plus } from 'lucide-react'
import { TopBar } from '../common/TopBar'
import { EmptyState } from '../common/EmptyState'
import { HistoryEntrySheet } from './HistoryEntrySheet'
import { useData } from '../../context/DataContext'
import { api } from '../../services/api'

const RATING_EMOJI = { up: '😋', meh: '😐', down: '🙁' }

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function HistoryTab({ onOpenRecipe }) {
  const { history, refreshHistory, loaded } = useData()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  const create = async (payload) => {
    await api.addHistory(payload)
    await refreshHistory()
  }

  const update = async (payload) => {
    await api.updateHistory(editing.id, payload)
    await refreshHistory()
  }

  const remove = async () => {
    await api.deleteHistory(editing.id)
    await refreshHistory()
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar
        title="History"
        right={
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-sm font-semibold text-tomato-600 active:text-tomato-700"
          >
            <Plus size={16} /> Add
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-24">
        {loaded && history.length === 0 && (
          <EmptyState emoji="📝" title="Nothing logged yet" sub="Cook something, or add what you ate below." />
        )}

        <div className="space-y-2">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-2xl shadow-card p-3.5 flex items-center gap-3 active:bg-ink-50 cursor-pointer"
              onClick={() => setEditing(entry)}
            >
              <span className="text-2xl shrink-0">{entry.emoji || '🍽️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {entry.recipeId ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenRecipe(entry.recipeId)
                      }}
                      className="font-semibold text-ink-800 truncate underline decoration-ink-200 underline-offset-2"
                    >
                      {entry.title}
                    </button>
                  ) : (
                    <p className="font-semibold text-ink-800 truncate">{entry.title}</p>
                  )}
                </div>
                <p className="text-xs text-ink-400">{formatDate(entry.cookedAt)}</p>
                {entry.note && <p className="text-sm text-ink-500 mt-0.5 line-clamp-2">{entry.note}</p>}
              </div>
              {entry.rating && <span className="text-xl shrink-0">{RATING_EMOJI[entry.rating]}</span>}
            </div>
          ))}
        </div>
      </div>

      {adding && <HistoryEntrySheet onClose={() => setAdding(false)} onSave={create} />}
      {editing && (
        <HistoryEntrySheet entry={editing} onClose={() => setEditing(null)} onSave={update} onDelete={remove} />
      )}
    </div>
  )
}
