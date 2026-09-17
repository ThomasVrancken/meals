# Two Pans

A private meal-recommendation PWA for Thomas and Lote, sharing one set of data (no per-user
accounts). See `SPEC.md` for the full data model, API contract and AI behaviour, and
`README.md` for local dev setup. This file is quick orientation + gotchas for future Claude
Code sessions.

## Architecture

- `server/`: Express API (CommonJS), Firestore via `@google-cloud/firestore` (ADC — no key
  file, no ORM), OpenAI Responses API for generation/edit/chat.
  - `server/index.js` — app setup, static client, SPA fallback, error handler.
  - `server/auth.js` — single shared Bearer `APP_TOKEN` on every `/api/*` except `/api/health`.
  - `server/db.js` — all Firestore reads/writes, prefix-aware (`col(name)` prepends
    `COLLECTION_PREFIX`), preference seeding/history, feedback counters.
  - `server/recipeModel.js` — recipe JSON schema (for structured LLM output), validation,
    normalisation (drops seasoning fluff like salt/oil/water), `buildRecipeDoc`.
  - `server/aisles.js` — the shopping-list "aisle" taxonomy (key, label, walking `order`,
    `description` for LLM prompts): 15 keys matching Thomas & Lote's actual walking order through
    AH Haarlemmerplein. Single source of truth, imported by `recipeModel.js` (ingredient schema),
    `llm/style.js` (prompt guide), `services/shoppingList.js` (grouping/sort), `services/
    classifyAisle.js` (manual item classification) and `scripts/migrate-aisles.js`. Also holds
    `OLD_TO_NEW_AISLE` (pre-2026-09 9-key taxonomy → new key) and `normalizeAisle` (lenient,
    never-fails version used at read time as a safety net for unmigrated data).
  - `server/llm/openai.js` — thin Responses API wrapper: one retry on 5xx/timeout, structured
    JSON helper, `LLMError` (502) with safe messages, key redaction.
  - `server/llm/context.js` — builds the shared "who we are / what we ate" context block
    every AI call gets (preferences, last 60 days history, liked/disliked recipes, current
    suggestions/week).
  - `server/llm/style.js` — `HOUSE_STYLE`: the actual recipe-writing rules (≤2 pans, pre-cut
    veg, no seasoning fluff, mainstream-AH-only ingredients, the aisle guide, ingredient `where`
    hints, recipe `tips`). This is the file to edit when recipes feel off-brand — it's shared by
    generation, edits and the chat agent.
  - `server/services/*.js` — `generate.js` (batch suggestions), `recipeEdit.js` (AI-edit one
    recipe), `recipeChat.js` (per-recipe chat: answers questions and decides itself whether to call
    its one `edit_recipe` tool, which delegates to `recipeEdit.js`), `classifyAisle.js`
    (tiny fast-model call to classify one manual grocery item's aisle, always falls back to `misc`),
    `chatAgent.js` (tool-using agent loop, max 8 rounds, incl. `add_shopping_items`), `reflect.js`
    (background "learned" notes rewrite, fires after 3 feedback events), `shoppingList.js`
    (deterministic, no LLM, groups by `aisles.js` order), `recipes.js` (shared status/feedback/cooked
    semantics used by routes + chat tools).
  - `server/routes/*.js` — thin, delegate to `services/`. `shoppingItems.js` is the manual
    "Other groceries" CRUD (classifies aisle on create).
- `client/`: React 18 + Vite + Tailwind 3 PWA, own `package.json`, builds to `client/dist`
  (served by the Express server, not a separate static host).
  - `client/src/context/DataContext.jsx` — shared data layer (recipes/week/history/prefs) so
    a mutation from any tab (including chat) refreshes every other tab via `applyChanged`.
  - `client/src/services/api.js` — axios wrapper, 120s timeout on generate/ai-edit/chat calls.
  - `client/public/sw.js` — service worker: navigations + index.html network-first (never
    cache-first — see gotcha below), hashed assets cache-first, API GETs network-first with
    cache fallback, mutating calls never cached.
  - `client/dev/mock-server.mjs` — throwaway in-memory mock backend for frontend-only dev,
    not used in production.

One App Engine Standard service, name **`meals`**, in GCP project `mlsd-2026-483513`
(region `europe-west`). Firestore is the project's shared `(default)` database (`eur3`),
also used by the `newsfeed` app (`default` service) — **never touch `default` or its
collections**. Every collection this app touches is prefixed with `COLLECTION_PREFIX`
(`meals_` in prod, `mealsdev_` locally) so the two apps can't collide.

## Commands

```bash
npm install                       # root deps only; client deps installed separately
npm run build                     # cd client && npm install --include=dev && npm run build
npm run dev:server                # API + built client on :3002, restarts on change
npm run dev:client                # Vite dev server (separate terminal, proxies /api to :3002)
REFLECTION_ENABLED=false npm run dev:server   # disable background LLM reflection calls
npm run test:api                  # non-LLM API smoke test, needs a running dev server + dev prefix
npm run deploy                    # gcloud app deploy app.yaml --project mlsd-2026-483513 --quiet
```

Local `.env` (gitignored) needs `OPENAI_API_KEY`, `APP_TOKEN`, `GOOGLE_CLOUD_PROJECT`,
`COLLECTION_PREFIX=mealsdev_`, `OPENAI_MODEL`, `OPENAI_MODEL_FAST`, `PORT=3002`. Requires
`gcloud auth application-default login` once (Firestore ADC).

## Deploy

Prod URL: **https://meals-dot-mlsd-2026-483513.ew.r.appspot.com**

```bash
cp app.yaml.example app.yaml      # gitignored; fill in APP_TOKEN + OPENAI_API_KEY from .env
npm run deploy
```

`app.yaml`: `runtime: nodejs22`, `service: meals`, `instance_class: F1`,
`automatic_scaling: min_instances: 0, max_instances: 1` (cost control — this is a 2-person
app, no need for more). App Engine's Node buildpack only runs the root `npm install`/`build`
— the root `build` script `cd`s into `client/` and runs `npm install --include=dev` itself
(Cloud Build sets `NODE_ENV=production`, which skips devDependencies otherwise, and
Tailwind/Vite/PostCSS are all devDependencies).

After deploying, sanity-check `gcloud app services list` still shows `default` untouched and
`meals` with the new version, and skim `gcloud app logs read --service=meals --project
mlsd-2026-483513` for errors.

## Collection-prefix convention

**Never** call `db().collection(name)` directly — always go through `server/db.js`'s `col()`
(or the exported accessor functions), which prepends `COLLECTION_PREFIX` and throws if the
env var is unset. `server/index.js` refuses to start without `COLLECTION_PREFIX` for the same
reason: a bug here would silently write into the shared `(default)` Firestore database's
unprefixed root, which is where the newsfeed's own collections could plausibly collide
depending on its naming (they don't today, but there's no schema-level guard — the prefix
*is* the guard).

## Aisle taxonomy migration (2026-09)

The shopping-list `aisle` enum was replaced with a 15-key taxonomy matching the actual walking
order through AH Haarlemmerplein (`server/aisles.js`; see `SPEC.md` for the full table), up from a
generic 9-key one. Existing data written before this used the old keys; `scripts/migrate-aisles.js`
reclassifies a prefix's recipes in place (one fast-model call per recipe, static
`OLD_TO_NEW_AISLE` fallback per-ingredient on any failure), always backing up the full `recipes`
collection to `backups/<prefix>recipes-<timestamp>.json` (gitignored) first. Run
`--dry-run` before a real run, and prod (`--prefix=meals_`) additionally needs `--yes-prod` to
write. The server tolerates old keys at read time regardless (`normalizeAisle`), so a stale
document never crashes or vanishes from the list — the migration is about correctness/consistency,
not a hard requirement for the app to function.

