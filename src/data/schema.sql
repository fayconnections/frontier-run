-- LIFTED from arcademy/server.js — composed, not verbatim. Re-pulled on
-- re-extraction — see docs/EXTRACTION.md.
--
-- Arcademy defines these tables as a base `CREATE TABLE IF NOT EXISTS`
-- (server.js:245-331) plus ~25 cumulative `ALTER TABLE` migrations added
-- over time (server.js:402-590, run with try/catch on every boot so an
-- already-migrated column is a silent no-op). This file collapses that
-- history into ONE current effective shape — verified column-by-column
-- against live server.js on 2026-08-15. It is not a migration runner; it is
-- a snapshot of "what the schema actually looks like today." If Arcademy
-- adds another ALTER TABLE, this file is stale until the next re-extraction.
--
-- Scope A only lifts frontier_pool, frontier_runs, frontier_topic_results,
-- frontier_attempts, and app_settings (the tables/keys the CAT engine and
-- pool builder touch). NOT included: frontier_pool_archives (admin
-- pool-editor undo history — admin tooling, out of scope) and the three
-- frontier_* columns Arcademy adds directly to its own `users` table
-- (frontier_start_override, frontier_last_run_id, frontier_tour_done) —
-- those live on an external identity table this repo doesn't own. See the
-- `users` FK note on frontier_runs/frontier_attempts/frontier_topic_results
-- below and src/auth/README.md for how a standalone identity table should
-- provide the equivalent.

