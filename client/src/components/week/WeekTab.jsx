import { useEffect, useMemo, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { TopBar } from '../common/TopBar'
import { EmptyState } from '../common/EmptyState'
import { CookedSheet } from '../recipe/CookedSheet'
import { useData } from '../../context/DataContext'
import { api } from '../../services/api'

const AISLE_LABELS = {
  produce: 'Produce',
  'meat-fish': 'Meat & fish',
  'dairy-eggs': 'Dairy & eggs',
  'pasta-rice-noodles': 'Pasta, rice & noodles',
  'sauces-spices': 'Sauces & spices',
  'canned-jars': 'Canned & jars',
  frozen: 'Frozen',
  bakery: 'Bakery',
  other: 'Other',
}

const CHECKS_KEY = 'two_pans_shopping_checks'

function loadChecks() {
  try {
    return JSON.parse(localStorage.getItem(CHECKS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function WeekTab({ onOpenRecipe }) {
  const { week, refreshWeek, refreshRecipes, refreshHistory, loaded } = useData()
  const [checks, setChecks] = useState(loadChecks)
  const [cookingRecipe, setCookingRecipe] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    localStorage.setItem(CHECKS_KEY, JSON.stringify(checks))
  }, [checks])

  const toggleCheck = (key) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const resetChecks = () => setChecks({})

  const removeFromWeek = async (id) => {
    if (busyId) return
    setBusyId(id)
    try {
      await api.updateRecipe(id, { inWeek: false })
      await Promise.all([refreshWeek(), refreshRecipes()])
    } finally {
      setBusyId(null)
    }
  }

  const confirmCooked = async (payload) => {
    await api.cookRecipe(cookingRecipe.id, payload)
    await Promise.all([refreshRecipes(), refreshWeek(), refreshHistory()])
  }

  const checkedCount = useMemo(() => Object.values(checks).filter(Boolean).length, [checks])
  const totalItems = useMemo(
    () => week.shoppingList.reduce((sum, group) => sum + group.items.length, 0),
    [week.shoppingList]
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar title="This Week" />

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-24">
        {loaded && week.recipes.length === 0 && (
          <EmptyState
            emoji="🗓️"
            title="No recipes picked yet"
            sub="Add a few from Ideas to build this week's plan and shopping list."
          />
        )}

        {week.recipes.length > 0 && (
          <div className="space-y-3 mb-6">
            {week.recipes.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => onOpenRecipe(r.id)}>
                  <span className="text-2xl shrink-0">{r.emoji || '🍽️'}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-800 truncate">{r.title}</p>
                    {r.timeMinutes && <p className="text-xs text-ink-400">{r.timeMinutes} min</p>}
                  </div>
                </button>
                <button
                  onClick={() => setCookingRecipe(r)}
                  className="h-9 px-3 rounded-lg bg-ink-50 text-ink-600 text-sm font-medium active:bg-ink-100 whitespace-nowrap"
                >
                  Cooked ✓
                </button>
                <button
                  onClick={() => removeFromWeek(r.id)}
                  disabled={busyId === r.id}
                  aria-label="Remove from week"
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-ink-50 text-ink-400 active:bg-ink-100 shrink-0 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {totalItems > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-ink-800">
                Shopping list <span className="text-ink-400 font-normal text-sm">({checkedCount}/{totalItems})</span>
              </h2>
              <button
                onClick={resetChecks}
                className="flex items-center gap-1 text-xs text-ink-400 underline underline-offset-2"
              >
                <RotateCcw size={11} /> Reset checks
              </button>
            </div>
            <div className="space-y-4">
              {week.shoppingList.map((group) => (
                <div key={group.aisle} className="bg-white rounded-2xl shadow-card overflow-hidden">
                  <div className="px-4 py-2 bg-ink-50 text-xs font-bold uppercase tracking-wide text-ink-500">
                    {AISLE_LABELS[group.aisle] || group.aisle}
                  </div>
                  <div className="divide-y divide-ink-50">
                    {group.items.map((item) => {
                      const key = `${group.aisle}:${item.name}`
                      const checked = Boolean(checks[key])
                      return (
                        <label
                          key={key}
                          className="flex items-start gap-3 px-4 py-3 active:bg-ink-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCheck(key)}
                            className="mt-0.5 w-5 h-5 rounded-md accent-tomato-500 shrink-0"
                          />
                          <div className={`min-w-0 ${checked ? 'opacity-40 line-through' : ''}`}>
                            <p className="text-sm font-medium text-ink-800">
                              {item.name}
                              {item.amounts?.length > 0 && (
                                <span className="text-ink-400 font-normal"> · {item.amounts.join(', ')}</span>
                              )}
                            </p>
                            {item.recipes?.length > 0 && (
                              <p className="text-xs text-ink-400 truncate">{item.recipes.join(', ')}</p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {cookingRecipe && (
        <CookedSheet title={cookingRecipe.title} onClose={() => setCookingRecipe(null)} onConfirm={confirmCooked} />
      )}
    </div>
  )
}
