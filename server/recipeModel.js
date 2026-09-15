const { badRequest } = require('./http');

// Recipe shape, JSON schemas for structured LLM output, and validation /
// normalisation shared by the routes (manual edits), AI services and the
// chat agent's create_recipe tool.

// Walking order through the shop; also the order of the shopping list.
const AISLES = [
  'produce',
  'meat-fish',
  'dairy-eggs',
  'pasta-rice-noodles',
  'sauces-spices',
  'canned-jars',
  'frozen',
  'bakery',
  'other',
];

const STATUSES = ['suggested', 'saved', 'dismissed'];
const FEEDBACK = ['up', 'down'];

// JSON schema for the "content" part of a recipe (what the LLM writes).
// Strict structured outputs require every property to be listed in
// `required` and `additionalProperties: false`; optional values are nullable.
const RECIPE_CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short appetising title, e.g. "Thai green chicken curry"' },
    emoji: { type: 'string', description: 'Exactly one food emoji' },
    description: { type: 'string', description: 'One sentence: what it is and why it fits them' },
    cuisine: { type: 'string', description: 'Short label, e.g. Thai, Italian, Mexican' },
    tags: { type: 'array', items: { type: 'string' }, description: '2-5 lowercase tags' },
    timeMinutes: { type: 'integer', description: 'Honest total time in minutes, including boiling the carb' },
    servings: { type: 'integer', description: 'Always 2' },
    pans: { type: 'integer', enum: [1, 2], description: 'Number of pans/pots used: 1 or 2' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Ingredient, with Dutch/AH product name in parentheses when helpful' },
          amount: { type: 'string', description: 'Supermarket pack amount, e.g. "1 bag (400 g)"' },
          aisle: { type: 'string', enum: AISLES },
          note: { type: ['string', 'null'], description: 'Very short optional note, else null' },
        },
        required: ['name', 'amount', 'aisle', 'note'],
      },
    },
    steps: { type: 'array', items: { type: 'string' }, description: '3-6 short imperative steps' },
  },
  required: [
    'title',
    'emoji',
    'description',
    'cuisine',
    'tags',
    'timeMinutes',
    'servings',
    'pans',
    'ingredients',
    'steps',
  ],
};

const CONTENT_FIELDS = Object.keys(RECIPE_CONTENT_SCHEMA.properties);

// Basic seasoning / pantry fluff the couple never wants listed. Matched on the
// whole normalised ingredient name, so "bell pepper", "sesame oil",
// "chili oil" or "peanut butter" are NOT caught.
const BASIC_SEASONING = new Set([
  'salt',
  'sea salt',
  'fine salt',
  'zout',
  'pepper',
  'black pepper',
  'ground pepper',
  'ground black pepper',
  'peper',
  'zwarte peper',
  'salt and pepper',
  'salt & pepper',
  'oil',
  'cooking oil',
  'olive oil',
  'extra virgin olive oil',
  'sunflower oil',
  'vegetable oil',
  'rapeseed oil',
  'neutral oil',
  'frying oil',
  'olijfolie',
  'zonnebloemolie',
  'water',
  'boiling water',
  'hot water',
]);

function ingredientKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBasicSeasoning(name) {
  const key = ingredientKey(name).replace(/^(a pinch of|pinch of|some|splash of|a splash of)\s+/, '');
  return BASIC_SEASONING.has(key) || /^(salt|pepper|oil|water)\s*(,|and|&|\/|to taste)/.test(key);
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Normalise LLM-produced recipe content. Returns `{ ok: true, content }` or
 * `{ ok: false, reason }`. Strips basic seasoning ingredients rather than
 * rejecting the recipe, since that's easy to fix deterministically.
 */
function normalizeAiContent(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const title = str(raw.title);
  if (!title) return { ok: false, reason: 'missing title' };
  const pans = Number(raw.pans);
  if (![1, 2].includes(pans)) return { ok: false, reason: `${title}: pans must be 1 or 2` };
  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((i) => ({
      name: str(i && i.name),
      amount: str(i && i.amount),
      aisle: AISLES.includes(i && i.aisle) ? i.aisle : null,
      note: str(i && i.note) || null,
    }))
    .filter((i) => i.name && !isBasicSeasoning(i.name));
  if (ingredients.length < 2) return { ok: false, reason: `${title}: too few ingredients` };
  if (ingredients.some((i) => !i.aisle)) return { ok: false, reason: `${title}: invalid aisle` };
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(str).filter(Boolean);
  if (steps.length < 2 || steps.length > 8) return { ok: false, reason: `${title}: ${steps.length} steps` };
  const timeMinutes = Math.round(Number(raw.timeMinutes));
  if (!Number.isFinite(timeMinutes) || timeMinutes < 5 || timeMinutes > 120) {
    return { ok: false, reason: `${title}: bad timeMinutes` };
  }
  return {
    ok: true,
    content: {
      title: title.slice(0, 120),
      emoji: str(raw.emoji).slice(0, 16) || '🍳',
      description: str(raw.description).slice(0, 500),
      cuisine: str(raw.cuisine).slice(0, 60),
      tags: (Array.isArray(raw.tags) ? raw.tags : [])
        .map((t) => str(t).toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      timeMinutes,
      servings: 2,
      pans,
      ingredients,
      steps,
    },
  };
}

/**
 * Validate user-supplied recipe content (PATCH / manual create). With
 * `partial`, only present fields are validated and returned. Throws 400.
 */
function validateManualContent(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
  const need = (k) => {
    if (!partial && !has(k)) throw badRequest(`${k} is required`);
    return has(k);
  };

  if (need('title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) throw badRequest('title must be a non-empty string');
    if (body.title.trim().length > 120) throw badRequest('title is too long (max 120)');
    out.title = body.title.trim();
  }
  if (has('emoji')) {
    if (typeof body.emoji !== 'string' || body.emoji.length > 16) throw badRequest('emoji must be a short string');
    out.emoji = body.emoji.trim() || '🍳';
  } else if (!partial) out.emoji = '🍳';
  if (has('description')) {
    if (typeof body.description !== 'string' || body.description.length > 500) {
      throw badRequest('description must be a string (max 500)');
    }
    out.description = body.description.trim();
  } else if (!partial) out.description = '';
  if (has('cuisine')) {
    if (typeof body.cuisine !== 'string' || body.cuisine.length > 60) throw badRequest('cuisine must be a short string');
    out.cuisine = body.cuisine.trim();
  } else if (!partial) out.cuisine = '';
  if (has('tags')) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string') || body.tags.length > 20) {
      throw badRequest('tags must be an array of strings');
    }
    out.tags = body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  } else if (!partial) out.tags = [];
  if (has('timeMinutes')) {
    const n = Number(body.timeMinutes);
    if (typeof body.timeMinutes !== 'number' || !Number.isFinite(n) || n < 1 || n > 600) {
      throw badRequest('timeMinutes must be a number between 1 and 600');
    }
    out.timeMinutes = Math.round(n);
  } else if (!partial) out.timeMinutes = 30;
  if (has('pans')) {
    if (![1, 2].includes(body.pans)) throw badRequest('pans must be 1 or 2');
    out.pans = body.pans;
  } else if (!partial) out.pans = 2;
  if (has('servings')) {
    if (!Number.isInteger(body.servings) || body.servings < 1 || body.servings > 20) {
      throw badRequest('servings must be an integer between 1 and 20');
    }
    out.servings = body.servings;
  } else if (!partial) out.servings = 2;
  if (need('ingredients')) {
    if (!Array.isArray(body.ingredients) || body.ingredients.length > 60) {
      throw badRequest('ingredients must be an array');
    }
    out.ingredients = body.ingredients.map((i, idx) => {
      if (!i || typeof i !== 'object') throw badRequest(`ingredients[${idx}] must be an object`);
      if (typeof i.name !== 'string' || !i.name.trim()) throw badRequest(`ingredients[${idx}].name is required`);
      if (i.amount !== undefined && i.amount !== null && typeof i.amount !== 'string') {
        throw badRequest(`ingredients[${idx}].amount must be a string`);
      }
      const aisle = i.aisle === undefined || i.aisle === null || i.aisle === '' ? 'other' : i.aisle;
      if (!AISLES.includes(aisle)) {
        throw badRequest(`ingredients[${idx}].aisle must be one of: ${AISLES.join(', ')}`);
      }
      if (i.note !== undefined && i.note !== null && typeof i.note !== 'string') {
        throw badRequest(`ingredients[${idx}].note must be a string or null`);
      }
      return {
        name: i.name.trim(),
        amount: (i.amount || '').trim(),
        aisle,
        note: (i.note && i.note.trim()) || null,
      };
    });
  }
  if (need('steps')) {
    if (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string') || body.steps.length > 30) {
      throw badRequest('steps must be an array of strings');
    }
    out.steps = body.steps.map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** Full recipe document with defaults for all metadata. */
function buildRecipeDoc(content, meta = {}) {
  const now = new Date().toISOString();
  return {
    title: content.title,
    emoji: content.emoji || '🍳',
    description: content.description || '',
    cuisine: content.cuisine || '',
    tags: content.tags || [],
    timeMinutes: content.timeMinutes || 30,
    servings: content.servings || 2,
    pans: content.pans || 2,
    ingredients: content.ingredients || [],
    steps: content.steps || [],
    status: meta.status || 'suggested',
    inWeek: Boolean(meta.inWeek),
    feedback: meta.feedback || null,
    feedbackNote: meta.feedbackNote || null,
    source: meta.source || 'ai',
    parentId: meta.parentId || null,
    cookedCount: meta.cookedCount || 0,
    lastCookedAt: meta.lastCookedAt || null,
    hint: meta.hint || null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Pick only the LLM-editable content fields from a recipe. */
function contentOf(recipe) {
  const out = {};
  for (const k of CONTENT_FIELDS) out[k] = recipe[k];
  return out;
}

module.exports = {
  AISLES,
  STATUSES,
  FEEDBACK,
  RECIPE_CONTENT_SCHEMA,
  CONTENT_FIELDS,
  ingredientKey,
  isBasicSeasoning,
  normalizeAiContent,
  validateManualContent,
  buildRecipeDoc,
  contentOf,
};
