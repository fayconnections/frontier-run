// LIFTED verbatim from arcademy/frontier-topic-results.js. Re-pulled on
// re-extraction — see docs/EXTRACTION.md. This file needed ZERO changes to
// move here — it was already the one piece of Frontier Run's logic written
// as a standalone module (its own original header comment, preserved below,
// says exactly that).
//
// Pure merge logic for the Frontier Run ABA/PT data layer (see
// docs/Arcademy Claude/specs/frontier-run-aba-pt-data-layer-spec.md, D5).
// Extracted to its own module — unlike the rest of server.js's frontier
// logic, this touches no db/globals, so it's independently requireable and
// testable without booting the whole app.

// Merges the one in-progress topic (if any) into state.topic_results,
// producing the map every downstream consumer (the per-topic `<topic>_level`
// columns, the skill_progress backfill, the client-facing results object,
// and the frontier_topic_results rows) should read instead of the raw
// state.topic_results.
//
// A topic already resolved by a ceiling/budget/pool/regression event
// (../engine/progression.js's advanceToNextTopic / the regression sentinel)
// already has a real entry — including the -1 "gap" sentinel for
// regression, which must survive untouched. The one topic that never gets
// such an entry is whichever topic the run is sitting on when an end-state
// fires with no resolving event yet — reconcileLevel (../engine/selection.js)
// guarantees state.level is the honest last-served bucket for that topic at
// all times, so (state.topic, state.level) is a trustworthy source for it.
//
// Three gates, each load-bearing:
//   - state.phase === 'main' — excludes calibration; counting_cardinality
//     never gets an entry (it has no <topic>_level column to begin with).
//   - finalTopicResults[state.topic] === undefined — never overwrites an
//     already-resolved topic's real value.
//   - inProgressAttempts >= 1 — a topic merely transitioned into (reconcile
//     already ran, state.level is defined) but never actually answered has
//     nothing to summarize; NULL/absent is correct for it, same as a topic
//     genuinely never reached.
function computeFinalTopicResults(state) {
  const finalTopicResults = { ...state.topic_results };
  const inProgressAttempts = state.attempts.filter(a => a.topic === state.topic).length;

  if (
    state.phase === 'main' &&
    finalTopicResults[state.topic] === undefined &&
    inProgressAttempts >= 1
  ) {
    finalTopicResults[state.topic] = state.level;
  }

  return finalTopicResults;
}

module.exports = { computeFinalTopicResults };
