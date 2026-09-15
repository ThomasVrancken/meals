const store = require('../db');
const { createResponse, models, LLMError } = require('../llm/openai');
const { buildContext } = require('../llm/context');
const { HOUSE_STYLE } = require('../llm/style');
const { RECIPE_CONTENT_SCHEMA, normalizeAiContent, buildRecipeDoc } = require('../recipeModel');
const { amsterdamDate } = require('../http');
const { generateSuggestions } = require('./generate');
const { editRecipe } = require('./recipeEdit');
const recipesService = require('./recipes');

// Tool-using chat agent (Responses API function calling). It acts
// autonomously: performs changes through the same services the HTTP routes
// use, records a human-readable action chip for every successful mutation,
// and flips the matching `changed` flags so the client can refresh.

const MAX_TOOL_ROUNDS = 8;
const CHAT_HISTORY_MESSAGES = 20;
const MIN_PREF_LENGTH_RATIO = 0.4;
const RATING_EMOJI = { up: '👍', meh: '😐', down: '👎' };
const FIELD_NAMES = {
  cookingStyle: 'how we cook',
  likes: 'likes',
  dislikes: 'dislikes',
  shopping: 'shopping',
  learned: 'learned notes',
};

// ---------------------------------------------------------------------------
// Tool schemas (strict: every property required, optional ones nullable)

const nullableString = (description) => ({ type: ['string', 'null'], description });

const TOOLS = [
  {
    name: 'list_recipes',
    description: 'List recipes (compact). status: suggested (Ideas list), saved (cookbook), week (picked for this week), dismissed, all (everything except dismissed).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { status: { type: 'string', enum: ['suggested', 'saved', 'week', 'dismissed', 'all'] } },
      required: ['status'],
    },
  },
  {
    name: 'get_recipe',
    description: 'Get one full recipe (ingredients, steps, metadata) by id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { recipeId: { type: 'string' } },
      required: ['recipeId'],
    },
  },
  {
    name: 'get_history',
    description: 'Get what we cooked/ate in the last N days (newest first), with ratings and notes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { days: { type: 'integer', description: '1-365' } },
      required: ['days'],
    },
  },
  {
    name: 'update_preferences',
    description:
      'Change preference texts. newText is the FULL replacement text of that field: copy the current text verbatim and make a minimal targeted edit (add/adjust/remove one bullet). Refused if a field would shrink below 40% of its length.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              field: { type: 'string', enum: ['cookingStyle', 'likes', 'dislikes', 'shopping', 'learned'] },
              newText: { type: 'string' },
            },
            required: ['field', 'newText'],
          },
        },
        summary: { type: 'string', description: 'Very short label of the change, max ~6 words, e.g. "less zucchini"' },
      },
      required: ['changes', 'summary'],
    },
  },
  {
    name: 'generate_suggestions',
    description:
      'Generate new recipe ideas with the recipe generator (stored as suggestions in the Ideas list). Takes 20-40 s. Put every specific wish into hint.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        count: { type: 'integer', description: '1-8' },
        hint: nullableString(
          'Only the user\'s specific wishes for this batch, short, e.g. "one with salmon" or "vegetarian"; null if none. The generator already knows all house rules and preferences.'
        ),
      },
      required: ['count', 'hint'],
    },
  },
  {
    name: 'edit_recipe',
    description:
      'AI-edit a recipe from an instruction (e.g. "used coconut cream instead of coconut milk and added peanuts"). asVariation=false updates it in place; true creates a new saved recipe linked to the original.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recipeId: { type: 'string' },
        instruction: { type: 'string' },
        asVariation: { type: 'boolean' },
      },
      required: ['recipeId', 'instruction', 'asVariation'],
    },
  },
  {
    name: 'create_recipe',
    description:
      'Create a recipe you write yourself, following the house style (e.g. a dish we actually cooked that has no recipe yet). status saved = cookbook, suggested = Ideas list.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...RECIPE_CONTENT_SCHEMA.properties,
        status: { type: 'string', enum: ['saved', 'suggested'] },
        inWeek: { type: 'boolean' },
      },
      required: [...RECIPE_CONTENT_SCHEMA.required, 'status', 'inWeek'],
    },
  },
  {
    name: 'log_cooked',
    description:
      'Log a meal we cooked/ate. With recipeId: marks that recipe cooked (saved to cookbook, removed from week, cooked count +1; rating up/down also sets its thumbs) and adds a history entry. Without recipeId: history entry only, title required.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recipeId: nullableString('Recipe id, or null'),
        title: nullableString('Meal title when there is no recipeId, else null'),
        rating: { type: ['string', 'null'], enum: ['up', 'meh', 'down', null] },
        note: nullableString('Short note in their words, or null'),
        cookedAt: nullableString('YYYY-MM-DD; null means today'),
      },
      required: ['recipeId', 'title', 'rating', 'note', 'cookedAt'],
    },
  },
  {
    name: 'set_feedback',
    description: 'Thumbs up (saves to cookbook) or down (dismisses) a recipe, with optional note. null clears feedback.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recipeId: { type: 'string' },
        feedback: { type: ['string', 'null'], enum: ['up', 'down', null] },
        note: nullableString('Reason in their words, or null'),
      },
      required: ['recipeId', 'feedback', 'note'],
    },
  },
  {
    name: 'set_in_week',
    description: "Add a recipe to (or remove it from) this week's picks / shopping list.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { recipeId: { type: 'string' }, inWeek: { type: 'boolean' } },
      required: ['recipeId', 'inWeek'],
    },
  },
  {
    name: 'dismiss_recipe',
    description: 'Hide a recipe from Ideas/cookbook (no thumbs down).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { recipeId: { type: 'string' } },
      required: ['recipeId'],
    },
  },
].map((t) => ({ type: 'function', strict: true, ...t }));

