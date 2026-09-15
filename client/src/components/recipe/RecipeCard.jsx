import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Plus, Check, CookingPot, Clock } from 'lucide-react'
import { Chip } from '../common/Chip'
import { DismissSheet } from './DismissSheet'
import { CookedSheet } from './CookedSheet'
import { api } from '../../services/api'
import { useData } from '../../context/DataContext'

export function RecipeCard({ recipe, onOpen, variant = 'suggested' }) {
  const { patchRecipeLocal, refreshRecipes, refreshWeek, refreshHistory } = useData()
  const [showDismiss, setShowDismiss] = useState(false)
  const [showCooked, setShowCooked] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggleWeek = async (e) => {
    e.stopPropagation()
    if (busy) return
    const next = !recipe.inWeek
    patchRecipeLocal(recipe.id, { inWeek: next })
    setBusy(true)
    try {
      await api.updateRecipe(recipe.id, { inWeek: next })
      refreshWeek()
    } catch {
      patchRecipeLocal(recipe.id, { inWeek: !next })
    } finally {
      setBusy(false)
    }
  }

  const thumbUp = async (e) => {
    e.stopPropagation()
    if (busy) return
    const wasUp = recipe.feedback === 'up'
    patchRecipeLocal(recipe.id, { feedback: wasUp ? null : 'up', status: wasUp ? recipe.status : 'saved' })
    setBusy(true)
    try {
      await api.updateRecipe(recipe.id, { feedback: wasUp ? null : 'up' })
      refreshRecipes()
    } finally {
      setBusy(false)
    }
  }

  const confirmDismiss = async (reason) => {
    patchRecipeLocal(recipe.id, { feedback: 'down', status: 'dismissed' })
    await api.updateRecipe(recipe.id, { feedback: 'down', feedbackNote: reason || null })
    refreshRecipes()
  }

  const confirmCooked = async (payload) => {
    await api.cookRecipe(recipe.id, payload)
    await Promise.all([refreshRecipes(), refreshWeek(), refreshHistory()])
  }

  return (
    <>
      <div
        onClick={() => onOpen(recipe.id)}
        className="bg-white rounded-2xl shadow-card p-4 active:scale-[0.98] transition-transform cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl leading-none shrink-0 mt-0.5">{recipe.emoji || '🍽️'}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-ink-800 leading-snug">{recipe.title}</h3>
            {recipe.description && (
              <p className="text-sm text-ink-500 mt-0.5 line-clamp-2">{recipe.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
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
              {variant === 'cookbook' && recipe.cookedCount > 0 && (
                <Chip tone="basil">Cooked {recipe.cookedCount}×</Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-50">
          {variant === 'suggested' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDismiss(true)
              }}
              aria-label="Not interested"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-ink-50 active:bg-ink-100 text-ink-500"
            >
              <ThumbsDown size={17} />
            </button>
          )}
          <button
            onClick={thumbUp}
            aria-label="Like"
            className={`w-11 h-11 flex items-center justify-center rounded-xl active:opacity-70 ${
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
            {recipe.inWeek ? 'In week' : 'Week'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowCooked(true)
            }}
            className="h-11 px-3.5 flex items-center justify-center gap-1 rounded-xl font-medium text-sm bg-ink-50 text-ink-600 active:bg-ink-100 whitespace-nowrap"
          >
            Cooked ✓
          </button>
        </div>
      </div>

      {showDismiss && (
        <DismissSheet title={recipe.title} onClose={() => setShowDismiss(false)} onConfirm={confirmDismiss} />
      )}
      {showCooked && (
        <CookedSheet title={recipe.title} onClose={() => setShowCooked(false)} onConfirm={confirmCooked} />
      )}
    </>
  )
}
