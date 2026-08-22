// LIFTED (algorithm) from arcademy/server.js:2002-2054, with a STUBBED input
// boundary — see the "Kolibri-DB dependency" note below and
// src/pool/kolibri-source.md. Re-pulled verbatim on re-extraction as far as
// the classification/insert logic goes — see docs/EXTRACTION.md. The input
// boundary (loadCurriculumSource below) is REPO-NATIVE and will NOT be
// overwritten by re-extraction.
//
// ── Kolibri-DB dependency (why this isn't a straight lift) ─────────────────
// In server.js, buildFrontierPool() reads two top-level constants populated
// at server boot:
//   - CURRICULUM_NODES — parsed from a flat repo file (kolibri-curriculum-
//     nodes.txt), genuinely portable, no Kolibri connection needed.
//   - SKILL_TREE_CACHE — built by buildSkillTreeCache() (server.js:1877-
//     1927), which opens Kolibri's OWN SQLite file directly
//     (~/.kolibri/db.sqlite3) and queries content_contentnode filtered to a
//     hardcoded channel_id. That hardcoded ID is exactly the kind of
//     environment-specific literal the seam investigation
//     (docs/Arcademy Claude/specs/frontier-run-extraction-seam-investigation.md
//     in the Arcademy repo, §B.4) flags as something that must become
//     config, not a copied literal — so it is NOT reproduced here.
//
// This file lifts the classification/insert ALGORITHM verbatim (the loop
// over curriculum nodes -> subtopics -> exercises, classifySubtopic() calls,
// double-attribution overrides, GRADE_TO_LEVEL lookup, INSERT OR IGNORE).
// What it does NOT lift is the Kolibri-SQLite read — that's represented as a
// documented interface (loadCurriculumSource, below) that a later phase
// implements against KOLIBRI_DB_PATH / KOLIBRI_CHANNEL_ID (see .env.example
// and src/pool/kolibri-source.md). For now it's backed by the small fixture
// in fixtures/, so this file is runnable and its output inspectable without
// a live Kolibri install.

const { classifySubtopic, GRADE_TO_LEVEL } = require('../engine/constants');
const { getDb } = require('../data/db');
const { poolState } = require('./state');
const { loadCurriculumSource } = require('./kolibri-source');

// ─── buildFrontierPool (server.js:2002-2041) ───────────────────────────────────
// Classifies every exercise reachable from the curriculum source into
// (topic, level) buckets and inserts new rows. INSERT OR IGNORE on
// UNIQUE(content_id, topic) means this is ADDITIVE ONLY — see the seam
// investigation's "copy-vs-move" section (§ Copy-vs-Move pool bug) for the
// duplication risk this creates on a classifier change. That risk is a
// property of the algorithm below, preserved verbatim, not something this
// lift fixes.
function buildFrontierPool({ curriculumNodes, skillTreeCache } = {}) {
  const db = getDb();
  const { CURRICULUM_NODES, SKILL_TREE_CACHE } =
    curriculumNodes && skillTreeCache
      ? { CURRICULUM_NODES: curriculumNodes, SKILL_TREE_CACHE: skillTreeCache }
      : loadCurriculumSource();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO frontier_pool
      (content_id, topic, level, flagged, auto_classified, created_at, updated_at)
    VALUES (?, ?, ?, 1, 1,
      strftime('%Y-%m-%dT%H:%M:%SZ','now'),
      strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  `);

  const insertMany = db.transaction((entries) => {
    for (const { contentId, topic, level } of entries) {
      stmt.run(contentId, topic, level);
    }
  });

  const entries = [];
  for (const node of CURRICULUM_NODES) {
    const cached = SKILL_TREE_CACHE[node.id];
    if (!cached) continue;
    for (const subtopic of cached.subtopicList) {
      let topics = classifySubtopic(subtopic.title);
      // Double-attribution overrides
      if (/put together|take apart|make \d|more and fewer/i.test(subtopic.title)) {
        topics = ['addition', 'subtraction'];
      }
      if (/multiplication and division/i.test(subtopic.title)) {
        topics = ['multiplication', 'division'];
      }
      if (topics.length === 0) continue;
      const level = GRADE_TO_LEVEL[node.grade];
      if (!level) continue;
      for (const ex of subtopic.exercises) {
        for (const topic of topics) {
          entries.push({ contentId: ex.content_id, topic, level });
        }
      }
    }
  }
  insertMany(entries);
  return entries.length;
}

// ─── loadFrontierPool (server.js:2043-2054) ────────────────────────────────────
// DB -> in-memory { topic: { level: [content_id, ...] } } map. This is the
// structure ../engine/selection.js and ../engine/progression.js read via
// poolState.pool — call this (and assign the result to poolState.pool)
// after any pool write, exactly as the source reloads FRONTIER_POOL after
// every admin write route.
function loadFrontierPool() {
  const rows = getDb().prepare(
    'SELECT content_id, topic, level FROM frontier_pool WHERE flagged=1'
  ).all();
  const pool = {};
  for (const row of rows) {
    if (!pool[row.topic]) pool[row.topic] = {};
    if (!pool[row.topic][row.level]) pool[row.topic][row.level] = [];
    pool[row.topic][row.level].push(row.content_id);
  }
  return pool;
}

// Convenience used by fixtures/tests: rebuilds frontier_pool from the
// curriculum source (real or fixture) and refreshes poolState.pool. Not a
// lift of a specific server.js function — server.js does this same two-step
// sequence inline at boot (initFrontierPool IIFE + `let FRONTIER_POOL =
// loadFrontierPool()`) and again after every admin pool-edit route; this
// just names that sequence.
function rebuildAndLoadPool(opts) {
  buildFrontierPool(opts);
  poolState.pool = loadFrontierPool();
  return poolState.pool;
}

module.exports = { buildFrontierPool, loadFrontierPool, rebuildAndLoadPool };
