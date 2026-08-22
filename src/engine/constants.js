// LIFTED from arcademy/server.js (Frontier Pool + CAT Engine sections).
// Re-pulled verbatim on re-extraction — see docs/EXTRACTION.md. Do not hand-edit
// the logic here; fix it at the source (Arcademy) and re-run the sync, or this
// file will silently diverge from what's actually running there.
//
// The shared constants the adaptive engine (progression.js, selection.js,
// processAnswer.js) and the pool builder (../pool/build.js) both need.
// classifySubtopic/GRADE_TO_LEVEL are pool-construction inputs, not run-time
// adaptive logic — they live here (not in ../pool/) because that's how the
// source groups them (server.js's "Frontier Pool" section, immediately above
// "CAT Engine"), and ../pool/build.js imports them from here.

// ─── Topic classification (server.js:1966-1982) ───────────────────────────────
// Maps a Kolibri L4 curriculum-node title to one or more Frontier topics.
// First match wins, except the two explicit double-attribution overrides
// applied by the caller (see ../pool/build.js) after this returns.
function classifySubtopic(title) {
  const t = title.toLowerCase();
  if (/fraction|denominator|mixed number/.test(t))       return ['fractions'];
  if (/decimal/.test(t))                                 return ['decimals'];
  if (/ratio|proportion|\brate|percent/.test(t))          return ['ratios_proportions'];
  if (/function|slope|intercept|linear model|system|linear equation|expression|equation|inequalit|like terms/.test(t)) return ['algebra'];
  if (/division|divid|remainder|quotient/.test(t))        return ['division'];
  if (/multipl|product/.test(t))                          return ['multiplication'];
  if (/subtract/.test(t))                                 return ['subtraction'];
  // "negative" excluded: integer/signed-number addition is a different
  // number domain from whole-number addition — parked as a possible
  // future "integers" topic, not folded in here (frontier-run-pool-
  // cleanup-spec.md §3).
  if (!/negative/.test(t) && /add/.test(t))               return ['addition'];
  if (/count|cardinality/.test(t))                        return ['counting_cardinality'];
  return [];
}

// ─── Grade → difficulty level (server.js:1984-2000) ────────────────────────────
// The sole source of exercise difficulty in this system: one integer (1-9)
// per Kolibri L3 curriculum node grade string, applied uniformly to every
// exercise nested under that node regardless of the exercise's own apparent
// difficulty (a known, documented limitation — see the seam investigation's
// F6 reference and frontier-run-pool-architecture.md §6).
const GRADE_TO_LEVEL = {
  'Kindergarten':             1,
  '1st grade':                2,
  '2nd grade':                3,
  'Get ready for 3rd grade':  3,
  '3rd grade':                4,
  'Get ready for 4th grade':  4,
  '4th grade':                5,
  'Get ready for 5th grade':  5,
  '5th grade':                6,
  'Get ready for 6th grade':  6,
  '6th grade':                7,
  'Get ready for 7th grade':  7,
  '7th grade':                8,
  'Get ready for 8th grade':  8,
  '8th grade':                9,
};

// ─── Topic traversal order + range (server.js:2114-2123) ──────────────────────
// Fixed order the adaptive walk moves through topics in. `.max` on each entry
// is a LITERAL/DECLARED value only until deriveTopicCeilings() (progression.js)
// runs — it then mutates `.max` in place to the pool-derived real ceiling,
// preserving the original literal as `.declaredMax`. See
// docs/Arcademy Claude/specs/frontier-run-pool-derived-ceiling-spec.md in the
// Arcademy repo for the full derivation rationale.
const TOPIC_CHAIN = [
  { topic: 'addition',               min: 1, max: 5 },
  { topic: 'subtraction',            min: 1, max: 8 },
  { topic: 'multiplication',         min: 4, max: 8 },
  { topic: 'division',               min: 4, max: 8 },
  { topic: 'fractions',              min: 4, max: 8 },
  { topic: 'decimals',               min: 5, max: 8 },
  { topic: 'ratios_proportions',     min: 7, max: 9 },
  { topic: 'algebra',                min: 4, max: 9 },
];

// ─── Bootstrap defaults (server.js:2164-2165) ──────────────────────────────────
// FRONTIER_QUESTIONS_PER_TOPIC is NOT read live by processAnswer anymore —
// confirmed against live server.js (2026-08-15): processAnswer checks
// `state.question_count >= state.budgetPerTopic`, and state.budgetPerTopic is
// frozen per-run from the app_settings-backed getBudgetPerTopic() getter (see
// ../data/accessors.js), whose own fallback default (10) is this constant's
// value duplicated, not sourced from it. This constant is kept only because
// getBudgetPerTopic()'s comment in the source still points back to it as "the
// constant this replaces" — it is documentation-only today, not load-bearing.
// Flagged here rather than silently dropped so a reader hunting for "where's
// the budget actually enforced" doesn't get misdirected by it.
const FRONTIER_QUESTIONS_PER_TOPIC = 10;

// Consecutive correct-at-the-topic's-true-ceiling answers required before the
// engine trusts it's really a ceiling and advances (see processAnswer.js).
const FRONTIER_CEILING_CONFIRM_COUNT = 2;

// ─── Topic → curriculum node title (server.js:2315-2324) ───────────────────────
// Used by the reward/results path (NOT lifted in Scope A — see
// docs/EXTRACTION.md) to resolve a topic back to a human curriculum-node
// title for "which node should this student review" recommendations. Lifted
// here anyway because it's a small, static, secret-free constant and a
// reader tracing TOPIC_CHAIN naturally asks "what does 'algebra' even mean
// as curriculum content" — this answers that without pulling in the reward
// path's db/token dependencies.
const TOPIC_TO_NODE_TITLE = {
  addition:              'Addition and subtraction',
  subtraction:           'Addition and subtraction',
  multiplication:        'Multiplication and division',
  division:              'Multiplication and division',
  fractions:             'Fractions',
  decimals:              'Decimals',
  ratios_proportions:    'Ratios and proportions',
  algebra:               'Linear equations and functions',
};

module.exports = {
  classifySubtopic,
  GRADE_TO_LEVEL,
  TOPIC_CHAIN,
  FRONTIER_QUESTIONS_PER_TOPIC,
  FRONTIER_CEILING_CONFIRM_COUNT,
  TOPIC_TO_NODE_TITLE,
};
