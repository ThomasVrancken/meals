const express = require('express');
const store = require('../db');
const recipes = require('../services/recipes');
const { generateSuggestions } = require('../services/generate');
const { editRecipe } = require('../services/recipeEdit');
const { chatAboutRecipe } = require('../services/recipeChat');
const { badRequest, notFound } = require('../http');

const router = express.Router();

const LIST_STATUSES = ['suggested', 'saved', 'all', 'dismissed'];

router.get('/', async (req, res) => {
  const status = req.query.status || 'all';
  if (!LIST_STATUSES.includes(status)) throw badRequest(`status must be one of ${LIST_STATUSES.join(', ')}`);
  res.json({ recipes: await store.listRecipes(status) });
});

router.post('/generate', async (req, res) => {
  const body = req.body || {};
  const count = body.count === undefined || body.count === null ? 5 : body.count;
  if (!Number.isInteger(count) || count < 1 || count > 8) throw badRequest('count must be an integer between 1 and 8');
  let hint = null;
  if (body.hint !== undefined && body.hint !== null) {
    if (typeof body.hint !== 'string') throw badRequest('hint must be a string');
    if (body.hint.length > 500) throw badRequest('hint is too long (max 500 chars)');
    hint = body.hint.trim() || null;
  }
  const created = await generateSuggestions({ count, hint, source: 'ai' });
  res.json({ recipes: created });
});

router.post('/clear-suggestions', async (req, res) => {
  res.json({ dismissed: await recipes.clearSuggestions() });
});

// Not in the original contract: manual create (used by scripts/api-test.js and
// handy for "add my own recipe"). Defaults to status 'saved', source 'manual'.
router.post('/', async (req, res) => {
  const recipe = await recipes.createManualRecipe(req.body, { source: 'manual' });
  res.status(201).json({ recipe });
});

router.get('/:id', async (req, res) => {
  const recipe = await store.getRecipe(req.params.id);
  if (!recipe) throw notFound('Recipe not found');
  res.json({ recipe });
});

router.patch('/:id', async (req, res) => {
  const { recipe } = await recipes.patchRecipe(req.params.id, req.body);
  res.json({ recipe });
});

// Not in the original contract: hard delete (test cleanup). The UI dismisses instead.
router.delete('/:id', async (req, res) => {
  await recipes.requireRecipe(req.params.id);
  await store.deleteRecipe(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/ai-edit', async (req, res) => {
  const body = req.body || {};
  if (typeof body.instruction !== 'string' || !body.instruction.trim()) throw badRequest('instruction is required');
  if (body.instruction.length > 2000) throw badRequest('instruction is too long (max 2000 chars)');
  if (body.asVariation !== undefined && typeof body.asVariation !== 'boolean') {
    throw badRequest('asVariation must be a boolean');
  }
  const { recipe, summary } = await editRecipe(req.params.id, {
    instruction: body.instruction.trim(),
    asVariation: Boolean(body.asVariation),
    source: 'ai',
  });
  res.json({ recipe, summary });
});

// Per-recipe chat: answers questions and may edit the recipe itself (see services/recipeChat.js).
router.post('/:id/chat', async (req, res) => {
  const body = req.body || {};
  if (typeof body.message !== 'string' || !body.message.trim()) throw badRequest('message is required');
  if (body.message.length > 2000) throw badRequest('message is too long (max 2000 chars)');
  let history = [];
  if (body.history !== undefined && body.history !== null) {
    if (!Array.isArray(body.history) || body.history.length > 20) throw badRequest('history must be an array (max 20)');
    history = body.history.map((h, idx) => {
      if (!h || typeof h !== 'object' || typeof h.text !== 'string' || !['user', 'assistant'].includes(h.role)) {
        throw badRequest(`history[${idx}] must be {role: 'user'|'assistant', text: string}`);
      }
      return { role: h.role, text: h.text.slice(0, 2000) };
    });
  }
  const { answer, edit } = await chatAboutRecipe(req.params.id, { message: body.message.trim(), history });
  res.json({ answer, edit });
});

router.post('/:id/cooked', async (req, res) => {
  const { recipe, entry } = await recipes.markCooked(req.params.id, req.body || {});
  res.json({ recipe, entry });
});

module.exports = router;
