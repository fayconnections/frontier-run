// LIFTED from arcademy/server.js (CAT Engine section, server.js:2551-2692).
// Re-pulled verbatim on re-extraction — see docs/EXTRACTION.md.
//
// This is the core adaptive-walk state machine: one call per answer (or
// skip), advancing/regressing the run's target level, deciding when a topic
// resolves (ceiling confirmed / budget exhausted / pool exhausted), and
// picking the next exercise to serve.
//
// ── The `state` object this function mutates ──────────────────────────────
// Arcademy builds this object inline in its `/api/frontier-run/start` route
// (server.js, not lifted here — see src/serving/README.md and
// src/auth/README.md for why). There is no separate "run state" module to
// lift from, so — for a reader to be able to call processAnswer() at all
// without also reading the Arcademy route handler — its shape is documented
// here as a plain JSDoc typedef instead:
//
// @typedef {Object} FrontierRunState
// @property {number}   user_id            - external identity, see src/auth/README.md
// @property {number}   run_id             - frontier_runs.id for this run
// @property {'calibration'|'main'|'complete'} phase
// @property {number}   topic_idx          - index into TOPIC_CHAIN
// @property {string}   topic              - TOPIC_CHAIN[topic_idx].topic
// @property {number}   targetLevel        - the ±1 ramp's intent (see reconcileLevel note)
// @property {number}   level              - the SERVED level, written only by reconcileLevel()
// @property {Set<string>} alreadySeen     - content_ids already served this run
// @property {string|null} last_content_id - most recently served content_id
// @property {Array}    attempts           - flat list of every attempt this run (see frontier-topic-results.js)
// @property {number[]} levels_visited     - served levels for the CURRENT topic only (reset on topic advance)
// @property {Object}   topic_results      - { [topic]: level_reached }, filled in by advanceToNextTopic()
// @property {Object}   topic_termination  - { [topic]: 'ceiling'|'budget_exhausted'|'pool_exhausted' }
// @property {number}   question_count     - answered/counted-against-budget questions in the current topic
// @property {number}   atTopStreak        - consecutive correct-at-ceiling count (see FRONTIER_CEILING_CONFIRM_COUNT)
// @property {number}   skipHoldStreak     - consecutive held skips at the current level (skip_level='hold' mode)
// @property {string}   last_activity_at   - ISO timestamp, used by the (not-lifted) inactivity timeout
// @property {string}   progressionMode    - 'floor'|'warm-floor'|'midpoint', frozen at /start
// @property {boolean}  isRetake           - computed once at /start
// @property {number}   warmfloorOffset    - frozen at /start
// @property {string}   runMode            - 'countdown'|'countup', frozen at /start
// @property {string}   skipFree           - 'free'|'budget'|'auto', frozen at /start
// @property {string}   skipLevel          - 'drop'|'hold', frozen at /start
// @property {number}   skipHoldCount      - frozen at /start
// @property {number}   budgetPerTopic     - frozen at /start (see ../engine/constants.js's
//                                           FRONTIER_QUESTIONS_PER_TOPIC comment on why this
//                                           is NOT that constant read live)

const { TOPIC_CHAIN, FRONTIER_CEILING_CONFIRM_COUNT } = require('./constants');
const { pickNextExercise, reconcileLevel, assertServedLevelHonest } = require('./selection');
const { computeModalLevel, advanceToNextTopic } = require('./progression');
const { persistAnswerIncremental } = require('../data/accessors');
const { FRONTIER_RUN_STATE } = require('./runState');
const { poolState } = require('../pool/state');

