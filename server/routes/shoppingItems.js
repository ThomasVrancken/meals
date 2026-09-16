const express = require('express');
const store = require('../db');
const { badRequest, notFound } = require('../http');
const { AISLE_KEYS } = require('../aisles');
const { classifyItemAisle } = require('../services/classifyAisle');

const router = express.Router();

function validateName(body) {
  if (typeof body.name !== 'string' || !body.name.trim()) throw badRequest('name is required');
  if (body.name.trim().length > 200) throw badRequest('name is too long (max 200 chars)');
  return body.name.trim();
}

function validateAmount(body) {
  if (!('amount' in body) || body.amount === null || body.amount === undefined) return null;
  if (typeof body.amount !== 'string') throw badRequest('amount must be a string or null');
  if (body.amount.length > 100) throw badRequest('amount is too long (max 100 chars)');
  return body.amount.trim() || null;
}

router.get('/', async (req, res) => {
  res.json({ items: await store.listShoppingItems() });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const name = validateName(body);
  const amount = validateAmount(body);
  // No recipe context to infer an aisle from, so classify it with a tiny fast-model call
  // (falls back to "misc" on any failure, never throws).
  const aisle = await classifyItemAisle(name);
  const item = await store.createShoppingItem({ name, amount, aisle });
  res.status(201).json({ item });
});

router.post('/clear-checked', async (req, res) => {
  res.json({ deleted: await store.clearCheckedShoppingItems() });
});

router.patch('/:id', async (req, res) => {
  const existing = await store.getShoppingItem(req.params.id);
  if (!existing) throw notFound('Shopping item not found');
  const body = req.body || {};
  const patch = {};
  if ('name' in body) patch.name = validateName(body);
  if ('amount' in body) patch.amount = validateAmount(body);
  if ('checked' in body) {
    if (typeof body.checked !== 'boolean') throw badRequest('checked must be a boolean');
    patch.checked = body.checked;
  }
  if ('aisle' in body) {
    if (!AISLE_KEYS.includes(body.aisle)) throw badRequest(`aisle must be one of: ${AISLE_KEYS.join(', ')}`);
    patch.aisle = body.aisle;
  }
  if (Object.keys(patch).length === 0) throw badRequest('No updatable fields in body');
  const item = await store.updateShoppingItem(req.params.id, patch);
  res.json({ item });
});

router.delete('/:id', async (req, res) => {
  const existing = await store.getShoppingItem(req.params.id);
  if (!existing) throw notFound('Shopping item not found');
  await store.deleteShoppingItem(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