## Gotchas hit while integrating (this session)

- **Live browser UI testing of the authenticated PWA was not done this session.** The sandbox's
  safety layer treats the shared `APP_TOKEN` as a credential and blocks agent-driven browser flows
  that would authenticate with it, so a future session automating the real logged-in UI should
  expect the same and plan around it (e.g. ask the user to drive that part, or verify through the
  API/component code instead). UI changes were verified via `npm run build`, the API test suite,
  real (non-browser) LLM calls against the dev server, and a static visual mockup rendered from the
  actual Tailwind tokens — not a substitute for a real Playwright pass against the logged-in app.

- **Zero client/server contract mismatches found.** The backend (Express/Firestore/OpenAI)
  and frontend (React/Vite PWA) were built by separate agents against `SPEC.md` and had never
  been run together before this integration pass. A full manual walkthrough against the real
  backend (ideas → detail → +Week → shopping list → cooked with rating/note → thumbs down with
  reason → manual edit → AI edit → History CRUD → Prefs edit+save → both required chat
  messages → action chips → cross-tab refresh) turned up no field-name or response-shape bugs
  and all 57 non-LLM `scripts/api-test.js` checks passed unchanged. If this ever needs
  revisiting, start by diffing `client/src/services/api.js` call shapes against
  `server/routes/*.js` bodies/responses — that's the seam most likely to drift next time
  either side changes independently.
