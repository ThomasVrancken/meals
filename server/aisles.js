// Single source of truth for the shopping-list "aisle" taxonomy: the actual
// walking order through Thomas & Lote's AH Haarlemmerplein. Used by the recipe
// content schema/validation, the LLM prompts (generation, ai-edit, chat
// create_recipe, manual shopping-item classification), the shopping-list
// builder (grouping + sort order) and the migration script.

const AISLES = [
  { key: 'spices', label: 'Spices', order: 1, description: 'powdered/dried spices & herbs, spice mixes in jars (not taco kits)' },
  { key: 'fruit', label: 'Fruit', order: 2, description: 'fresh fruit, lemons/limes' },
  { key: 'vegetables', label: 'Vegetables', order: 3, description: 'fresh veg incl. pre-cut veg bags, fresh herbs, garlic, ginger' },
  {
    key: 'fresh-meals',
    label: 'Fresh pasta & ready-made',
    order: 4,
    description:
      'chilled ready meals, fresh tortellini/gnocchi/fresh pasta, fresh chilled sauces (e.g. fresh arrabbiata), fresh pesto',
  },
  { key: 'meat', label: 'Meat & fish', order: 5, description: 'fresh meat, chicken, minced beef, fish, prawns' },
  { key: 'cheese-deli', label: 'Cheese & deli', order: 6, description: 'cheese (incl. grated), charcuterie, bacon lardons, chorizo' },
  { key: 'bread', label: 'Bread', order: 7, description: 'bread, wraps from the bakery shelf, naan' },
  { key: 'carbs', label: 'Rice & pasta', order: 8, description: 'dry rice, pasta, noodles, couscous' },
  {
    key: 'world-food',
    label: 'World food',
    order: 9,
    description:
      'tortillas, Worcestershire, Italian tomato purée/passata, taco seasoning, curry pastes, coconut milk, soy/sweet chili/sambal, Asian & Mexican & other international products',
  },
  { key: 'cereals', label: 'Cereals', order: 10, description: 'breakfast cereals, oats' },
  { key: 'snacks', label: 'Chips & crackers', order: 11, description: 'chips, crackers, nuts for snacking' },
  { key: 'tea', label: 'Tea & coffee', order: 12, description: 'tea (and coffee)' },
  { key: 'dairy', label: 'Dairy', order: 13, description: 'milk, cooking cream, yoghurt, butter, eggs, coconut-free chilled dairy' },
  { key: 'drinks', label: 'Drinks', order: 14, description: 'beer, soft drinks, juice, water' },
  { key: 'misc', label: 'Other', order: 15, description: 'everything else (frozen, canned goods not covered above, household, etc.)' },
];

const AISLE_KEYS = AISLES.map((a) => a.key);
const AISLE_LABELS = Object.fromEntries(AISLES.map((a) => [a.key, a.label]));
const AISLE_ORDER = Object.fromEntries(AISLES.map((a) => [a.key, a.order]));

// Old (pre store-order) aisle keys -> closest new key. Used to read/migrate
// data written before this taxonomy existed.
const OLD_TO_NEW_AISLE = {
  produce: 'vegetables',
  'meat-fish': 'meat',
  'dairy-eggs': 'dairy',
  'pasta-rice-noodles': 'carbs',
  'sauces-spices': 'world-food',
  'canned-jars': 'world-food',
  frozen: 'misc',
  bakery: 'bread',
  other: 'misc',
};

/** Strict: a valid new key, the mapped-old-key equivalent, or null if `raw` is unrecognised. */
function coerceAisle(raw) {
  if (raw === undefined || raw === null || raw === '') return 'misc';
  if (AISLE_KEYS.includes(raw)) return raw;
  if (OLD_TO_NEW_AISLE[raw]) return OLD_TO_NEW_AISLE[raw];
  return null;
}

/**
 * Lenient: like coerceAisle but never fails — unrecognised values fall back to
 * "misc" instead of null. Use when READING data that might predate a
 * migration, so nothing crashes or silently vanishes from the shopping list.
 */
function normalizeAisle(raw) {
  return coerceAisle(raw) || 'misc';
}

// Enumerated guide for LLM prompts (generation, ai-edit, chat, item classification).
const AISLE_GUIDE = AISLES.map((a) => `  - "${a.key}" (${a.label}): ${a.description}`).join('\n');

module.exports = { AISLES, AISLE_KEYS, AISLE_LABELS, AISLE_ORDER, OLD_TO_NEW_AISLE, coerceAisle, normalizeAisle, AISLE_GUIDE };
