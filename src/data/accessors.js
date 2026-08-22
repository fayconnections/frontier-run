// LIFTED from arcademy/server.js (CAT Engine section). Re-pulled verbatim on
// re-extraction — see docs/EXTRACTION.md.
//
// The frontier_* database reads/writes the adaptive engine depends on: prior
// placement lookups (for retake seeding), the ten app_settings-backed
// behavior-lever getters (see schema.sql's reference table), and the
// per-answer incremental persist that makes a run resumable.
//
// Module-split note: the source has these as plain functions closing over a
// single top-level `db` constant in server.js. Here they call getDb() from
// ./db.js instead of closing over a module-level `db` — same connection
// object, just fetched through a function because this repo has no single
// boot script that opens it once at the top like server.js does. No logic
// changed.

const { getDb } = require('./db');

// ─── getPriorTopicLevel (server.js:2167-2189) ──────────────────────────────────
// Most recent persisted frontier_topic_results row for this exact
// (userId, topic), from a COMPLETED run only — null if the student never
// completed a run that reached this topic. Used by both the entry-seed and
// transition-seed retake branches (progression.js) so the lookup logic
// exists in exactly one place.
//
// The join + completed_at filter is load-bearing, not just a WHERE clause
// bolted on after the fact — ORDER BY tr.id DESC LIMIT 1 means "most recent
// AMONG the rows this query considers eligible," so filtering to completed
// runs BEFORE ordering is what makes a genuinely completed run's result win
// over a more recent but abandoned run's, not just what excludes
// abandoned-only users entirely.
function getPriorTopicLevel(userId, topic) {
  const row = getDb().prepare(`
    SELECT tr.level_reached
    FROM frontier_topic_results tr
    JOIN frontier_runs r ON r.id = tr.run_id
    WHERE tr.user_id = ? AND tr.topic = ? AND r.completed_at IS NOT NULL
    ORDER BY tr.id DESC LIMIT 1
  `).get(userId, topic);
  return row ? row.level_reached : null;
}

// ─── Behavior-lever getters (server.js:2195-2313) ──────────────────────────────
// One `app_settings` row per key, one getter per key. Every getter is
// deliberately failure-proof: an unset row OR a garbage stored value both
// fall back to the documented bootstrap default — none of these throw, and
// none of them propagate an unrecognized value into the engine. See
// schema.sql's reference table for the full key/values/default list.

// Unset row = 'floor' (bootstrap default, not a recommendation). A garbage
// stored value also falls back to 'floor' rather than propagating into the
// engine — this read must never throw or return something the engine
// doesn't recognize.
function getProgressionMode() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_progression_mode'"
  ).get();
  if (row && (row.value === 'floor' || row.value === 'warm-floor' || row.value === 'midpoint')) return row.value;
  return 'floor';
}

// Unset row = 'countdown' (bootstrap default, not a recommendation). A
// garbage stored value also falls back to 'countdown' — same discipline as
// getProgressionMode().
function getRunMode() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_run_mode'"
  ).get();
  if (row && (row.value === 'countdown' || row.value === 'countup')) return row.value;
  return 'countdown';
}

// Unset row = 20 (bootstrap default). A garbage/non-numeric/non-positive
// stored value also falls back to 20 rather than handing the client a
// broken countdown.
function getCountdownMinutes() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_countdown_minutes'"
  ).get();
  const n = row ? parseInt(row.value, 10) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  return 20;
}

// Unset row = 'on' (bootstrap default — hard-defaulted to showing the mode
// picker). 'off' is the only other recognized value, meaning a teacher-mode
// toggle forces getRunMode()'s app_settings default with no student choice
// offered. A garbage stored value falls back to 'on'.
function isStudentModeChoiceEnabled() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_student_mode_choice'"
  ).get();
  return row?.value !== 'off';
}

// Unset row = 1 (bootstrap default — today's only behavior, prior - 1). A
// garbage/non-integer stored value also falls back to 1. 0 is a valid,
// intentional override (resume exactly where they left off) — only
// non-integers are rejected.
function getWarmfloorOffset() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_warmfloor_offset'"
  ).get();
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isInteger(n) ? n : 1;
}

