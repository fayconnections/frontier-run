// REPO-NATIVE stub — never overwritten by re-extraction (see docs/EXTRACTION.md).
// Not implemented. See ./README.md for the full boundary writeup.
//
// This documents the one contract the engine actually needs from identity —
// nothing more. A later phase implements this against whatever "enter a
// name (and maybe a shared password)" front door it builds.

/**
 * Resolve the current request/session to a stable userId the engine can key
 * run state, retake lookups, and admin overrides against.
 *
 * @returns {number|string} a stable identifier, unique per student, that
 *   exists as a row in whatever identity table this phase designs (see
 *   ./README.md point 2-3 for what that row needs to hold).
 */
function getCurrentUserId(/* req */) {
  throw new Error(
    'getCurrentUserId() is not implemented — this is a Scope A stub. ' +
    'See src/auth/README.md.'
  );
}

module.exports = { getCurrentUserId };
