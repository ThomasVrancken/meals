#!/usr/bin/env node
/* eslint-disable no-console */
// Smoke test for the non-LLM API endpoints against a running server.
//
//   PORT=3012 REFLECTION_ENABLED=false npm start      # in one terminal (dev prefix!)
//   API_BASE=http://localhost:3012 npm run test:api   # in another
//
// Uses APP_TOKEN from .env. Creates its own recipes/history entries (titles
// prefixed "[api-test]") and deletes them afterwards. Note: it calls
// clear-suggestions and DELETE /api/chat, which affect existing dev data.
// Start the server with REFLECTION_ENABLED=false so thumbs up/down don't
// trigger LLM reflection runs.
//
// One exception to "non-LLM": creating a shopping item always classifies its
// aisle with a tiny fast-model call server-side (no way to opt out via the
// API), so this script does make two small classification calls.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 3002}`;
const TOKEN = process.env.APP_TOKEN;
const TAG = '[api-test]';

if (!TOKEN) {
  console.error('APP_TOKEN missing (.env)');
  process.exit(1);
}
if (process.env.COLLECTION_PREFIX && !process.env.COLLECTION_PREFIX.includes('dev')) {
  console.error(`Refusing to run: COLLECTION_PREFIX "${process.env.COLLECTION_PREFIX}" does not look like a dev prefix`);
  process.exit(1);
}

let passed = 0;
let failed = 0;
const created = { recipes: [], history: [], shoppingItems: [] };

async function api(method, url, body, { token = TOKEN } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}

function amsterdamDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(
    new Date(Date.now() + offsetDays * 86400000)
  );
}

const recipeBody = (overrides = {}) => ({
  title: `${TAG} Test curry`,
  emoji: '🍛',
  description: 'Test recipe',
  cuisine: 'Thai',
  tags: ['curry'],
  timeMinutes: 25,
  pans: 2,
  ingredients: [
    { name: 'chicken thigh (kipdijfilet)', amount: '1 pack (300 g)', aisle: 'meat' },
    { name: 'Coconut milk', amount: '1 can (400 ml)', aisle: 'world-food', note: null },
    { name: 'pandan rice', amount: '250 g', aisle: 'carbs' },
  ],
  steps: ['Cook rice.', 'Fry chicken.', 'Add coconut milk and simmer.'],
  status: 'suggested',
  ...overrides,
});

async function createRecipe(overrides) {
  const r = await api('POST', '/api/recipes', recipeBody(overrides));
  if (r.data && r.data.recipe) created.recipes.push(r.data.recipe.id);
  return r;
}

