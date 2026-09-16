import { useEffect, useMemo, useState } from 'react'
import { ThumbsUp, ThumbsDown, Plus, Check, Pencil, Sparkles, Clock, CookingPot, ArrowUp } from 'lucide-react'
import { Sheet } from '../common/Sheet'
import { Chip } from '../common/Chip'
import { LoadingPanel, LoadingDots } from '../common/LoadingDots'
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

  const [aiMode, setAiMode] = useState('ask') // ask | change
  const [aiInstruction, setAiInstruction] = useState('')
  const [asVariation, setAsVariation] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSummary, setAiSummary] = useState(null)
  const [aiError, setAiError] = useState(null)

  const [askThread, setAskThread] = useState([]) // [{role:'user'|'assistant', text}], this sheet only
  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState(null)

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

  const submitAsk = async () => {
    const question = askInput.trim()
    if (!question || askBusy) return
    setAskInput('')
    setAskBusy(true)
    setAskError(null)
    const priorHistory = askThread
    setAskThread((prev) => [...prev, { role: 'user', text: question }])
    try {
      const { answer } = await api.askRecipe(recipe.id, { question, history: priorHistory })
      setAskThread((prev) => [...prev, { role: 'assistant', text: answer }])
    } catch (err) {
      setAskError(err.message || 'Could not get an answer. Try again.')
    } finally {
      setAskBusy(false)
    }
  }

  const applyAsChange = (text) => {
    setAiMode('change')
    setAiInstruction(text)
    setAiError(null)
    setAiSummary(null)
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
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-ink-700 shrink-0 min-w-[64px]">{ing.amount}</span>
                    <span className="text-sm text-ink-700">
                      {ing.name}
                      {ing.note && <span className="text-ink-400"> · {ing.note}</span>}
                    </span>
                  </div>
                  {ing.where && <p className="text-xs text-ink-400 mt-0.5 pl-[72px]">📍 {ing.where}</p>}
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

          {recipe.tips && recipe.tips.length > 0 && (
            <div className="mt-6">
              <h2 className="text-base font-bold text-ink-800 mb-2">Tips</h2>
              <div className="bg-white rounded-2xl shadow-card divide-y divide-ink-50 overflow-hidden">
                {recipe.tips.map((tip, i) => (
                  <p key={i} className="px-4 py-2.5 text-sm text-ink-700 leading-relaxed">
                    💡 {tip}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-7">
            <h2 className="text-base font-bold text-ink-800 mb-2 flex items-center gap-1.5">
              <Sparkles size={16} className="text-tomato-500" /> Ask AI
            </h2>

            <div className="flex bg-ink-50 rounded-xl p-1 mb-3">
              <button
                type="button"
                onClick={() => setAiMode('ask')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  aiMode === 'ask' ? 'bg-white shadow-card text-ink-800' : 'text-ink-400'
                }`}
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => setAiMode('change')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  aiMode === 'change' ? 'bg-white shadow-card text-ink-800' : 'text-ink-400'
                }`}
              >
                Change
              </button>
            </div>

            {aiMode === 'ask' ? (
              <div>
                {askThread.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {askThread.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[90%]">
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap ${
                              m.role === 'user'
                                ? 'bg-tomato-500 text-white rounded-br-md'
                                : 'bg-white text-ink-800 shadow-card rounded-bl-md'
                            }`}
                          >
                            {m.text}
                          </div>
                          {m.role === 'assistant' && (
                            <button
                              onClick={() => applyAsChange(askThread[i - 1]?.text || m.text)}
                              className="mt-1 text-xs font-medium text-tomato-600 underline underline-offset-2"
                            >
                              Apply this as a change
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {askBusy && (
                  <div className="flex justify-start mb-3">
                    <div className="bg-white shadow-card rounded-2xl rounded-bl-md px-4 py-3 text-ink-400">
                      <LoadingDots />
                    </div>
                  </div>
                )}
                {askError && <p className="text-tomato-600 text-xs mb-2">{askError}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submitAsk()
                      }
                    }}
                    placeholder="e.g. can I use chicken breast instead?"
                    rows={1}
                    disabled={askBusy}
                    className="flex-1 bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none max-h-28 disabled:opacity-60"
                  />
                  <button
                    onClick={submitAsk}
                    disabled={!askInput.trim() || askBusy}
                    aria-label="Send"
                    className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-tomato-500 text-white active:bg-tomato-600 disabled:opacity-40"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            ) : aiBusy ? (
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
