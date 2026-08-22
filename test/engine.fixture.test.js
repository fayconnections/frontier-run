// REPO-NATIVE — created for this repo, never overwritten by re-extraction
// (see docs/EXTRACTION.md, section (b)).
//
// Regression test for the LIFTED engine (src/engine/, src/pool/, src/data/),
// wired against the fixtures (fixtures/sample-curriculum-nodes.txt,
// fixtures/sample-skill-tree-cache.json) exactly as the discarded end-to-end
// smoke test did during extraction. No Kolibri install, no Arcademy code,
// no network — a throwaway SQLite file under the OS temp dir, created fresh
// for this run and removed afterward.
//
// This file does NOT modify any lifted module. Where the lifted code has
// real nondeterminism (pickNextExercise's Math.random() tie-break among
// equal-distance candidates), it is controlled from here via node:test's
// built-in mock tracker temporarily replacing the global Math.random for the
// duration of each test — the lifted file itself is never touched.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Must be set before any lifted module that reads them is required:
// selection.js reads FRONTIER_LEVEL_ASSERT at module-load time (not lazily),
// and db.js reads FRONTIER_DB_PATH the first time getDb() is called — this
// repo's db.js caches one connection per process, so this must be the very
// first thing that touches it.
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `frontier-run-test-${process.pid}-${Date.now()}.db`
);
process.env.FRONTIER_DB_PATH = TEST_DB_PATH;
process.env.FRONTIER_LEVEL_ASSERT = '1'; // arm the honesty tripwire — a broken reconcile should fail the test loudly, not silently

const { getDb } = require('../src/data/db');
const { rebuildAndLoadPool } = require('../src/pool/build');
const { poolState } = require('../src/pool/state');
const { deriveTopicCeilings, getStartingLevel, computeModalLevel } = require('../src/engine/progression');
const { pickNextExercise, reconcileLevel } = require('../src/engine/selection');
const { processAnswer } = require('../src/engine/processAnswer');
const { FRONTIER_RUN_STATE } = require('../src/engine/runState');
const { TOPIC_CHAIN } = require('../src/engine/constants');

// Small seeded PRNG (mulberry32) so a test that mocks Math.random gets a
// fixed, repeatable sequence instead of a fixed constant — a constant would
// make Math.floor(Math.random() * n) always pick index 0, which happens to
// work here but would silently stop testing "pick among several candidates"
// if the fixture ever grows a 3+-way tie.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let db;
let nextUserId = 1;
let nextRunId = 1;

// Suite-level setup: this repo has no "boot sequence" of its own (that's the
// point of Scope A — see src/README.md), so this recreates, once for the
// whole file, exactly the sequence Arcademy's own boot does: open the DB,
// build/load the pool, derive ceilings against it. TOPIC_CHAIN[i].max is
// mutated in place by deriveTopicCeilings() — shared, intentionally, across
// every test below, same as it's shared across every run in the real app.
before(() => {
  db = getDb();
  // The one external-identity dependency this repo deliberately doesn't own
  // (see src/auth/README.md) — getStartingLevel() unconditionally looks up
  // `users.frontier_start_override`, so a minimal stand-in table is needed
  // for the lifted function to run at all. This is test scaffolding, not a
  // claim about what a real identity table should look like.
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, frontier_start_override INTEGER)');
  rebuildAndLoadPool();
  deriveTopicCeilings();
});

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(TEST_DB_PATH + suffix, { force: true });
  }
});

// Diagnostic sanity check, not a behavioral assertion: confirms the fixture
// pool actually loaded before the heavier tests below build on it. If this
// fails, the failures in the other two tests are a symptom, not the cause.
test('pool builds from fixtures with the expected topic coverage', () => {
  const topics = Object.keys(poolState.pool).sort();
  const expected = [...TOPIC_CHAIN.map(t => t.topic), 'counting_cardinality'].sort();
  assert.deepEqual(topics, expected,
    'fixture pool should cover every TOPIC_CHAIN topic plus the calibration-only counting_cardinality bucket');
});

