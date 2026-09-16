import { useEffect, useMemo, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { TopBar } from '../common/TopBar'
import { EmptyState } from '../common/EmptyState'
import { CookedSheet } from '../recipe/CookedSheet'
import { useData } from '../../context/DataContext'
import { api } from '../../services/api'
import { AISLES } from '../../constants/aisles'

const CHECKS_KEY = 'two_pans_shopping_checks'

function loadChecks() {
  try {
    return JSON.parse(localStorage.getItem(CHECKS_KEY) || '{}')
  } catch {
    return {}
  }
}

// Quick-add parsing: "milk x2" -> {name: "milk", amount: "x2"}; otherwise name-only.
function parseQuickAdd(text) {
  const raw = text.trim()
  const m = raw.match(/^(.+?)\s+x\s*(\d+)$/i)
  if (m) return { name: m[1].trim(), amount: `x${m[2]}` }
  return { name: raw, amount: null }
}

export function WeekTab({ onOpenRecipe }) {
  const {
    week,
    shoppingItems,
    refreshWeek,
    refreshRecipes,
    refreshHistory,
    refreshShoppingItems,
    patchShoppingItemLocal,
    removeShoppingItemLocal,
    loaded,
  } = useData()
  const [checks, setChecks] = useState(loadChecks)
  const [cookingRecipe, setCookingRecipe] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [quickAdd, setQuickAdd] = useState('')
  const [addBusy, setAddBusy] = useState(false)

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

  const addQuickItem = async () => {
    const { name, amount } = parseQuickAdd(quickAdd)
    if (!name || addBusy) return
    setQuickAdd('')
    setAddBusy(true)
    try {
      await api.addShoppingItem({ name, amount })
      await refreshShoppingItems()
    } finally {
      setAddBusy(false)
    }
  }

  const toggleItemChecked = async (item) => {
    const next = !item.checked
    patchShoppingItemLocal(item.id, { checked: next })
    try {
      await api.updateShoppingItem(item.id, { checked: next })
    } catch {
      await refreshShoppingItems()
    }
  }

  const deleteItem = async (item) => {
    removeShoppingItemLocal(item.id)
    try {
      await api.deleteShoppingItem(item.id)
    } catch {
      await refreshShoppingItems()
    }
  }

  const updateItemAisle = async (item, aisle) => {
    const prevAisle = item.aisle
    patchShoppingItemLocal(item.id, { aisle })
    try {
      await api.updateShoppingItem(item.id, { aisle })
    } catch {
      patchShoppingItemLocal(item.id, { aisle: prevAisle })
    }
  }

  const clearCheckedItems = async () => {
    await api.clearCheckedShoppingItems()
    await refreshShoppingItems()
  }

  const recipeItemCount = useMemo(
    () => week.shoppingList.reduce((sum, group) => sum + group.items.length, 0),
    [week.shoppingList]
  )
  const totalItems = recipeItemCount + shoppingItems.length
  const anyItemChecked = useMemo(() => shoppingItems.some((i) => i.checked), [shoppingItems])
  const recipeCheckedCount = useMemo(() => {
    let n = 0
    for (const group of week.shoppingList) {
      for (const item of group.items) if (checks[`${group.aisle}:${item.name}`]) n++
    }
    return n
  }, [week.shoppingList, checks])
  const manualCheckedCount = useMemo(() => shoppingItems.filter((i) => i.checked).length, [shoppingItems])
  const totalChecked = recipeCheckedCount + manualCheckedCount

  // One combined, store-ordered list: recipe ingredients + manual items grouped by the same
  // AH Haarlemmerplein walking-order aisle key.
  const combinedGroups = useMemo(() => {
    const byAisle = new Map()
    const ensure = (key) => {
      if (!byAisle.has(key)) byAisle.set(key, { recipeItems: [], manualItems: [] })
      return byAisle.get(key)
    }
    for (const group of week.shoppingList) ensure(group.aisle).recipeItems.push(...group.items)
    for (const item of shoppingItems) ensure(item.aisle || 'misc').manualItems.push(item)
    return AISLES.filter((a) => byAisle.has(a.key)).map((a) => ({ ...a, ...byAisle.get(a.key) }))
  }, [week.shoppingList, shoppingItems])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar title="This Week" />

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-24">
        {loaded && week.recipes.length === 0 && shoppingItems.length === 0 && (
          <EmptyState
            emoji="🗓️"
            title="Nothing on the list yet"
            sub="Add a few recipes from Ideas, or add loose groceries below."
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

        <div className="mb-3">
          <h2 className="text-base font-bold text-ink-800 mb-2">
            Shopping list
            {totalItems > 0 && (
              <span className="text-ink-400 font-normal text-sm">
                {' '}
                ({totalChecked}/{totalItems})
              </span>
            )}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addQuickItem()
            }}
            className="flex gap-2 mb-3"
          >
            <input
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              placeholder="Add an item, e.g. milk x2"
              className="flex-1 bg-white border border-ink-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-tomato-400"
            />
            <button
              type="submit"
              disabled={!quickAdd.trim() || addBusy}
              className="h-[42px] px-4 rounded-xl bg-tomato-500 text-white text-sm font-semibold active:bg-tomato-600 disabled:opacity-40"
            >
              Add
            </button>
          </form>

          {(recipeItemCount > 0 || anyItemChecked) && (
            <div className="flex items-center justify-end gap-4 mb-2">
              {anyItemChecked && (
                <button
                  onClick={clearCheckedItems}
                  className="flex items-center gap-1 text-xs text-ink-400 underline underline-offset-2"
                >
                  Clear checked
                </button>
              )}
              {recipeItemCount > 0 && (
                <button
                  onClick={resetChecks}
                  className="flex items-center gap-1 text-xs text-ink-400 underline underline-offset-2"
                >
                  <RotateCcw size={11} /> Reset checks
                </button>
              )}
            </div>
          )}
        </div>

        {combinedGroups.length > 0 && (
          <div className="space-y-4">
            {combinedGroups.map((group) => (
              <div key={group.key} className="bg-white rounded-2xl shadow-card overflow-hidden">
                <div className="px-4 py-2 bg-ink-50 text-xs font-bold uppercase tracking-wide text-ink-500">
                  {group.label}
                </div>
                <div className="divide-y divide-ink-50">
                  {group.recipeItems.map((item) => {
                    const key = `${group.key}:${item.name}`
                    const checked = Boolean(checks[key])
                    return (
                      <label key={key} className="flex items-start gap-3 px-4 py-3 active:bg-ink-50 cursor-pointer">
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
                          {item.where && <p className="text-xs text-ink-400">📍 {item.where}</p>}
                          {item.recipes?.length > 0 && (
                            <p className="text-xs text-ink-400 truncate">{item.recipes.join(', ')}</p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                  {group.manualItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(item.checked)}
                          onChange={() => toggleItemChecked(item)}
                          className="w-5 h-5 rounded-md accent-tomato-500 shrink-0"
                        />
                        <span
                          className={`text-sm font-medium text-ink-800 italic truncate ${
                            item.checked ? 'opacity-40 line-through' : ''
                          }`}
                        >
                          {item.name}
                          {item.amount && <span className="text-ink-400 font-normal not-italic"> · {item.amount}</span>}
                        </span>
                      </label>
                      <select
                        value={group.key}
                        onChange={(e) => updateItemAisle(item, e.target.value)}
                        aria-label={`Aisle for ${item.name}`}
                        className="text-[11px] bg-ink-50 text-ink-500 rounded-md px-1.5 py-1 border-none outline-none shrink-0 max-w-[92px]"
                      >
                        {AISLES.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => deleteItem(item)}
                        aria-label="Remove item"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-ink-50 text-ink-400 active:bg-ink-100 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cookingRecipe && (
        <CookedSheet title={cookingRecipe.title} onClose={() => setCookingRecipe(null)} onConfirm={confirmCooked} />
      )}
    </div>
  )
}
