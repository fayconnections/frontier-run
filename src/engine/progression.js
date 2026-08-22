// LIFTED from arcademy/server.js (CAT Engine section). Re-pulled verbatim on
// re-extraction — see docs/EXTRACTION.md.
//
// Everything about WHERE a run starts and how it moves between topics:
// deriving each topic's real ceiling from the live pool, seeding a starting
// level (first run vs. retake vs. admin override, gated by progression
// mode), and advancing to the next topic in TOPIC_CHAIN when one resolves.
//
// See ../engine/selection.js's module-split note re: poolState — the same
// applies here for deriveTopicCeilings(), which reads the live pool.

const { TOPIC_CHAIN } = require('./constants');
const { poolState } = require('../pool/state');
const { getPriorTopicLevel } = require('../data/accessors');
const { getDb } = require('../data/db');

// ─── deriveTopicCeilings (server.js:2125-2160) ─────────────────────────────────
// Corrects each topic's effective ceiling to the highest level the live pool
// actually has content at, bounded above by TOPIC_CHAIN's literal max (never
// below it — content classified above a topic's declared range is a separate
// content-tagging question, not a range-derivation one). Mutates
// TOPIC_CHAIN[i].max in place so every existing reader (getStartingLevel,
// advanceToNextTopic, processAnswer) sees the corrected value with no
// call-site changes. declaredMax preserves the original literal for two
// reasons: it's the derivation's own upper bound, and re-running this after a
// pool reload needs it to re-derive from the true ceiling, not from whatever
// was last derived.
//
// Must only ever run against the flagged=1 pool view — every call site in
// the source calls this immediately after a fresh pool reload, never before
// or interleaved with one. In this lift, that means: call
// ../pool/build.js's loadFrontierPool() first, THEN call this.
function deriveTopicCeilings() {
  console.log('[FRONTIER_CEILING] topic | declared max | derived top | count at top');
  for (const t of TOPIC_CHAIN) {
    if (t.declaredMax === undefined) t.declaredMax = t.max;

    const pool = poolState.pool[t.topic] || {};
    const inRangeLevels = Object.keys(pool)
      .map(Number)
      .filter(l => l >= t.min && l <= t.declaredMax);

    // Defensive fallback only — not expected to fire against real data
    // (every topic has real content somewhere in its declared range). Falls
    // to min, not declaredMax, so a topic that somehow has zero in-range
    // content doesn't silently claim a ceiling it can't serve.
    const derivedTop = inRangeLevels.length ? Math.max(...inRangeLevels) : t.min;
    const countAtTop = (pool[derivedTop] || []).length;

    t.max = derivedTop;

    console.log(`[FRONTIER_CEILING] ${t.topic.padEnd(20)} | ${t.declaredMax} | ${derivedTop} | ${countAtTop}`);
  }
}

// ─── clampToTopicRange (server.js:2191-2193) ───────────────────────────────────
function clampToTopicRange(topicObj, value) {
  return Math.max(topicObj.min, Math.min(topicObj.max, value));
}

// ─── getStartingLevel (server.js:2328-2383) ────────────────────────────────────
// Starting state.targetLevel for a topic, in priority order:
//   1. users.frontier_start_override (admin override) — wins outright,
//      entry seed only.
//   2. mode === 'floor' — topicObj.min, unconditionally, first run or retake.
//   3. mode === 'midpoint' — round((min+max)/2), unconditionally.
//   4. isRetake with a COMPLETED prior result for THIS topic — that topic's
//      own prior level_reached minus warmfloorOffset, clamped.
//   5. Otherwise (first run, or retake with no completed data for this
//      topic) — topicObj.min.
// `mode` is read once at /start via getProgressionMode() (../data/accessors.js)
// and threaded through as a parameter — never re-read here, so a mid-run
// owner toggle flip can't change a run already in progress. Same discipline
// for isRetake/warmfloorOffset.
function getStartingLevel(userId, topicObj, isRetake, mode, warmfloorOffset) {
  const user = getDb().prepare(
    'SELECT frontier_start_override FROM users WHERE id=?'
  ).get(userId);

  if (user.frontier_start_override != null) {
    return clampToTopicRange(topicObj, user.frontier_start_override);
  }

  if (mode === 'floor') {
    return topicObj.min;
  }

  if (mode === 'midpoint') {
    return Math.round((topicObj.min + topicObj.max) / 2);
  }

  if (isRetake) {
    const prior = getPriorTopicLevel(userId, topicObj.topic);
    if (prior != null) {
      return clampToTopicRange(topicObj, prior - warmfloorOffset);
    }
    // No COMPLETED persisted result for THIS topic specifically (e.g. the
    // student's completed run never reached it, or every prior run was
    // abandoned/paused). Fall through to first-run behavior as a
    // documented, deliberate default — not a silent gap.
  }

  // FIRST run (or retake with no completed prior data for this topic).
  // warm-floor's first-run behavior is floor, same as every other
  // no-completed-data case — there is no grade-based fallback here.
  return topicObj.min;
}

