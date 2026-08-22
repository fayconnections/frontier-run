# Identity / auth — not implemented here (later phase)

REPO-NATIVE, never overwritten by re-extraction (see `docs/EXTRACTION.md`).

There is no real authentication in this repo. This directory documents the
boundary and provides one stub so the engine's expectations are visible in
code, not just prose.

## What Arcademy does (full trace: seam investigation §A.1)

Not lifted, summarized here — see the seam investigation
(`docs/Arcademy Claude/specs/frontier-run-extraction-seam-investigation.md`
in the Arcademy repo) for exact citations. Every `/api/frontier-run/*` route
checks `req.session.userId`, an integer set at login and backed by a full
`users` table (bcrypt password, approval gate, ban check) with a session
store pointed directly at Arcademy's main database. `../engine/runState.js`'s
`FRONTIER_RUN_STATE[userId]` and `../engine/progression.js`'s
`getStartingLevel()`/`getPriorTopicLevel()` calls all key on that same
integer.

## What a minimal standalone front door needs to provide

Per the extraction goal (a "just enter a name, maybe a shared password"
front door, no full user system): whatever mints identity needs to produce
**an integer (or stable string) `userId`** that:

1. Is stable across a student's visits (so retake/prior-level lookups in
   `../engine/progression.js` work).
2. Exists as a row in whatever table `frontier_runs.user_id` /
   `frontier_attempts.user_id` / `frontier_topic_results.user_id` foreign-key
   against — `../data/schema.sql` deliberately leaves that table undefined;
   it's this phase's to design.
3. Has somewhere to hold the two admin-override fields
   `getStartingLevel()` and the (not-lifted) admin tooling read/write:
   `frontier_start_override`, `frontier_last_run_id` — Arcademy adds these as
   columns on its own `users` table; a standalone identity table needs its
   own equivalent columns, or a documented decision to drop that feature for
   the demo.

## `identity.stub.js`

A single documented function signature — not implemented, throws if called
— so `../engine/`'s expectation ("a userId exists, resolvable to a row that
can carry the two override fields above") is visible in code a reader can
open, not only in this README.
