const { ingredientKey } = require('../recipeModel');
const { AISLE_KEYS, normalizeAisle } = require('../aisles');

// Deterministic shopping list (no LLM): merge the ingredients of all week
// recipes by normalised name (lowercase, trimmed, parenthesised text
// stripped), keep every amount as a separate string, group by aisle in
// AH Haarlemmerplein walking order (server/aisles.js). The first occurrence
// decides display name, aisle and where-hint. `normalizeAisle` tolerates any
// stale pre-migration aisle key so nothing crashes or vanishes from the list.

function buildShoppingList(recipes) {
  const items = new Map(); // key -> { aisle, name, amounts, recipes }
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients || []) {
      const key = ingredientKey(ing.name);
      if (!key) continue;
      let item = items.get(key);
      if (!item) {
        item = {
          aisle: normalizeAisle(ing.aisle),
          name: String(ing.name).trim(),
          where: (ing.where && String(ing.where).trim()) || null,
          amounts: [],
          recipes: [],
        };
        items.set(key, item);
      }
      if (ing.amount && String(ing.amount).trim()) item.amounts.push(String(ing.amount).trim());
      if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);
    }
  }

  return AISLE_KEYS.map((aisle) => ({
    aisle,
    items: [...items.values()]
      .filter((i) => i.aisle === aisle)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, amounts, recipes: titles, where }) => ({ name, amounts, recipes: titles, where })),
  })).filter((group) => group.items.length > 0);
}

module.exports = { buildShoppingList };