- **Shopping ingredient brand drift**: the generation/edit/chat prompts (`server/llm/style.js`
  rule 7) originally just said "only things reliably stocked at a regular AH" without concrete
  brand examples, and would occasionally reach for deli/specialty items (nduja, imported curry
  roux blocks) a city-centre AH doesn't carry. Strengthened the rule with an explicit
  mainstream-brand allowlist (AH own-brand, Go-Tan, Conimex, Patak's, Bertolli, Grand'Italia,
  Knorr, Unox, Honig, Calvé, Maggi) and an explicit instruction to substitute the closest
  AH-available equivalent for anything from a Korean/Japanese/Middle-Eastern grocer, unless the
  user's own hint/instruction specifically asks for it. Confirmed in a fresh prod batch that
  the model now reaches for exactly these brands (e.g. "arrabbiata pasta sauce (AH /
  Grand'Italia)", "taco seasoning mix (AH / Knorr)").
- **Same App Engine gotchas as the newsfeed app apply here** (read
  `../newsfeed/CLAUDE.md` "Deployment gotchas" if touching build/deploy config): `europe-west`
  region (pairs with Firestore `eur3`, not `us-central1`), `nodejs22` not `nodejs20`, App
  Engine Standard has no `resources:` block (use `instance_class` instead), and `index.html`
  (plus `sw.js` and `manifest.webmanifest`) must be served with `Cache-Control: no-store` —
  already wired up in `server/index.js`'s static middleware and SPA fallback — or a returning
  client can get stuck on a stale `index.html` referencing a previous deploy's hashed asset
  filenames. Verified this is still correct post-deploy: `curl -I` on `/`, `/sw.js` and
  `/manifest.webmanifest` against prod all return `cache-control: no-store`.
- **Shell gotcha, not an app bug**: `VAR=x some-command "...${VAR}..."` (prefix-assignment
  form) does **not** make `$VAR` available for expansion in that same command's other
  arguments in bash — `VAR` is only set in the executed command's environment, not the
  shell's expansion context. Cost some time chasing a phantom "auto-login broken in
  production" when it was actually a Playwright script invoked as `TOKEN=$(...) node -e
  "...${TOKEN}..."` silently getting an empty token. Use a separate `TOKEN=$(...)` statement
  (own line or `;`-separated) before referencing `$TOKEN`.
- App Engine Standard automatic-scaling instances happily run 60–65s LLM-backed requests
  (`POST /api/recipes/generate` observed at ~20s and ~65s in testing) without hitting a
  platform timeout — no special handling needed beyond the client's existing 120s axios
  timeout on AI endpoints.

## Production data

Prod Firestore uses `COLLECTION_PREFIX=meals_`. After the initial deploy, production data was
wiped and preferences reset to the `SPEC.md` seed values (Firestore has no "restore defaults"
button — this was a one-off script requiring `server/db.js`'s `ensurePreferencesSeeded()` with
`GOOGLE_CLOUD_PROJECT`/`COLLECTION_PREFIX` set to prod values), then one fresh batch of 5
suggestions was generated via the live API so the app doesn't open empty. There's no
standing script for this in `scripts/` (it was a throwaway one-off, deleted after use) —
recreate it from `server/db.js`'s exports if a future full reset is ever needed, and
triple-check `COLLECTION_PREFIX` is `meals_` (not `mealsdev_`) before running anything
destructive against it.
