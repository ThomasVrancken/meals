const store = require('../db');
const { createResponse, models, LLMError } = require('../llm/openai');
const { buildContext } = require('../llm/context');
const { HOUSE_STYLE } = require('../llm/style');
const { contentOf } = require('../recipeModel');
const { notFound } = require('../http');

// Answers a quick question about one recipe WITHOUT changing it. Conversational,
// short, practical; the client keeps the Q&A thread in memory for the open sheet
// and resends prior turns as `history` so follow-ups have context.

const INSTRUCTIONS = `
You answer quick questions about ONE recipe in "Two Pans", a private dinner app for Thomas and Lote.
You get the recipe as JSON and the shared context below (their preferences, cooking history). Answer
ONLY the question asked: short, practical, conversational, like a friend who already knows the recipe.
Plain text, no markdown headings or bullet-heavy formatting (a short inline list is fine for e.g.
"what can I swap X for"). Usually 1-4 sentences.

You never change the recipe yourself, no matter how the question is phrased. If answering implies a
change they might want (a swap, an amount tweak, a technique), just say so briefly in your answer —
don't try to apply it. They can switch to "Change" mode themselves to actually apply it.

${HOUSE_STYLE}
`.trim();

/**
 * @param {string} recipeId
 * @param {{question: string, history?: Array<{role: 'user'|'assistant', text: string}>}} opts
 * @returns {Promise<{answer: string}>}
 */
async function askAboutRecipe(recipeId, { question, history = [] } = {}) {
  const recipe = await store.getRecipe(recipeId);
  if (!recipe) throw notFound('Recipe not found');
  const { text: context } = await buildContext();

  const intro = [context, '# Recipe being discussed', JSON.stringify(contentOf(recipe))].join('\n\n');

  const input = [
    { role: 'user', content: intro },
    { role: 'assistant', content: 'Got it — ask away about this recipe.' },
    ...history.slice(-12).map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.text || '').slice(0, 2000),
    })),
    { role: 'user', content: question },
  ];

  const response = await createResponse(
    {
      model: models.main(),
      instructions: INSTRUCTIONS,
      input,
      reasoning: { effort: 'low' },
      max_output_tokens: 1500,
    },
    { label: 'recipeAsk' }
  );

  const answer = (response.output_text || '').trim();
  if (!answer) throw new LLMError('AI returned an empty answer. Please try again.');
  return { answer };
}

module.exports = { askAboutRecipe };
