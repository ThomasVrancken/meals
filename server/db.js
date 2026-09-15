const { Firestore, FieldValue } = require('@google-cloud/firestore');

// Firestore accessors. The (default) database is shared with the newsfeed
// app, so every collection is prefixed with COLLECTION_PREFIX (`meals_` in
// prod, `mealsdev_` locally). We refuse to run without a prefix rather than
// risk writing unprefixed collections into the shared database.
//
// Data volume is tiny (two people's dinners), so we avoid composite indexes:
// at most one equality filter or one single-field orderBy per query, and do
// any further filtering/sorting in memory. Timestamps are ISO strings.

let firestore;
function db() {
  if (!firestore) {
    firestore = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      ignoreUndefinedProperties: true,
    });
  }
  return firestore;
}

function prefix() {
  const p = process.env.COLLECTION_PREFIX;
  if (!p) throw new Error('COLLECTION_PREFIX is not set; refusing to touch Firestore');
  return p;
}

const col = (name) => db().collection(`${prefix()}${name}`);
const nowIso = () => new Date().toISOString();
const withId = (snap) => ({ ...snap.data(), id: snap.id });

// ---------------------------------------------------------------------------
// Preferences

const PREFERENCE_FIELDS = ['cookingStyle', 'likes', 'dislikes', 'shopping', 'learned'];

const SEED_PREFERENCES = {
  cookingStyle: [
    '- Convenience and speed over food quality, always. Target ≤ 30 min, minimal effort.',
    '- Max TWO pans: typically one pot to boil carbs (rice, pasta, noodles) + one wok for the protein/sauce. Never oven + pans, never a third pan, no blender/food processor.',
    '- Hates cutting vegetables: prefer pre-cut vegetable bags (AH roerbakgroente / wokgroente / Italiaanse groentemix etc.). At most 1–2 very easy vegetables to cut (e.g. a zucchini, a bell pepper).',
    '- Bowl / deep-plate meals: a carb + a sauce/stir-fry on top.',
    '- Store-bought shortcuts are welcome: curry pastes, jarred sauces, stock cubes, pre-grated cheese, cooking cream.',
    '- Recipes skip basic seasoning fluff: never list salt, pepper, cooking oil, water; no "season to taste". DO mention a specific sauce, paste, spice mix or herb when it matters.',
  ].join('\n'),
  likes: [
    '- Curries: rice in one pan; in the wok first chicken, then a bag of pre-cut vegetables, then a store-bought curry paste/sauce (+ coconut milk). Many variations (Thai red/green/yellow, Indian, Japanese, etc.) by swapping sauce, veg mix and meat. A favourite format.',
    '- "Red sauce": bolognese-like but spicier. Ground beef in the wok, then a bag of Italian pre-cut vegetables, tomato paste added once cooked, herbs, chilies. With rice or pasta.',
    '- Tortellini with a cream sauce.',
    '- Spicy food.',
    '- Easy iterations and variations on these formats.',
  ].join('\n'),
  dislikes: [
    '- Complex recipes, many steps, fancy techniques.',
    '- Using more than two pans or lots of utensils.',
    '- Lots of chopping / prepping vegetables.',
  ].join('\n'),
  shopping: [
    '- All groceries at Albert Heijn "AH Haarlemmerplein", Haarlemmerplein 34, 1013 HS Amsterdam (a regular city-centre AH, not an XL).',
    '- Only use ingredients reliably stocked at a regular Albert Heijn in the Netherlands. Prefer AH own-brand / common Dutch supermarket products, and give the Dutch product name in parentheses when it helps find it (e.g. "Thai red curry paste (AH / Go-Tan)", "kipdijfilet").',
    '- Cooking for 2 people (Thomas and Lote). Standard supermarket pack sizes (e.g. "1 bag (400 g)").',
  ].join('\n'),
  learned: '',
};

const preferencesRef = () => col('config').doc('preferences');

function pickPreferenceFields(data) {
  const out = {};
  for (const f of PREFERENCE_FIELDS) out[f] = typeof data[f] === 'string' ? data[f] : SEED_PREFERENCES[f];
  return out;
}

/** Write the seed preferences once if the doc doesn't exist (idempotent). */
async function ensurePreferencesSeeded() {
  const ref = preferencesRef();
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    const now = nowIso();
    tx.set(ref, { ...SEED_PREFERENCES, updatedAt: now, updatedBy: 'seed' });
    tx.set(col('preferencesHistory').doc(), {
      fields: { ...SEED_PREFERENCES },
      changedFields: [...PREFERENCE_FIELDS],
      summary: 'Seeded default preferences',
      updatedBy: 'seed',
      createdAt: now,
    });
  });
}

async function getPreferences() {
  const snap = await preferencesRef().get();
  if (!snap.exists) {
    await ensurePreferencesSeeded();
    return { ...SEED_PREFERENCES, updatedAt: null, updatedBy: 'seed' };
  }
  const data = snap.data();
  return { ...pickPreferenceFields(data), updatedAt: data.updatedAt || null, updatedBy: data.updatedBy || 'seed' };
}

/**
 * Apply a subset of preference fields and append a snapshot to
 * preferencesHistory. Only fields whose text actually changed are recorded.
 * Returns `{ preferences, changedFields }`.
 */
