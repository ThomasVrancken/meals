const store = require('../db');
const { amsterdamDate, amsterdamWeekday } = require('../http');

// Builds the shared "who we are / what we ate" block that every AI call gets.
// Returns both the rendered text and the raw data, so services can reuse the
// data (e.g. for dedup) without refetching.

const HISTORY_DAYS = 60;
const MAX_LIKED = 30;
const MAX_DISLIKED = 30;
const MAX_PASSED = 15;
const MAX_COOKBOOK = 40;

const RATING_LABEL = { up: 'loved it', meh: 'it was ok', down: 'did not like it' };

const FIELD_LABELS = {
  cookingStyle: 'How we cook',
  likes: 'We like',
  dislikes: "We don't like",
  shopping: 'Shopping',
  learned: 'Learned from our feedback (maintained by the app)',
};

const byUpdatedDesc = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));

function section(title, lines, empty = '(none)') {
  return `## ${title}\n${lines.length ? lines.join('\n') : empty}`;
}

async function loadContextData() {
  const today = amsterdamDate();
  const since = amsterdamDate(-HISTORY_DAYS);
  const [preferences, history, recipes] = await Promise.all([
    store.getPreferences(),
    store.listHistory({ sinceDate: since }),
    store.listAllRecipesIncludingDismissed(),
  ]);
  return { today, preferences, history, recipes };
}

function renderContext({ today, preferences, history, recipes }) {
  const liked = recipes.filter((r) => r.feedback === 'up').sort(byUpdatedDesc).slice(0, MAX_LIKED);
  const disliked = recipes.filter((r) => r.feedback === 'down').sort(byUpdatedDesc).slice(0, MAX_DISLIKED);
  // Dismissed without a reason: a weak "not in the mood / not for us" signal.
  const passed = recipes
    .filter((r) => r.status === 'dismissed' && !r.feedback)
    .sort(byUpdatedDesc)
    .slice(0, MAX_PASSED);
  const suggestions = recipes.filter((r) => r.status === 'suggested');
  const week = recipes.filter((r) => r.inWeek && r.status !== 'dismissed');
  const cookbook = recipes.filter((r) => r.status === 'saved').slice(0, MAX_COOKBOOK);

  const parts = [
    `# Context\nToday is ${amsterdamWeekday()} ${today} (Europe/Amsterdam). Yesterday was ${amsterdamWeekday(-1)} ${amsterdamDate(-1)}.`,
    ...Object.entries(FIELD_LABELS).map(([field, label]) =>
      section(`Preferences: ${label} [field: ${field}]`, preferences[field] ? [preferences[field].trim()] : [], '(empty)')
    ),
    section(
      `What we cooked in the last ${HISTORY_DAYS} days (newest first)`,
      history.map((h) => {
        const bits = [`- ${h.cookedAt}: ${h.title}`];
        if (h.rating) bits.push(`(${RATING_LABEL[h.rating]})`);
        if (h.note) bits.push(`note: "${h.note}"`);
        if (h.recipeId) bits.push(`[recipe ${h.recipeId}]`);
        return bits.join(' ');
      }),
      '(nothing logged yet)'
    ),
    section(
      'Recipes we liked (thumbs up)',
      liked.map((r) => `- ${r.title}${r.description ? `: ${r.description}` : ''}${r.feedbackNote ? ` (note: "${r.feedbackNote}")` : ''}`)
    ),
    section(
      'Recipes we disliked (thumbs down)',
      disliked.map((r) => `- ${r.title}${r.feedbackNote ? `: "${r.feedbackNote}"` : ''}`)
    ),
    section('Suggestions we dismissed without a reason (weak signal)', passed.map((r) => `- ${r.title}`)),
    section(
      'Current suggestions (in the Ideas list)',
      suggestions.map((r) => `- [${r.id}] ${r.emoji || ''} ${r.title}${r.inWeek ? ' (in week)' : ''}${r.feedback ? ` (feedback: ${r.feedback})` : ''}`)
    ),
    section('Picked for this week', week.map((r) => `- [${r.id}] ${r.emoji || ''} ${r.title}`)),
    section(
      'Cookbook (saved recipes)',
      cookbook.map(
        (r) => `- [${r.id}] ${r.emoji || ''} ${r.title}${r.cookedCount ? ` (cooked ${r.cookedCount}x${r.lastCookedAt ? `, last ${r.lastCookedAt.slice(0, 10)}` : ''})` : ''}`
      )
    ),
  ];
  return parts.join('\n\n');
}

/** Load and render the shared context. Returns `{ text, data }`. */
async function buildContext() {
  const data = await loadContextData();
  return { text: renderContext(data), data };
}

module.exports = { buildContext, loadContextData, renderContext, HISTORY_DAYS };
