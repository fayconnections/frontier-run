# Extraction manifest

This document is the line referenced everywhere else in this repo as
"see docs/EXTRACTION.md": which files are **regenerated from Arcademy** on
every re-extraction pass (safe to overwrite, in fact expected to be
overwritten — hand edits to them will be silently lost), and which are
**repo-native** (created here, carry this repo's own history, and a
re-extraction must never touch them).

Source of truth for the lift: `~/arcademy/server.js` (read-only, verified
live on 2026-08-15) and `~/arcademy/frontier-topic-results.js`. Cross-checked
against `docs/Arcademy Claude/specs/frontier-run-extraction-seam-investigation.md`
in the Arcademy repo — every disagreement found between that doc and live
source is called out below, live wins per this extraction's instructions.

This pass is **Scope A**: the adaptive engine + data layer only, lifted as
legible source. No player UI, no real Kolibri connection, no real auth —
those are documented stubs, not implementations. See each stub's own README
for what a later phase needs to build.

---

## (a) LIFTED — regenerated from Arcademy on every re-extraction

| File | Arcademy source | What it is |
|---|---|---|
| `src/engine/constants.js` | `server.js:1966-1982` (`classifySubtopic`), `1984-2000` (`GRADE_TO_LEVEL`), `2114-2123` (`TOPIC_CHAIN`), `2164-2165` (`FRONTIER_QUESTIONS_PER_TOPIC`, `FRONTIER_CEILING_CONFIRM_COUNT`), `2315-2324` (`TOPIC_TO_NODE_TITLE`) | Topic classification, difficulty mapping, topic order/ranges |
| `src/engine/runState.js` | `server.js:2326` | The in-memory per-run registry (`FRONTIER_RUN_STATE`) |
| `src/engine/selection.js` | `server.js:2407-2481` (`spiralFrom`, `pickNextExercise`, `reconcileLevel`, `FRONTIER_LEVEL_ASSERT`, `assertServedLevelHonest`) | Which exercise gets served next, and the honesty tripwire |
| `src/engine/progression.js` | `server.js:2139-2160` (`deriveTopicCeilings`), `2191-2193` (`clampToTopicRange`), `2328-2383` (`getStartingLevel`), `2385-2405` (`computeModalLevel`), `2483-2522` (`advanceToNextTopic`) | Where a run starts, how it moves between topics |
| `src/engine/processAnswer.js` | `server.js:2551-2692` | The core per-answer state machine |
| `src/data/schema.sql` | `server.js:245-331` (base `CREATE TABLE`s) + `server.js:402-590` (all `ALTER TABLE` migrations touching these 5 tables), composed into one current shape | `frontier_pool`, `frontier_runs`, `frontier_attempts`, `frontier_topic_results`, `app_settings` |
| `src/data/accessors.js` | `server.js:2180-2189` (`getPriorTopicLevel`), `2199-2313` (10 behavior-lever getters), `2524-2549` (`persistAnswerIncremental`) | Every frontier_* DB read/write the engine calls |
| `src/pool/build.js` | `server.js:2002-2054` (`buildFrontierPool`, `loadFrontierPool`) | Pool classification/insert algorithm — **input boundary stubbed**, see (a-note) below |
| `src/results/frontier-topic-results.js` | `frontier-topic-results.js` (whole file, unchanged) | Pure end-of-run topic-result merge — already standalone in the source |

**(a-note) `src/pool/build.js` is a partial lift.** The classification/insert
algorithm is verbatim. Its two inputs (`CURRICULUM_NODES`, `SKILL_TREE_CACHE`)
are NOT lifted as a live Kolibri-DB read — see `src/pool/kolibri-source.md`
for why (short version: the real input is a direct SQLite read of Kolibri's
own database with a hardcoded channel_id — a bigger, environment-specific
dependency the hard rules for this extraction require replacing with config,
not copying in). `src/pool/kolibri-source.js`'s `loadCurriculumSource()` is
the repo-native seam this lift calls through instead.