// ---------------------------------------------------------------------------
// Prompt

const INSTRUCTIONS = `
You are the kitchen assistant inside "Two Pans", a private dinner app shared by Thomas and Lote, a couple
in Amsterdam. Either of them may be typing; "we" is the couple. With your tools you can read and change
everything in the app: preferences, recipe ideas, the cookbook, this week's picks and the cooking history.

# How to behave
- Be autonomous. When they state a preference, report a meal, or ask for something, DO it with your tools
  right away, then briefly tell what you did. Never ask "shall I?" or for confirmation. If something is
  ambiguous, choose the most sensible interpretation, act, and mention the assumption in a few words.
- Only claim changes that a tool call actually made. If a tool returns an error, fix the arguments and
  retry, or briefly explain what went wrong.
- Pure questions ("what did we eat recently?", "what's on the list this week?") are answered from the
  context below (or read-only tools). Do not change anything for them.
- Replies are short and friendly: 1-3 sentences, plain text, no headings. A few "- " bullets are fine when
  listing recipes. Don't paste full recipes unless asked; the app shows them. Reply in the user's language.

# Playbook
Preferences ("we don't like X", "more spicy please", "we bought an air fryer"):
- update_preferences on the field it belongs to (likes, dislikes, cookingStyle, shopping). newText = the
  current text copied verbatim plus one added or adjusted "- " bullet. Match the strength of the wish:
  "recommend it less" becomes a soft bullet (e.g. "- Zucchini: not a fan, use rarely"), "never X" a hard one.
  If the wish contradicts an existing bullet, edit that bullet instead of adding a conflicting one.
- Leave "learned" alone (the app maintains it) unless they explicitly ask to change it.

Ideas ("give me 3 ideas for this week, one with salmon"):
- generate_suggestions with their count (5 if unspecified, max 8) and a hint containing every specific
  wish. Never write idea recipes yourself. Then list the new titles briefly. Only add them to the week if
  they ask for that.

Meals they ate ("last night we cooked X but used Y, it was great", "we had pizza"):
1. Find the recipe: loosely match the title against current suggestions, week picks and the cookbook in
   the context; use list_recipes if unsure.
2. If they cooked it differently and liked the result, record the change with edit_recipe (instruction =
   what they did, in their words; don't guess what an ingredient replaced, the editor sees the recipe). asVariation=false for a suggestion, a week pick, or when they say to update the
   recipe; asVariation=true when it is an established cookbook favourite they'd keep as well, or it became
   a different dish. If they didn't like the change, don't edit; just mention it in the note.
3. log_cooked with the recipeId (the edited recipe, or the new variation's id), rating from their
   sentiment (great/loved/delicious -> up, fine/ok -> meh, bad/not again -> down, unclear -> null), a short
   note in their words, and cookedAt resolved from relative dates using today's date in the context
   ("last night"/"yesterday" = yesterday; "tonight"/"today" = today).
4. No matching recipe: if it's a home-cooked dish they liked and would repeat, create_recipe (status saved,
   inWeek false, house style below) and then log_cooked with its id. Otherwise (takeaway, restaurant,
   leftovers, vague) log_cooked with just a title.

Other:
- Opinions on a specific recipe ("the gnocchi idea looks great", "that curry was bland") -> set_feedback.
- "Put X in the week" / "take Y off the list" -> set_in_week. "Get rid of X" -> dismiss_recipe.
- "Make the red sauce spicier" (a change to an existing recipe) -> edit_recipe.

${HOUSE_STYLE}
`.trim();

