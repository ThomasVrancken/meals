#!/usr/bin/env node
// Throwaway mock backend implementing the SPEC's API contract with
// in-memory fake data, for local frontend development/verification while
// the real Express server is being built. Not used in production.
//
// Run: node dev/mock-server.mjs  (listens on :3002, matches vite.config.js proxy)

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = 3002
const TOKEN = 'demo'

const delay = (ms) => new Promise((res) => setTimeout(res, ms))
const slow = () => delay(3000 + Math.random() * 2000) // simulate a real 3-5s AI call

const now = () => new Date().toISOString()

// ---------- in-memory data ----------

let preferences = {
  cookingStyle:
    '- Convenience and speed over food quality, always. Target ≤ 30 min, minimal effort.\n- Max TWO pans: one pot for carbs + one wok for protein/sauce.\n- Hates cutting vegetables: prefer pre-cut vegetable bags.\n- Bowl / deep-plate meals: a carb + a sauce/stir-fry on top.\n- Store-bought shortcuts are welcome.\n- No salt/pepper/oil/water in ingredient lists.',
  likes:
    '- Curries: rice + wok with chicken, pre-cut veg, store-bought paste.\n- "Red sauce": bolognese-like but spicier.\n- Tortellini with a cream sauce.\n- Spicy food.',
  dislikes: '- Complex recipes, many steps, fancy techniques.\n- More than two pans or lots of utensils.\n- Lots of chopping.',
  shopping:
    '- All groceries at Albert Heijn "AH Haarlemmerplein".\n- Only regular AH stock, AH own-brand preferred.\n- Cooking for 2 people (Thomas and Lote). Standard pack sizes.',
  learned: '- Loved the last two Thai curries; repeat monthly.\n- Not keen on mushrooms.',
  updatedAt: now(),
  updatedBy: 'seed',
}

