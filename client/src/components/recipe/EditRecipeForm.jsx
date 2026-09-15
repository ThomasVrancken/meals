import { useState } from 'react'

// Ingredients as `amount | name | aisle` lines, steps as one-per-line.
function ingredientsToLines(ingredients = []) {
  return ingredients.map((i) => `${i.amount || ''} | ${i.name || ''} | ${i.aisle || 'other'}`).join('\n')
}

function linesToIngredients(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [amount, name, aisle] = line.split('|').map((s) => (s || '').trim())
      return { amount: amount || '', name: name || line, aisle: aisle || 'other' }
    })
}

function stepsToLines(steps = []) {
  return steps.join('\n')
}

function linesToSteps(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export function EditRecipeForm({ recipe, onCancel, onSave, saving }) {
  const [title, setTitle] = useState(recipe.title || '')
  const [emoji, setEmoji] = useState(recipe.emoji || '🍽️')
  const [description, setDescription] = useState(recipe.description || '')
  const [ingredientsText, setIngredientsText] = useState(ingredientsToLines(recipe.ingredients))
  const [stepsText, setStepsText] = useState(stepsToLines(recipe.steps))

  const submit = (e) => {
    e.preventDefault()
    onSave({
      title: title.trim(),
      emoji: emoji.trim() || '🍽️',
      description: description.trim(),
      ingredients: linesToIngredients(ingredientsText),
      steps: linesToSteps(stepsText),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        <div className="w-16">
          <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Emoji</label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-full bg-white border border-ink-100 rounded-2xl px-3 py-3 text-xl text-center outline-none focus:border-tomato-400"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">
          Ingredients <span className="normal-case font-normal text-ink-400">(one per line: amount | name | aisle)</span>
        </label>
        <textarea
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          rows={7}
          className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:border-tomato-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">
          Steps <span className="normal-case font-normal text-ink-400">(one per line)</span>
        </label>
        <textarea
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          rows={6}
          className="w-full bg-white border border-ink-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-tomato-400 resize-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 rounded-2xl font-medium text-ink-600 bg-ink-50 active:bg-ink-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="flex-1 py-3.5 rounded-2xl font-semibold text-white bg-tomato-500 active:bg-tomato-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </form>
  )
}