// ─── computeModalLevel (server.js:2385-2405) ───────────────────────────────────
// Most-frequently-visited level in the levels the run visited this topic,
// ties broken toward the lowest level. Used to seed the NEXT topic when the
// current one resolves via budget exhaustion or pool exhaustion (as opposed
// to a ceiling confirm, which seeds from the honest served level instead —
// see processAnswer.js).
function computeModalLevel(levels_visited) {
  if (!levels_visited.length) return 1;

  const freq = {};
  for (const lvl of levels_visited) {
    freq[lvl] = (freq[lvl] || 0) + 1;
  }

  let modalLevel = null;
  let maxFreq = 0;

  const sorted = Object.keys(freq).map(Number).sort((a, b) => a - b);
  for (const lvl of sorted) {
    if (freq[lvl] > maxFreq) {
      maxFreq = freq[lvl];
      modalLevel = lvl;
    }
  }

  return modalLevel;
}

// ─── advanceToNextTopic (server.js:2483-2522) ──────────────────────────────────
// Moves topic_idx forward and seeds the new topic's targetLevel. Returns
// false (and sets state.phase = 'complete') when TOPIC_CHAIN is exhausted —
// callers must check this before continuing.
//
// Reads state.progressionMode/state.isRetake/state.warmfloorOffset directly
// off the run state (frozen at /start, same discipline as getStartingLevel's
// parameters) rather than re-reading the app_settings getters mid-run.
function advanceToNextTopic(state, frontier_level) {
  state.topic_results[state.topic] = frontier_level;
  state.topic_idx += 1;

  if (state.topic_idx >= TOPIC_CHAIN.length) {
    state.phase = 'complete';
    return false;
  }

  const next = TOPIC_CHAIN[state.topic_idx];
  state.topic = next.topic;

  if (state.progressionMode === 'floor') {
    // Floor is floor — every topic starts at its min, first run or retake.
    // Prior data never moves this; that's warm-floor's job, not floor's.
    state.targetLevel = next.min;
  } else if (state.progressionMode === 'midpoint') {
    // Short-circuits exactly like floor — carry-over never applies under
    // midpoint mode.
    state.targetLevel = Math.round((next.min + next.max) / 2);
  } else if (state.isRetake) {
    const prior = getPriorTopicLevel(state.user_id, next.topic);
    state.targetLevel = prior != null
      ? clampToTopicRange(next, prior - state.warmfloorOffset)
      // No persisted result for this specific next topic (e.g. the prior
      // run never reached it) — same halfway fallback as first-run, rather
      // than inventing a third rule for a case the spec doesn't name.
      : Math.round((next.min + next.max) / 2);
  } else {
    state.targetLevel = Math.round((next.min + next.max) / 2);
  }

  state.question_count = 0;
  state.levels_visited = [];
  state.atTopStreak = 0;     // ceiling-confirm streak resets on every transition
  state.skipHoldStreak = 0;  // skip-level hold count resets on every transition
  return true;
}

module.exports = {
  deriveTopicCeilings,
  clampToTopicRange,
  getStartingLevel,
  computeModalLevel,
  advanceToNextTopic,
};
