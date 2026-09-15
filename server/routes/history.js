const express = require('express');
const store = require('../db');
const recipes = require('../services/recipes');
const { badRequest, notFound, isValidDate, amsterdamDate, RATINGS } = require('../http');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ entries: await store.listHistory() });
});

router.post('/', async (req, res) => {
  const entry = await recipes.logHistoryEntry(req.body || {});
  res.status(201).json({ entry });
});

router.patch('/:id', async (req, res) => {
  const existing = await store.getHistoryEntry(req.params.id);
  if (!existing) throw notFound('History entry not found');
  const body = req.body || {};
  const patch = {};
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) {
      throw badRequest('title must be a non-empty string (max 200)');
    }
    patch.title = body.title.trim();
  }
  if ('rating' in body) {
    if (body.rating !== null && !RATINGS.includes(body.rating)) {
      throw badRequest(`rating must be one of ${RATINGS.join(', ')} or null`);
    }
    patch.rating = body.rating;
  }
  if ('note' in body) {
    if (body.note !== null && typeof body.note !== 'string') throw badRequest('note must be a string or null');
    patch.note = (body.note && body.note.trim().slice(0, 1000)) || null;
  }
  if ('cookedAt' in body) {
    if (!isValidDate(body.cookedAt)) throw badRequest('cookedAt must be a date in YYYY-MM-DD format');
    if (body.cookedAt > amsterdamDate(1)) throw badRequest('cookedAt cannot be in the future');
    patch.cookedAt = body.cookedAt;
  }
  if ('emoji' in body) {
    if (typeof body.emoji !== 'string' || body.emoji.length > 16) throw badRequest('emoji must be a short string');
    patch.emoji = body.emoji;
  }
  if ('recipeId' in body) {
    if (body.recipeId === null) patch.recipeId = null;
    else {
      const recipe = await store.getRecipe(body.recipeId);
      if (!recipe) throw badRequest('recipeId does not exist');
      patch.recipeId = recipe.id;
    }
  }
  if (Object.keys(patch).length === 0) throw badRequest('No updatable fields in body');
  res.json({ entry: await store.updateHistoryEntry(req.params.id, patch) });
});

router.delete('/:id', async (req, res) => {
  const existing = await store.getHistoryEntry(req.params.id);
  if (!existing) throw notFound('History entry not found');
  await store.deleteHistoryEntry(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
