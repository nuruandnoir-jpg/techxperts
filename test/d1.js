// Minimal in-memory stand-in for Cloudflare D1, built on node:sqlite, so the API
// can be tested without wrangler. Covers the parts of the D1 API the app uses.
import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }

  #exec() {
    const s = this.db.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql) || /^\s*SELECT/i.test(this.sql)) {
      return { results: s.all(...this.args), meta: { changes: 0 } };
    }
    const r = s.run(...this.args);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }

  async first() {
    return this.#exec().results[0] ?? null;
  }

  async all() {
    return this.#exec();
  }

  async run() {
    return this.#exec();
  }

  runSync() {
    return this.#exec();
  }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  return {
    prepare: (sql) => new Statement(db, sql),
    // Like D1, a batch runs as a single transaction.
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => s.runSync());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
