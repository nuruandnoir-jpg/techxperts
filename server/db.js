import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT NOT NULL CHECK (role IN ('client', 'developer', 'admin')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS developer_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline       TEXT NOT NULL DEFAULT '',
  bio            TEXT NOT NULL DEFAULT '',
  skills         TEXT NOT NULL DEFAULT '[]',
  categories     TEXT NOT NULL DEFAULT '[]',
  hourly_rate    INTEGER NOT NULL DEFAULT 50,
  availability   TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'offline')),
  rating_total   INTEGER NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       INTEGER NOT NULL REFERENCES users(id),
  developer_id    INTEGER REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  urgency         TEXT NOT NULL DEFAULT 'standard' CHECK (urgency IN ('standard', 'priority', 'emergency')),
  skills          TEXT NOT NULL DEFAULT '[]',
  budget          INTEGER,
  estimate_hours  INTEGER,
  team_size       INTEGER NOT NULL DEFAULT 1 CHECK (team_size BETWEEN 1 AND 5),
  deadline        TEXT,
  ai_summary      TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'assigned', 'in_progress', 'review', 'completed', 'cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Developers on a job's team. requests.developer_id is the team lead.
CREATE TABLE IF NOT EXISTS request_team (
  request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  developer_id  INTEGER NOT NULL REFERENCES users(id),
  joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (request_id, developer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id   INTEGER REFERENCES users(id),
  kind        TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'event')),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  request_id  INTEGER PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id);
CREATE INDEX IF NOT EXISTS idx_requests_developer ON requests(developer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_team_developer ON request_team(developer_id);
`;

// Brings databases created before team support up to date.
function migrate(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(requests)').all().map((c) => c.name));
  if (!columns.has('team_size')) db.exec('ALTER TABLE requests ADD COLUMN team_size INTEGER NOT NULL DEFAULT 1');
  if (!columns.has('deadline')) db.exec('ALTER TABLE requests ADD COLUMN deadline TEXT');
  db.exec('INSERT OR IGNORE INTO request_team (request_id, developer_id) SELECT id, developer_id FROM requests WHERE developer_id IS NOT NULL');
}

export function openDatabase(dbPath = process.env.DB_PATH || 'data/techxperts.db') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Runs fn inside a transaction, rolling back if it throws. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
