import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { migrate } from './migrate';

/**
 * The datastore is a single SQLite file (see the plan's Decisions table), which
 * is also why the system is self-hosted rather than deployed to an edge runtime.
 */

/**
 * Read at call time, not at module load, so a test can point the process at an
 * in-memory file before the first request opens the handle.
 *
 * The default is built with `join(process.cwd(), …)` rather than `resolve` on a
 * variable: a path the bundler cannot statically scope makes it trace the whole
 * project into the server output.
 */
export function databasePath(): string {
  return process.env.HPW_DB_PATH ?? join(process.cwd(), 'data', 'hours.sqlite');
}

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
  handle ??= openDatabase(databasePath());
  return handle;
}

export function closeDatabase(): void {
  handle?.close();
  handle = null;
}
