const { createJSON, models } = require('../llm/openai');
const { AISLE_KEYS, AISLE_GUIDE } = require('../aisles');

// Classifies one manually-typed grocery item name into an aisle key, for the
// "Other groceries" shopping-list section (which has no recipe context to
// infer an aisle from). Tiny fast-model call, single enum field. Never
// throws: any failure falls back to "misc" so adding an item never breaks.

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { aisle: { type: 'string', enum: AISLE_KEYS } },
  required: ['aisle'],
};

const INSTRUCTIONS = `
Classify ONE grocery item into exactly one aisle of Thomas & Lote's Albert Heijn Haarlemmerplein,
using this walking order:
${AISLE_GUIDE}
Return only the JSON with the single best-fitting aisle key. If genuinely unsure, use "misc".
`.trim();

/** @param {string} name @returns {Promise<string>} an AISLE_KEYS member, always. */
async function classifyItemAisle(name) {
  try {
    const result = await createJSON({
      model: models.fast(),
      instructions: INSTRUCTIONS,
      input: `Item: "${name}"`,
      schemaName: 'aisle_classification',
      schema: SCHEMA,
      effort: 'low',
      maxOutputTokens: 200,
      label: 'classifyAisle',
    });
    return AISLE_KEYS.includes(result.aisle) ? result.aisle : 'misc';
  } catch (err) {
    console.warn(`[classifyAisle] failed for "${name}": ${err.message}`);
    return 'misc';
  }
}

module.exports = { classifyItemAisle };
