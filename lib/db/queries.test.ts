/**
 * The two pieces of query-layer logic no route test reaches: join-code
 * collision handling (§6.2.1) and monotonic stage advance (§6.2.2).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './index';
import { advanceStage, createRoom, createSession, findRoomByJoinCode, insertEvents } from './queries';
import * as ids from './ids';
import type { Event } from '@/lib/domain/types';

function fresh() {
  return openDatabase(':memory:');
}

afterEach(() => vi.restoreAllMocks());

describe('createRoom', () => {
  it('mints a four-digit code with no leading zero, readable aloud (§6.2.1)', () => {
    const db = fresh();
    for (let i = 0; i < 50; i += 1) {
      expect(createRoom(db).join_code).toMatch(/^[1-9]\d{3}$/);
    }
    db.close();
  });

  it('regenerates on collision rather than failing the second room', () => {
    const db = fresh();
    // Two rooms want 4712; the UNIQUE index is what surfaces it, and the third
    // draw is what resolves it.
    vi.spyOn(ids, 'newJoinCode')
      .mockReturnValueOnce('4712')
      .mockReturnValueOnce('4712')
      .mockReturnValue('5199');

    const first = createRoom(db);
    const second = createRoom(db);

    expect(first.join_code).toBe('4712');
    expect(second.join_code).toBe('5199');
    expect(findRoomByJoinCode('4712', db)?.id).toBe(first.id);
    db.close();
  });

  it('fails loudly rather than spinning when the code space is exhausted', () => {
    const db = fresh();
    vi.spyOn(ids, 'newJoinCode').mockReturnValue('4712');

    createRoom(db);
    expect(() => createRoom(db)).toThrow(/unique join code/);
    db.close();
  });
});

describe('advanceStage', () => {
  it('moves forward and never back (§6.2.2)', () => {
    const db = fresh();
    const room = createRoom(db);
    const session = createSession(room.id, db);
    const stage = () =>
      (db.prepare('SELECT stage FROM sessions WHERE id = ?').get(session.id) as { stage: string })
        .stage;

    expect(stage()).toBe('s1');

    advanceStage(session.id, 's3', db);
    expect(stage()).toBe('s3');

    // A retried batch arriving late must not walk the console backwards.
    advanceStage(session.id, 's2', db);
    expect(stage()).toBe('s3');

    advanceStage(session.id, 's5', db);
    expect(stage()).toBe('s5');
    db.close();
  });

  it('is a no-op for an unknown session', () => {
    const db = fresh();
    expect(() => advanceStage('nobody', 's4', db)).not.toThrow();
    db.close();
  });
});

describe('insertEvents', () => {
  it('preserves batch order, which is cut order (§10)', () => {
    const db = fresh();
    const room = createRoom(db);
    const session = createSession(room.id, db);
    // All at the same millisecond: `id` is the only tiebreak available.
    const events: Event[] = [
      { t: 100, type: 'hours.change', activityId: 'leisure', from: 3, to: 2 },
      { t: 100, type: 'hours.change', activityId: 'social', from: 2, to: 1 },
      { t: 100, type: 'hours.change', activityId: 'chores', from: 1, to: 0 },
    ];

    expect(insertEvents(session.id, events, db)).toBe(3);
    const order = db
      .prepare('SELECT activity_id FROM events WHERE session_id = ? ORDER BY t, id')
      .all(session.id)
      .map((row) => (row as { activity_id: string }).activity_id);
    expect(order).toEqual(['leisure', 'social', 'chores']);
    db.close();
  });

  it('writes an empty batch without touching the file', () => {
    const db = fresh();
    expect(insertEvents('anyone', [], db)).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
    db.close();
  });
});
