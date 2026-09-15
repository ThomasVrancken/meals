const store = require('../db');
const { createJSON, models } = require('../llm/openai');
const { buildContext } = require('../llm/context');
const { HOUSE_STYLE, EXAMPLE_RECIPE } = require('../llm/style');
const { RECIPE_CONTENT_SCHEMA, normalizeAiContent, buildRecipeDoc } = require('../recipeModel');
const { amsterdamDate } = require('../http');

// Generates N new recipe suggestions (status "suggested") in one structured
// output call, validates each, drops invalid ones, and stores the rest.

const BATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recipes: { type: 'array', items: RECIPE_CONTENT_SCHEMA },
  },
  required: ['recipes'],
};

const INSTRUCTIONS = `
You are the recipe brain of "Two Pans", a private dinner-ideas app. You propose dinners this couple
will actually cook. Output only the JSON described by the schema.

${HOUSE_STYLE}

# How to build a batch
- Mix proven favourites with new ideas. Roughly half the batch: genuinely different variations of their
  favourite formats (curry with rice; spicy "red sauce" with mince, Italian veg bag and tomato paste;
  tortellini in a cream sauce). Vary them by swapping the paste/sauce, protein, veg bag and carb,
  e.g. Japanese katsu-style curry, Indian butter chicken from a jar, green curry with prawns,
  red sauce with chorizo and penne, tortellini with pesto-cream and spinach.
- The rest: new ideas in the same lazy bowl-meal spirit, e.g. spicy stir-fried noodles, gochujang
  beef rice bowl, pan gnocchi with sausage and tomato, burrito bowl, shakshuka-style eggs with
  bread, teriyaki salmon rice bowl, pad krapow-style mince with a fried egg, nasi/bami with
  ketjap chicken, dal with naan.
- Within one batch: no two recipes with the same main protein AND the same format; spread cuisines.
  No single format (e.g. curry) more than twice in a batch, and at most once in a batch of 3 or fewer
  (unless they ask for it). In batches of 4+, at least two recipes are NOT curry/red sauce/tortellini.
- Avoid anything cooked in the last ~10 days and anything that is a near-duplicate of the current
  suggestions or week picks. Lean towards what they liked, away from what they disliked or dismissed.
- A request from the user (if given) takes priority. A constraint ("vegetarian", "no meat",
  "cheap") applies to every recipe. An inclusion ask ("something with salmon", "one with salmon")
  means at least one recipe features it, unless only one recipe is asked for.
- If they ask for leftovers/meal prep, scale amounts up and say so in the description, still ≤2 pans.

# Target format (example of ONE recipe, match this density and tone)
${JSON.stringify(EXAMPLE_RECIPE)}

Before answering, silently check every recipe: ≤2 pans, no oven, no salt/pepper/oil/water listed,
veg mostly from pre-cut bags, ≤2 easy things to cut, ≤30 min, AH-findable products, 3-6 short steps.
Fix anything that fails.
`.trim();

const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Generate and store `count` suggestions. Returns the created recipes.
 * @param {{count?: number, hint?: string|null, source?: 'ai'|'chat'}} opts
 */
async function generateSuggestions({ count = 5, hint = null, source = 'ai' } = {}) {
  const { text: context, data } = await buildContext();

  const recentCutoff = amsterdamDate(-10);
  const recent = data.history.filter((h) => h.cookedAt >= recentCutoff).map((h) => h.title);

  const input = [
    context,
    '# Task',
    `Create exactly ${count} new dinner recipe${count === 1 ? '' : 's'} for us.`,
    hint ? `Our request for this batch: "${hint}"` : 'No specific request: surprise us within our style.',
    recent.length ? `Cooked in the last 10 days (do not repeat): ${recent.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await createJSON({
    model: models.main(),
    instructions: INSTRUCTIONS,
    input,
    schemaName: 'recipe_batch',
    schema: BATCH_SCHEMA,
    effort: 'low',
    maxOutputTokens: 4000 + count * 1500,
    label: `generate(${count})`,
  });

  // Drop invalid items and duplicates of existing suggestions / week picks.
  const existingTitles = new Set(
    data.recipes.filter((r) => r.status === 'suggested' || r.inWeek).map((r) => normTitle(r.title))
  );
  const accepted = [];
  for (const raw of (result.recipes || []).slice(0, count)) {
    const check = normalizeAiContent(raw);
    if (!check.ok) {
      console.warn(`[generate] dropped recipe: ${check.reason}`);
      continue;
    }
    const key = normTitle(check.content.title);
    if (existingTitles.has(key)) {
      console.warn(`[generate] dropped duplicate: ${check.content.title}`);
      continue;
    }
    existingTitles.add(key);
    accepted.push(check.content);
  }

  const created = [];
  for (const content of accepted) {
    created.push(await store.createRecipe(buildRecipeDoc(content, { status: 'suggested', source, hint: hint || null })));
  }
  return created;
}

module.exports = { generateSuggestions };
