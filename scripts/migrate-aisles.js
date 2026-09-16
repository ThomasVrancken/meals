#!/usr/bin/env node
/* eslint-disable no-console */
// One-off migration: reclassifies every recipe's ingredients from the old
// 9-key aisle taxonomy to the new 15-key AH Haarlemmerplein walking-order
// taxonomy (server/aisles.js). Only touches `ingredients[].aisle` (+updatedAt)
// -- nothing else about the recipe changes.
//
// For each recipe, one fast-model call classifies ALL its ingredients at once
// (structured output: an array of new aisle keys, same order/length as the
// ingredients). If that call fails, times out, or returns the wrong length,
// every ingredient in that recipe falls back to the static OLD_TO_NEW_AISLE
// map (server/aisles.js) applied to its current (old) aisle value.
//
// Always backs up the full `<prefix>recipes` collection to a timestamped JSON
// file under backups/ (gitignored) before making any change -- even for
// --dry-run, so there's always a pre-migration snapshot to fall back to.
//
// Usage:
//   node scripts/migrate-aisles.js --prefix=mealsdev_ --dry-run
//   node scripts/migrate-aisles.js --prefix=mealsdev_
//   node scripts/migrate-aisles.js --prefix=meals_ --dry-run
//   node scripts/migrate-aisles.js --prefix=meals_ --yes-prod

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yesProd = args.includes('--yes-prod');
const prefixArg = args.find((a) => a.startsWith('--prefix='));

if (!prefixArg) {
  console.error('Usage: node scripts/migrate-aisles.js --prefix=<mealsdev_|meals_> [--dry-run] [--yes-prod]');
  process.exit(1);
}
const prefix = prefixArg.slice('--prefix='.length);
if (!prefix) {
  console.error('--prefix cannot be empty');
  process.exit(1);
}
const isProd = prefix === 'meals_';
if (isProd && !dryRun && !yesProd) {
  console.error(
    `Refusing to write to prefix "${prefix}" (looks like prod) without --dry-run or --yes-prod. ` +
      `Run with --dry-run first, inspect the output, then re-run with --yes-prod.`
  );
  process.exit(1);
}

// Set BEFORE requiring server modules: server/db.js's col()/prefix() read
// process.env.COLLECTION_PREFIX lazily on each call, not at module load.
process.env.COLLECTION_PREFIX = prefix;
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT is not set (.env)');
  process.exit(1);
}

const store = require('../server/db');
const { AISLE_KEYS, OLD_TO_NEW_AISLE, coerceAisle } = require('../server/aisles');
const { createJSON, models } = require('../server/llm/openai');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    aisles: { type: 'array', items: { type: 'string', enum: AISLE_KEYS } },
  },
  required: ['aisles'],
};

const INSTRUCTIONS = `
Classify every ingredient of ONE recipe into Thomas & Lote's Albert Heijn Haarlemmerplein aisles
(their actual walking order through the store). Return exactly one aisle key per ingredient, in the
SAME ORDER as the ingredient list given. Aisle keys and what belongs in each:
  - "spices": powdered/dried spices & herbs, spice mixes in jars (not taco kits)
  - "fruit": fresh fruit, lemons/limes
  - "vegetables": fresh veg incl. pre-cut veg bags, fresh herbs, garlic, ginger
  - "fresh-meals": chilled ready meals, fresh tortellini/gnocchi/fresh pasta, fresh chilled sauces, fresh pesto
  - "meat": fresh meat, chicken, minced beef, fish, prawns
  - "cheese-deli": cheese (incl. grated), charcuterie, bacon lardons, chorizo
  - "bread": bread, wraps from the bakery shelf, naan
  - "carbs": dry rice, pasta, noodles, couscous
  - "world-food": tortillas, Worcestershire, Italian tomato purée/passata, taco seasoning, curry
    pastes, coconut milk, soy/sweet chili/sambal, Asian & Mexican & other international products
  - "cereals": breakfast cereals, oats
  - "snacks": chips, crackers, nuts for snacking
  - "tea": tea (and coffee)
  - "dairy": milk, cooking cream, yoghurt, butter, eggs, coconut-free chilled dairy
  - "drinks": beer, soft drinks, juice, water
  - "misc": everything else (frozen, canned goods not covered above, household, etc.)
`.trim();

/** One call per recipe; returns an array of new aisle keys matching ingredients.length. */
async function classifyRecipeIngredients(recipe) {
  const names = recipe.ingredients.map((i) => i.name);
  const result = await createJSON({
    model: models.fast(),
    instructions: INSTRUCTIONS,
    input: `Recipe: "${recipe.title}"\nIngredients in order:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`,
    schemaName: 'aisle_migration',
    schema: SCHEMA,
    effort: 'low',
    maxOutputTokens: 800,
    label: `migrateAisles(${recipe.id})`,
  });
  const aisles = Array.isArray(result.aisles) ? result.aisles : [];
  if (aisles.length !== names.length) throw new Error(`length mismatch (${aisles.length} vs ${names.length})`);
  if (!aisles.every((a) => AISLE_KEYS.includes(a))) throw new Error('invalid aisle key in response');
  return aisles;
}

/** Static fallback: map each ingredient's current (old) aisle to its new equivalent. */
function fallbackAisles(recipe) {
  return recipe.ingredients.map((i) => coerceAisle(i.aisle) || 'misc');
}

async function backupRecipes() {
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const recipes = await store.listAllRecipesIncludingDismissed();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${prefix}recipes-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(recipes, null, 2));
  console.log(`Backed up ${recipes.length} recipes to ${file}`);
  return { recipes, file };
}

async function run() {
  console.log(`Migrating aisles for prefix "${prefix}"${dryRun ? ' (DRY RUN, no writes)' : ''}`);
  const { recipes } = await backupRecipes();

  let recipesChanged = 0;
  let ingredientsChanged = 0;
  let fallbackUsed = 0;

  for (const recipe of recipes) {
    const ingredients = recipe.ingredients || [];
    if (ingredients.length === 0) continue;

    let newAisles;
    try {
      newAisles = await classifyRecipeIngredients(recipe);
    } catch (err) {
      console.warn(`[migrate] "${recipe.title}" (${recipe.id}): LLM classify failed (${err.message}); using static fallback`);
      newAisles = fallbackAisles(recipe);
      fallbackUsed++;
    }

    const nextIngredients = ingredients.map((ing, i) => ({ ...ing, aisle: newAisles[i] }));
    const changedCount = ingredients.filter((ing, i) => ing.aisle !== newAisles[i]).length;
    if (changedCount === 0) continue;

    recipesChanged++;
    ingredientsChanged += changedCount;
    console.log(
      `${dryRun ? '[dry-run] would update' : 'updating'} "${recipe.title}" (${recipe.id}): ` +
        `${ingredients.map((ing, i) => `${ing.name}: ${ing.aisle}->${newAisles[i]}`).filter((_, i) => ingredients[i].aisle !== newAisles[i]).join(', ')}`
    );

    if (!dryRun) {
      await store.updateRecipe(recipe.id, { ingredients: nextIngredients });
    }
  }

  console.log(
    `\nDone. ${recipesChanged}/${recipes.length} recipes ${dryRun ? 'would change' : 'changed'}, ` +
      `${ingredientsChanged} ingredients reclassified, ${fallbackUsed} recipes used the static fallback.`
  );
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
