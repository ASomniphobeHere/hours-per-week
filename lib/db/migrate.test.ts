import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDatabase } from './index';
import { SCHEMA_VERSION, migrate, migrations } from './migrate';

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
    expect(db.prepare('SELECT open_stage FROM rooms WHERE id = ?').get('room-1')).toEqual({ open_stage: 0 });

    db.prepare('INSERT INTO events (session_id, t, type, activity_id, from_h, to_h) VALUES (?, ?, ?, ?, ?, ?)')
      .run('sess-1', now, 'hours.change', 'leisure', 3, 1);
    db.prepare('INSERT INTO snapshots (session_id, kind, json, t) VALUES (?, ?, ?, ?)')
      .run('sess-1', 'finish', '{}', now);
    db.prepare('INSERT INTO room_events (room_id, type, t, ready, total, to_stage) VALUES (?, ?, ?, ?, ?, ?)')
      .run('room-1', 'stage.open', now, 23, 40, 2);

    expect(db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 1 });
    db.close();
  });

  /*
   * Plan 25 §The renumber. The reveal moved from s4 to s6 and done from s5 to
   * s7, and `sessions.stage` is a high-water mark, so a database written
   * before the rename holds values that now name different screens. Driven
   * against a database stopped at version 3 rather than against the current
   * one, because the migration is only interesting on rows that predate it.
   */
  it('rewrites stage ids written before the renumber', () => {
    const db = new Database(':memory:');
    for (const step of migrations.filter((m) => m.version <= 3)) db.exec(step.sql());
    db.pragma('user_version = 3');

    const now = Date.now();
    db.prepare('INSERT INTO rooms (id, join_code, created_at) VALUES (?, ?, ?)').run('room-1', '4712', now);
    const insert = db.prepare(
      'INSERT INTO sessions (id, room_id, token, stage, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [id, stage] of [
      ['old-reveal', 's4'],
      ['old-done', 's5'],
      ['editing', 's2'],
    ]) {
      insert.run(id, 'room-1', 'tok', stage, now);
    }

    expect(migrate(db)).toBe(SCHEMA_VERSION);

    const stageOf = (id: string): string =>
      (db.prepare('SELECT stage FROM sessions WHERE id = ?').get(id) as { stage: string }).stage;
    expect(stageOf('old-reveal')).toBe('s6');
    expect(stageOf('old-done')).toBe('s7');
    // Untouched: s1–s3 mean what they always meant.
    expect(stageOf('editing')).toBe('s2');
    db.close();
  });

  /* The log is history and is deliberately not rewritten — an old room's
     *time to fit* must keep measuring from the stage that existed in it. */
  it('leaves events.stage alone', () => {
    const db = new Database(':memory:');
    for (const step of migrations.filter((m) => m.version <= 3)) db.exec(step.sql());
    db.pragma('user_version = 3');

    const now = Date.now();
    db.prepare('INSERT INTO rooms (id, join_code, created_at) VALUES (?, ?, ?)').run('room-1', '4712', now);
    db.prepare('INSERT INTO sessions (id, room_id, token, created_at) VALUES (?, ?, ?, ?)').run('sess-1', 'room-1', 'tok', now);
    db.prepare('INSERT INTO events (session_id, t, type, stage) VALUES (?, ?, ?, ?)').run('sess-1', now, 'stage.enter', 's4');

    migrate(db);

    expect(db.prepare('SELECT stage FROM events').get()).toEqual({ stage: 's4' });
    db.close();
  });

  /*
   * Plan 25 §E.4. The boolean became an ordinal, and both stores holding it
   * are backfilled on the same reading: the old flag only ever opened the
   * reveal, so a room that was open was open to level 2 and every `stage.open`
   * row already written records that press. Driven from version 4, because a
   * backfill is only interesting on rows that predate it.
   */
  it('backfills the gate ordinal from the boolean it replaced', () => {
    const db = new Database(':memory:');
    for (const step of migrations.filter((m) => m.version <= 4)) db.exec(step.sql());
    db.pragma('user_version = 4');

    const now = Date.now();
    const insert = db.prepare(
      'INSERT INTO rooms (id, join_code, stage_open, opened_at, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('opened', '4712', 1, now, now);
    insert.run('shut', '4713', 0, null, now);
    db.prepare('INSERT INTO room_events (room_id, type, t, ready, total) VALUES (?, ?, ?, ?, ?)')
      .run('opened', 'stage.open', now, 23, 40);

    expect(migrate(db)).toBe(SCHEMA_VERSION);

    const levelOf = (id: string): number =>
      (db.prepare('SELECT open_stage FROM rooms WHERE id = ?').get(id) as { open_stage: number })
        .open_stage;
    expect(levelOf('opened')).toBe(2);
    expect(levelOf('shut')).toBe(0);

    // The column it replaced is gone, so nothing can read the old meaning.
    expect(() => db.prepare('SELECT stage_open FROM rooms').get()).toThrow();

    // The room's t = 0 for *time to fit, room* is the `to = 2` row, and an old
    // room's only row has to keep being findable as one.
    expect(db.prepare('SELECT to_stage, ready, total FROM room_events').get()).toEqual({
      to_stage: 2,
      ready: 23,
      total: 40,
    });
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