let preferencesHistory = [
  {
    id: randomUUID(),
    fields: { ...preferences },
    changedFields: ['learned'],
    summary: 'Learned: noted preference against mushrooms after a dismissed suggestion',
    updatedBy: 'reflection',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
]

function mkRecipe(overrides) {
  const id = overrides.id || randomUUID()
  return {
    id,
    title: 'Untitled',
    emoji: '🍽️',
    description: '',
    cuisine: '',
    tags: [],
    timeMinutes: 25,
    servings: 2,
    pans: 2,
    ingredients: [],
    steps: [],
    status: 'suggested',
    inWeek: false,
    feedback: null,
    feedbackNote: null,
    source: 'ai',
    parentId: null,
    cookedCount: 0,
    lastCookedAt: null,
    hint: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  }
}

let recipes = [
  mkRecipe({
    title: 'Thai green chicken curry',
    emoji: '🍛',
    description: 'A fragrant, creamy weeknight curry with pre-cut veg and jasmine rice.',
    cuisine: 'Thai',
    tags: ['curry', 'spicy'],
    timeMinutes: 25,
    pans: 2,
    status: 'suggested',
    ingredients: [
      { name: 'Jasmine rice', amount: '160 g', aisle: 'pasta-rice-noodles' },
      { name: 'Chicken thigh fillet (kipdijfilet)', amount: '300 g', aisle: 'meat-fish' },
      { name: 'AH wokgroente', amount: '1 bag (400 g)', aisle: 'produce' },
      { name: 'Thai green curry paste (AH / Go-Tan)', amount: '4 tbsp', aisle: 'sauces-spices' },
      { name: 'Coconut milk', amount: '1 can (400 ml)', aisle: 'canned-jars' },
    ],
    steps: [
      'Cook the rice according to the pack.',
      'Fry the chicken in the wok until browned.',
      'Add the wokgroente and stir-fry 3 min.',
      'Stir in curry paste, then coconut milk. Simmer 8 min.',
      'Serve over the rice.',
    ],
  }),
  mkRecipe({
    title: 'Spicy red sauce pasta',
    emoji: '🍝',
    description: 'Bolognese-like ground beef sauce with Italian veg and chili, spicier than usual.',
    cuisine: 'Italian',
    tags: ['red sauce', 'spicy'],
    timeMinutes: 25,
    pans: 2,
    status: 'suggested',
    ingredients: [
      { name: 'Pasta (penne)', amount: '250 g', aisle: 'pasta-rice-noodles' },
      { name: 'Ground beef (rundergehakt)', amount: '300 g', aisle: 'meat-fish' },
      { name: 'AH Italiaanse groentemix', amount: '1 bag (400 g)', aisle: 'produce' },
      { name: 'Tomato paste (tomatenpuree)', amount: '1 tube', aisle: 'canned-jars' },
      { name: 'Dried chili flakes', amount: '1 tsp', aisle: 'sauces-spices' },
    ],
    steps: [
      'Boil the pasta.',
      'Brown the beef in the wok.',
      'Add the vegetable mix, cook 4 min.',
      'Stir in tomato paste and chili flakes. Simmer 5 min.',
      'Toss with the pasta.',
    ],
  }),
  mkRecipe({
    title: 'Japanese curry udon bowl',
    emoji: '🍜',
    description: 'A new take on the curry format with udon noodles and a milder Japanese curry block.',
    cuisine: 'Japanese',
    tags: ['curry', 'new idea'],
    timeMinutes: 20,
    pans: 2,
    status: 'suggested',
    ingredients: [
      { name: 'Udon noodles', amount: '2 packs', aisle: 'pasta-rice-noodles' },
      { name: 'Pork strips (varkenshaas reepjes)', amount: '300 g', aisle: 'meat-fish' },
      { name: 'AH roerbakgroente', amount: '1 bag (400 g)', aisle: 'produce' },
      { name: 'Japanese curry roux block', amount: '4 cubes', aisle: 'sauces-spices' },
    ],
    steps: [
      'Heat the udon per pack instructions.',
      'Fry the pork strips until cooked.',
      'Add the roerbakgroente, stir-fry 3 min.',
      'Dissolve curry roux in a splash of water, stir through. Simmer 5 min.',
      'Serve over the udon.',
    ],
  }),
  mkRecipe({
    id: 'saved-tortellini',
    title: 'Creamy tortellini',
    emoji: '🥟',
    description: 'Store-bought tortellini in a quick cream sauce, a proven favourite.',
    cuisine: 'Italian',
    tags: ['pasta', 'favourite'],
    timeMinutes: 15,
    pans: 1,
    status: 'saved',
    feedback: 'up',
    cookedCount: 4,
    lastCookedAt: '2026-09-01',
    ingredients: [
      { name: 'Fresh tortellini (spinach & ricotta)', amount: '500 g', aisle: 'pasta-rice-noodles' },
      { name: 'Cooking cream (kookroom)', amount: '1 pack (200 ml)', aisle: 'dairy-eggs' },
      { name: 'Grated Parmesan', amount: '40 g', aisle: 'dairy-eggs' },
    ],
    steps: [
      'Boil the tortellini per pack instructions.',
      'Warm the cooking cream in the same pan once drained.',
      'Stir the tortellini through, toss with Parmesan.',
    ],
  }),
  mkRecipe({
    id: 'saved-curry-2',
    title: 'Indian butter chicken bowl',
    emoji: '🍛',
    description: 'Rich, mildly spiced butter chicken with rice — another curry-format favourite.',
    cuisine: 'Indian',
    tags: ['curry'],
    timeMinutes: 30,
    pans: 2,
    status: 'saved',
    feedback: 'up',
    cookedCount: 2,
    lastCookedAt: '2026-08-20',
    inWeek: true,
    ingredients: [
      { name: 'Basmati rice', amount: '160 g', aisle: 'pasta-rice-noodles' },
      { name: 'Chicken breast fillet (kipfilet)', amount: '300 g', aisle: 'meat-fish' },
      { name: 'Butter chicken paste/sauce (AH / Patak’s)', amount: '1 jar', aisle: 'sauces-spices' },
      { name: 'Cooking cream (kookroom)', amount: '100 ml', aisle: 'dairy-eggs' },
    ],
    steps: [
      'Cook the rice.',
      'Fry the chicken in the wok until browned.',
      'Add the butter chicken sauce, simmer 6 min.',
      'Stir in the cream, simmer 2 min more.',
      'Serve over rice.',
    ],
  }),
]

let history = [
  {
    id: randomUUID(),
    recipeId: 'saved-tortellini',
    title: 'Creamy tortellini',
    emoji: '🥟',
    cookedAt: '2026-09-01',
    rating: 'up',
    note: 'Added extra Parmesan, great as always.',
    createdAt: '2026-09-01T19:00:00.000Z',
  },
  {
    id: randomUUID(),
    recipeId: null,
    title: 'Leftover pizza',
    emoji: '🍕',
    cookedAt: '2026-08-28',
    rating: 'meh',
    note: null,
    createdAt: '2026-08-28T19:30:00.000Z',
  },
  {
    id: randomUUID(),
    recipeId: 'saved-curry-2',
    title: 'Indian butter chicken bowl',
    emoji: '🍛',
    cookedAt: '2026-08-20',
    rating: 'up',
    note: null,
    createdAt: '2026-08-20T19:00:00.000Z',
  },
].sort((a, b) => (a.cookedAt < b.cookedAt ? 1 : -1))

let chat = []

// ---------- helpers ----------

function json(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = ''
    req.on('data', (c) => (chunks += c))
    req.on('end', () => {
      if (!chunks) return resolve({})
      try {
        resolve(JSON.parse(chunks))
      } catch {
        resolve({})
      }
    })
  })
}

