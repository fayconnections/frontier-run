// REPO-NATIVE — created for this repo, not lifted from Arcademy, never
// overwritten by re-extraction (see docs/EXTRACTION.md).
//
// Arcademy opens its single `arcademy.db` (better-sqlite3) once near the top
// of server.js and every frontier_* function in that file closes over that
// one shared `db` constant. There is no equivalent standalone "open the
// frontier database" module there to lift — this is new glue, written to
// give the lifted functions in ../engine/ and ../pool/ something concrete to
// call `.prepare()` on outside of server.js's boot sequence.
//
// Deliberately minimal: opens (creating if needed) a SQLite file at
// FRONTIER_DB_PATH (see .env.example), applies schema.sql, and returns the
// connection. No migration framework — Arcademy's own approach (base
// CREATE TABLE + try/catch ALTER TABLE per historical change) isn't
// reproduced here because schema.sql already represents that history
// collapsed into one current shape (see schema.sql's own header comment).
//
// This module is intentionally NOT wired into a running server in Scope A —
// nothing in this repo calls an HTTP listener. It exists so the lifted engine
// files are exercise-able (e.g. from a test or a REPL) against a real local
// SQLite file without needing arcademy.db or any Arcademy code.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = process.env.FRONTIER_DB_PATH || path.join(__dirname, '..', '..', 'frontier-run.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  _db.exec(schema);

  return _db;
}

module.exports = { getDb };
