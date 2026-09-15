import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TopBar } from '../common/TopBar'
import { RecipeCard } from '../recipe/RecipeCard'
import { EmptyState } from '../common/EmptyState'
import { LoadingPanel } from '../common/LoadingDots'
import { useData } from '../../context/DataContext'
import { api } from '../../services/api'

const COUNTS = [3, 5, 8]

export function IdeasTab({ onOpenRecipe }) {
  const { recipes, refreshRecipes, loaded } = useData()
  const [segment, setSegment] = useState('suggestions')
  const [hint, setHint] = useState('')
  const [count, setCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState(null)

  const suggestions = useMemo(
    () => recipes.filter((r) => r.status === 'suggested').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [recipes]
  )
  const cookbook = useMemo(
    () => recipes.filter((r) => r.status === 'saved').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [recipes]
  )

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      await api.generateRecipes({ count, hint: hint.trim() || undefined })
      await refreshRecipes()
      setHint('')
    } catch (err) {
      setError(err.message || 'Could not get ideas. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  const clearUntouched = async () => {
    if (clearing) return
    setClearing(true)
    try {
      await api.clearSuggestions()
      await refreshRecipes()
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar title="Ideas" />

      <div className="px-5 pb-3 shrink-0">
        <div className="flex bg-ink-50 rounded-xl p-1 gap-1">
          {[
            ['suggestions', 'Suggestions'],
            ['cookbook', 'Cookbook'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSegment(key)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                segment === key ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-24">
        {segment === 'suggestions' && (
          <>
            <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. something with salmon"
                disabled={generating}
                className="w-full bg-cream border border-ink-100 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-tomato-400 mb-3 disabled:opacity-60"
              />
              <div className="flex items-center gap-2">
                <div className="flex bg-cream rounded-xl p-1 gap-0.5">
                  {COUNTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCount(c)}
                      disabled={generating}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                        count === c ? 'bg-tomato-500 text-white' : 'text-ink-500'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-60"
                >
                  <Sparkles size={16} />
                  {generating ? 'Cooking up ideas…' : 'Get ideas'}
                </button>
              </div>
              {error && <p className="text-tomato-600 text-xs mt-2">{error}</p>}
            </div>

            {generating && (
              <LoadingPanel message="Cooking up ideas…" sub="This can take 20–40 seconds. Hang tight." />
            )}

            {!generating && loaded && suggestions.length === 0 && (
              <EmptyState
                emoji="✨"
                title="No suggestions yet"
                sub="Tap 'Get ideas' to get a few dinner suggestions based on what you like."
              />
            )}

            {!generating && suggestions.length > 0 && (
              <>
                <div className="space-y-3">
                  {suggestions.map((r) => (
                    <RecipeCard key={r.id} recipe={r} onOpen={onOpenRecipe} variant="suggested" />
                  ))}
                </div>
                <div className="flex justify-center mt-4">
                  <button
                    onClick={clearUntouched}
                    disabled={clearing}
                    className="text-xs text-ink-400 underline underline-offset-2 disabled:opacity-50"
                  >
                    {clearing ? 'Clearing…' : 'Clear untouched'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {segment === 'cookbook' && (
          <>
            {loaded && cookbook.length === 0 && (
              <EmptyState
                emoji="📖"
                title="Your cookbook is empty"
                sub="Thumbs-up a suggestion or cook something to save it here."
              />
            )}
            <div className="space-y-3">
              {cookbook.map((r) => (
                <RecipeCard key={r.id} recipe={r} onOpen={onOpenRecipe} variant="cookbook" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