function createTestRun() {
  const userId = nextUserId++;
  const runId = nextRunId++;
  db.prepare('INSERT INTO users (id, frontier_start_override) VALUES (?, NULL)').run(userId);
  db.prepare('INSERT INTO frontier_runs (id, user_id, started_at) VALUES (?, ?, ?)')
    .run(runId, userId, new Date().toISOString());

  const topic0 = TOPIC_CHAIN[0];
  const startLevel = getStartingLevel(userId, topic0, /* isRetake */ false, 'floor', 1);

  // Shape documented in src/engine/processAnswer.js's own header comment
  // (the FrontierRunState typedef) — this is test scaffolding standing in
  // for Arcademy's /api/frontier-run/start route, not lifted code.
  FRONTIER_RUN_STATE[userId] = {
    user_id: userId, run_id: runId, phase: 'main',
    topic_idx: 0, topic: topic0.topic,
    targetLevel: startLevel, level: null,
    alreadySeen: new Set(), last_content_id: null,
    attempts: [], levels_visited: [],
    topic_results: {}, topic_termination: {},
    question_count: 0, atTopStreak: 0, skipHoldStreak: 0,
    last_activity_at: new Date().toISOString(),
    progressionMode: 'floor', isRetake: false, warmfloorOffset: 1,
    runMode: 'countup', skipFree: 'auto', skipLevel: 'drop',
    skipHoldCount: 3, budgetPerTopic: 10,
  };

  const state = FRONTIER_RUN_STATE[userId];
  const first = pickNextExercise(state);
  reconcileLevel(state, first);
  return { userId, runId, state };
}

test('full run: all-correct answers walk every topic in TOPIC_CHAIN order and terminate via ceiling-confirm, not pool exhaustion', (t) => {
  // Controls pickNextExercise's tie-break among equal-distance candidates
  // (only addition@its-ceiling-level and algebra@its-ceiling-level have more
  // than one fixture exercise) without touching selection.js itself.
  t.mock.method(Math, 'random', seededRandom(12345));

  const { userId, runId, state } = createTestRun();

  let result;
  let answers = 0;
  const MAX_ANSWERS = 200; // guards against a hang/infinite-loop regression rather than timing out silently
  while (answers < MAX_ANSWERS) {
    answers++;
    result = processAnswer(userId, /* correct */ true, 1000 + answers, false);
    if (result.event === 'complete') break;
  }

  assert.ok(answers < MAX_ANSWERS,
    `run did not reach 'complete' within ${MAX_ANSWERS} answers — possible infinite-loop regression`);
  assert.equal(result.event, 'complete', 'an all-correct run should end with a complete event');

  // Every topic reached, in TOPIC_CHAIN order — JS preserves insertion order
  // for non-numeric string keys, and topic_results is only ever written by
  // advanceToNextTopic() in chain order.
  assert.deepEqual(
    Object.keys(state.topic_results),
    TOPIC_CHAIN.map(t => t.topic),
    'run should walk every topic in TOPIC_CHAIN order exactly once'
  );

  // Termination reason per topic: must be a real stop condition, never
  // pool exhaustion on an all-correct run against a pool sized to support
  // ceiling-confirm on every topic.
  for (const t of TOPIC_CHAIN) {
    assert.equal(
      state.topic_termination[t.topic], 'ceiling',
      `topic ${t.topic} should terminate via ceiling-confirm on an all-correct run, got '${state.topic_termination[t.topic]}'`
    );
  }

  // The core behavioral assertion on the ±1 walk + 2-confirm ceiling logic:
  // an all-correct run should land exactly on each topic's derived ceiling
  // (TOPIC_CHAIN[i].max, mutated in place by deriveTopicCeilings from the
  // live pool) — the honest served level, not an inflated target overshoot.
  // This is exactly the invariant reconcileLevel()/the ceiling-confirm
  // branch exist to guarantee; a regression here is the historical "served
  // level disagreed with logged level" class of bug.
  for (const t of TOPIC_CHAIN) {
    assert.equal(
      state.topic_results[t.topic], t.max,
      `topic ${t.topic} should record level_reached === its derived ceiling (${t.max}), got ${state.topic_results[t.topic]}`
    );
  }

  // Persistence: persistAnswerIncremental (src/data/accessors.js) writes one
  // frontier_attempts row per answer, EXCEPT the final answer that completes
  // the run — that branch returns early before reaching the persist call
  // (see processAnswer.js's own comment at that call site; this is also the
  // exact gap the seam investigation's "processAnswer is not pure" finding
  // was about). Asserting the precise count, not just ">0", catches a future
  // reordering of that early return.
  const persistedCount = db.prepare(
    'SELECT COUNT(*) c FROM frontier_attempts WHERE run_id=?'
  ).get(runId).c;
  assert.equal(
    persistedCount, answers - 1,
    `expected answers-1 (${answers - 1}) persisted frontier_attempts rows (the final completing answer is never persisted), got ${persistedCount}`
  );

  // Resume snapshot: the last successful persist happened one answer before
  // completion, while state.topic_idx still pointed at the final real topic
  // — the in-memory bump past the end of TOPIC_CHAIN that marks 'complete'
  // is never itself written to frontier_runs.
  const runRow = db.prepare('SELECT resume_topic_idx FROM frontier_runs WHERE id=?').get(runId);
  assert.equal(
    runRow.resume_topic_idx, TOPIC_CHAIN.length - 1,
    'last persisted resume_topic_idx should be the final topic index, not the post-completion overflow value'
  );

  delete FRONTIER_RUN_STATE[userId];
});

