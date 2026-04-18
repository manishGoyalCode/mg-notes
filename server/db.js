const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "tasktracker.db");

// Ensure data directory exists
const fs = require("fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

/**
 * Get the full application state.
 * Returns null if no state has been saved yet.
 */
function getState() {
  const row = db.prepare("SELECT state FROM app_state WHERE id = 1").get();
  if (!row) return null;
  try {
    return JSON.parse(row.state);
  } catch {
    return null;
  }
}

/**
 * Save the full application state (upsert).
 */
function setState(stateObj) {
  const json = JSON.stringify(stateObj);
  db.prepare(`
    INSERT INTO app_state (id, state, updated_at)
    VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `).run(json);
}

module.exports = { getState, setState };
