# src/ — guided tour

REPO-NATIVE, never overwritten by re-extraction (see `../docs/EXTRACTION.md`
for the full lifted-vs-repo-native manifest).

Scope A of this extraction lifted the **adaptive engine and data layer**
only — a self-contained placement-test algorithm, readable and (with the
included fixtures) runnable in isolation, with no player UI, no real
Kolibri connection, and no real auth wired up yet. Start here if you want to
understand how the adaptive walk actually works; start in
`engine/processAnswer.js` specifically if you want the one function that
ties it all together.

```
engine/
  constants.js       Topic order/ranges, grade→level map, topic classifier.
                      Start here for "what are the eight topics and how are
                      exercises leveled."
  runState.js         The in-memory per-run registry (FRONTIER_RUN_STATE).
  selection.js        Which exercise gets served next: spiralFrom,
                      pickNextExercise, reconcileLevel, and the dev-only
                      honesty tripwire.
  progression.js       Where a run starts and how it moves between topics:
                      getStartingLevel, computeModalLevel,
                      advanceToNextTopic, deriveTopicCeilings.
  processAnswer.js     THE core state machine — one call per answer. Read
                      this file's header comment for the full shape of the
                      `state` object it expects; that shape is documented
                      there because the code that builds it (Arcademy's
                      route handler) isn't lifted.

pool/
  build.js            Classifies curriculum exercises into (topic, level)
                      buckets and loads them into memory. Runnable today
                      against the fixtures in ../fixtures/.
  state.js            Tiny mutable container so engine/ and pool/ agree on
                      "the current pool" without a circular import — see its
                      own header comment.
  kolibri-source.js /
  kolibri-source.md    The stubbed boundary: real pool data comes from a live
                      Kolibri SQLite database, which this repo doesn't have.
                      Read the .md first.

data/
  schema.sql          The five frontier_* / app_settings tables this system
                      uses, as one composed current-shape file (Arcademy's
                      version is a base CREATE TABLE plus ~25 accumulated
                      ALTER TABLEs — collapsed here into one snapshot).
  db.js               Opens a local SQLite file against schema.sql. New glue
                      code, not present as a discrete file in Arcademy.
  accessors.js        Every frontier_* database read/write the engine needs:
                      prior-level lookups, the ten behavior-lever getters,
                      and the per-answer incremental persist that makes a
                      run resumable.

results/
  frontier-topic-results.js   The one piece of this system that was already
                      a standalone module in Arcademy, unchanged here.

serving/README.md     Documents (does not implement) how a content_id
                      becomes a rendered exercise. Read before assuming the
                      engine can serve a real exercise today — it can't yet.

auth/README.md,
auth/identity.stub.js  Documents (does not implement) how a student's
                      identity gets into `userId`. No real login exists.
```

## What this can and can't do today

**Can:** run `pool/build.js`'s classification algorithm against the
fixtures and inspect the resulting pool; read `engine/processAnswer.js` and
its dependencies end-to-end as a complete, self-consistent adaptive-testing
algorithm; open `data/schema.sql` to see the exact tables a real deployment
needs. `npm test` runs a regression suite (`test/engine.fixture.test.js`)
that drives the engine through a full run against the fixtures — that's the
fastest way to confirm "does the lift still behave correctly" after a
re-extraction.

**Can't:** serve a real exercise to a real student, or authenticate anyone
— those are `serving/` and `auth/`'s documented-but-not-built later phases.
There is no server listening on any port in this repo yet.
