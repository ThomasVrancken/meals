const store = require('../db');
const { recordFeedbackEvents } = require('./reflect');
const { validateManualContent, STATUSES, FEEDBACK, buildRecipeDoc } = require('../recipeModel');
const { badRequest, notFound, amsterdamDate, isValidDate, RATINGS } = require('../http');

// Recipe / history domain operations shared by the HTTP routes and the chat
// agent's tools, so both follow exactly the same status and feedback rules:
// - thumbs up   -> feedback 'up',   status 'saved'
// - thumbs down -> feedback 'down', status 'dismissed' (and out of the week)
// - cooked      -> status 'saved', inWeek false, cookedCount + 1, history entry

async function requireRecipe(id) {
  const recipe = await store.getRecipe(id);
  if (!recipe) throw notFound('Recipe not found');
  return recipe;
}

/**
 * Apply a PATCH body (content fields and/or inWeek/status/feedback/feedbackNote).
 * Returns `{ recipe, feedbackEvent }`.
 */
async function patchRecipe(id, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Body must be a JSON object');
  const recipe = await requireRecipe(id);
  const patch = validateManualContent(body, { partial: true });

  if ('inWeek' in body) {
    if (typeof body.inWeek !== 'boolean') throw badRequest('inWeek must be a boolean');
    patch.inWeek = body.inWeek;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) throw badRequest(`status must be one of ${STATUSES.join(', ')}`);
    patch.status = body.status;
  }
  if ('feedbackNote' in body) {
    if (body.feedbackNote !== null && typeof body.feedbackNote !== 'string') {
      throw badRequest('feedbackNote must be a string or null');
    }
    if (body.feedbackNote && body.feedbackNote.length > 1000) throw badRequest('feedbackNote is too long');
    patch.feedbackNote = (body.feedbackNote && body.feedbackNote.trim()) || null;
  }

  let feedbackEvent = false;
  if ('feedback' in body) {
    const fb = body.feedback;
    if (fb !== null && !FEEDBACK.includes(fb)) throw badRequest('feedback must be "up", "down" or null');
    patch.feedback = fb;
    if (fb === 'up') patch.status = 'saved';
    if (fb === 'down') {
      patch.status = 'dismissed';
      patch.inWeek = false;
    }
    const noteChanged = 'feedbackNote' in patch && patch.feedbackNote !== recipe.feedbackNote;
    feedbackEvent = fb !== null && (fb !== recipe.feedback || noteChanged);
  }

  if (Object.keys(patch).length === 0) throw badRequest('No updatable fields in body');
  const updated = await store.updateRecipe(id, patch);
  if (feedbackEvent) await recordFeedbackEvents(1);
  return { recipe: updated, feedbackEvent };
}

function parseCookedInput(input = {}) {
  const rating = input.rating === undefined || input.rating === null || input.rating === '' ? null : input.rating;
  if (rating !== null && !RATINGS.includes(rating)) throw badRequest(`rating must be one of ${RATINGS.join(', ')}`);
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    throw badRequest('note must be a string');
  }
  const note = (input.note && input.note.trim().slice(0, 1000)) || null;
  const cookedAt = input.cookedAt || amsterdamDate();
  if (!isValidDate(cookedAt)) throw badRequest('cookedAt must be a date in YYYY-MM-DD format');
  if (cookedAt > amsterdamDate(1)) throw badRequest('cookedAt cannot be in the future');
  return { rating, note, cookedAt };
}

/**
 * Cooked flow for a recipe. A rating of up/down also sets the recipe's
 * feedback (down also dismisses it). `countAsFeedback` forces a feedback
 * event even without a rating (chat-logged meals).
 */
async function markCooked(id, input = {}, { countAsFeedback = false } = {}) {
  const recipe = await requireRecipe(id);
  const { rating, note, cookedAt } = parseCookedInput(input);

  const cookedIso = cookedAt === amsterdamDate() ? new Date().toISOString() : `${cookedAt}T18:00:00.000Z`;
  const lastCookedAt =
    recipe.lastCookedAt && String(recipe.lastCookedAt) > cookedIso ? recipe.lastCookedAt : cookedIso;

  const patch = {
    status: 'saved',
    inWeek: false,
    cookedCount: (recipe.cookedCount || 0) + 1,
    lastCookedAt,
  };
  if (rating === 'up') {
    patch.feedback = 'up';
    if (note) patch.feedbackNote = note;
  } else if (rating === 'down') {
    patch.feedback = 'down';
    patch.status = 'dismissed';
    if (note) patch.feedbackNote = note;
  }

  const updated = await store.updateRecipe(id, patch);
  const entry = await store.createHistoryEntry({
    recipeId: recipe.id,
    title: recipe.title,
    emoji: recipe.emoji,
    cookedAt,
    rating,
    note,
  });
  if (rating || countAsFeedback) await recordFeedbackEvents(1);
  return { recipe: updated, entry };
}

/** Dismiss untouched suggestions (no feedback, not in week). Not a feedback event. */
async function clearSuggestions() {
  const suggestions = await store.listRecipes('suggested');
  const targets = suggestions.filter((r) => !r.feedback && !r.inWeek);
  await Promise.all(targets.map((r) => store.updateRecipe(r.id, { status: 'dismissed' })));
  return targets.length;
}

/** Validate and create a history entry (no recipe cooked flow). */
async function logHistoryEntry(input = {}, { countAsFeedback = false } = {}) {
  if (typeof input.title !== 'string' || !input.title.trim()) throw badRequest('title is required');
  if (input.title.trim().length > 200) throw badRequest('title is too long');
  const { rating, note, cookedAt } = parseCookedInput(input);
  let emoji = '🍽️';
  let recipeId = null;
  if (input.recipeId !== undefined && input.recipeId !== null && input.recipeId !== '') {
    if (typeof input.recipeId !== 'string') throw badRequest('recipeId must be a string');
    const recipe = await requireRecipe(input.recipeId);
    recipeId = recipe.id;
    emoji = recipe.emoji || emoji;
  }
  const entry = await store.createHistoryEntry({ recipeId, title: input.title.trim(), emoji, cookedAt, rating, note });
  if (rating || countAsFeedback) await recordFeedbackEvents(1);
  return entry;
}

/** Create a recipe from user/agent-supplied content (validated like a manual edit). */
async function createManualRecipe(body, { source = 'manual' } = {}) {
  if (!body || typeof body !== 'object') throw badRequest('Body must be a JSON object');
  const content = validateManualContent(body);
  const status = body.status === undefined ? 'saved' : body.status;
  if (!STATUSES.includes(status)) throw badRequest(`status must be one of ${STATUSES.join(', ')}`);
  if (body.inWeek !== undefined && typeof body.inWeek !== 'boolean') throw badRequest('inWeek must be a boolean');
  return store.createRecipe(buildRecipeDoc(content, { status, source, inWeek: Boolean(body.inWeek) }));
}

module.exports = { requireRecipe, patchRecipe, markCooked, clearSuggestions, logHistoryEntry, createManualRecipe };
