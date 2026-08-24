import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate } from './migrate';

/**
 * The datastore is a single SQLite file (see the plan's Decisions table), which
 * is also why the system is self-hosted rather than deployed to an edge runtime.
 */
export const DB_PATH = resolve(process.env.HPW_DB_PATH ?? 'data/hours.sqlite');

let handle: Database.Database | null = null;

/** Opens a file, applies migrations, and returns the handle. Used by tests too. */
export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  // WAL lets the console poll while participants write telemetry.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Opened once per process and reused. */
export function getDatabase(): Database.Database {
  handle ??= openDatabase(DB_PATH);
  return handle;
}

export function closeDatabase(): void {
  handle?.close();
  handle = null;
}