### Functions/constants pulled in beyond the literal instruction list, and why

The task's "what to lift" list named 8 functions
(`getStartingLevel, computeModalLevel, spiralFrom, pickNextExercise,
reconcileLevel, advanceToNextTopic, processAnswer, deriveTopicCeilings`) plus
4 constants. Reading the live source to lift `processAnswer` legibly required
also pulling in:

- **`FRONTIER_RUN_STATE`** (`runState.js`) — `processAnswer`'s exact
  live signature is `processAnswer(userId, correct, response_ms, skipped)`;
  `state` is looked up from this registry by `userId`, not passed as a
  parameter. Omitting it would mean either misrepresenting the function's
  real signature or inventing a different one — this lift does neither.
- **`assertServedLevelHonest` / `FRONTIER_LEVEL_ASSERT`** (`selection.js`) —
  called directly by `processAnswer` on every answer.
- **`clampToTopicRange`** (`progression.js`) — a 3-line pure helper both
  `getStartingLevel` and `advanceToNextTopic` call.
- **`getPriorTopicLevel`** and the **ten `app_settings` getters**
  (`accessors.js`) — `getStartingLevel`, `advanceToNextTopic`, and
  `processAnswer` all read run-state fields (`state.progressionMode`,
  `state.budgetPerTopic`, `state.skipFree`, etc.) that are frozen from these
  getters at run start. The getters themselves are small, secret-free,
  fail-safe DB reads — leaving them out would make the lifted functions
  reference fields with no visible origin.
- **`persistAnswerIncremental`** (`accessors.js`) — see the corrected finding
  below; `processAnswer` calls this directly, so it is not a pure function.

None of these expand the *scope* (no reward/token/Kolibri/auth code was
pulled in) — they're the actual dependency graph of the 8 named functions,
made visible rather than silently omitted.

---

## (b) REPO-NATIVE — created here, never overwritten by re-extraction