const AISLE_ORDER = [
  'produce',
  'meat-fish',
  'dairy-eggs',
  'pasta-rice-noodles',
  'sauces-spices',
  'canned-jars',
  'frozen',
  'bakery',
  'other',
]

function normalizeKey(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .trim()
}

function buildShoppingList() {
  const weekRecipes = recipes.filter((r) => r.inWeek)
  const byKey = new Map()
  for (const r of weekRecipes) {
    for (const ing of r.ingredients || []) {
      const key = normalizeKey(ing.name)
      if (!byKey.has(key)) {
        byKey.set(key, { aisle: ing.aisle || 'other', name: ing.name, amounts: [], recipes: [] })
      }
      const entry = byKey.get(key)
      if (ing.amount) entry.amounts.push(ing.amount)
      if (!entry.recipes.includes(r.title)) entry.recipes.push(r.title)
    }
  }
  const groups = new Map()
  for (const item of byKey.values()) {
    if (!groups.has(item.aisle)) groups.set(item.aisle, [])
    groups.get(item.aisle).push(item)
  }
  return AISLE_ORDER.filter((a) => groups.has(a)).map((aisle) => ({ aisle, items: groups.get(aisle) }))
}

const SAMPLE_TITLES = [
  ['Korean gochujang beef bowl', '🍚', 'Korean'],
  ['Shakshuka-style eggs', '🍳', 'Middle Eastern'],
  ['Massaman beef curry', '🍛', 'Thai'],
  ['Burrito bowl with salsa', '🌮', 'Mexican'],
  ['Gnocchi in tomato-chili sauce', '🍝', 'Italian'],
  ['Teriyaki salmon noodles', '🍣', 'Japanese'],
  ['Peanut satay chicken bowl', '🥜', 'Indonesian'],
  ['Chorizo & bean stew', '🍲', 'Spanish'],
]

