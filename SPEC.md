# Two Pans: meal recommendation PWA (spec)

A personal recipe-recommendation app for Thomas and his girlfriend Lote (Amsterdam). They both use it
from their phones as an installed PWA, **sharing the exact same data** (no per-user accounts).
Core loop: get recipe ideas → pick a few for the week → shopping list → cook → tell the app what we
actually ate and whether we liked it → the app learns. A strong AI chat can change anything.

Reference implementation for infra patterns: `~/Documents/projects/newsfeed/thoughtstream`
(Express + React/Vite/Tailwind PWA on App Engine + Firestore). Read its `../CLAUDE.md`
"Deployment gotchas" section before touching build/deploy. Do not modify the newsfeed project.

## Stack & layout

- Node 22, Express API (CommonJS) + React 18 / Vite / Tailwind 3 PWA client. One App Engine
  Standard service named **`meals`** in GCP project `mlsd-2026-483513` (region europe-west,
  App Engine app already exists; `default` service is the newsfeed, never touch it).
  URL: `https://meals-dot-mlsd-2026-483513.ew.r.appspot.com`
- Firestore: the project's existing `(default)` database (eur3), shared with newsfeed, so **every
  collection name is prefixed** with `process.env.COLLECTION_PREFIX` (`meals_` in prod,
  `mealsdev_` locally). Local dev talks to real Firestore via ADC with the dev prefix.
  **No queries that need composite indexes**: data volume is tiny, so fetch and filter/sort in memory
  where needed (single-field `orderBy` is fine).
- LLM: OpenAI via the official `openai` npm package, **Responses API**. Models from env:
  `OPENAI_MODEL` (default `gpt-5.6-sol`, for recipe generation, recipe edits, and the chat agent) and
  `OPENAI_MODEL_FAST` (default `gpt-5.4-mini`, for cheap background work like reflection).
  Use `reasoning: { effort: 'low' }` unless quality demands more. Use structured outputs
  (`text.format` json_schema, strict) for recipe JSON.
- Secrets: `.env` locally (exists, gitignored: OPENAI_API_KEY, APP_TOKEN, GOOGLE_CLOUD_PROJECT,
  COLLECTION_PREFIX, OPENAI_MODEL, OPENAI_MODEL_FAST, PORT=3002). In prod: `app.yaml` (gitignored,
  generated from committed `app.yaml.example`). Never commit the key. Never print it in logs.

```
meals/
  SPEC.md  README.md  CLAUDE.md  package.json  app.yaml.example  .gcloudignore  .gitignore
  server/
    index.js            express app, static client, SPA fallback (index.html Cache-Control: no-store)
    auth.js             Bearer APP_TOKEN on all /api/* except /api/health
    db.js               Firestore accessors (prefix-aware), seeding of default preferences
    llm/openai.js       thin client wrapper (retry once on 5xx/timeout, JSON parse helpers)
    llm/context.js      builds the shared "who we are / what we ate" context block for prompts
    services/generate.js      generate N recipe suggestions
    services/recipeEdit.js    AI-edit one recipe from an instruction
    services/chatAgent.js     tool-using chat agent
    services/reflect.js       periodic "learned" preference update from feedback
    services/shoppingList.js  deterministic merge of week ingredients
    routes/*.js
  client/               Vite app (own package.json), builds to client/dist
```