// Unset row = 10 (bootstrap default, matches the FRONTIER_QUESTIONS_PER_TOPIC
// constant in ../engine/constants.js — see that file's comment on why that
// constant is documentation-only, not load-bearing, today). A garbage/
// non-integer/non-positive stored value falls back to 10.
function getBudgetPerTopic() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_budget_per_topic'"
  ).get();
  const n = row ? parseInt(row.value, 10) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  return 10;
}

// Unset row = 'auto' (bootstrap default — today's mode-derived rule: free in
// count-up, consumes budget in countdown). 'free'/'budget' override that rule
// regardless of run_mode. A garbage stored value falls back to 'auto'.
function getSkipFreeMode() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_skip_free'"
  ).get();
  if (row && (row.value === 'free' || row.value === 'budget')) return row.value;
  return 'auto';
}

// Unset row = 'auto' (bootstrap default — today's mode-derived rule: enabled
// for count-up, disabled for countdown). 'on'/'off' override that rule
// regardless of run_mode. A garbage stored value falls back to 'auto'.
function getBreaksControl() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_breaks_control'"
  ).get();
  if (row && (row.value === 'on' || row.value === 'off')) return row.value;
  return 'auto';
}

// Unset row = 'drop' (bootstrap default — today's only behavior: a skip
// drops targetLevel by 1, exactly like a wrong answer). 'hold' is the only
// other recognized value. A garbage stored value falls back to 'drop'.
function getSkipLevelMode() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_skip_level'"
  ).get();
  if (row && row.value === 'hold') return 'hold';
  return 'drop';
}

// Unset row = 3 (bootstrap default). A garbage/non-integer/negative stored
// value falls back to 3. Unlike getBudgetPerTopic(), 0 is a valid,
// intentional override — it means every hold-mode skip drops immediately (no
// holding at all), matching 'drop'. Only relevant when
// frontier_skip_level='hold'; read and stored regardless so flipping the
// mode doesn't lose the count.
function getSkipHoldCount() {
  const row = getDb().prepare(
    "SELECT value FROM app_settings WHERE key='frontier_skip_hold_count'"
  ).get();
  const n = row ? parseInt(row.value, 10) : NaN;
  if (Number.isInteger(n) && n >= 0) return n;
  return 3;
}

// ─── persistAnswerIncremental (server.js:2524-2549) ────────────────────────────
// Writes one just-finalized attempt row + the resume position snapshot, in a
// single transaction, so a crash between the two can't leave the attempt
// durable without a matching position (or vice versa). Called by
// processAnswer.js on every answer (not just at run-end) — this is what
// makes a run resumable after a crash/power-loss.
function makePersistAnswerIncremental(db) {
  return db.transaction((userId, state, attempt) => {
    db.prepare(`
      INSERT INTO frontier_attempts
        (run_id, user_id, topic, level, content_id,
         correct, response_ms, regression_event, skipped, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      state.run_id, userId, attempt.topic, attempt.level, attempt.content_id,
      attempt.correct, attempt.response_ms, attempt.regression_event,
      attempt.skipped, attempt.recorded_at
    );
    db.prepare(`
      UPDATE frontier_runs SET
        resume_topic_idx = ?,
        resume_target_level = ?,
        resume_budget_used = ?,
        resume_at_top_streak = ?
      WHERE id = ?
    `).run(state.topic_idx, state.targetLevel, state.question_count, state.atTopStreak, state.run_id);
  });
}

// db.transaction() (better-sqlite3) binds to a specific connection at
// creation time, so — unlike the plain-query getters above — this can't
// lazily call getDb() inside the function body. Built once, on first use,
// against whatever connection getDb() returns; fine here because this repo
// only ever opens one connection (see ./db.js).
let _persistAnswerIncremental = null;
function persistAnswerIncremental(userId, state, attempt) {
  if (!_persistAnswerIncremental) {
    _persistAnswerIncremental = makePersistAnswerIncremental(getDb());
  }
  return _persistAnswerIncremental(userId, state, attempt);
}

module.exports = {
  getPriorTopicLevel,
  getProgressionMode,
  getRunMode,
  getCountdownMinutes,
  isStudentModeChoiceEnabled,
  getWarmfloorOffset,
  getBudgetPerTopic,
  getSkipFreeMode,
  getBreaksControl,
  getSkipLevelMode,
  getSkipHoldCount,
  persistAnswerIncremental,
};