function generateFakeRecipe(hint) {
  const pick = SAMPLE_TITLES[Math.floor(Math.random() * SAMPLE_TITLES.length)]
  const [title, emoji, cuisine] = pick
  return mkRecipe({
    title: hint ? `${title} (${hint})` : title,
    emoji,
    description: `A quick two-pan ${cuisine.toLowerCase()} bowl, ready in under 30 minutes.`,
    cuisine,
    tags: ['new idea'],
    timeMinutes: 20 + Math.floor(Math.random() * 10),
    pans: Math.random() > 0.5 ? 2 : 1,
    status: 'suggested',
    ingredients: [
      { name: 'Rice noodles', amount: '200 g', aisle: 'pasta-rice-noodles' },
      { name: 'AH wokgroente', amount: '1 bag (400 g)', aisle: 'produce' },
      { name: 'Chicken thigh fillet (kipdijfilet)', amount: '300 g', aisle: 'meat-fish' },
      { name: 'Store-bought stir-fry sauce', amount: '1 pack', aisle: 'sauces-spices' },
    ],
    steps: [
      'Prepare the noodles per pack instructions.',
      'Fry the chicken in the wok until browned.',
      'Add the vegetables, stir-fry 3 min.',
      'Stir in the sauce, simmer 3 min.',
      'Toss with the noodles.',
    ],
  })
}

function recordFeedbackEvent() {
  // In the real app this drives reflect.js; the mock just no-ops.
}

// ---------- chat agent (fake) ----------

async function fakeChat(message) {
  const lower = message.toLowerCase()
  const actions = []
  let replyText = ''
  const changed = { recipes: false, week: false, history: false, preferences: false }

  if (lower.includes('idea') || lower.includes('suggest')) {
    const created = [generateFakeRecipe(), generateFakeRecipe()]
    recipes = [...created, ...recipes]
    changed.recipes = true
    created.forEach((r) => actions.push({ type: 'recipe', label: `Suggested ${r.title}`, recipeId: r.id }))
    replyText = `Added ${created.length} new ideas to Suggestions — take a look!`
  } else if (lower.includes('cooked') || lower.includes('we ate') || lower.includes('ate ')) {
    const entry = {
      id: randomUUID(),
      recipeId: null,
      title: message.replace(/^we (ate|cooked)\s*/i, '').trim() || 'Something tasty',
      emoji: '🍽️',
      cookedAt: new Date().toISOString().slice(0, 10),
      rating: null,
      note: null,
      createdAt: now(),
    }
    history = [entry, ...history]
    changed.history = true
    actions.push({ type: 'history', label: `Logged ${entry.title}` })
    replyText = `Nice, logged "${entry.title}" in your history. How was it — loved it, fine, or not again?`
  } else if (lower.includes('less of') || lower.includes('dislike') || lower.includes("don't like") || lower.includes('too much')) {
    preferences = { ...preferences, dislikes: preferences.dislikes + `\n- ${message}`, updatedAt: now(), updatedBy: 'chat' }
    preferencesHistory = [
      {
        id: randomUUID(),
        fields: { ...preferences },
        changedFields: ['dislikes'],
        summary: `Updated dislikes: ${message}`,
        updatedBy: 'chat',
        createdAt: now(),
      },
      ...preferencesHistory,
    ]
    changed.preferences = true
    actions.push({ type: 'preferences', label: 'Updated dislikes' })
    replyText = `Got it, noted that preference — I'll keep it in mind for future ideas.`
  } else {
    replyText = `Sounds good! I can suggest ideas, log what you cooked, or update your preferences — just tell me what you'd like.`
  }

  return { replyText, actions, changed }
}

