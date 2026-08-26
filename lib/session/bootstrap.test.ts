/**
 * Step 2.6 — one session row per participant, however many times they refresh.
 *
 * The second half of this file wires the client's `fetch` straight to the
 * `POST /session` route handler, so "exactly one row" is asserted against the
 * database rather than against a spy. AC 36 is about a row count, and a mock
 * that counts calls cannot fail the way the real thing would.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage, save, type PersistedState } from '@/lib/store/persist';
import { setAnswer } from '@/lib/store/answers';
import { resetDatabase, teardownDatabase, setupMemoryDatabase } from '@/lib/db/testing';

setupMemoryDatabase();

import { ensureSession, resetToNewSession } from './bootstrap';
import type { FetchLike } from './client';
import { POST as createRoomRoute } from '@/app/api/room/route';
import { POST as createSessionRoute } from '@/app/api/session/route';
import { POST as resetRoute } from '@/app/api/session/[id]/reset/route';
import { getDatabase } from '@/lib/db/index';

const PACK = { version: 'v1', fieldIds: ['sleep.wake.wd', 'work.days'] };

function stubFetch(body: unknown, status = 201): FetchLike {
  return vi.fn(async () => Response.json(body, { status }));
}

const CREATED = {
  sessionId: 'sess-1',
  token: 'tok-1',
  packVersion: 'v1',
  packUrl: '/api/pack/v1',
};

beforeEach(() => resetDatabase());
afterAll(() => teardownDatabase());

describe('ensureSession', () => {
  it('creates a session and persists identity when there is nothing stored', async () => {
    const storage = memoryStorage();
    const fetchImpl = stubFetch(CREATED);

    const result = await ensureSession({ storage, pack: PACK, joinCode: '4712', fetchImpl });

    expect(result.created).toBe(true);
    expect(result.packUrl).toBe('/api/pack/v1');
    expect(result.state).toMatchObject({
      sessionId: 'sess-1',
      token: 'tok-1',
      packVersion: 'v1',
      dayType: 'wd',
      stage: 's1',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Written before the participant answers anything (§11: a refresh in the
    // seconds after joining is still a refresh).
    const stored = JSON.parse(storage.getItem('hpw:state:sess-1') ?? 'null') as PersistedState;
    expect(stored.token).toBe('tok-1');
  });

  it('resumes a stored session without calling POST /session (AC 36)', async () => {
    const storage = memoryStorage();
    const fetchImpl = stubFetch(CREATED);
    await ensureSession({ storage, pack: PACK, joinCode: '4712', fetchImpl });

    const second = await ensureSession({ storage, pack: PACK, joinCode: '4712', fetchImpl });
    const third = await ensureSession({ storage, pack: PACK, fetchImpl });

    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(third.state.sessionId).toBe('sess-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('resumes at the furthest stage with answers intact (§5, §11)', async () => {
    const storage = memoryStorage();
    save(storage, {
      sessionId: 'sess-9',
      token: 'tok-9',
      packVersion: 'v1',
      dayType: 'we',
      stage: 's4',
      introSeen: true,
      answers: setAnswer({}, 'sleep.wake.wd', '07:00', 1000),
      authored: {},
    });
    const fetchImpl = stubFetch(CREATED);

    const result = await ensureSession({ storage, pack: PACK, fetchImpl });

    expect(result.created).toBe(false);
    expect(result.state.stage).toBe('s4');
    expect(result.state.dayType).toBe('we');
    expect(result.state.answers['sleep.wake.wd']?.value).toBe('07:00');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the session across a pack change, pruning answers only (§5)', async () => {
    const storage = memoryStorage();
    save(storage, {
      sessionId: 'sess-2',
      token: 'tok-2',
      packVersion: 'v0',
      dayType: 'wd',
      stage: 's4',
      introSeen: true,
      answers: {
        ...setAnswer({}, 'sleep.wake.wd', '07:00', 1000),
        ...setAnswer({}, 'gone.field', 3, 1000),
      },
      authored: {},
    });
    const fetchImpl = stubFetch(CREATED);

    const result = await ensureSession({ storage, pack: PACK, fetchImpl });

    // Identity is room membership, not content: re-minting it here is exactly
    // the duplicate row AC 36 forbids.
    expect(result.created).toBe(false);
    expect(result.state.sessionId).toBe('sess-2');
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(result.packChanged).toBe(true);
    expect(result.dropped).toEqual(['gone.field']);
    expect(Object.keys(result.state.answers)).toEqual(['sleep.wake.wd']);
    // Resume at S1's first unanswered screen (§5).
    expect(result.state.stage).toBe('s1');
  });

  it('throws rather than joining blind when there is no stored session and no code', async () => {
    await expect(
      ensureSession({ storage: memoryStorage(), pack: PACK, fetchImpl: stubFetch(CREATED) }),
    ).rejects.toThrow(/joinCode required/);
  });

  it('does not persist a half-made session when POST /session fails', async () => {
    const storage = memoryStorage();
    const fetchImpl = stubFetch({ error: 'unknown join code' }, 404);

    await expect(
      ensureSession({ storage, pack: PACK, joinCode: '9999', fetchImpl }),
    ).rejects.toThrow();
    expect(storage.getItem('hpw:current')).toBeNull();
  });
});

describe('ensureSession against the real endpoint', () => {
  /** Routes the client's one call to the handler, so the row count is real. */
  const routedFetch: FetchLike = async (url, init) => {
    expect(url).toBe('/api/session');
    return createSessionRoute(
      new Request(`http://localhost${url}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: init?.body as string,
      }),
    );
  };

  it('creates exactly one row across repeated boots (AC 36)', async () => {
    const { joinCode } = (await (await createRoomRoute()).json()) as { joinCode: string };
    const storage = memoryStorage();

    const first = await ensureSession({ storage, pack: PACK, joinCode, fetchImpl: routedFetch });
    for (let boot = 0; boot < 5; boot += 1) {
      const again = await ensureSession({ storage, pack: PACK, joinCode, fetchImpl: routedFetch });
      expect(again.created).toBe(false);
      expect(again.state.sessionId).toBe(first.state.sessionId);
    }

    // `total` on the console counts these rows, and `inStage` must sum to it
    // (§6.2.2).
    expect(getDatabase().prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  });
});

describe('resetToNewSession (§5)', () => {
  function stored(): PersistedState {
    return {
      sessionId: 'sess-1',
      token: 'tok-1',
      packVersion: 'v1',
      dayType: 'we',
      stage: 's2',
      introSeen: true,
      answers: setAnswer({}, 'sleep.wake.wd', '07:00'),
      authored: {},
    };
  }

  it('replaces the record with an empty session and drops the old keys', async () => {
    const state = stored();
    const storage = memoryStorage();
    save(storage, state);
    const fetchImpl = stubFetch({
      sessionId: 'sess-2',
      token: 'tok-2',
      packVersion: 'v1',
      packUrl: '/api/pack/v1',
    });

    const next = await resetToNewSession({ storage, state, fetchImpl });

    expect(next).toEqual({
      sessionId: 'sess-2',
      token: 'tok-2',
      packVersion: 'v1',
      dayType: 'wd',
      stage: 's1',
      // A reset is a fresh participant, so §13's statement is unread again.
      introSeen: false,
      answers: {},
      authored: {},
    });
    expect(storage.getItem('hpw:state:sess-1')).toBeNull();
    expect(storage.getItem('hpw:current')).toBe('sess-2');
  });

  it('authorises the delete with the session being destroyed', async () => {
    const state = stored();
    const storage = memoryStorage();
    save(storage, state);
    const fetchImpl = vi.fn<FetchLike>(async () =>
      Response.json({ sessionId: 's2', token: 't2', packVersion: 'v1', packUrl: '/p' }, { status: 201 }),
    );

    await resetToNewSession({ storage, state, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/session/sess-1/reset');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok-1');
  });

  it('destroys nothing locally when the request fails, so a retry is free', async () => {
    const state = stored();
    const storage = memoryStorage();
    save(storage, state);
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new TypeError('network down');
    });

    await expect(resetToNewSession({ storage, state, fetchImpl })).rejects.toThrow('network down');

    const kept = JSON.parse(storage.getItem('hpw:state:sess-1') ?? 'null') as PersistedState;
    expect(kept.answers).toEqual(state.answers);
    expect(storage.getItem('hpw:current')).toBe('sess-1');
  });

  it('clears the record and returns null on a 401 — the row is already gone', async () => {
    const state = stored();
    const storage = memoryStorage();
    save(storage, state);

    const next = await resetToNewSession({
      storage,
      state,
      fetchImpl: stubFetch({ error: 'unauthorized' }, 401),
    });

    // Null drops the client to the join screen. Keeping the record would
    // strand the phone on a session the server has forgotten, able to neither
    // continue nor reset.
    expect(next).toBeNull();
    expect(storage.getItem('hpw:current')).toBeNull();
    expect(storage.getItem('hpw:state:sess-1')).toBeNull();
  });

  it('leaves one row in the room, against the real route', async () => {
    const storage = memoryStorage();
    const fetchImpl: FetchLike = async (input, init) => {
      const request = new Request(`http://localhost${input}`, init);
      if (input === '/api/session') return createSessionRoute(request);
      const id = /\/api\/session\/([^/]+)\/reset/.exec(input)?.[1] ?? '';
      return resetRoute(request, { params: Promise.resolve({ id }) });
    };

    const room = (await (await createRoomRoute()).json()) as { joinCode: string; roomId: string };
    const first = await ensureSession({ storage, pack: PACK, joinCode: room.joinCode, fetchImpl });
    const next = await resetToNewSession({ storage, state: first.state, fetchImpl });

    expect(next).not.toBeNull();
    expect(next!.sessionId).not.toBe(first.state.sessionId);

    const rows = getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE room_id = ?')
      .get(room.roomId);
    expect(rows).toEqual({ n: 1 });

    // And the resumed record is the new session, not the destroyed one.
    const resumed = await ensureSession({ storage, pack: PACK, fetchImpl });
    expect(resumed.created).toBe(false);
    expect(resumed.state.sessionId).toBe(next!.sessionId);
  });
});