Root `package.json` scripts: `start` (node server/index.js), `dev:server`, `dev:client`,
`build` = `cd client && npm install --include=dev && npm run build` (App Engine buildpack only runs
root build; devDeps are skipped otherwise), `deploy` = `gcloud app deploy app.yaml --project mlsd-2026-483513 --quiet`.
`client/postcss.config.js` MUST exist (else Tailwind silently doesn't apply).

## Data model (Firestore, all prefixed)

`{prefix}config/preferences`:
```
{ cookingStyle: string, likes: string, dislikes: string, shopping: string, learned: string,
  updatedAt, updatedBy: 'seed'|'user'|'chat'|'reflection' }
```
Free-text markdown-ish fields (bullets). Every change also appends a snapshot doc to
`{prefix}preferencesHistory` `{ fields (full copy), changedFields: [..], summary, updatedBy, createdAt }`.

Seed values (written once if the doc does not exist; also used as fallback):

- **cookingStyle**
  - Convenience and speed over food quality, always. Target ≤ 30 min, minimal effort.
  - Max TWO pans: typically one pot to boil carbs (rice, pasta, noodles) + one wok for the protein/sauce. Never oven + pans, never a third pan, no blender/food processor.
  - Hates cutting vegetables: prefer pre-cut vegetable bags (AH roerbakgroente / wokgroente / Italiaanse groentemix etc.). At most 1–2 very easy vegetables to cut (e.g. a zucchini, a bell pepper).
  - Bowl / deep-plate meals: a carb + a sauce/stir-fry on top.
  - Store-bought shortcuts are welcome: curry pastes, jarred sauces, stock cubes, pre-grated cheese, cooking cream.
  - Recipes skip basic seasoning fluff: never list salt, pepper, cooking oil, water; no "season to taste". DO mention a specific sauce, paste, spice mix or herb when it matters.
- **likes**
  - Curries: rice in one pan; in the wok first chicken, then a bag of pre-cut vegetables, then a store-bought curry paste/sauce (+ coconut milk). Many variations (Thai red/green/yellow, Indian, Japanese, etc.) by swapping sauce, veg mix and meat. A favourite format.
  - "Red sauce": bolognese-like but spicier. Ground beef in the wok, then a bag of Italian pre-cut vegetables, tomato paste added once cooked, herbs, chilies. With rice or pasta.
  - Tortellini with a cream sauce.
  - Spicy food.
  - Easy iterations and variations on these formats.
- **dislikes**
  - Complex recipes, many steps, fancy techniques.
  - Using more than two pans or lots of utensils.
  - Lots of chopping / prepping vegetables.
- **shopping**
  - All groceries at Albert Heijn "AH Haarlemmerplein", Haarlemmerplein 34, 1013 HS Amsterdam (a regular city-centre AH, not an XL).
  - Only use ingredients reliably stocked at a regular Albert Heijn in the Netherlands. Prefer AH own-brand / common Dutch supermarket products, and give the Dutch product name in parentheses when it helps find it (e.g. "Thai red curry paste (AH / Go-Tan)", "kipdijfilet").
  - Cooking for 2 people (Thomas and Lote). Standard supermarket pack sizes (e.g. "1 bag (400 g)").
  - For less common products (specific pastes, sauces, spices, Asian/Mexican items), say where to find them in the AH store (e.g. world food aisle, chilled section).
- **learned**: `""` (maintained by the app from feedback; see Learning)

`{prefix}recipes/{id}`:
```
{ id, title, emoji, description (1 sentence, what it is / why it fits),
  cuisine, tags: [string], timeMinutes: number, servings: number (2), pans: number (1|2),
  ingredients: [{ name, amount, aisle, note?, where? }],
  steps: [string],                 // 3–6 short, direct steps
  tips: [string],                  // 0–3 short, genuinely useful tips; [] if none. Never seasoning fluff.
  status: 'suggested'|'saved'|'dismissed',
  inWeek: boolean,                 // picked for this week's shopping
  feedback: 'up'|'down'|null, feedbackNote: string|null,
  source: 'ai'|'chat'|'manual', parentId: string|null,
  cookedCount: number, lastCookedAt: ISO|null,
  hint: string|null, createdAt, updatedAt }
```
`ingredients[].where`: optional store-section hint (nullable), only filled for non-obvious/fancier
items, e.g. `"World food aisle, Asian section"`, `"Chilled section near the fresh pasta"`. Null for
obvious items (pasta, rice, minced beef, milk, eggs, plain vegetables).

`aisle` enum (`server/aisles.js` is the single source of truth — key, label, walking-order `order`,
and a `description` fed to every LLM prompt): Thomas & Lote's actual walking order through AH
Haarlemmerplein.

| order | key | label | typical contents |
|---|---|---|---|
| 1 | `spices` | Spices | powdered/dried spices & herbs, spice mixes in jars (not taco kits) |
| 2 | `fruit` | Fruit | fresh fruit, lemons/limes |
| 3 | `vegetables` | Vegetables | fresh veg incl. pre-cut veg bags, fresh herbs, garlic, ginger |
| 4 | `fresh-meals` | Fresh pasta & ready-made | chilled ready meals, fresh tortellini/gnocchi/pasta, fresh chilled sauces, fresh pesto |
| 5 | `meat` | Meat & fish | fresh meat, chicken, minced beef, fish, prawns |
| 6 | `cheese-deli` | Cheese & deli | cheese (incl. grated), charcuterie, bacon lardons, chorizo |
| 7 | `bread` | Bread | bread, bakery-shelf wraps, naan |
| 8 | `carbs` | Rice & pasta | dry rice, pasta, noodles, couscous |
| 9 | `world-food` | World food | tortillas, Worcestershire, tomato purée/passata, taco seasoning, curry pastes, coconut milk, soy/sweet chili/sambal, Asian/Mexican/international products |
| 10 | `cereals` | Cereals | breakfast cereals, oats |
| 11 | `snacks` | Chips & crackers | chips, crackers, nuts for snacking |
| 12 | `tea` | Tea & coffee | tea (and coffee) |
| 13 | `dairy` | Dairy | milk, cooking cream, yoghurt, butter, eggs, coconut-free chilled dairy |
| 14 | `drinks` | Drinks | beer, soft drinks, juice, water |
| 15 | `misc` | Other | everything else (frozen, canned goods not covered above, household, etc.) |

A pre-2026-09 dataset used a 9-key taxonomy (`produce`, `meat-fish`, `dairy-eggs`,
`pasta-rice-noodles`, `sauces-spices`, `canned-jars`, `frozen`, `bakery`, `other`);
`server/aisles.js`'s `OLD_TO_NEW_AISLE` maps each to its closest new key, used both by
`scripts/migrate-aisles.js` (one-off backfill) and as a read-time safety net (`normalizeAisle`) so
any unmigrated data still groups sensibly instead of crashing or vanishing.

Status semantics: `suggested` = shown in Ideas; `saved` = in the cookbook (favourites / cooked
before); `dismissed` = hidden (kept as a negative signal). Thumbs-down on a suggestion sets
`feedback:'down'` AND `status:'dismissed'`. Thumbs-up sets `feedback:'up'` and `status:'saved'`.
Cooking a recipe sets `status:'saved'`, `inWeek:false`, increments `cookedCount`.

`{prefix}history/{id}`: `{ id, recipeId|null, title, emoji, cookedAt (YYYY-MM-DD), rating: 'up'|'meh'|'down'|null, note|null, createdAt }`

`{prefix}chat/{id}`: `{ id, role: 'user'|'assistant', text, actions: [{ type, label, recipeId? }], createdAt }`
(`actions` = human-readable list of what the agent changed, rendered as small chips under the reply.)

`{prefix}shoppingItems/{id}`: `{ id, name, amount: string|null, aisle, checked: boolean, createdAt, updatedAt }`
Manual "Other groceries" list, shared by both phones, independent of recipes (works as a general
grocery list even with no recipes picked for the week). `aisle` is classified automatically on
create with a tiny fast-model call (`server/services/classifyAisle.js`, falls back to `misc` on any
error) since there's no recipe context to infer it from; PATCH lets the user change it.

`{prefix}meta/counters`: `{ feedbackSinceReflection: number }`

## HTTP API (JSON, all `/api/*` need `Authorization: Bearer <APP_TOKEN>` except `/api/health`)

| Method & path | Body | Returns |
|---|---|---|
| GET `/api/health` | | `{status:'ok'}` |
| GET `/api/me` | | `{ok:true}` (token check) |
| GET `/api/recipes?status=suggested\|saved\|all` | | `{recipes}` newest first; `all` excludes dismissed |
| GET `/api/recipes/:id` | | `{recipe}` |
| POST `/api/recipes/generate` | `{count?=5 (1–8), hint?}` | `{recipes}` (newly created, status suggested) |
| PATCH `/api/recipes/:id` | any of title, emoji, description, ingredients, steps, timeMinutes, tags, inWeek, status, feedback, feedbackNote | `{recipe}` (feedback changes follow status semantics above + count as feedback event) |
| POST `/api/recipes/:id/ai-edit` | `{instruction, asVariation?:false}` | `{recipe, summary}` (in place, or new saved recipe with parentId) |
| POST `/api/recipes/:id/chat` | `{message, history?: [{role:'user'\|'assistant', text}]}` | `{answer, edit: null \| {recipeId, title, summary, created}}` — answers about the recipe and may edit it itself; client resends prior turns as `history` for follow-ups |
| POST `/api/recipes/:id/cooked` | `{rating?, note?, cookedAt?}` | `{recipe, entry}` |
| POST `/api/recipes/clear-suggestions` | | `{dismissed: n}`: dismiss suggestions with no feedback and not inWeek (no feedback event) |
| GET `/api/week` | | `{recipes, shoppingList: [{aisle, items:[{name, amounts:[string], recipes:[title]}]}]}` |
| GET `/api/history` | | `{entries}` newest cookedAt first |
| POST `/api/history` | `{title, recipeId?, rating?, note?, cookedAt?}` | `{entry}` |
| PATCH/DELETE `/api/history/:id` | | `{entry}` / `{ok}` |
| GET `/api/preferences` | | `{preferences}` |
| PUT `/api/preferences` | subset of the 5 fields | `{preferences}` (updatedBy user, snapshot) |
| GET `/api/preferences/history` | | `{changes}` last 20 |
| GET `/api/chat` | | `{messages}` last 60, oldest first |
| POST `/api/chat` | `{message}` | `{messages:[userMsg, assistantMsg], changed:{recipes,week,history,preferences,shopping}: booleans}` |
| DELETE `/api/chat` | | `{ok}` clears conversation (not data) |
| GET `/api/shopping-items` | | `{items}` oldest first |
| POST `/api/shopping-items` | `{name, amount?}` | `{item}` (201; aisle auto-classified) |
| PATCH `/api/shopping-items/:id` | any of `name, amount, checked, aisle` | `{item}` |
| DELETE `/api/shopping-items/:id` | | `{ok}` |
| POST `/api/shopping-items/clear-checked` | | `{deleted: n}` |

Errors: `{error: string}` with sensible status. LLM calls can take 10–60 s; that's fine.

Shopping list (deterministic, no LLM): merge ingredients of all `inWeek` recipes by normalized name
(lowercase, trimmed, strip parentheses content for the key), keep all amounts as separate strings,
group by aisle in a sensible walking order (produce, meat-fish, dairy-eggs, pasta-rice-noodles,
sauces-spices, canned-jars, frozen, bakery, other).

## AI behaviour

### Shared context block (`llm/context.js`)
Every AI call gets: today's date (Europe/Amsterdam) and weekday; the 5 preference fields; cooking
history of the last 60 days (date, title, rating, note); liked recipes (titles + one-line
description, up to 30), disliked/dismissed-with-feedback recipes (title + feedbackNote, up to 30);
current suggestions and week recipes (id, title).

### Generation (`services/generate.js`)
Produces `count` recipes (structured output, array). Rules for the prompt:
- Obey cookingStyle/dislikes/shopping strictly: ≤2 pans, pre-cut veg preferred, ≤2 easy things to chop,
  ≤ ~30 min, ingredients findable at a regular AH, 2 servings, pack-size amounts.
- No salt/pepper/oil/water in ingredients or steps. Steps: 3–6 short imperative lines, no fluff,
  include heat/timing only when useful (e.g. "Simmer 5 min").
- Variety across the batch: mix of proven favourite formats (curry, red sauce, cream pasta)
  in genuinely different variations AND a few new ideas in the same spirit (bowl meals: stir-fries,
  noodle dishes, gnocchi, burrito bowls, shakshuka-style, etc.). Different proteins/cuisines.
- Avoid repeating anything cooked in the last ~10 days or near-duplicates of current suggestions.
  Lean toward what was liked, away from what was disliked; apply `learned` notes.
- If `hint` given (e.g. "something with salmon", "vegetarian", "for 3 days of leftovers"), honour it.
- Clear, appetising, short titles (e.g. "Thai green chicken curry"), one emoji.
Validate output (required fields, aisle enum, ≤2 pans), drop invalid items rather than fail the batch.

### Recipe edit (`services/recipeEdit.js`)
Instruction examples: "I used coconut cream and added peanuts, make that the recipe",
"swap chicken for tofu", "make it spicier". Returns full updated recipe (structured output) +
1-sentence summary. Same style rules. Preserve id/status/feedback metadata server-side.

### Chat agent (`services/chatAgent.js`)
A tool-using agent loop (Responses API function calling, max ~8 tool rounds). It should act
**autonomously**: when the user states a preference, a meal they ate, or a request, it just performs the
change and then briefly tells what it did (no "shall I?"). Conversational replies short and friendly.
Input: shared context + last ~20 chat messages + new message.
Tools (all operate on the same services the routes use):
- `list_recipes({status})`, `get_recipe({recipeId})`, `get_history({days})`
- `update_preferences({ changes: [{field, newText}], summary })`: full replacement text per field;
  instruct the model to make minimal targeted edits preserving the rest (like the newsfeed prompt agent).
  Server-side guard: refuse if a field shrinks below 40% of original length unless the new text is non-empty and the user explicitly asked to remove stuff (just use the ratio guard + let the model retry with a clearer edit).
- `generate_suggestions({count, hint})`
- `edit_recipe({recipeId, instruction, asVariation})`
- `create_recipe({recipe fields..., status})`: e.g. "what we actually ate" when no matching recipe
- `log_cooked({recipeId?, title?, rating?, note?, cookedAt?})`: if recipeId given use cooked flow, else history entry only (the agent may create_recipe first when the meal deserves to be in the cookbook)
- `set_feedback({recipeId, feedback, note})`, `set_in_week({recipeId, inWeek})`, `dismiss_recipe({recipeId})`
- `add_shopping_items({items: [{name, amount?}]})`: adds manual, non-recipe items to the shared
  shopping list (e.g. "add milk and eggs to the list"); each item's aisle is auto-classified the same
  way as the `POST /api/shopping-items` route.
Each successful mutating tool call adds an `actions` chip (e.g. `{type:'preferences', label:'Updated dislikes: less zucchini'}`)
and flips the matching `changed` flag in the response.

### Recipe chat (`services/recipeChat.js`)
`POST /api/recipes/:id/chat` is one chat box per recipe that both answers questions and changes the
recipe when that's what the user wants. The model (`OPENAI_MODEL`, `reasoning: { effort: 'medium' }`)
gets the recipe JSON + shared context + prior turns from `history`, and has a single `edit_recipe`
tool (`{instruction, asVariation}`) that delegates to `recipeEdit.js`. It decides on its own: edits
for explicit changes or "this is what I actually did", answers (and offers to update) for pure
questions. At most one edit per message; `edit` in the response describes it (or is null). If the
follow-up reply fails after an edit landed, the edit is still returned. The client keeps the thread
in component state for the open recipe sheet only and resends it as `history`.

### Learning (`services/reflect.js`)
Feedback events = thumbs up/down (with or without note), cooked with rating, chat-logged meals.
Increment `meta/counters.feedbackSinceReflection`; when ≥ 3, run reflection in the background
(don't block the response; catch & log errors), reset counter. Reflection (fast model) rewrites only
the `learned` field: concise bullets (max ~15) of patterns inferred from ratings/notes/dismissals,
e.g. "- Loved Thai green curry variations; repeat monthly", "- Dislikes mushrooms". Snapshot with
updatedBy 'reflection'.

## UX (mobile-first PWA)

App name **Two Pans**, emoji icon 🍳 (generate PNG icons 32/180/192/512). Warm, clean, legible, friendly look
(not the newsfeed's dark slate). Light theme with good contrast; respect safe-area insets. Fixed bottom tab bar:

1. **Ideas** (default). Segmented control: *Suggestions* | *Cookbook* (saved recipes).
   Top: "Get ideas" button + optional hint input ("e.g. something with salmon") + count (3/5/8).
   Generation shows a friendly loading state (it takes ~20–40 s). Recipe cards: emoji, title,
   1-line description, chips (⏱ 25 min, 🍳 2 pans, cuisine). Quick actions on the card:
   👎 (dismiss, optional reason prompt via small sheet with skip), 👍, "+ Week" toggle, "Cooked ✓".
   Small "Clear untouched" link. Cookbook shows saved recipes with cookedCount / last cooked.
2. **Week**: recipes picked for this week (remove / cooked buttons) + one combined, store-ordered
   shopping list (recipe ingredients merged with manual items, see below), grouped by aisle in AH
   Haarlemmerplein walking order. "Other groceries": a quick-add input (type + Enter/Add; `milk x2`
   parses to name "milk" + amount "x2") sits above the list; manual items are visually distinct
   (italic, no recipe caption, a small aisle picker, a × to delete) and their checked state is
   server-side ("Clear checked" removes checked manual items) vs. recipe-ingredient checks which
   stay in localStorage ("Reset checks"). Works as a general grocery list with no recipes picked;
   empty state only shows when there is truly nothing (no week recipes AND no manual items).
3. **Chat**: conversation with the agent. Quick-prompt chips when empty: "Give me 5 ideas for this week",
   "We cooked …", "Less of …". Shows action chips under assistant replies. Sending shows typing indicator.
   After a reply with `changed` flags, refresh the affected data. "New conversation" button.
4. **History**: what we ate, newest first (date, emoji, title, rating, note). "+ We ate something"
   quick form (title, date default today, rating, note). Tap entry → edit/delete. Tap linked recipe → detail.
5. **Prefs**: the 5 fields as editable textareas (labels: How we cook / We like / We don't like /
   Shopping / Learned from feedback), Save button, hint "or just tell the chat". Recent changes list.

**Recipe detail** (full-screen sheet from any list): emoji + title, description, chips, Ingredients
(amount + name + note, with a small muted "where to find it" line when set), numbered Steps, a Tips
section after Steps (only shown when non-empty). Actions: +Week toggle, 👍/👎, Cooked it (sheet:
rating up/meh/down, note, date), Edit (form: title, emoji, ingredients one per line as
`amount | name | aisle | where`, steps one per line, tips one per line), and an "Ask AI" chat box (thread in component state, this sheet only). Questions get answers; changes
("make it spicier", "I used coconut cream, keep it") are applied by the AI itself, shown as a small
"✓ Recipe updated" line under its reply. If it saved a new variation, the sheet switches to it.

Auth: access-code gate screen (stores token in localStorage). Visiting `/?code=<APP_TOKEN>` logs in
automatically and strips the param (so Thomas can send Lote one link). Client HTTP timeout ≥ 120 s.
Service worker: navigations network-first, hashed assets cache-first, never cache /api mutating calls
(API GETs network-first with cache fallback is fine). `index.html` served no-store.