// Exact signature and lookup from server.js:2551 — state is NOT a parameter,
// it's read from the shared run registry by userId, same as every other
// frontier route in the source. See ./runState.js and ./processAnswer.js's
// own header comment (above) for what populates FRONTIER_RUN_STATE[userId]
// and why that population step isn't part of this Scope A lift.
function processAnswer(userId, correct, response_ms, skipped = false) {
  const state = FRONTIER_RUN_STATE[userId];
  const now = new Date().toISOString();
  state.last_activity_at = now;

  const topicObj = TOPIC_CHAIN[state.topic_idx];

  const attempt = {
    topic:            state.topic,
    level:            state.level,
    content_id:       state.last_content_id,
    correct:          correct ? 1 : 0,
    response_ms,
    regression_event: 0,
    skipped:          skipped ? 1 : 0,
    recorded_at:      now,
  };
  assertServedLevelHonest(attempt.topic, attempt.level, attempt.content_id);
  state.attempts.push(attempt);
  state.levels_visited.push(state.level);

  // 'auto' reproduces the mode-derived rule (free in count-up, consumes
  // budget in countdown) — a skip still logs as an attempt and still drops
  // the level below (unchanged, all modes), but under 'auto'+count-up
  // doesn't consume budget, so a topic advances on budgetPerTopic ANSWERED
  // questions with unlimited skips along the way. 'free'/'budget' override
  // the rule regardless of run_mode.
  const skipConsumesBudget =
    state.skipFree === 'free'   ? false :
    state.skipFree === 'budget' ? true :
    /* 'auto' */ (state.runMode === 'countdown');
  if (!skipped || skipConsumesBudget) {
    state.question_count += 1;
  }

  let event = skipped ? 'skip' : (correct ? 'correct' : 'wrong');

  if (correct) {
    state.skipHoldStreak = 0; // any non-held answer resets the hold count
    state.targetLevel += 1;

    // "At top" means the exercise just answered was actually SERVED at this
    // topic's true ceiling bucket — state.level, the reconciled/honest
    // level, not state.targetLevel (the ramp's intent, which can run past
    // what the pool actually has).
    if (state.level === topicObj.max) {
      state.atTopStreak += 1;

      if (state.atTopStreak >= FRONTIER_CEILING_CONFIRM_COUNT) {
        event = 'ceiling';
        state.topic_termination[state.topic] = event;
        // Pass the reconciled, honest served bucket (state.level), not the
        // topic's declared max — topicObj.max can outrun real pool coverage,
        // and persisting it would re-inflate the next run's starting level
        // even with reconcileLevel() in place.
        const advanced = advanceToNextTopic(state, state.level);
        if (!advanced) return { next: null, event: 'complete' };
      }
    } else {
      state.atTopStreak = 0;
    }

  } else {
    state.atTopStreak = 0; // any wrong answer (or skip) resets the streak, at top or not

    // Skip-level lever: a skip in 'hold' mode repeats the same level for up
    // to skipHoldCount consecutive skips before it drops — e.g. count=3
    // holds on skips 1, 2, and 3 (targetLevel unchanged each time), then
    // skip 4 releases the hold (drops + resets the streak, so the new level
    // gets its own fresh count=3 budget). A genuine wrong answer never holds
    // — it isn't `skipped`, so it always takes the drop branch below. 'drop'
    // mode (or student-choice runs, which always resolve to 'drop') also
    // always takes the drop branch, unaffected.
    const isHeldSkip = skipped && state.skipLevel === 'hold' &&
      (state.skipHoldStreak + 1) <= state.skipHoldCount;

    if (isHeldSkip) {
      state.skipHoldStreak += 1;
      // Level intentionally unchanged — no targetLevel move, no bottom-out
      // check (nothing moved, so there's nothing to clamp). Only reset
      // alreadySeen for this level if the pool is exhausted (all exercises
      // seen), so it can cycle through them again on the next hold.
      const pool = poolState.pool[state.topic] || {};
      const levelPool = pool[state.targetLevel] || [];
      const candidates = levelPool.filter(cid => !state.alreadySeen.has(cid));

      if (candidates.length === 0 && levelPool.length > 0) {
        for (const cid of levelPool) state.alreadySeen.delete(cid);
      }
    } else {
      state.skipHoldStreak = 0; // release (or a real wrong answer, or 'drop' mode) starts fresh
      state.targetLevel -= 1;

      // A miss at a topic's floor STAYS at that topic's floor — no backward
      // move to the previous topic. Every topic clamps in place
      // unconditionally, using topicObj.min. regression_event is still set
      // — it means "a miss-at-floor happened," a real data point
      // independent of whatever the engine does about it, not "the topic
      // moved backward." The topic still only advances forward via budget
      // exhaustion (below) or ceiling-confirm (above).
      if (state.targetLevel < topicObj.min) {
        event = 'bottom_out';
        attempt.regression_event = 1;
        state.targetLevel = topicObj.min;
      }
    }
  }

  if (state.question_count >= state.budgetPerTopic) {
    event = 'budget_exhausted';
    state.topic_termination[state.topic] = event;
    const modal = computeModalLevel(state.levels_visited);
    const advanced = advanceToNextTopic(state, modal);
    if (!advanced) return { next: null, event: 'complete' };
  }

  let next = pickNextExercise(state);
  reconcileLevel(state, next);

  if (!next) {
    event = 'pool_exhausted';
    state.topic_termination[state.topic] = event;
    const modal = computeModalLevel(state.levels_visited);
    const advanced = advanceToNextTopic(state, modal);
    if (!advanced) return { next: null, event: 'complete' };
    next = pickNextExercise(state);
    reconcileLevel(state, next);
  }

  // The just-finalized attempt (all mutation on it, including
  // regression_event above, is done by this point — inserting any earlier
  // would write regression_event=0 for a row that becomes a regression) +
  // the resume position, in one transaction so a crash can't write one
  // without the other. NOTE: this is a real database write, not a pure
  // function call — processAnswer() is NOT side-effect-free. See
  // ../data/accessors.js.
  persistAnswerIncremental(userId, state, attempt);

  return { next, event };
}

module.exports = { processAnswer };
