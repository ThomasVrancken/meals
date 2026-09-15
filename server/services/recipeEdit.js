const store = require('../db');
const { createJSON, models, LLMError } = require('../llm/openai');
const { buildContext } = require('../llm/context');
const { HOUSE_STYLE } = require('../llm/style');
const { RECIPE_CONTENT_SCHEMA, normalizeAiContent, buildRecipeDoc, contentOf } = require('../recipeModel');
const { notFound } = require('../http');

// AI-edits one recipe from a plain-language instruction, either in place
// (metadata such as status/feedback/cookedCount preserved server-side) or as
// a new saved variation linked via parentId.

const EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recipe: RECIPE_CONTENT_SCHEMA,
    summary: { type: 'string', description: 'One short sentence describing what changed' },
  },
  required: ['recipe', 'summary'],
};

const INSTRUCTIONS = `
You edit recipes in "Two Pans", a private dinner app. You get one recipe as JSON and an instruction
from the couple (e.g. "I used coconut cream and added peanuts, make that the recipe",
"swap chicken for tofu", "make it spicier"). Return the full updated recipe plus a one-sentence summary.

${HOUSE_STYLE}

# Editing rules
- Apply the instruction faithfully. If they describe what they actually did, make the recipe match
  reality (ingredients, amounts and the step where it happens).
- Change only what the instruction implies; keep the rest (wording, amounts, order) as is. Follow-on
  changes are fine when needed (e.g. tofu cooks differently than chicken, adjust that step).
- The house rules still apply to the result: ≤2 pans, no salt/pepper/oil/water, 3-6 short steps.
  If the instruction itself conflicts with a rule (e.g. "use the oven"), do what they ask.
- Update title/emoji/description/tags only when the dish meaningfully changed (e.g. a new protein).
  When asked to create a variation, give it a distinct title that names the difference
  (e.g. "Coconut-peanut red chicken curry").
- summary: one short plain sentence, e.g. "Swapped coconut milk for coconut cream and added peanuts."
`.trim();

/**
 * @param {string} recipeId
 * @param {{instruction: string, asVariation?: boolean, source?: 'ai'|'chat'}} opts
 * @returns {Promise<{recipe: object, summary: string, created: boolean, original: object}>}
 */
async function editRecipe(recipeId, { instruction, asVariation = false, source = 'ai' }) {
  const original = await store.getRecipe(recipeId);
  if (!original) throw notFound('Recipe not found');
  const { text: context } = await buildContext();

  const input = [
    context,
    '# Recipe to edit',
    JSON.stringify(contentOf(original)),
    '# Instruction',
    `"${instruction}"`,
    asVariation
      ? 'Create this as a NEW VARIATION of the recipe (the original stays as is), with a distinct title.'
      : 'Update this recipe in place.',
  ].join('\n\n');

  const result = await createJSON({
    model: models.main(),
    instructions: INSTRUCTIONS,
    input,
    schemaName: 'recipe_edit',
    schema: EDIT_SCHEMA,
    effort: 'low',
    maxOutputTokens: 6000,
    label: 'recipeEdit',
  });

  const check = normalizeAiContent(result.recipe);
  if (!check.ok) {
    console.warn(`[recipeEdit] invalid output: ${check.reason}`);
    throw new LLMError('AI produced an invalid recipe. Please try rephrasing the instruction.');
  }
  const summary = String(result.summary || '').trim() || 'Updated the recipe.';

  if (asVariation) {
    const doc = buildRecipeDoc(check.content, { status: 'saved', source, parentId: original.id });
    const recipe = await store.createRecipe(doc);
    return { recipe, summary, created: true, original };
  }
  // In place: only content fields change; id/status/feedback/cooked metadata are preserved.
  const recipe = await store.updateRecipe(original.id, check.content);
  return { recipe, summary, created: false, original };
}

module.exports = { editRecipe };
