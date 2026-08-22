# Pool source data — the Kolibri-DB boundary

REPO-NATIVE doc, never overwritten by re-extraction (see `docs/EXTRACTION.md`).

## What Arcademy actually does

`buildFrontierPool()` needs two inputs to classify exercises into
`(topic, level)` buckets:

1. **`CURRICULUM_NODES`** — parsed from a flat repo text file
   (`kolibri-curriculum-nodes.txt`), one row per Kolibri L3 curriculum node
   with a grade string and its L4 child ids. Genuinely portable — no Kolibri
   connection needed to read it. Lifted here as
   `loadCurriculumNodesFile()` in `kolibri-source.js`, and the format is
   demonstrated in `fixtures/sample-curriculum-nodes.txt`.

2. **`SKILL_TREE_CACHE`** — built by opening **Kolibri's own SQLite database
   file directly** (`~/.kolibri/db.sqlite3`) with `better-sqlite3`, read-only,
   and querying its `content_contentnode` table filtered to a **hardcoded
   Kolibri channel_id** (the Khan Academy channel), resolving each L4 node's
   exercises via `lft`/`rght` nested-set range containment. This is
   documented in full in the seam investigation
   (`docs/Arcademy Claude/specs/frontier-run-extraction-seam-investigation.md`
   in the Arcademy repo, §B.4): **it is filesystem-level access to Kolibri's
   private database, not an HTTP API call.**

## Why this repo doesn't reproduce #2

Two reasons, both hard rules for this extraction:

- The channel_id is an environment-specific literal. Per the seam
  investigation's cleanliness flags, embedding it directly in lifted code
  would be exactly the kind of hardcoded environment constant a public repo
  must not carry — it becomes config (`KOLIBRI_CHANNEL_ID`), not a literal.
- More fundamentally: **this dependency is bigger than "call Kolibri's API."**
  A standalone Frontier Run service that wants to build/refresh its own pool
  needs either (a) to run co-located with a Kolibri install and read its
  SQLite file directly, exactly as Arcademy does, or (b) a real design for a
  narrower, safer way to get the same curriculum→exercise mapping (a Kolibri
  export step, a read-only API Kolibri exposes, etc.). Neither is a small
  wrapper function — it's an open architectural question the seam
  investigation flags explicitly as the extraction's biggest unresolved
  dependency, and Scope A does not attempt to resolve it.

## What this repo has instead

- `.env.example` documents `KOLIBRI_DB_PATH` and `KOLIBRI_CHANNEL_ID` as the
  config a real implementation would read.
- `kolibri-source.js` exports `loadCurriculumSource()`, the one function
  `../pool/build.js` calls. By default (`FRONTIER_USE_FIXTURE_POOL=1`, the
  default) it returns the small synthetic fixture in `fixtures/` so the pool
  builder is runnable and its output inspectable without a live Kolibri
  install. Its `loadSkillTreeCacheFromKolibri()` stub throws a clear
  "not implemented" error if fixture mode is turned off — a later phase
  implements the real read (or the narrower alternative) there.
- `fixtures/sample-curriculum-nodes.txt` and
  `fixtures/sample-skill-tree-cache.json` demonstrate the exact shape both
  inputs have, with invented (not real Kolibri) content_ids and titles.

## For the later phase implementing this for real

Read the seam investigation's §B.4 and §A.3 (boot-sequence entanglement) —
in Arcademy, `SKILL_TREE_CACHE` is built as a top-level `const` at module
load time and will crash the whole process if the Kolibri DB is missing or
malformed, with no lazy/degraded fallback. Don't reproduce that failure mode
by accident; `loadSkillTreeCacheFromKolibri()`'s caller in this repo
(`loadCurriculumSource()`) already isolates it behind a function call rather
than a module-load-time side effect, which is a better starting point.