-- ─── frontier_pool ──────────────────────────────────────────────────────────
-- The exercise pool itself: which content_id belongs to which (topic, level)
-- bucket, and whether it's currently servable (flagged=1). No FK — pure
-- classification data, portable on its own.
-- Base: server.js:307-317. Migration: preview_path added server.js:418
-- (written only by Arcademy's separate preview-screenshot pipeline, not by
-- anything lifted here — nullable, safe to ignore in a standalone deploy).
CREATE TABLE IF NOT EXISTS frontier_pool (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id       TEXT NOT NULL,
  topic            TEXT NOT NULL,
  level            INTEGER NOT NULL,
  flagged          INTEGER DEFAULT 1,
  auto_classified  INTEGER DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  preview_path     TEXT,
  UNIQUE(content_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_frontier_pool_topic_level
  ON frontier_pool(topic, level, flagged);

-- ─── frontier_runs ──────────────────────────────────────────────────────────
-- One row per placement-test attempt. user_id is a bare INTEGER FK to an
-- external `users(id)` table this repo does not define — see
-- src/auth/README.md for what a standalone identity table needs to provide.
--
-- Column provenance (base server.js:245-263, migrations in the order added):
--   expressions_equations_level was renamed to algebra_level and
--   linear_equations_level was dropped (server.js:468, 471) when the
--   2026-08-09 algebra-topic merge retired both original topics — this
--   schema reflects the POST-merge shape only, not the historical one.
--   ended_at/end_reason (424, 427), progression_mode (434), status (515,
--   default 'active'), run_mode (527), breaks_enabled (533, default 0),
--   is_retake (536), resume_topic_idx/resume_target_level/
--   resume_budget_used/resume_at_top_streak (539, 542, 545, 548 — the
--   pause/resume snapshot columns processAnswer.js's persistAnswerIncremental
--   writes on every answer), skip_free/skip_level/skip_hold_count/
--   budget_per_topic/countdown_minutes/warmfloor_offset/mode_control (559,
--   562, 565, 568, 571, 574, 579 — the resolved per-run lever config, one
--   column per lever, stamped once at run start; see the behavior-levers
--   spec referenced in the Arcademy architecture docs for why these are
--   columns and not a JSON blob).
CREATE TABLE IF NOT EXISTS frontier_runs (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                     INTEGER NOT NULL,        -- FK to an external users(id) table — see src/auth/README.md
  started_at                  TEXT NOT NULL,
  completed_at                TEXT,
  self_report_grade           INTEGER,
  addition_level              INTEGER,
  subtraction_level           INTEGER,
  multiplication_level        INTEGER,
  division_level              INTEGER,
  fractions_level             INTEGER,
  decimals_level               INTEGER,
  ratios_proportions_level    INTEGER,
  algebra_level               INTEGER,                 -- renamed from expressions_equations_level; linear_equations_level dropped
  tokens_awarded              INTEGER DEFAULT 0,        -- Arcademy's reward path (NOT lifted) writes 10 here on completion
  next_available_at           TEXT,                     -- Arcademy's cooldown gate; currently always NULL live (cooldown removed 2026-08-12 per the seam investigation)
  ended_at                    TEXT,
  end_reason                  TEXT,                     -- 'completed' | 'timed_out' | 'abandoned' | 'paused'
  progression_mode            TEXT,                     -- 'floor' | 'warm-floor' | 'midpoint', frozen at /start
  status                      TEXT DEFAULT 'active',    -- 'active' | 'paused' | 'complete' | 'abandoned' | 'timed_out'
  run_mode                    TEXT,                     -- 'countdown' | 'countup'
  breaks_enabled              INTEGER DEFAULT 0,
  is_retake                   INTEGER,
  resume_topic_idx            INTEGER,
  resume_target_level         INTEGER,
  resume_budget_used          INTEGER,
  resume_at_top_streak        INTEGER,
  skip_free                   TEXT,                     -- 'free' | 'budget' | 'auto', resolved value for this run
  skip_level                  TEXT,                     -- 'drop' | 'hold', resolved value for this run
  skip_hold_count             INTEGER,
  budget_per_topic            INTEGER,
  countdown_minutes           INTEGER,
  warmfloor_offset            INTEGER,
  mode_control                TEXT                      -- 'student' | 'teacher' — which control path produced this run
);
CREATE INDEX IF NOT EXISTS idx_frontier_runs_user
  ON frontier_runs(user_id, completed_at);

-- ─── frontier_attempts ──────────────────────────────────────────────────────
-- One row per question answered (or skipped). Base server.js:266-279;
-- `skipped` added server.js:441 (skip-button build).
CREATE TABLE IF NOT EXISTS frontier_attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL,
  user_id          INTEGER NOT NULL,        -- FK to an external users(id) table — see src/auth/README.md
  topic            TEXT NOT NULL,
  level            INTEGER NOT NULL,
  content_id       TEXT NOT NULL,
  correct          INTEGER NOT NULL,
  response_ms      INTEGER,
  regression_event INTEGER DEFAULT 0,       -- 1 = this answer was a miss-at-topic-floor (see processAnswer.js)
  skipped          INTEGER DEFAULT 0,
  recorded_at      TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES frontier_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_frontier_attempts_run
  ON frontier_attempts(run_id, user_id);

-- ─── frontier_topic_results ─────────────────────────────────────────────────
-- One row per (run_id, topic) reached — the per-topic placement summary.
-- Base server.js:282-304; skip_count added server.js:448 (split out of
-- error_count), peak_correct_level added server.js:459, termination_reason
-- added server.js:590.
--
-- total_response_ms is a ROUGH PROXY, not PT-grade: it's a client-computed
-- Date.now() delta, stamped before the next exercise loads rather than when
-- it actually renders, so it includes iframe-swap/Perseus-render lag on top
-- of real think time. Directional only — see the source comment at
-- server.js:291-300 (preserved in spirit here, trimmed for length) before
-- treating this as measurement-grade timing data.
CREATE TABLE IF NOT EXISTS frontier_topic_results (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id             INTEGER NOT NULL,
  user_id            INTEGER NOT NULL,      -- FK to an external users(id) table — see src/auth/README.md
  topic              TEXT NOT NULL,
  level_reached      INTEGER NOT NULL,
  attempt_count      INTEGER NOT NULL,
  correct_count      INTEGER NOT NULL,
  error_count        INTEGER NOT NULL,
  skip_count         INTEGER DEFAULT 0,
  total_response_ms  INTEGER,               -- directional only — see comment above
  peak_correct_level INTEGER,
  termination_reason TEXT,                  -- 'ceiling' | 'budget_exhausted' | 'pool_exhausted' | NULL (regression / in-progress cutoff)
  UNIQUE(run_id, topic),
  FOREIGN KEY (run_id) REFERENCES frontier_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_frontier_topic_results_run
  ON frontier_topic_results(run_id, user_id);

-- ─── app_settings ───────────────────────────────────────────────────────────
-- Generic key-value settings table (server.js:326-331) — schema is
-- app-generic, but every key actually read/written today is a Frontier
-- behavior lever (confirmed live, 2026-08-15: no non-frontier_* key exists in
-- the running app). See src/data/accessors.js for the getters and their
-- documented defaults, and the table below for a quick reference.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  INTEGER
);

-- Reference: app_settings keys Frontier reads (key | valid values | default)
--   frontier_progression_mode    floor | warm-floor | midpoint      -> floor
--   frontier_run_mode            countdown | countup                -> countdown
--   frontier_countdown_minutes   positive integer                   -> 20
--   frontier_student_mode_choice on | off                           -> on
--   frontier_warmfloor_offset    integer                            -> 1
--   frontier_budget_per_topic    positive integer                   -> 10
--   frontier_skip_free           auto | free | budget               -> auto
--   frontier_breaks_control      auto | on | off                    -> auto
--   frontier_skip_level          drop | hold                        -> drop
--   frontier_skip_hold_count     non-negative integer                -> 3
-- Every getter falls back to its default on an unset OR garbage stored
-- value — none of them throw. See src/data/accessors.js for the exact logic.
