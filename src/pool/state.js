// REPO-NATIVE — created for this repo, not lifted from Arcademy, never
// overwritten by re-extraction (see docs/EXTRACTION.md).
//
// In arcademy/server.js the live in-memory pool is a single top-level
// `let FRONTIER_POOL`, reassigned by loadFrontierPool() and read directly by
// every CAT-engine function in the same file. Splitting that file into
// modules means something has to hold that mutable reference so
// ../engine/selection.js and ../pool/build.js agree on "the current pool"
// without a circular import between them — this is that something. It is
// glue for the module split, not new logic: `poolState.pool` is exactly
// `FRONTIER_POOL` from the source, just reachable from more than one file.
const poolState = {
  pool: {}, // { [topic]: { [level]: [content_id, ...] } } — see ../pool/build.js loadFrontierPool()
};

module.exports = { poolState };
