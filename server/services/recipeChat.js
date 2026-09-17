const store = require('../db');
const { createResponse, models, LLMError } = require('../llm/openai');
const { buildContext } = require('../llm/context');
const { HOUSE_STYLE } = require('../llm/style');
const { contentOf } = require('../recipeModel');
const { notFound } = require('../http');
const { editRecipe } = require('./recipeEdit');

// One chat box per recipe: answers questions about it AND decides on its own
// whether to change it, via a single `edit_recipe` tool (which delegates to
// recipeEdit.js). The client keeps the thread in memory for the open sheet
// and resends prior turns as `history` so follow-ups have context.

const MAX_TOOL_ROUNDS = 3;

const TOOLS = [
  {
    type: 'function',
    strict: true,
    name: 'edit_recipe',
    description:
      'Rewrite THIS recipe. instruction = a precise, self-contained description of the change (what to swap/add/remove, amounts, which step), written so an editor without the chat can apply it. asVariation = true only when they want to keep the original and save the change as a separate recipe.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        instruction: { type: 'string' },
        asVariation: { type: 'boolean' },
      },
      required: ['instruction', 'asVariation'],
    },
  },
];

const INSTRUCTIONS = `
You are the cooking assistant inside ONE recipe in "Two Pans", a private dinner app for Thomas and Lote.
You get the current recipe as JSON and the shared context (their preferences, cooking history). They
may ask a question, ask for a change, or tell you what they actually did while cooking.

# Deciding whether to change the recipe
You decide autonomously, with the edit_recipe tool:
- Change it when they ask for a change ("make it spicier", "swap chicken for tofu", "use 2 peppers"),
  or when they tell you what they actually did / what worked better and want the recipe to reflect it
  ("I used coconut cream and it was great"). Don't ask for confirmation, just do it.
- Don't change it for pure questions ("can I use chicken breast?", "how do I know the salmon is done?",
  "what can I prep ahead?"). Answer, and if a change would clearly help, briefly offer it ("want me to
  update the recipe?"). If they then say yes, make the change.
- When in doubt whether they're hypothesising or deciding, answer and offer rather than edit.
- Default is editing in place. Only use asVariation when they want to keep the original too
  ("save this as a separate version", "a vegetarian version too").
- Never claim a change you didn't make with the tool. After an edit, reply with one short sentence on
  what changed (plus a practical note if useful). The updated recipe is shown to them automatically.

# Answer style
Short, practical, conversational, like a friend who knows the recipe and knows cooking well. Think
about the actual food: timings, textures, what goes wrong, what a swap really changes. Plain text, no
markdown headings, no bullet-heavy formatting (a short inline list is fine). Usually 1-4 sentences.

${HOUSE_STYLE}
`.trim();

/**
 * @param {string} recipeId
 * @param {{message: string, history?: Array<{role: 'user'|'assistant', text: string}>}} opts
 * @returns {Promise<{answer: string, edit: null | {recipeId: string, title: string, summary: string, created: boolean}}>}
 */
async function chatAboutRecipe(recipeId, { message, history = [] } = {}) {
  const recipe = await store.getRecipe(recipeId);
  if (!recipe) throw notFound('Recipe not found');
  const { text: context } = await buildContext();

  let edit = null;
  const intro = [context, '# Recipe being discussed', JSON.stringify(contentOf(recipe))].join('\n\n');
  const base = {
    model: models.main(),
    instructions: INSTRUCTIONS,
    tools: TOOLS,
    reasoning: { effort: 'medium' },
    max_output_tokens: 6000,
  };

  let response = await createResponse(
    {
      ...base,
      input: [
        { role: 'user', content: intro },
        { role: 'assistant', content: 'Got it — ask away, or tell me what to change.' },
        ...history.slice(-12).map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.text || '').slice(0, 2000),
        })),
        { role: 'user', content: message },
      ],
    },
    { label: 'recipeChat r0' }
  );

  try {
    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const calls = (response.output || []).filter((item) => item.type === 'function_call');
      if (calls.length === 0) break;
      const outputs = [];
      for (const call of calls) {
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(await runEdit(call)) });
      }
      response = await createResponse(
        {
          ...base,
          previous_response_id: response.id,
          input: outputs,
          // At most one edit per message; after that (or on the last round) force a text reply.
          tool_choice: edit || round === MAX_TOOL_ROUNDS ? 'none' : 'auto',
        },
        { label: `recipeChat r${round}` }
      );
    }
  } catch (err) {
    // The edit already landed; don't hide it behind an error just because the follow-up reply failed.
    if (!edit) throw err;
    console.error(`[recipeChat] reply failed after edit: ${err.message}`);
    return { answer: `Done: ${edit.summary}`, edit };
  }

  async function runEdit(call) {
    if (call.name !== 'edit_recipe') return { error: `Unknown tool ${call.name}` };
    if (edit) return { error: 'The recipe was already edited for this message.' };
    try {
      const { instruction, asVariation } = JSON.parse(call.arguments || '{}');
      console.log(`[recipeChat] edit_recipe ${String(instruction).slice(0, 300)}`);
      // Edits the latest stored version (a previous turn may have changed it).
      const result = await editRecipe(recipeId, { instruction, asVariation: Boolean(asVariation), source: 'ai' });
      edit = { recipeId: result.recipe.id, title: result.recipe.title, summary: result.summary, created: result.created };
      return { ok: true, summary: result.summary, createdVariation: result.created, title: result.recipe.title };
    } catch (err) {
      console.warn(`[recipeChat] edit_recipe failed: ${err.message}`);
      return { error: err.message };
    }
  }

  const answer = (response.output_text || '').trim() || (edit ? edit.summary : '');
  if (!answer) throw new LLMError('AI returned an empty answer. Please try again.');
  return { answer, edit };
}

module.exports = { chatAboutRecipe };