async function updatePreferences(changes, { updatedBy, summary }) {
  const ref = preferencesRef();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? pickPreferenceFields(snap.data()) : { ...SEED_PREFERENCES };
    const changedFields = PREFERENCE_FIELDS.filter(
      (f) => typeof changes[f] === 'string' && changes[f] !== current[f]
    );
    const base = snap.exists ? snap.data() : { updatedAt: null, updatedBy: 'seed' };
    if (changedFields.length === 0) {
      return { preferences: { ...current, updatedAt: base.updatedAt, updatedBy: base.updatedBy }, changedFields };
    }
    const next = { ...current };
    for (const f of changedFields) next[f] = changes[f];
    const now = nowIso();
    tx.set(ref, { ...next, updatedAt: now, updatedBy });
    tx.set(col('preferencesHistory').doc(), {
      fields: { ...next },
      changedFields,
      summary: summary || `Updated ${changedFields.join(', ')}`,
      updatedBy,
      createdAt: now,
    });
    return { preferences: { ...next, updatedAt: now, updatedBy }, changedFields };
  });
}

async function listPreferenceChanges(limit = 20) {
  const snap = await col('preferencesHistory').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(withId);
}

// ---------------------------------------------------------------------------
// Recipes

const byCreatedDesc = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

async function listRecipes(status = 'all') {
  let snap;
  if (status === 'all') snap = await col('recipes').get();
  else if (status === 'week') snap = await col('recipes').where('inWeek', '==', true).get();
  else snap = await col('recipes').where('status', '==', status).get();
  let recipes = snap.docs.map(withId);
  if (status === 'all') recipes = recipes.filter((r) => r.status !== 'dismissed');
  if (status === 'week') recipes = recipes.filter((r) => r.status !== 'dismissed');
  return recipes.sort(byCreatedDesc);
}

/** Every recipe including dismissed ones (for AI context). */
async function listAllRecipesIncludingDismissed() {
  const snap = await col('recipes').get();
  return snap.docs.map(withId).sort(byCreatedDesc);
}

async function getRecipe(id) {
  if (typeof id !== 'string' || !id || id.includes('/')) return null;
  const snap = await col('recipes').doc(id).get();
  return snap.exists ? withId(snap) : null;
}

async function createRecipe(doc) {
  const ref = col('recipes').doc();
  const data = { ...doc, id: ref.id };
  await ref.set(data);
  return data;
}

async function updateRecipe(id, patch) {
  const ref = col('recipes').doc(id);
  const data = { ...patch, updatedAt: nowIso() };
  delete data.id;
  await ref.update(data);
  const snap = await ref.get();
  return withId(snap);
}

async function deleteRecipe(id) {
  await col('recipes').doc(id).delete();
}

// ---------------------------------------------------------------------------
// History

const byCookedDesc = (a, b) =>
  String(b.cookedAt).localeCompare(String(a.cookedAt)) || String(b.createdAt).localeCompare(String(a.createdAt));

async function listHistory({ sinceDate } = {}) {
  let q = col('history');
  if (sinceDate) q = q.where('cookedAt', '>=', sinceDate);
  const snap = await q.get();
  return snap.docs.map(withId).sort(byCookedDesc);
}

async function getHistoryEntry(id) {
  if (typeof id !== 'string' || !id || id.includes('/')) return null;
  const snap = await col('history').doc(id).get();
  return snap.exists ? withId(snap) : null;
}

async function createHistoryEntry(entry) {
  const ref = col('history').doc();
  const data = {
    id: ref.id,
    recipeId: entry.recipeId || null,
    title: entry.title,
    emoji: entry.emoji || '🍽️',
    cookedAt: entry.cookedAt,
    rating: entry.rating || null,
    note: entry.note || null,
    createdAt: nowIso(),
  };
  await ref.set(data);
  return data;
}

async function updateHistoryEntry(id, patch) {
  const ref = col('history').doc(id);
  const data = { ...patch };
  delete data.id;
  await ref.update(data);
  return withId(await ref.get());
}

async function deleteHistoryEntry(id) {
  await col('history').doc(id).delete();
}

// ---------------------------------------------------------------------------
// Chat

async function listChat(limit = 60) {
  const snap = await col('chat').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(withId).reverse();
}

async function addChatMessage({ role, text, actions = [], createdAt }) {
  const ref = col('chat').doc();
  const data = { id: ref.id, role, text, actions, createdAt: createdAt || nowIso() };
  await ref.set(data);
  return data;
}

async function clearChat() {
  const snap = await col('chat').get();
  // Batches are capped at 500 writes.
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

// ---------------------------------------------------------------------------
// Counters

const countersRef = () => col('meta').doc('counters');

/** Atomically add `n` to feedbackSinceReflection and return the new value. */
async function incrementFeedbackCounter(n = 1) {
  const ref = countersRef();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists && snap.data().feedbackSinceReflection) || 0;
    const next = current + n;
    tx.set(ref, { feedbackSinceReflection: next }, { merge: true });
    return next;
  });
}

/**
 * Reset the counter only if it is still >= threshold. Returns true when this
 * caller "claimed" the reflection run (prevents two concurrent requests from
 * both starting one).
 */
async function claimReflection(threshold) {
  const ref = countersRef();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists && snap.data().feedbackSinceReflection) || 0;
    if (current < threshold) return false;
    tx.set(ref, { feedbackSinceReflection: 0, lastReflectionAt: nowIso() }, { merge: true });
    return true;
  });
}

async function getCounters() {
  const snap = await countersRef().get();
  return snap.exists ? snap.data() : { feedbackSinceReflection: 0 };
}

module.exports = {
  db,
  col,
  FieldValue,
  PREFERENCE_FIELDS,
  SEED_PREFERENCES,
  ensurePreferencesSeeded,
  getPreferences,
  updatePreferences,
  listPreferenceChanges,
  listRecipes,
  listAllRecipesIncludingDismissed,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  listHistory,
  getHistoryEntry,
  createHistoryEntry,
  updateHistoryEntry,
  deleteHistoryEntry,
  listChat,
  addChatMessage,
  clearChat,
  incrementFeedbackCounter,
  claimReflection,
  getCounters,
};
