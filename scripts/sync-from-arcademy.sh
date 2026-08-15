#!/usr/bin/env bash
# sync-from-arcademy.sh — STUB. Not implemented yet.
#
# Future job of this script (once the extraction's "clean-core" file set is
# defined — see docs/Arcademy Claude/specs/frontier-run-extraction-seam-
# investigation.md in the Arcademy repo for the boundary analysis this will
# be based on):
#
#   1. Copy a DEFINED, EXPLICIT list of "clean-core" Frontier Run files out
#      of ~/arcademy into this repo (source paths TBD — see TODO below).
#   2. Run scripts/scrub.sh against every copied file.
#   3. If scrub.sh exits nonzero (ANY suspicious match), REFUSE to proceed —
#      do not stage, do not commit, print the scrub output, and exit
#      nonzero. A human must clear the flagged content (or add a vetted
#      literal to .scrub-secrets.local / adjust scrub-patterns.txt) and
#      re-run before this script may continue.
#   4. Only stage/commit the synced files if scrub.sh passed clean.
#
# This script intentionally does NOT run any of that yet. It exists as a
# placeholder so the sync + scrub-gate shape is visible in the repo from
# day one, before the file-by-file extraction work happens.
#
# TODO(extraction): define the clean-core file list here once the boundary
# investigation's "keep" column is finalized (auth-seam replacement, the
# frontier_* schema/functions, a new minimal player, etc. — NOT a lift of
# server.js or skill-tree.html wholesale). Nothing is copied by this stub.

set -euo pipefail

echo "sync-from-arcademy.sh: STUB — not implemented. No files copied." >&2
echo "See the TODO block at the top of this script." >&2
exit 1