// ---------- router ----------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const method = req.method

  // CORS not needed (same-origin via vite proxy), but keep permissive for direct hits.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  if (method === 'OPTIONS') return json(res, 204, {})

  if (path === '/api/health') return json(res, 200, { status: 'ok' })

  if (!path.startsWith('/api/')) return json(res, 404, { error: 'Not found' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (token !== TOKEN) return json(res, 401, { error: 'Invalid or missing access code' })

  try {
    // /api/me
    if (path === '/api/me' && method === 'GET') return json(res, 200, { ok: true })

    // /api/recipes
    if (path === '/api/recipes' && method === 'GET') {
      const status = url.searchParams.get('status') || 'all'
      let list = recipes
      if (status === 'suggested') list = recipes.filter((r) => r.status === 'suggested')
      else if (status === 'saved') list = recipes.filter((r) => r.status === 'saved')
      else list = recipes.filter((r) => r.status !== 'dismissed')
      list = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json(res, 200, { recipes: list })
    }

    const recipeIdMatch = path.match(/^\/api\/recipes\/([^/]+)$/)
    if (recipeIdMatch && method === 'GET') {
      const recipe = recipes.find((r) => r.id === recipeIdMatch[1])
      if (!recipe) return json(res, 404, { error: 'Recipe not found' })
      return json(res, 200, { recipe })
    }

    if (path === '/api/recipes/generate' && method === 'POST') {
      const body = await readBody(req)
      await slow()
      const count = Math.min(8, Math.max(1, body.count || 5))
      const created = Array.from({ length: count }, () => generateFakeRecipe(body.hint))
      recipes = [...created, ...recipes]
      return json(res, 200, { recipes: created })
    }

    if (path === '/api/recipes/clear-suggestions' && method === 'POST') {
      let dismissed = 0
      recipes = recipes.map((r) => {
        if (r.status === 'suggested' && !r.feedback && !r.inWeek) {
          dismissed++
          return { ...r, status: 'dismissed', updatedAt: now() }
        }
        return r
      })
      return json(res, 200, { dismissed })
    }

    if (recipeIdMatch && method === 'PATCH') {
      const idx = recipes.findIndex((r) => r.id === recipeIdMatch[1])
      if (idx === -1) return json(res, 404, { error: 'Recipe not found' })
      const body = await readBody(req)
      const current = recipes[idx]
      let next = { ...current, ...body, updatedAt: now() }
      // status semantics per SPEC
      if (body.feedback === 'down') {
        next.status = 'dismissed'
        recordFeedbackEvent()
      } else if (body.feedback === 'up') {
        next.status = 'saved'
        recordFeedbackEvent()
      }
      recipes[idx] = next
      return json(res, 200, { recipe: next })
    }

    const aiEditMatch = path.match(/^\/api\/recipes\/([^/]+)\/ai-edit$/)
    if (aiEditMatch && method === 'POST') {
      const idx = recipes.findIndex((r) => r.id === aiEditMatch[1])
      if (idx === -1) return json(res, 404, { error: 'Recipe not found' })
      const body = await readBody(req)
      await slow()
      const base = recipes[idx]
      const summary = `Applied: ${body.instruction}`
      if (body.asVariation) {
        const variation = mkRecipe({
          ...base,
          id: randomUUID(),
          title: `${base.title} (variation)`,
          parentId: base.id,
          source: 'chat',
          status: 'saved',
          cookedCount: 0,
          lastCookedAt: null,
          createdAt: now(),
          updatedAt: now(),
        })
        recipes = [variation, ...recipes]
        return json(res, 200, { recipe: variation, summary })
      }
      const updated = { ...base, updatedAt: now() }
      recipes[idx] = updated
      return json(res, 200, { recipe: updated, summary })
    }

    const cookedMatch = path.match(/^\/api\/recipes\/([^/]+)\/cooked$/)
    if (cookedMatch && method === 'POST') {
      const idx = recipes.findIndex((r) => r.id === cookedMatch[1])
      if (idx === -1) return json(res, 404, { error: 'Recipe not found' })
      const body = await readBody(req)
      const cookedAt = body.cookedAt || now().slice(0, 10)
      const current = recipes[idx]
      const updated = {
        ...current,
        status: 'saved',
        inWeek: false,
        cookedCount: (current.cookedCount || 0) + 1,
        lastCookedAt: cookedAt,
        updatedAt: now(),
      }
      recipes[idx] = updated
      const entry = {
        id: randomUUID(),
        recipeId: updated.id,
        title: updated.title,
        emoji: updated.emoji,
        cookedAt,
        rating: body.rating || null,
        note: body.note || null,
        createdAt: now(),
      }
      history = [entry, ...history]
      recordFeedbackEvent()
      return json(res, 200, { recipe: updated, entry })
    }

    // /api/week
    if (path === '/api/week' && method === 'GET') {
      const weekRecipes = recipes.filter((r) => r.inWeek)
      return json(res, 200, { recipes: weekRecipes, shoppingList: buildShoppingList() })
    }

    // /api/history
    if (path === '/api/history' && method === 'GET') {
      return json(res, 200, { entries: [...history].sort((a, b) => (a.cookedAt < b.cookedAt ? 1 : -1)) })
    }
    if (path === '/api/history' && method === 'POST') {
      const body = await readBody(req)
      const entry = {
        id: randomUUID(),
        recipeId: body.recipeId || null,
        title: body.title,
        emoji: '🍽️',
        cookedAt: body.cookedAt || now().slice(0, 10),
        rating: body.rating || null,
        note: body.note || null,
        createdAt: now(),
      }
      history = [entry, ...history]
      recordFeedbackEvent()
      return json(res, 200, { entry })
    }
    const historyIdMatch = path.match(/^\/api\/history\/([^/]+)$/)
    if (historyIdMatch && method === 'PATCH') {
      const idx = history.findIndex((h) => h.id === historyIdMatch[1])
      if (idx === -1) return json(res, 404, { error: 'Entry not found' })
      const body = await readBody(req)
      history[idx] = { ...history[idx], ...body }
      return json(res, 200, { entry: history[idx] })
    }
    if (historyIdMatch && method === 'DELETE') {
      history = history.filter((h) => h.id !== historyIdMatch[1])
      return json(res, 200, { ok: true })
    }

    // /api/preferences
    if (path === '/api/preferences' && method === 'GET') {
      return json(res, 200, { preferences })
    }
    if (path === '/api/preferences' && method === 'PUT') {
      const body = await readBody(req)
      const changedFields = Object.keys(body)
      preferences = { ...preferences, ...body, updatedAt: now(), updatedBy: 'user' }
      preferencesHistory = [
        {
          id: randomUUID(),
          fields: { ...preferences },
          changedFields,
          summary: `Updated ${changedFields.join(', ')}`,
          updatedBy: 'user',
          createdAt: now(),
        },
        ...preferencesHistory,
      ]
      return json(res, 200, { preferences })
    }
    if (path === '/api/preferences/history' && method === 'GET') {
      return json(res, 200, { changes: preferencesHistory.slice(0, 20) })
    }

    // /api/chat
    if (path === '/api/chat' && method === 'GET') {
      return json(res, 200, { messages: chat.slice(-60) })
    }
    if (path === '/api/chat' && method === 'POST') {
      const body = await readBody(req)
      const userMsg = { id: randomUUID(), role: 'user', text: body.message, actions: [], createdAt: now() }
      chat.push(userMsg)
      await slow()
      const { replyText, actions, changed } = await fakeChat(body.message || '')
      const assistantMsg = { id: randomUUID(), role: 'assistant', text: replyText, actions, createdAt: now() }
      chat.push(assistantMsg)
      return json(res, 200, { messages: [userMsg, assistantMsg], changed })
    }
    if (path === '/api/chat' && method === 'DELETE') {
      chat = []
      return json(res, 200, { ok: true })
    }

    return json(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Internal mock server error' })
  }
})

server.listen(PORT, () => {
  console.log(`Mock Two Pans API listening on http://localhost:${PORT}`)
  console.log(`Access code: ${TOKEN}`)
})
