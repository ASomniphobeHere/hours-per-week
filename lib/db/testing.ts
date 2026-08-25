/**
 * Test harness for anything that reaches the database.
 *
 * Vitest isolates module state per test file, so pointing the process at an
 * in-memory file before the first `getDatabase()` gives each file its own
 * schema-migrated database with no temp files to clean up.
 */

import { closeDatabase, getDatabase } from './index';

export function setupMemoryDatabase(): void {
  process.env.HPW_DB_PATH = ':memory:';
  // Force the handle open now, so a later env change cannot swap it mid-test.
  getDatabase();
}

export function resetDatabase(): void {
  const db = getDatabase();
  db.exec('DELETE FROM room_events; DELETE FROM events; DELETE FROM snapshots; DELETE FROM sessions; DELETE FROM rooms;');
}

export function teardownDatabase(): void {
  closeDatabase();
  delete process.env.HPW_DB_PATH;
}