// ---------------------------------------------------------------------------
// Tool execution

const compact = (r) => ({
  id: r.id,
  emoji: r.emoji,
  title: r.title,
  description: r.description,
  status: r.status,
  inWeek: r.inWeek,
  feedback: r.feedback,
  cookedCount: r.cookedCount,
  lastCookedAt: r.lastCookedAt,
});

function createToolRunner(state) {
  const addAction = (action) => state.actions.push(action);
  const flag = (...names) => names.forEach((n) => (state.changed[n] = true));

  return {
    async list_recipes({ status }) {
      const recipes = await store.listRecipes(status);
      return { recipes: recipes.map(compact) };
    },

    async get_recipe({ recipeId }) {
      const recipe = await store.getRecipe(recipeId);
      if (!recipe) return { error: `No recipe with id ${recipeId}` };
      return { recipe };
    },

    async get_history({ days }) {
      const d = Math.min(Math.max(Number(days) || 30, 1), 365);
      const entries = await store.listHistory({ sinceDate: amsterdamDate(-d) });
      return { entries: entries.map(({ createdAt, ...e }) => e) };
    },

    async update_preferences({ changes, summary }) {
      const current = await store.getPreferences();
      const updates = {};
      for (const { field, newText } of changes || []) {
        if (!(field in FIELD_NAMES)) return { error: `Unknown field ${field}` };
        const before = current[field] || '';
        const after = String(newText || '').trim();
        if (before.length >= 20 && after.length < before.length * MIN_PREF_LENGTH_RATIO) {
          return {
            error: `Refused: "${field}" would shrink from ${before.length} to ${after.length} characters. newText must be the FULL field text: copy the existing text and make only a targeted edit.`,
          };
        }
        updates[field] = after;
      }
      const { changedFields } = await store.updatePreferences(updates, { updatedBy: 'chat', summary });
      if (changedFields.length === 0) return { ok: true, note: 'Nothing changed (text identical).' };
      flag('preferences');
      addAction({
        type: 'preferences',
        label: `Updated ${changedFields.map((f) => FIELD_NAMES[f]).join(' & ')}: ${summary}`,
      });
      return { ok: true, changedFields };
    },

    async generate_suggestions({ count, hint }) {
      const n = Math.min(Math.max(Number(count) || 5, 1), 8);
      const created = await generateSuggestions({ count: n, hint: hint || null, source: 'chat' });
      if (created.length) flag('recipes');
      for (const r of created) addAction({ type: 'recipe', label: `New idea: ${r.title}`, recipeId: r.id });
      return { created: created.map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, description: r.description })) };
    },

    async edit_recipe({ recipeId, instruction, asVariation }) {
      const { recipe, summary, created, original } = await editRecipe(recipeId, {
        instruction,
        asVariation: Boolean(asVariation),
        source: 'chat',
      });
      flag('recipes');
      if (original.inWeek && !created) flag('week');
      addAction({
        type: 'recipe',
        label: created ? `New variation: ${recipe.title}` : `Edited ${recipe.title}`,
        recipeId: recipe.id,
      });
      return { recipeId: recipe.id, title: recipe.title, createdVariation: created, summary };
    },

    async create_recipe(args) {
      const { status, inWeek, ...content } = args;
      const check = normalizeAiContent(content);
      if (!check.ok) return { error: `Invalid recipe: ${check.reason}` };
      const recipe = await store.createRecipe(
        buildRecipeDoc(check.content, { status: status === 'suggested' ? 'suggested' : 'saved', source: 'chat', inWeek })
      );
      flag('recipes');
      if (recipe.inWeek) flag('week');
      addAction({ type: 'recipe', label: `Added recipe: ${recipe.title}`, recipeId: recipe.id });
      return { recipeId: recipe.id, title: recipe.title };
    },

    async log_cooked({ recipeId, title, rating, note, cookedAt }) {
      const input = { rating, note, cookedAt: cookedAt || undefined };
      let entry;
      if (recipeId) {
        const before = await recipesService.requireRecipe(recipeId);
        const result = await recipesService.markCooked(recipeId, input, { countAsFeedback: true });
        entry = result.entry;
        flag('recipes', 'history');
        if (before.inWeek) flag('week');
      } else {
        if (!title) return { error: 'title is required when recipeId is null' };
        entry = await recipesService.logHistoryEntry({ ...input, title }, { countAsFeedback: true });
        flag('history');
      }
      addAction({
        type: 'history',
        label: `Logged ${entry.title} on ${entry.cookedAt}${rating ? ` ${RATING_EMOJI[rating]}` : ''}`,
        ...(entry.recipeId ? { recipeId: entry.recipeId } : {}),
      });
      return { entry };
    },

    async set_feedback({ recipeId, feedback, note }) {
      const body = { feedback };
      if (note) body.feedbackNote = note;
      const before = await recipesService.requireRecipe(recipeId);
      const { recipe } = await recipesService.patchRecipe(recipeId, body);
      flag('recipes');
      if (before.inWeek !== recipe.inWeek) flag('week');
      const label = feedback === 'up' ? '👍' : feedback === 'down' ? '👎' : 'Cleared feedback on';
      addAction({ type: 'feedback', label: `${label} ${recipe.title}`, recipeId: recipe.id });
      return { recipe: compact(recipe) };
    },

    async set_in_week({ recipeId, inWeek }) {
      const before = await recipesService.requireRecipe(recipeId);
      const body = { inWeek };
      // Picking a suggestion for the week doesn't change its status; a dismissed one comes back.
      if (inWeek && before.status === 'dismissed') body.status = 'suggested';
      const { recipe } = await recipesService.patchRecipe(recipeId, body);
      flag('recipes', 'week');
      addAction({
        type: 'week',
        label: `${inWeek ? 'Added to week' : 'Removed from week'}: ${recipe.title}`,
        recipeId: recipe.id,
      });
      return { recipe: compact(recipe) };
    },

    async dismiss_recipe({ recipeId }) {
      const before = await recipesService.requireRecipe(recipeId);
      const { recipe } = await recipesService.patchRecipe(recipeId, { status: 'dismissed', inWeek: false });
      flag('recipes');
      if (before.inWeek) flag('week');
      addAction({ type: 'recipe', label: `Dismissed ${recipe.title}`, recipeId: recipe.id });
      return { recipe: compact(recipe) };
    },
  };
}