async function run() {
  console.log(`API test against ${BASE}`);

  // --- health & auth
  console.log('\nHealth & auth');
  let r = await api('GET', '/api/health', undefined, { token: null });
  check('GET /api/health without token -> 200 ok', r.status === 200 && r.data.status === 'ok', r);
  r = await api('GET', '/api/me', undefined, { token: null });
  check('GET /api/me without token -> 401', r.status === 401 && r.data.error, r);
  r = await api('GET', '/api/recipes', undefined, { token: 'wrong-token' });
  check('GET /api/recipes with wrong token -> 401', r.status === 401, r);
  r = await api('GET', '/api/me');
  check('GET /api/me with token -> {ok:true}', r.status === 200 && r.data.ok === true, r);
  r = await api('GET', '/api/does-not-exist');
  check('unknown API route -> 404 {error}', r.status === 404 && r.data.error, r);
  r = await api('POST', '/api/history', '{not json');
  check('invalid JSON body -> 400', r.status === 400 && r.data.error, r);

  // --- preferences
  console.log('\nPreferences');
  r = await api('GET', '/api/preferences');
  const prefs = r.data && r.data.preferences;
  check(
    'GET /api/preferences has 5 fields',
    r.status === 200 && ['cookingStyle', 'likes', 'dislikes', 'shopping', 'learned'].every((f) => typeof prefs[f] === 'string'),
    r.data
  );
  r = await api('PUT', '/api/preferences', { likes: 42 });
  check('PUT preferences with non-string -> 400', r.status === 400, r.data);
  r = await api('PUT', '/api/preferences', { nothing: 'x' });
  check('PUT preferences without fields -> 400', r.status === 400, r.data);
  const marker = `${prefs.learned}${prefs.learned ? '\n' : ''}- ${TAG} marker ${Date.now()}`;
  r = await api('PUT', '/api/preferences', { learned: marker });
  check(
    'PUT preferences updates field, updatedBy user',
    r.status === 200 && r.data.preferences.learned === marker && r.data.preferences.updatedBy === 'user',
    r.data
  );
  r = await api('GET', '/api/preferences/history');
  check(
    'GET preferences/history has snapshot with changedFields',
    r.status === 200 &&
      Array.isArray(r.data.changes) &&
      r.data.changes.length <= 20 &&
      r.data.changes[0].changedFields.includes('learned') &&
      r.data.changes[0].fields.learned === marker,
    r.data && r.data.changes && r.data.changes[0]
  );
  r = await api('PUT', '/api/preferences', { learned: prefs.learned });
  check('PUT preferences restores original', r.status === 200 && r.data.preferences.learned === prefs.learned, r.data);

  // --- recipes CRUD
  console.log('\nRecipes');
  r = await api('POST', '/api/recipes', recipeBody({ title: '' }));
  check('POST recipe without title -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/recipes', recipeBody({ ingredients: [{ name: 'x', amount: '1', aisle: 'garage' }] }));
  check('POST recipe with bad aisle -> 400', r.status === 400, r.data);

  r = await createRecipe({ title: `${TAG} Week curry A`, inWeek: true });
  const A = r.data.recipe;
  check('POST recipe A (suggested, inWeek) -> 201', r.status === 201 && A.status === 'suggested' && A.inWeek === true && A.source === 'manual', r.data);
  r = await createRecipe({
    title: `${TAG} Week curry B`,
    inWeek: true,
    ingredients: [
      { name: 'Chicken thigh (AH)', amount: '2 packs (600 g)', aisle: 'meat' },
      { name: 'coconut milk', amount: '1 can (400 ml)', aisle: 'world-food' },
      { name: 'wok vegetable mix (AH wokgroente)', amount: '1 bag (400 g)', aisle: 'vegetables' },
    ],
  });
  const B = r.data.recipe;
  check('POST recipe B -> 201', r.status === 201 && B.id, r.data);
  r = await createRecipe({ title: `${TAG} To dislike C` });
  const C = r.data.recipe;
  r = await createRecipe({ title: `${TAG} Untouched D` });
  const D = r.data.recipe;
  check('created C and D', C && D, r.data);

  r = await api('GET', '/api/recipes?status=suggested');
  check(
    'GET recipes?status=suggested lists A (newest first)',
    r.status === 200 &&
      r.data.recipes.some((x) => x.id === A.id) &&
      r.data.recipes.every((x, i, arr) => i === 0 || String(arr[i - 1].createdAt) >= String(x.createdAt)),
    r.data && r.data.recipes && r.data.recipes.length
  );
  r = await api('GET', '/api/recipes?status=bogus');
  check('GET recipes?status=bogus -> 400', r.status === 400, r.data);
  r = await api('GET', `/api/recipes/${A.id}`);
  check('GET recipe by id', r.status === 200 && r.data.recipe.id === A.id && r.data.recipe.ingredients.length === 3, r.data);
  r = await api('GET', '/api/recipes/doesnotexist123');
  check('GET unknown recipe -> 404', r.status === 404 && r.data.error, r.data);

  r = await api('PATCH', `/api/recipes/${A.id}`, { title: `${TAG} Week curry A (edited)`, timeMinutes: 20, steps: ['One.', 'Two.'] });
  check(
    'PATCH recipe content',
    r.status === 200 && r.data.recipe.title.endsWith('(edited)') && r.data.recipe.timeMinutes === 20 && r.data.recipe.steps.length === 2,
    r.data
  );
  r = await api('PATCH', `/api/recipes/${A.id}`, { inWeek: 'yes' });
  check('PATCH inWeek non-boolean -> 400', r.status === 400, r.data);
  r = await api('PATCH', `/api/recipes/${A.id}`, { feedback: 'sideways' });
  check('PATCH bad feedback -> 400', r.status === 400, r.data);
  r = await api('PATCH', `/api/recipes/${A.id}`, { id: 'x', createdAt: 'y' });
  check('PATCH with no updatable fields -> 400', r.status === 400, r.data);
  r = await api('PATCH', '/api/recipes/doesnotexist123', { title: 'x' });
  check('PATCH unknown recipe -> 404', r.status === 404, r.data);

  // --- week & shopping list
  console.log('\nWeek & shopping list');
  r = await api('GET', '/api/week');
  const weekIds = (r.data.recipes || []).map((x) => x.id);
  check('GET /api/week contains A and B', r.status === 200 && weekIds.includes(A.id) && weekIds.includes(B.id), weekIds);
  const list = r.data.shoppingList || [];
  const aisles = list.map((g) => g.aisle);
  const order = [
    'spices',
    'fruit',
    'vegetables',
    'fresh-meals',
    'meat',
    'cheese-deli',
    'bread',
    'carbs',
    'world-food',
    'cereals',
    'snacks',
    'tea',
    'dairy',
    'drinks',
    'misc',
  ];
  check(
    'shopping list grouped in AH Haarlemmerplein walking order',
    aisles.every((a, i) => i === 0 || order.indexOf(aisles[i - 1]) < order.indexOf(a)),
    aisles
  );
  const findItem = (aisle, pred) => ((list.find((g) => g.aisle === aisle) || {}).items || []).filter(pred);
  const chicken = findItem('meat', (i) => i.name.toLowerCase().startsWith('chicken thigh'));
  check(
    'chicken thigh merged across parenthesised variants',
    chicken.length === 1 &&
      chicken[0].amounts.includes('1 pack (300 g)') &&
      chicken[0].amounts.includes('2 packs (600 g)') &&
      chicken[0].recipes.includes(`${TAG} Week curry A (edited)`) &&
      chicken[0].recipes.includes(`${TAG} Week curry B`),
    chicken
  );
  const coconut = findItem('world-food', (i) => i.name.toLowerCase() === 'coconut milk');
  check(
    'coconut milk merged case-insensitively with both amounts kept',
    coconut.length === 1 && coconut[0].amounts.length >= 2,
    coconut
  );

  // --- feedback semantics
  console.log('\nFeedback & status');
  r = await api('PATCH', `/api/recipes/${B.id}`, { feedback: 'up' });
  check('thumbs up -> feedback up, status saved', r.status === 200 && r.data.recipe.feedback === 'up' && r.data.recipe.status === 'saved', r.data);
  r = await api('PATCH', `/api/recipes/${C.id}`, { feedback: 'down', feedbackNote: 'too many steps' });
  check(
    'thumbs down -> feedback down, status dismissed, note kept',
    r.status === 200 && r.data.recipe.status === 'dismissed' && r.data.recipe.feedbackNote === 'too many steps',
    r.data
  );
  r = await api('GET', '/api/recipes?status=all');
  check(
    'status=all excludes dismissed',
    r.status === 200 && !r.data.recipes.some((x) => x.id === C.id) && r.data.recipes.some((x) => x.id === B.id),
    r.data && r.data.recipes && r.data.recipes.length
  );
  r = await api('GET', '/api/recipes?status=saved');
  check('status=saved includes B', r.status === 200 && r.data.recipes.some((x) => x.id === B.id), null);

  r = await api('POST', '/api/recipes/clear-suggestions');
  const aAfter = (await api('GET', `/api/recipes/${A.id}`)).data.recipe;
  const dAfter = (await api('GET', `/api/recipes/${D.id}`)).data.recipe;
  check(
    'clear-suggestions dismisses untouched D, keeps inWeek A',
    r.status === 200 && r.data.dismissed >= 1 && dAfter.status === 'dismissed' && aAfter.status === 'suggested',
    { res: r.data, a: aAfter.status, d: dAfter.status }
  );

  // --- cooked flow
  console.log('\nCooked & history');
  r = await api('POST', `/api/recipes/${A.id}/cooked`, { rating: 'great' });
  check('cooked with invalid rating -> 400', r.status === 400, r.data);
  r = await api('POST', `/api/recipes/${A.id}/cooked`, { cookedAt: amsterdamDate(5) });
  check('cooked in the future -> 400', r.status === 400, r.data);
  r = await api('POST', `/api/recipes/${A.id}/cooked`, { rating: 'up', note: `${TAG} tasty`, cookedAt: amsterdamDate() });
  if (r.data && r.data.entry) created.history.push(r.data.entry.id);
  check(
    'cooked -> saved, out of week, cookedCount 1, feedback up, history entry',
    r.status === 200 &&
      r.data.recipe.status === 'saved' &&
      r.data.recipe.inWeek === false &&
      r.data.recipe.cookedCount === 1 &&
      r.data.recipe.feedback === 'up' &&
      r.data.recipe.lastCookedAt &&
      r.data.entry.recipeId === A.id &&
      r.data.entry.rating === 'up' &&
      r.data.entry.cookedAt === amsterdamDate(),
    r.data
  );
  r = await api('POST', '/api/recipes/doesnotexist123/cooked', {});
  check('cooked unknown recipe -> 404', r.status === 404, r.data);

  r = await api('POST', '/api/history', { rating: 'up' });
  check('POST history without title -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/history', { title: `${TAG} Takeaway pizza`, cookedAt: '2026-02-30' });
  check('POST history with invalid date -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/history', { title: `${TAG} Takeaway pizza`, rating: 'meh', note: 'late night', cookedAt: amsterdamDate(-1) });
  const H = r.data && r.data.entry;
  if (H) created.history.push(H.id);
  check('POST history -> entry', (r.status === 200 || r.status === 201) && H.title.includes('pizza') && H.rating === 'meh' && H.recipeId === null, r.data);
  r = await api('POST', '/api/history', { title: `${TAG} Old meal`, cookedAt: amsterdamDate(-3), recipeId: B.id });
  const H2 = r.data && r.data.entry;
  if (H2) created.history.push(H2.id);
  check('POST history linked to recipe takes its emoji', H2 && H2.recipeId === B.id && H2.emoji === '🍛', r.data);

  r = await api('GET', '/api/history');
  const entries = r.data.entries || [];
  const idx = (id) => entries.findIndex((e) => e.id === id);
  check(
    'GET history newest cookedAt first',
    r.status === 200 &&
      idx(H.id) >= 0 &&
      idx(created.history[0]) < idx(H.id) &&
      idx(H.id) < idx(H2.id) &&
      entries.every((e, i) => i === 0 || entries[i - 1].cookedAt >= e.cookedAt),
    entries.slice(0, 5)
  );
  r = await api('PATCH', `/api/history/${H.id}`, { note: 'edited note', rating: 'down' });
  check('PATCH history', r.status === 200 && r.data.entry.note === 'edited note' && r.data.entry.rating === 'down', r.data);
  r = await api('PATCH', `/api/history/${H.id}`, { cookedAt: 'yesterday' });
  check('PATCH history bad date -> 400', r.status === 400, r.data);
  r = await api('PATCH', '/api/history/doesnotexist123', { note: 'x' });
  check('PATCH unknown history -> 404', r.status === 404, r.data);
  r = await api('DELETE', `/api/history/${H.id}`);
  check('DELETE history -> {ok}', r.status === 200 && r.data.ok === true, r.data);
  if (r.status === 200) created.history = created.history.filter((id) => id !== H.id);
  r = await api('DELETE', `/api/history/${H.id}`);
  check('DELETE history again -> 404', r.status === 404, r.data);

  // --- LLM endpoints: validation only (no model calls)
  console.log('\nLLM endpoint validation (no model calls)');
  r = await api('POST', '/api/recipes/generate', { count: 99 });
  check('generate count 99 -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/recipes/generate', { count: 2, hint: 7 });
  check('generate non-string hint -> 400', r.status === 400, r.data);
  r = await api('POST', `/api/recipes/${A.id}/ai-edit`, { instruction: '' });
  check('ai-edit without instruction -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/recipes/doesnotexist123/ai-edit', { instruction: 'spicier' });
  check('ai-edit unknown recipe -> 404', r.status === 404, r.data);
  r = await api('POST', `/api/recipes/${A.id}/chat`, { message: '' });
  check('recipe chat without message -> 400', r.status === 400, r.data);
  r = await api('POST', `/api/recipes/${A.id}/chat`, { message: 'ok?', history: 'not-an-array' });
  check('recipe chat with non-array history -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/recipes/doesnotexist123/chat', { message: 'can I use tofu?' });
  check('recipe chat unknown recipe -> 404', r.status === 404, r.data);
  r = await api('POST', '/api/chat', { message: '   ' });
  check('chat with empty message -> 400', r.status === 400, r.data);

  // --- shopping items (manual "Other groceries" list)
  console.log('\nShopping items');
  r = await api('POST', '/api/shopping-items', {});
  check('POST shopping-items without name -> 400', r.status === 400, r.data);
  r = await api('POST', '/api/shopping-items', { name: `${TAG} milk` });
  const item1 = r.data && r.data.item;
  if (item1) created.shoppingItems.push(item1.id);
  check(
    'POST shopping-items -> item unchecked with a classified aisle',
    r.status === 201 && item1 && item1.checked === false && item1.name.includes('milk') && typeof item1.aisle === 'string',
    r.data
  );
  r = await api('POST', '/api/shopping-items', { name: `${TAG} eggs`, amount: 'x6' });
  const item2 = r.data && r.data.item;
  if (item2) created.shoppingItems.push(item2.id);
  check('POST shopping-items keeps amount', r.status === 201 && item2 && item2.amount === 'x6', r.data);
  r = await api('GET', '/api/shopping-items');
  check(
    'GET shopping-items lists both, oldest first',
    r.status === 200 &&
      Array.isArray(r.data.items) &&
      r.data.items.some((i) => i.id === item1.id) &&
      r.data.items.findIndex((i) => i.id === item1.id) < r.data.items.findIndex((i) => i.id === item2.id),
    r.data
  );
  r = await api('PATCH', `/api/shopping-items/${item1.id}`, { checked: true, amount: 'x2' });
  check(
    'PATCH shopping-items updates checked & amount',
    r.status === 200 && r.data.item.checked === true && r.data.item.amount === 'x2',
    r.data
  );
  r = await api('PATCH', `/api/shopping-items/${item1.id}`, { aisle: 'not-a-real-aisle' });
  check('PATCH shopping-items bad aisle -> 400', r.status === 400, r.data);
  r = await api('PATCH', `/api/shopping-items/${item1.id}`, { aisle: 'dairy' });
  check('PATCH shopping-items valid aisle', r.status === 200 && r.data.item.aisle === 'dairy', r.data);
  r = await api('PATCH', '/api/shopping-items/doesnotexist123', { checked: true });
  check('PATCH unknown shopping-item -> 404', r.status === 404, r.data);
  r = await api('POST', '/api/shopping-items/clear-checked');
  check('POST clear-checked removes the checked item', r.status === 200 && r.data.deleted >= 1, r.data);
  created.shoppingItems = created.shoppingItems.filter((id) => id !== item1.id);
  r = await api('GET', '/api/shopping-items');
  check('cleared item no longer listed', r.status === 200 && !r.data.items.some((i) => i.id === item1.id), r.data);
  r = await api('DELETE', `/api/shopping-items/${item2.id}`);
  check('DELETE shopping-items -> {ok}', r.status === 200 && r.data.ok === true, r.data);
  created.shoppingItems = created.shoppingItems.filter((id) => id !== item2.id);
  r = await api('DELETE', `/api/shopping-items/${item2.id}`);
  check('DELETE shopping-items again -> 404', r.status === 404, r.data);

  // --- chat (no LLM)
  console.log('\nChat');
  r = await api('GET', '/api/chat');
  check('GET /api/chat -> messages array (<= 60)', r.status === 200 && Array.isArray(r.data.messages) && r.data.messages.length <= 60, r.data);
  r = await api('DELETE', '/api/chat');
  check('DELETE /api/chat -> {ok}', r.status === 200 && r.data.ok === true, r.data);
  r = await api('GET', '/api/chat');
  check('chat empty after DELETE', r.status === 200 && r.data.messages.length === 0, r.data);
}

async function cleanup() {
  for (const id of created.history) await api('DELETE', `/api/history/${id}`).catch(() => {});
  for (const id of created.recipes) await api('DELETE', `/api/recipes/${id}`).catch(() => {});
  for (const id of created.shoppingItems) await api('DELETE', `/api/shopping-items/${id}`).catch(() => {});
  const r = await api('GET', `/api/recipes/${created.recipes[0]}`).catch(() => ({}));
  console.log(
    `\nCleanup: removed ${created.recipes.length} recipes, ${created.history.length} history entries, ${created.shoppingItems.length} shopping items${r.status === 404 ? '' : ' (recipe delete check failed!)'}`
  );
}

run()
  .catch((err) => {
    failed++;
    console.error('\nCrashed:', err);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