test('all-wrong run on the first topic stays pinned at its floor and terminates via budget exhaustion, not ceiling', (t) => {
  t.mock.method(Math, 'random', seededRandom(999));

  const { userId, runId, state } = createTestRun();
  const topic0 = TOPIC_CHAIN[0];

  let answers = 0;
  const MAX_ANSWERS = 200;
  // advanceToNextTopic() mutates state.topic in place the instant the topic
  // resolves, so this loop naturally stops on the answer that causes that —
  // no separate lookahead needed.
  while (state.topic === topic0.topic && answers < MAX_ANSWERS) {
    answers++;
    processAnswer(userId, /* correct */ false, 1000 + answers, false);
  }

  assert.ok(answers < MAX_ANSWERS,
    `topic did not resolve within ${MAX_ANSWERS} answers — possible infinite-loop regression`);

  assert.equal(
    state.topic_termination[topic0.topic], 'budget_exhausted',
    'an unbroken wrong-answer streak should exhaust the topic budget, never confirm a ceiling or exhaust the pool'
  );
  assert.equal(
    answers, state.budgetPerTopic,
    `an all-wrong topic should resolve in exactly budgetPerTopic (${state.budgetPerTopic}) answers, took ${answers}`
  );

  const rows = db.prepare(
    'SELECT level, regression_event FROM frontier_attempts WHERE run_id=? AND topic=? ORDER BY id'
  ).all(runId, topic0.topic);

  assert.equal(
    rows.length, answers,
    `every answer in a budget_exhausted (non-final) topic should be persisted — expected ${answers}, got ${rows.length}`
  );
  assert.ok(
    rows.every(r => r.regression_event === 1),
    'every answer in an unbroken wrong-answer streak should be stamped as a floor-regression event'
  );

  // Cross-check topic_results against independently-fetched persisted data,
  // using the SAME lifted computeModalLevel() the engine itself uses — not
  // a hardcoded fixture-specific number — so this stays a real behavioral
  // assertion about "does level_reached correctly reflect what was actually
  // served" rather than a brittle magic constant.
  const expectedModal = computeModalLevel(rows.map(r => r.level));
  assert.equal(
    state.topic_results[topic0.topic], expectedModal,
    'a budget-exhausted topic\'s level_reached should be the modal SERVED level, even when every answer was wrong'
  );

  delete FRONTIER_RUN_STATE[userId];
});
