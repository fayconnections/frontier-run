# Player UI — not built here (later phase)

REPO-NATIVE, never overwritten by re-extraction (see `docs/EXTRACTION.md`).

This directory is intentionally empty of code. Scope A (this extraction
pass) lifted the engine and data layer only — no front-end.

## Why nothing was copied from Arcademy

There is no standalone Frontier Run player page to lift. In Arcademy, the
entire player — overlay shell, mode picker, timer, pause/resume, bridge-event
handling, answer submission — lives inline inside `public/skill-tree.html`, a
single ~6,600-line file that also contains the full skill-tree canvas
renderer and the daily-goals companion UI, with zero external `<link>`/
`<script src>` includes (confirmed in the seam investigation, §Front-end
seam). Even in Frontier mode, that file still runs the regular mode's
daily-goals fetch before hiding it via CSS. There is no clean cut to lift —
extracting it would mean carrying that entanglement along, which
contradicts "don't rebuild the player" for this pass.

## What a later phase builds here

A new, minimal player written against the `../src/engine/` contract
directly — not a lift of `skill-tree.html`. At minimum: a mode picker
(count-up/count-down), a timer, an exercise-embed point (whatever
`../src/serving/README.md`'s later phase produces), and a results screen.
See the seam investigation's "What a minimal standalone player needs to keep
vs. drop" table for the specific carry-over list from the current
implementation.
