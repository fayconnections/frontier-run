// LIFTED from arcademy/server.js (server.js:2326). Re-pulled verbatim on
// re-extraction — see docs/EXTRACTION.md.
//
// The live in-memory run registry: one entry per active run, keyed by
// userId. processAnswer() (and, in the source, every /api/frontier-run/*
// route) reads/writes FRONTIER_RUN_STATE[userId] directly.
//
// This is exactly what it looks like in server.js — a plain object, no
// persistence, no clustering, one Node process only. Nothing here decides
// what a valid userId is; that's the identity/session boundary documented in
// src/auth/README.md, which this repo deliberately does not implement yet.
// Nothing here populates an entry either — that's Arcademy's
// `/api/frontier-run/start` route (server.js, not lifted — see
// src/serving/README.md), which builds the FrontierRunState-shaped object
// documented in ./processAnswer.js's header comment and assigns it here.
const FRONTIER_RUN_STATE = {};

module.exports = { FRONTIER_RUN_STATE };
