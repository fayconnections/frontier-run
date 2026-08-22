#!/usr/bin/env bash
# sync-from-arcademy.sh — GUARDED PLAN, still non-executing.
#
# This names the real "clean-core" (LIFTED) file list as of the Scope A
# extraction pass (2026-08-15) — see docs/EXTRACTION.md section (a) for the
# authoritative, documented version of this same list with source line
# numbers and rationale. This script is the machine-readable mirror of that
# table; docs/EXTRACTION.md is the human-readable source of truth if the two
# ever disagree.
#
# Future job of this script, once actually wired up:
#   1. For each entry in LIFTED_FILES below, re-derive the file from the
#      current arcademy/server.js (read-only over there — never move/edit/
#      delete anything under ~/arcademy) and write it to this repo's path.
#   2. Run scripts/scrub.sh against every file it just wrote.
#   3. If scrub.sh exits nonzero (ANY suspicious match), REFUSE to proceed —
#      do not stage, do not commit, print the scrub output, and exit
#      nonzero. A human must clear the flagged content (or add a vetted
#      literal to .scrub-secrets.local / adjust scrub-patterns.txt) and
#      re-run before this script may continue.
#   4. Only stage/commit the synced files if scrub.sh passed clean.
#   5. Never touch REPO-NATIVE files (docs/EXTRACTION.md section (b)) —
#      those carry this repo's own history and must survive a re-extraction
#      untouched.
#
# This script intentionally does NOT run any of that yet — re-deriving each
# file automatically (rather than by hand, as this pass did) needs its own
# review before it's trusted to run unattended. It exists so the real file
# list and the scrub-gate shape are both visible and versioned from this
# point forward, not so re-extraction is automated today.

set -euo pipefail

# Mirrors docs/EXTRACTION.md section (a). Keep these two lists in sync by
# hand until this script actually does the copying itself.
LIFTED_FILES=(
  "src/engine/constants.js"
  "src/engine/runState.js"
  "src/engine/selection.js"
  "src/engine/progression.js"
  "src/engine/processAnswer.js"
  "src/data/schema.sql"
  "src/data/accessors.js"
  "src/pool/build.js"
  "src/results/frontier-topic-results.js"
)

echo "sync-from-arcademy.sh: GUARDED — plan only, not wired up yet." >&2
echo "Would re-derive and scrub the following files from ~/arcademy:" >&2
for f in "${LIFTED_FILES[@]}"; do
  echo "  - $f" >&2
done
echo "" >&2
echo "No files were copied or modified. See the header comment in this" >&2
echo "script and docs/EXTRACTION.md for the real plan." >&2
exit 1
