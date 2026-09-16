import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

// Shared data layer: one place holding recipes / week / history /
// preferences so that a change made in one tab (e.g. chat creates a
// suggestion, Week logs a cooked meal) is immediately visible in every
// other tab without a manual reload. Each tab reads from this context and
// calls its refresh*/mutate* helpers instead of keeping its own copy.
const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [recipes, setRecipes] = useState([]) // all non-dismissed recipes (suggested + saved)
  const [week, setWeek] = useState({ recipes: [], shoppingList: [] })
  const [history, setHistory] = useState([])
  const [preferences, setPreferences] = useState(null)
  const [prefsHistory, setPrefsHistory] = useState([])
  const [shoppingItems, setShoppingItems] = useState([]) // manual "Other groceries" list
  const [loaded, setLoaded] = useState(false)
  const loadingRef = useRef(false)

  const refreshRecipes = useCallback(async () => {
    const { recipes } = await api.getRecipes('all')
    setRecipes(recipes)
    return recipes
  }, [])

  const refreshWeek = useCallback(async () => {
    const data = await api.getWeek()
    setWeek(data)
    return data
  }, [])

  const refreshHistory = useCallback(async () => {
    const { entries } = await api.getHistory()
    setHistory(entries)
    return entries
  }, [])

  const refreshPreferences = useCallback(async () => {
    const { preferences } = await api.getPreferences()
    setPreferences(preferences)
    return preferences
  }, [])

  const refreshPrefsHistory = useCallback(async () => {
    const { changes } = await api.getPreferencesHistory()
    setPrefsHistory(changes)
    return changes
  }, [])

  const refreshShoppingItems = useCallback(async () => {
    const { items } = await api.getShoppingItems()
    setShoppingItems(items)
    return items
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshRecipes(), refreshWeek(), refreshHistory(), refreshPreferences(), refreshShoppingItems()])
  }, [refreshRecipes, refreshWeek, refreshHistory, refreshPreferences, refreshShoppingItems])

  useEffect(() => {
    if (loadingRef.current) return
    loadingRef.current = true
    refreshAll().finally(() => setLoaded(true))
  }, [refreshAll])

  // Apply a `changed` map from a chat response (or any action) by
  // re-fetching just the affected slices.
  const applyChanged = useCallback(
    async (changed) => {
      if (!changed) return
      const tasks = []
      if (changed.recipes) tasks.push(refreshRecipes())
      if (changed.week) tasks.push(refreshWeek())
      if (changed.history) tasks.push(refreshHistory())
      if (changed.preferences) {
        tasks.push(refreshPreferences())
        tasks.push(refreshPrefsHistory())
      }
      if (changed.shopping) tasks.push(refreshShoppingItems())
      await Promise.all(tasks)
    },
    [refreshRecipes, refreshWeek, refreshHistory, refreshPreferences, refreshPrefsHistory, refreshShoppingItems]
  )

  // Optimistically patch a recipe in local state (used for instant-feeling
  // toggles like +Week / thumbs) ahead of the server round trip.
  const patchRecipeLocal = useCallback((id, patch) => {
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  // Optimistic helpers for the manual shopping list (check/uncheck, delete).
  const patchShoppingItemLocal = useCallback((id, patch) => {
    setShoppingItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const removeShoppingItemLocal = useCallback((id) => {
    setShoppingItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const value = {
    recipes,
    week,
    history,
    preferences,
    prefsHistory,
    shoppingItems,
    loaded,
    refreshRecipes,
    refreshWeek,
    refreshHistory,
    refreshPreferences,
    refreshPrefsHistory,
    refreshShoppingItems,
    refreshAll,
    applyChanged,
    patchRecipeLocal,
    patchShoppingItemLocal,
    removeShoppingItemLocal,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
