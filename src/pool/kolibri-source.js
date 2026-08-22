// REPO-NATIVE — created for this repo, not lifted from Arcademy, never
// overwritten by re-extraction (see docs/EXTRACTION.md).
//
// This is the documented interface boundary for pool-source data. See
// src/pool/kolibri-source.md for the full writeup of what Arcademy actually
// does here (a direct SQLite read of Kolibri's own database, filtered to a
// hardcoded channel_id) and why that is NOT reproduced in this repo.
//
// Today, loadCurriculumSource() returns fixture data by default — enough for
// ../pool/build.js's classification algorithm to be readable and runnable
// end-to-end without a live Kolibri install. Set FRONTIER_USE_FIXTURE_POOL=0
// (see .env.example) once a real implementation exists to make this call out
// to a live Kolibri DB instead — that implementation is a later phase, not
// built here.
//
// The curriculum-nodes text format parsed below (loadCurriculumNodesFile) IS
// the real Arcademy format — it's a plain repo text file
// (kolibri-curriculum-nodes.txt), not Kolibri-DB-derived, so there's nothing
// to stub about parsing it; only the SKILL_TREE_CACHE side (which requires a
// live Kolibri SQLite read) is faked here.

const fs = require('fs');
const path = require('path');

// Mirrors arcademy/server.js's loadCurriculumNodes() (server.js:1845-1868) —
// a small, pure text parser, no Kolibri connection involved. Lifted as
// reference logic since it's what makes the fixture curriculum file
// (fixtures/sample-curriculum-nodes.txt) parseable in the same shape
// CURRICULUM_NODES has in the real app.
function loadCurriculumNodesFile(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const nodes = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 4) continue;

    const [grade, elevation, topic, idsStr] = parts;
    const l4ids = idsStr.split(',').map(id => id.trim()).filter(Boolean);

    const id = (grade + '_' + topic)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    nodes.push({ id, grade, title: topic, elevation: parseInt(elevation, 10), l4ids });
  }

  return nodes;
}

// STUB. In arcademy/server.js this is buildSkillTreeCache() (server.js:1877-
// 1927): a direct better-sqlite3 read of ~/.kolibri/db.sqlite3's
// content_contentnode table, filtered to a hardcoded channel_id, resolving
// each L4 curriculum node's exercises via lft/rght nested-set containment.
// NOT reproduced here — see src/pool/kolibri-source.md. Throws deliberately
// so a caller that reaches this without the fixture flag gets a clear
// "not implemented" error instead of a silent empty pool.
function loadSkillTreeCacheFromKolibri({ dbPath, channelId }) {
  throw new Error(
    'loadSkillTreeCacheFromKolibri() is not implemented in this repo — ' +
    'see src/pool/kolibri-source.md. Set FRONTIER_USE_FIXTURE_POOL=1 ' +
    '(the default) to use fixtures/sample-skill-tree-cache.json instead.'
  );
}

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures');

// The one function ../pool/build.js actually calls. Returns
// { CURRICULUM_NODES, SKILL_TREE_CACHE } in the exact shape
// buildFrontierPool() expects.
function loadCurriculumSource() {
  const useFixture = process.env.FRONTIER_USE_FIXTURE_POOL !== '0';

  if (!useFixture) {
    return {
      CURRICULUM_NODES: loadCurriculumNodesFile(
        process.env.FRONTIER_CURRICULUM_NODES_PATH ||
          path.join(FIXTURES_DIR, 'sample-curriculum-nodes.txt')
      ),
      SKILL_TREE_CACHE: loadSkillTreeCacheFromKolibri({
        dbPath: process.env.KOLIBRI_DB_PATH,
        channelId: process.env.KOLIBRI_CHANNEL_ID,
      }),
    };
  }

  const CURRICULUM_NODES = loadCurriculumNodesFile(
    path.join(FIXTURES_DIR, 'sample-curriculum-nodes.txt')
  );
  const SKILL_TREE_CACHE = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'sample-skill-tree-cache.json'), 'utf8')
  );
  return { CURRICULUM_NODES, SKILL_TREE_CACHE };
}

module.exports = { loadCurriculumSource, loadCurriculumNodesFile, loadSkillTreeCacheFromKolibri };
