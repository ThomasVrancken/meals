import { useEffect, useMemo, useState } from 'react'
import { ThumbsUp, ThumbsDown, Plus, Check, Pencil, Sparkles, Clock, CookingPot } from 'lucide-react'
import { Sheet } from '../common/Sheet'
import { Chip } from '../common/Chip'
import { LoadingPanel } from '../common/LoadingDots'
import { DismissSheet } from './DismissSheet'
import { CookedSheet } from './CookedSheet'
import { EditRecipeForm } from './EditRecipeForm'
import { api } from '../../services/api'
import { useData } from '../../context/DataContext'

export function RecipeDetail({ recipeId, onClose }) {
  const { recipes, patchRecipeLocal, refreshRecipes, refreshWeek, refreshHistory } = useData()
  const [fetched, setFetched] = useState(null)
  const [mode, setMode] = useState('view') // view | edit
  const [showDismiss, setShowDismiss] = useState(false)
  const [showCooked, setShowCooked] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [busy, setBusy] = useState(false)

  const [aiInstruction, setAiInstruction] = useState('')
  const [asVariation, setAsVariation] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSummary, setAiSummary] = useState(null)
  const [aiError, setAiError] = useState(null)

  const recipe = useMemo(() => recipes.find((r) => r.id === recipeId) || fetched, [recipes, fetched, recipeId])

  useEffect(() => {
    if (!recipes.find((r) => r.id === recipeId)) {
      api.getRecipe(recipeId).then(({ recipe }) => setFetched(recipe)).catch(() => {})
    }
  }, [recipeId, recipes])

  if (!recipe) {
    return (
      <Sheet onClose={onClose} full title="Recipe">
        <LoadingPanel message="Loading recipe…" />
      </Sheet>
    )
  }

  const toggleWeek = async () => {
    if (busy) return
    const next = !recipe.inWeek
    patchRecipeLocal(recipe.id, { inWeek: next })
    setBusy(true)
    try {
      await api.updateRecipe(recipe.id, { inWeek: next })
      refreshWeek()
    } finally {
      setBusy(false)
    }
  }

  const thumbUp = async () => {
    if (busy) return
    const wasUp = recipe.feedback === 'up'
    patchRecipeLocal(recipe.id, { feedback: wasUp ? null : 'up' })
    setBusy(true)
    try {
      await api.updateRecipe(recipe.id, { feedback: wasUp ? null : 'up' })
      refreshRecipes()
    } finally {
      setBusy(false)
    }
  }

  const confirmDismiss = async (reason) => {
    await api.updateRecipe(recipe.id, { feedback: 'down', feedbackNote: reason || null })
    await refreshRecipes()
    onClose()
  }

  const confirmCooked = async (payload) => {
    await api.cookRecipe(recipe.id, payload)
    await Promise.all([refreshRecipes(), refreshWeek(), refreshHistory()])
  }

  const saveEdit = async (patch) => {
    setSavingEdit(true)
    try {
      await api.updateRecipe(recipe.id, patch)
      await refreshRecipes()
      setMode('view')
    } finally {
      setSavingEdit(false)
    }
  }

  const submitAiEdit = async () => {
    if (!aiInstruction.trim() || aiBusy) return
    setAiBusy(true)
    setAiError(null)
    setAiSummary(null)
    try {
      const { recipe: updated, summary } = await api.aiEditRecipe(recipe.id, {
        instruction: aiInstruction.trim(),
        asVariation,
      })
      setAiSummary(summary)
      setAiInstruction('')
      await refreshRecipes()
      if (asVariation && updated?.id && updated.id !== recipe.id) {
        setFetched(updated)
      }
    } catch (err) {
      setAiError(err.message || 'Could not make that change. Try again.')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} full>
      {mode === 'edit' ? (
        <EditRecipeForm recipe={recipe} saving={savingEdit} onCancel={() => setMode('view')} onSave={saveEdit} />
      ) : (
        <div className="pb-4">
          <div className="flex items-start gap-3 mb-1">
            <div className="text-4xl leading-none">{recipe.emoji || '🍽️'}</div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h1 className="text-xl font-bold text-ink-800 leading-snug">{recipe.title}</h1>
            </div>
            <button
              onClick={() => setMode('edit')}
              aria-label="Edit"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-ink-50 active:bg-ink-100 text-ink-500 shrink-0"
            >
              <Pencil size={16} />
            </button>
          </div>

          {recipe.description && <p className="text-ink-500 text-sm mt-1.5">{recipe.description}</p>}

          <div className="flex flex-wrap gap-1.5 mt-3">
            {recipe.timeMinutes && (
              <Chip>
                <Clock size={11} /> {recipe.timeMinutes} min
              </Chip>
            )}
            {recipe.pans && (
              <Chip>
                <CookingPot size={11} /> {recipe.pans} pan{recipe.pans > 1 ? 's' : ''}
              </Chip>
            )}
            {recipe.cuisine && <Chip>{recipe.cuisine}</Chip>}
            {recipe.tags?.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
            {recipe.cookedCount > 0 && <Chip tone="basil">Cooked {recipe.cookedCount}×</Chip>}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-ink-50">
            <button
              onClick={() => setShowDismiss(true)}
              aria-label="Not interested"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-ink-50 active:bg-ink-100 text-ink-500 shrink-0"
            >
              <ThumbsDown size={17} />
            </button>
            <button
              onClick={thumbUp}
              aria-label="Like"
              className={`w-11 h-11 flex items-center justify-center rounded-xl active:opacity-70 shrink-0 ${
                recipe.feedback === 'up' ? 'bg-tomato-100 text-tomato-600' : 'bg-ink-50 text-ink-500'
              }`}
            >
              <ThumbsUp size={17} />
            </button>
            <button
              onClick={toggleWeek}
              className={`flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl font-medium text-sm active:opacity-80 ${
                recipe.inWeek ? 'bg-basil-500 text-white' : 'bg-ink-50 text-ink-600'
              }`}
            >
              {recipe.inWeek ? <Check size={16} /> : <Plus size={16} />}
              {recipe.inWeek ? 'In week' : 'Add to week'}
            </button>
            <button
              onClick={() => setShowCooked(true)}
              className="h-11 px-3.5 flex items-center justify-center rounded-xl font-medium text-sm bg-ink-50 text-ink-600 active:bg-ink-100 whitespace-nowrap shrink-0"
            >
              Cooked ✓
            </button>
          </div>

          <div className="mt-6">
            <h2 className="text-base font-bold text-ink-800 mb-2">Ingredients</h2>
            <div className="bg-white rounded-2xl shadow-card divide-y divide-ink-50 overflow-hidden">
              {(recipe.ingredients || []).map((ing, i) => (
                <div key={i} className="px-4 py-2.5 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink-700 shrink-0 min-w-[64px]">{ing.amount}</span>
                  <span className="text-sm text-ink-700">
                    {ing.name}
                    {ing.note && <span className="text-ink-400"> · {ing.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-base font-bold text-ink-800 mb-2">Steps</h2>
            <ol className="space-y-3">
              {(recipe.steps || []).map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-tomato-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-ink-700 leading-relaxed pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-7">
            <h2 className="text-base font-bold text-ink-800 mb-2 flex items-center gap-1.5">
              <Sparkles size={16} className="text-tomato-500" /> Ask AI to change this
            </h2>
            {aiBusy ? (
              <LoadingPanel message="Rewriting the recipe…" sub="Usually takes 10–30 seconds." />
            ) : (
              <>
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder="e.g. swap chicken for tofu, make it spicier"
                  rows={2}
                  className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none mb-2"
                />
                <label className="flex items-center gap-2 mb-3 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    checked={asVariation}
                    onChange={(e) => setAsVariation(e.target.checked)}
                    className="w-4 h-4 rounded accent-tomato-500"
                  />
                  Save as a new variation instead of changing this one
                </label>
                {aiError && <p className="text-tomato-600 text-xs mb-2">{aiError}</p>}
                {aiSummary && <p className="text-basil-600 text-xs mb-2">✓ {aiSummary}</p>}
                <button
                  onClick={submitAiEdit}
                  disabled={!aiInstruction.trim() || aiBusy}
                  className="w-full py-3 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-40"
                >
                  Apply change
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showDismiss && (
        <DismissSheet title={recipe.title} onClose={() => setShowDismiss(false)} onConfirm={confirmDismiss} />
      )}
      {showCooked && (
        <CookedSheet title={recipe.title} onClose={() => setShowCooked(false)} onConfirm={confirmCooked} />
      )}
    </Sheet>
  )
}
