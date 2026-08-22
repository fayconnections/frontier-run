// LIFTED from arcademy/server.js (CAT Engine section, server.js:2407-2481).
// Re-pulled verbatim on re-extraction — see docs/EXTRACTION.md.
//
// Exercise selection: given a run's current target level and topic, which
// content_id does the student see next — plus the "did we actually serve
// what we think we served" honesty check that guards against a whole class
// of historical bugs (see F1 in the seam investigation / architecture docs).
//
// Module-split note: the source keeps the live in-memory pool in a top-level
// `let FRONTIER_POOL` reassigned by ../pool/build.js's loadFrontierPool().
// CommonJS modules don't share a live `let` binding across files the way the
// single server.js file did, so this lift threads it through `poolState`
// (../pool/state.js) — a tiny mutable container, not a behavior change.
// Every read below (`poolState.pool[...]`) is exactly `FRONTIER_POOL[...]`
// in the source.

const { poolState } = require('../pool/state');
const { getDb } = require('../data/db');

// ─── spiralFrom (server.js:2407-2414) ──────────────────────────────────────────
// Orders a topic's available pool levels by absolute distance from a target
// level, ties broken toward the lower level.
function spiralFrom(target, availableLevels) {
  return [...availableLevels].sort((a, b) => {
    const da = Math.abs(a - target);
    const db_ = Math.abs(b - target);
    if (da !== db_) return da - db_;
    return a - b;
  });
}

// ─── pickNextExercise (server.js:2424-2450) ────────────────────────────────────
// A level whose every exercise is already in alreadySeen resets that level's
// entries (only that level's — dedup elsewhere in the run is untouched)
// instead of falling through to a farther, thinner-content level. Without
// this, a topic's thin high buckets (e.g. addition L4/L5) drain permanently
// and the picker keeps serving from whatever easier bucket still has unseen
// stock, pinning a capable student low for the rest of the topic.
function pickNextExercise(state) {
  const pool = poolState.pool[state.topic] || {};
  const availableLevels = Object.keys(pool).map(Number);

  if (!availableLevels.length) return null;

  const ordered = spiralFrom(state.targetLevel, availableLevels);

  for (const lvl of ordered) {
    const levelPool = pool[lvl] || [];
    let candidates = levelPool.filter(cid => !state.alreadySeen.has(cid));

    if (candidates.length === 0 && levelPool.length > 0) {
      for (const cid of levelPool) state.alreadySeen.delete(cid);
      candidates = levelPool;
    }

    if (candidates.length > 0) {
      const cid = candidates[Math.floor(Math.random() * candidates.length)];
      state.alreadySeen.add(cid);
      state.last_content_id = cid;
      return { content_id: cid, level: lvl };
    }
  }

  return null;
}

// ─── reconcileLevel (server.js:2452-2459) ──────────────────────────────────────
// Reconciles state.level to the real pool bucket a pickNextExercise() call
// actually served — no-ops on a null pick (empty pool). state.level must
// only ever be written here, never computed, so attempt logging and
// next_level always reflect the served exercise, not the ±1 ramp's intent
// (state.targetLevel). This is the fix for the historical "served level
// disagreed with logged level" bug (F1) — see the architecture docs.
function reconcileLevel(state, picked) {
  if (picked) state.level = picked.level;
}

// ─── assertServedLevelHonest (server.js:2461-2481) ─────────────────────────────
// Dev-only tripwire for F1 regressions: off by default (zero cost on the hot
// path), enabled by setting FRONTIER_LEVEL_ASSERT=1 in the environment during
// a verification session. Confirms a served exercise's logged level actually
// matches its frontier_pool classification for that content_id — if a future
// call site picks an exercise without reconciling state.level first, this
// throws loudly instead of silently logging a phantom level.
const FRONTIER_LEVEL_ASSERT = process.env.FRONTIER_LEVEL_ASSERT === '1';

function assertServedLevelHonest(topic, level, contentId) {
  if (!FRONTIER_LEVEL_ASSERT) return;
  const row = getDb().prepare(
    'SELECT level FROM frontier_pool WHERE content_id=? AND topic=?'
  ).get(contentId, topic);
  if (!row || row.level !== level) {
    throw new Error(
      `[FRONTIER_LEVEL_ASSERT] topic=${topic} logged level=${level} ` +
      `content_id=${contentId} but frontier_pool.level=${row ? row.level : 'MISSING'} ` +
      `— a reconcile was likely skipped for this pick`
    );
  }
}

module.exports = {
  spiralFrom,
  pickNextExercise,
  reconcileLevel,
  assertServedLevelHonest,
  FRONTIER_LEVEL_ASSERT,
};
