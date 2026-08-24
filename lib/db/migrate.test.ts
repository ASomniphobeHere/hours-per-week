import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDatabase } from './index';
import { SCHEMA_VERSION, migrate } from './migrate';

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

describe('schema', () => {
  it('applies to a fresh file', () => {
    const db = openDatabase(':memory:');
    expect(tableNames(db)).toEqual(['events', 'room_events', 'rooms', 'sessions', 'snapshots']);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('is idempotent — a second migrate is a no-op', () => {
    const db = openDatabase(':memory:');
    const before = tableNames(db);
    expect(migrate(db)).toBe(SCHEMA_VERSION);
    expect(tableNames(db)).toEqual(before);
    db.close();
  });

  it('holds a room, a session, an event and a snapshot', () => {
    const db = openDatabase(':memory:');
    const now = Date.now();

    db.prepare('INSERT INTO rooms (id, join_code, created_at) VALUES (?, ?, ?)').run('room-1', '4712', now);
    db.prepare('INSERT INTO sessions (id, room_id, token, created_at) VALUES (?, ?, ?, ?)').run('sess-1', 'room-1', 'tok', now);

    // A session starts at s1 on creation, so inStage sums to total from the
    // first row (§6.2.2).
    expect(db.prepare('SELECT stage FROM sessions WHERE id = ?').get('sess-1')).toEqual({ stage: 's1' });
    expect(db.prepare('SELECT stage_open FROM rooms WHERE id = ?').get('room-1')).toEqual({ stage_open: 0 });

    db.prepare('INSERT INTO events (session_id, t, type, activity_id, from_h, to_h) VALUES (?, ?, ?, ?, ?, ?)')
      .run('sess-1', now, 'hours.change', 'leisure', 3, 1);
    db.prepare('INSERT INTO snapshots (session_id, kind, json, t) VALUES (?, ?, ?, ?)')
      .run('sess-1', 'finish', '{}', now);
    db.prepare('INSERT INTO room_events (room_id, type, t, ready, total) VALUES (?, ?, ?, ?, ?)')
      .run('room-1', 'stage.open', now, 23, 40);

    expect(db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 1 });
    db.close();
  });

  it('rejects an unknown snapshot kind and a duplicate join code', () => {
    const db = openDatabase(':memory:');
    const now = Date.now();
    db.prepare('INSERT INTO rooms (id, join_code, created_at) VALUES (?, ?, ?)').run('room-1', '4712', now);
    db.prepare('INSERT INTO sessions (id, room_id, token, created_at) VALUES (?, ?, ?, ?)').run('sess-1', 'room-1', 'tok', now);

    expect(() =>
      db.prepare('INSERT INTO snapshots (session_id, kind, json, t) VALUES (?, ?, ?, ?)').run('sess-1', 's2', '{}', now),
    ).toThrow();
    expect(() =>
      db.prepare('INSERT INTO rooms (id, join_code, created_at) VALUES (?, ?, ?)').run('room-2', '4712', now),
    ).toThrow();
    db.close();
  });
});
