const store = require('../db');
const { createJSON, models } = require('../llm/openai');
const { loadContextData, renderContext } = require('../llm/context');

// Learning loop. Feedback events (thumbs up/down, cooked with a rating,
// meals logged via chat or the history form with a rating) increment a
// counter; once it reaches THRESHOLD we reset it and rewrite the `learned`
// preference field in the background with the fast model.
//
// Set REFLECTION_ENABLED=false to skip counting and reflecting entirely
// (used when running scripts/api-test.js so it doesn't spend LLM credits).

const THRESHOLD = 3;
const MAX_LEARNED_CHARS = 2500;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    learned: { type: 'string', description: 'Markdown bullet list, one "- " bullet per line, max 15 bullets' },
    summary: { type: 'string', description: 'One short sentence on what changed in the learned notes' },
  },
  required: ['learned', 'summary'],
};

const INSTRUCTIONS = `
You maintain the "Learned from our feedback" notes of "Two Pans", a private dinner app for a couple
(Thomas and Lote) who cook lazy two-pan dinners. These notes are fed into every future recipe
suggestion, so they must be short, concrete and actionable.

Read their preferences, cooking history (ratings and notes), thumbs up/down with notes and dismissed
suggestions, then rewrite the learned notes:
- Concise bullets, max 15, each one line starting with "- ". Examples:
  "- Loved Thai green curry variations; suggest one roughly every couple of weeks"
  "- Not keen on mushrooms"
  "- Coconut cream + peanuts upgrade on red curry was a hit"
- Only infer patterns actually supported by the data. Every thumbs down or low rating WITH a note is a
  strong signal and should be reflected (e.g. "- Heavy, greasy sausage dishes didn't land"), as should
  loved meals and changes they made. One silent dismissal is not enough; several are.
- Prefer specific ingredients, formats, cuisines, spice level and effort signals over vague praise.
- Keep existing learned bullets that are still supported; update or drop ones contradicted by newer
  feedback. Do not restate what is already written in the other preference fields.
- If there is not enough signal yet, return the existing notes unchanged (or empty if none).
`.trim();

let running = false;

function reflectionEnabled() {
  return process.env.REFLECTION_ENABLED !== 'false';
}

/** Run one reflection pass and store the new `learned` text. */
async function runReflection() {
  const data = await loadContextData();
  const input = `${renderContext(data)}\n\n# Task\nRewrite the learned notes now.`;
  const result = await createJSON({
    model: models.fast(),
    instructions: INSTRUCTIONS,
    input,
    schemaName: 'learned_notes',
    schema: SCHEMA,
    effort: 'low',
    maxOutputTokens: 4000,
    label: 'reflect',
  });
  let learned = String(result.learned || '').trim();
  // Enforce the format: bullets only, max 15.
  const bullets = learned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('- ') ? l : `- ${l.replace(/^[-*•]\s*/, '')}`))
    .slice(0, 15);
  learned = bullets.join('\n').slice(0, MAX_LEARNED_CHARS);
  const { changedFields } = await store.updatePreferences(
    { learned },
    { updatedBy: 'reflection', summary: String(result.summary || 'Updated learned notes').trim() }
  );
  console.log(`[reflect] done; learned ${changedFields.length ? 'updated' : 'unchanged'} (${bullets.length} bullets)`);
  return { learned, changed: changedFields.length > 0 };
}

/**
 * Count `n` feedback events. Never throws and never blocks on the LLM:
 * reflection runs in the background once the threshold is reached.
 */
async function recordFeedbackEvents(n = 1) {
  if (!reflectionEnabled() || n <= 0) return;
  try {
    const count = await store.incrementFeedbackCounter(n);
    if (count < THRESHOLD || running) return;
    const claimed = await store.claimReflection(THRESHOLD);
    if (!claimed) return;
    running = true;
    console.log(`[reflect] ${count} feedback events since last reflection; reflecting in background`);
    setImmediate(() => {
      runReflection()
        .catch((err) => console.error(`[reflect] failed: ${err.message}`))
        .finally(() => {
          running = false;
        });
    });
  } catch (err) {
    console.error(`[reflect] could not record feedback event: ${err.message}`);
  }
}

module.exports = { recordFeedbackEvents, runReflection, THRESHOLD };