async function executeTool(runner, call) {
  const fn = runner[call.name];
  if (!fn) return { error: `Unknown tool ${call.name}` };
  let args;
  try {
    args = JSON.parse(call.arguments || '{}');
  } catch {
    return { error: 'Arguments were not valid JSON' };
  }
  try {
    return await fn(args);
  } catch (err) {
    // Validation/not-found/LLM errors go back to the model so it can recover or explain.
    console.warn(`[chat] tool ${call.name} failed: ${err.message}`);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Agent loop

function historyToInput(messages) {
  return messages.map((m) => {
    let content = m.text || '';
    if (m.role === 'assistant' && Array.isArray(m.actions) && m.actions.length) {
      content += `\n[actions taken: ${m.actions.map((a) => a.label).join('; ')}]`;
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
  });
}

/**
 * Run the agent for one user message. Returns `{ text, actions, changed }`.
 * Throws LLMError only if nothing was changed yet; after partial progress it
 * returns what was done with an apology instead, so the user sees the chips.
 */
async function runChat(message) {
  const [previous, { text: context }] = await Promise.all([store.listChat(CHAT_HISTORY_MESSAGES), buildContext()]);
  const state = { actions: [], changed: { recipes: false, week: false, history: false, preferences: false } };
  const runner = createToolRunner(state);
  const instructions = `${INSTRUCTIONS}\n\n${context}`;
  const base = {
    model: models.main(),
    instructions,
    tools: TOOLS,
    reasoning: { effort: 'low' },
    max_output_tokens: 8000,
  };

  try {
    let response = await createResponse(
      { ...base, input: [...historyToInput(previous), { role: 'user', content: message }] },
      { label: 'chat r0' }
    );
    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const calls = (response.output || []).filter((item) => item.type === 'function_call');
      if (calls.length === 0) break;
      const outputs = [];
      for (const call of calls) {
        console.log(`[chat] tool ${call.name} ${call.arguments.slice(0, 300)}`);
        const result = await executeTool(runner, call);
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
      }
      response = await createResponse(
        {
          ...base,
          previous_response_id: response.id,
          input: outputs,
          // On the last round, force a text answer.
          tool_choice: round === MAX_TOOL_ROUNDS ? 'none' : 'auto',
        },
        { label: `chat r${round}` }
      );
    }
    const text = (response.output_text || '').trim() || (state.actions.length ? 'Done.' : 'Sorry, I have no answer to that.');
    return { text, actions: state.actions, changed: state.changed };
  } catch (err) {
    if (state.actions.length === 0) throw err instanceof LLMError ? err : new LLMError(`Chat failed: ${err.message}`);
    console.error(`[chat] failed after partial progress: ${err.message}`);
    return {
      text: 'Something went wrong partway through, but I did manage the changes listed below. Please check and try the rest again.',
      actions: state.actions,
      changed: state.changed,
    };
  }
}

module.exports = { runChat, TOOLS, INSTRUCTIONS };
