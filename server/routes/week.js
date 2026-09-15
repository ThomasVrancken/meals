const express = require('express');
const store = require('../db');
const { buildShoppingList } = require('../services/shoppingList');

const router = express.Router();

router.get('/', async (req, res) => {
  const recipes = await store.listRecipes('week');
  res.json({ recipes, shoppingList: buildShoppingList(recipes) });
});

module.exports = router;