| File | Why it exists |
|---|---|
| `README.md`, `LICENSE`, `.gitignore`, `package.json` | Repo identity, from the skeleton commit |
| `.env.example` | Config placeholders for the stubbed boundaries |
| `.scrub-secrets.local.example`, `scripts/scrub-patterns.txt`, `scripts/scrub.sh` | The scrub safety rail, from the skeleton commit |
| `scripts/sync-from-arcademy.sh` | Updated this pass — see below |
| `docs/EXTRACTION.md` | This file |
| `src/README.md` | Guided tour of `src/` |
| `src/pool/state.js` | Module-split glue: a shared mutable pool reference so `engine/` and `pool/` agree on "the current pool" without a circular import (server.js has this as one closure-scoped `let`, which doesn't translate directly across files) |
| `src/pool/kolibri-source.js`, `src/pool/kolibri-source.md` | The stubbed Kolibri-DB pool-source boundary |
| `src/data/db.js` | New glue: opens a local SQLite connection against `schema.sql`. No equivalent standalone file exists in Arcademy (it opens `db` inline near the top of `server.js`) |
| `src/serving/README.md` | Documents, does not implement, the Kolibri exercise-serving chain |
| `src/auth/README.md`, `src/auth/identity.stub.js` | Documents, does not implement, identity/session |
| `public/README.md` | Documents why no player UI was lifted |
| `fixtures/sample-curriculum-nodes.txt`, `fixtures/sample-skill-tree-cache.json` | Small synthetic data so `pool/build.js` is runnable without a live Kolibri install — NOT copied from Arcademy's real curriculum file; content_ids/titles are invented |

**`scripts/sync-from-arcademy.sh`** moved from a pure stub to a guarded,
non-executing plan this pass: it now names the real file list (mirroring the
table in section (a) above) as what it will copy + scrub on a future
re-extraction, but still refuses to run (`exit 1`) until that copy logic is
actually written. Re-run `git log` on this file over time to see that
evolution rather than assuming it's wired up — it isn't yet.

---

## Corrections found by reading live source (live wins over the seam doc)

1. **`processAnswer` is not a pure/in-memory-only function.** It calls
   `persistAnswerIncremental` (`server.js:2689`, lifted to
   `data/accessors.js`) on every single answer — a real `db.transaction()`
   write (one `frontier_attempts` INSERT + one `frontier_runs` resume-columns
   UPDATE). The prior seam investigation described `processAnswer` primarily
   as "the core ±1 state machine on `state.targetLevel`," which is accurate
   but incomplete — it undersells that this function has a hard database
   dependency, not just a state-mutation one. Corrected here; see
   `processAnswer.js`'s own inline comment at the call site.
2. **`FRONTIER_QUESTIONS_PER_TOPIC` is vestigial.** Confirmed via grep
   against live `server.js`: this constant (`2164`) is referenced only in
   comments now, not in any live budget check — `processAnswer` checks
   `state.question_count >= state.budgetPerTopic`, where `budgetPerTopic` is
   frozen per-run from the `app_settings`-backed `getBudgetPerTopic()`
   getter, whose own fallback default (10) merely duplicates this constant's
   value rather than reading it. Flagged in `constants.js`'s own comment so
   a reader hunting for "where's the budget actually enforced" isn't
   misdirected.
3. **`getStartingLevel` no longer reads `self_reported_grade`.** The live
   source's own comment on this function says so explicitly ("self_reported_grade
   is no longer read anywhere in this function") — the old grade-based
   warm-floor fallback was removed; warm-floor's first-run behavior is now
   identical to floor's (topic min). This is a refinement of, not a
   contradiction of, the prior seam investigation (which noted
   `self_reported_grade` as "read at run start" — true at the `/start` route
   level, just not inside this specific function).

No other drift was found in the specific line ranges this lift touched.
Line numbers for the exact functions/constants above were re-verified
against live `server.js` on 2026-08-15 (see the grep commands' output this
session, not re-transcribed here).

---

## Explicitly NOT lifted in Scope A (deferred, not forgotten)

- **`persistFrontierRunTx` / `awardFrontierRunTx`** (`server.js:3532`,
  `3635`) — end-of-run persistence and the reward path (tokens,
  `skill_progress`, cooldown). Not in the task's lift list; the reward path
  specifically is Arcademy's token economy, explicitly flagged in the seam
  investigation as something to stub for any standalone demo, not carry
  over.
- **`getWeakestNode` / `findNodeIdForTopic`** (`server.js:2701`, `2715`) —
  the "which node should this student review" recommendation, part of the
  reward/results path above, not the CAT engine itself. (`TOPIC_TO_NODE_TITLE`
  was lifted anyway — see its own comment in `constants.js` for why.)
- **`checkTimeout`** (`server.js:2694`) — inactivity-timeout housekeeping,
  a run-lifecycle/session concern, not adaptive logic.
- **`frontier_pool_archives` table** — admin pool-editor undo history, admin
  tooling, out of scope for the engine/data-layer lift.
- **The three `frontier_*` columns Arcademy adds to its own `users` table**
  (`frontier_start_override`, `frontier_last_run_id`, `frontier_tour_done`)
  — they live on an external identity table this repo doesn't define; see
  `src/auth/README.md`.
- **The full Kolibri serving chain, the front-end, and real auth** — per the
  task's explicit scope boundary; see `src/serving/README.md`,
  `public/README.md`, and `src/auth/README.md`.

---

## Cleanliness verification for this pass

Per the hard rules, before writing anything derived from `server.js`'s
Frontier sections, the surrounding code was checked for the specific
secrets/credentials/PII the seam investigation already flagged elsewhere in
`server.js` (hardcoded session secret, Kolibri admin credentials, the
Kolibri facility ID, the hardcoded owner seed email/password). **None of
those appear in, or are reachable from, any of the functions/constants
listed in section (a)** — they live in unrelated auth/Kolibri-account code
paths this extraction never touches. `scripts/scrub.sh` was also run across
every file in this commit as a second, independent check (see the commit
message / session report for its output).
