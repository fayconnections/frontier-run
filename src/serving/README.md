# Kolibri serving path — not implemented here (later phase)

REPO-NATIVE, never overwritten by re-extraction (see `docs/EXTRACTION.md`).

This directory intentionally contains no code. It documents the boundary a
later phase implements: how a `content_id` picked by
`../engine/processAnswer.js` actually gets turned into a rendered Perseus
exercise a student can answer.

## What Arcademy does (full trace: seam investigation §B.1)

Not lifted, summarized here from
`docs/Arcademy Claude/specs/frontier-run-extraction-seam-investigation.md`
(Arcademy repo) — read that document for exact file:line citations. In
short, the chain is:

1. Client has `content_id` + `node_id` (the engine supplies both on every
   answer response).
2. An iframe is pointed at `/exercise-launcher/{node_id}?cid={content_id}`.
3. That route requires the student to already have a **linked Kolibri
   facility user** (a `kolibri_user_id`/`kolibri_password` pair stored
   against their Arcademy account), logs into Kolibri **as that specific
   student**, forwards Kolibri's session cookies to the browser, and
   redirects to `/en/learn/#/topics/c/{contentId}`.
4. A same-origin HTML intercept fetches Kolibri's real page, injects a
   small bridge script, and serves it.
5. From there, Kolibri's own Vue SPA renders the actual Perseus exercise via
   a same-origin reverse proxy — **Arcademy never touches Perseus rendering
   directly**; it only makes Kolibri's own app reachable same-origin.
6. The injected bridge script watches the DOM for Kolibri's own "Check"/
   "Next" button state and posts `correct`/`incorrect` events back up —
   **there is no server-side check against Kolibri's own mastery log**;
   correctness is client-asserted.

## Why none of this is lifted

Three reasons, all from the seam investigation:

- **It isn't a narrow API.** There's no "give me this one exercise" endpoint
  to extract — the mechanism is "make Kolibri's entire student-facing SPA
  reachable same-origin, at the right URL fragment, with the right cookies."
  A standalone service inherits essentially all of steps 2-5 as a unit, not
  a trimmed subset.
- **The proxy scope is broader than exercise rendering** (seam investigation
  §B.3, an explicit STOP CONDITION item): Arcademy's reverse proxy also
  same-origin-exposes Kolibri's own auth API, facility data, and its admin
  task queue. That's a security question for whoever builds this later, not
  something to silently narrow-and-ship here.
- **It requires a per-student Kolibri account already provisioned** — this
  standalone repo has no auth system yet (see `../auth/README.md`), so there
  is no "student" for a real implementation to log into Kolibri as.

## What a later phase needs to design here

- How a minimal standalone identity (see `../auth/README.md`) maps to a
  Kolibri facility user — or whether it needs to at all, if the standalone
  service ends up rendering exercises some other way.
- A **narrowed** proxy surface — not Arcademy's full path list — scoped to
  only what rendering one exercise requires, with the admin/facility/task
  APIs excluded or separately gated.
- Whether to keep the client-asserted-correctness model or add a
  server-side check.

None of this is code yet. `../engine/processAnswer.js` and
`../engine/selection.js` only need a `content_id` in and a
`correct`/`response_ms` back — whatever this phase builds just needs to
produce that shape.
