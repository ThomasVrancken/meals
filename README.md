# Two Pans 🍳

A private meal-recommendation PWA for two people sharing one set of data: get dinner ideas that
fit a lazy two-pan cooking style, pick a few for the week, get a merged shopping list, log what you
cooked, and let the app learn. An AI chat agent can change anything (preferences, recipes, week,
history). See [SPEC.md](SPEC.md) for the full data model, API contract and AI behaviour.

- `server/`: Express API (CommonJS). Firestore via ADC, OpenAI Responses API.
- `client/`: React + Vite + Tailwind PWA, built to `client/dist` and served by the server.

## Local development

Requires Node 22+, `gcloud auth application-default login`, and a `.env` in the repo root:

```
OPENAI_API_KEY=...
APP_TOKEN=...                 # access code for the app
GOOGLE_CLOUD_PROJECT=mlsd-2026-483513
COLLECTION_PREFIX=mealsdev_   # always a dev prefix locally; the Firestore DB is shared
OPENAI_MODEL=gpt-5.5
OPENAI_MODEL_FAST=gpt-5.4-mini
PORT=3002
```

```bash
npm install
npm run dev:server            # API on http://localhost:3002 (restarts on change)
npm run dev:client            # Vite dev server (in another terminal)
```

Optional env: `REFLECTION_ENABLED=false` disables the background learning pass (no LLM calls on
thumbs up/down).

API smoke test (non-LLM endpoints, cleans up its own data) against a running dev server:

```bash
REFLECTION_ENABLED=false npm run dev:server
npm run test:api              # or API_BASE=http://localhost:3012 npm run test:api
```

## Deploy (App Engine service `meals`)

```bash
cp app.yaml.example app.yaml  # fill in APP_TOKEN and OPENAI_API_KEY; app.yaml is gitignored
npm run deploy
```

App Engine installs root dependencies and runs the root `build` script, which builds the client.
URL: https://meals-dot-mlsd-2026-483513.ew.r.appspot.com
