/**
 * Route tests for every §6.1 / §6.2.1 endpoint Stage 2 defines.
 *
 * Handlers are called directly with a Web `Request`: no server, no port, and
 * the same code path Next runs.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, teardownDatabase, setupMemoryDatabase } from '@/lib/db/testing';

setupMemoryDatabase();

import { POST as createRoom } from './room/route';
import { POST as openRoomStage } from './room/[id]/stage/route';
import { POST as createSession } from './session/route';
import { GET as getStage } from './session/[id]/stage/route';
import { POST as postReady } from './session/[id]/ready/route';
import { POST as postComplete } from './session/[id]/complete/route';
import { POST as postTelemetry } from './session/[id]/telemetry/route';
import { POST as postReset } from './session/[id]/reset/route';
import { GET as getPack } from './pack/[version]/route';
import { get, params, postJson } from '@/lib/api/testing';
import { getDatabase } from '@/lib/db/index';
import type { ScheduleSnapshot } from '@/lib/domain/types';

interface Room {
  roomId: string;
  joinCode: string;
  consoleUrl: string;
}

interface Session {
  sessionId: string;
  token: string;
  packVersion: string;
  packUrl: string;
}

async function newRoom(): Promise<Room> {
  const response = await createRoom();
  expect(response.status).toBe(201);
  return (await response.json()) as Room;
}

async function join(joinCode: string): Promise<Session> {
  const response = await createSession(postJson('/api/session', { joinCode }));
  expect(response.status).toBe(201);
  return (await response.json()) as Session;
}

function snapshot(kind: ScheduleSnapshot['kind'], remainingWd = 2): ScheduleSnapshot {
  return {
    kind,
    t: Date.now(),
    packVersion: 'v1',
    activities: [
      { id: 'sleep', wd: { mode: 'derived', hours: 8 }, we: { mode: 'derived', hours: 9 } },
    ],
    total: { wd: 22, we: 21 },
    remaining: { wd: remainingWd, we: 3 },
    fits: true,
  };
}

function stageOf(sessionId: string): string {
  const row = getDatabase().prepare('SELECT stage FROM sessions WHERE id = ?').get(sessionId);
  return (row as { stage: string }).stage;
}

beforeEach(() => resetDatabase());
afterAll(() => teardownDatabase());

/* ── 2.1 / 2.2 — room and session (AC 49) ───────────────────────────────── */

describe('POST /room', () => {
  it('creates a room with the stage closed and a console url', async () => {
    const room = await newRoom();
    expect(room.joinCode).toMatch(/^[1-9]\d{3}$/);
    expect(room.consoleUrl).toBe(`/facilitate/${room.roomId}`);

    const row = getDatabase()
      .prepare('SELECT stage_open, opened_at FROM rooms WHERE id = ?')
      .get(room.roomId);
    expect(row).toEqual({ stage_open: 0, opened_at: null });
  });

  it('mints a distinct roomId and joinCode per room, and roomId is not the code', async () => {
    const rooms = [await newRoom(), await newRoom(), await newRoom()];
    expect(new Set(rooms.map((room) => room.roomId)).size).toBe(3);
    expect(new Set(rooms.map((room) => room.joinCode)).size).toBe(3);
    // §6.2.1: roomId is not derivable from joinCode.
    for (const room of rooms) expect(room.roomId).not.toContain(room.joinCode);
  });
});

describe('POST /session', () => {
  it('resolves a join code to its room (AC 49)', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    expect(session.packVersion).toBe('v1');
    expect(session.packUrl).toBe('/api/pack/v1');
    const row = getDatabase()
      .prepare('SELECT room_id, stage FROM sessions WHERE id = ?')
      .get(session.sessionId);
    expect(row).toEqual({ room_id: room.roomId, stage: 's1' });
  });

  it('rejects an unknown and a malformed join code with 404 (AC 49)', async () => {
    await newRoom();
    for (const joinCode of ['0000', 'abcd', '', '12345', 42, null]) {
      const response = await createSession(postJson('/api/session', { joinCode }));
      expect(response.status).toBe(404);
    }
  });

  it('never returns a roomId — RD-2', async () => {
    const room = await newRoom();
    const response = await createSession(postJson('/api/session', { joinCode: room.joinCode }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['packUrl', 'packVersion', 'sessionId', 'token']);
    // Not under another name, and not embedded in one of the values either.
    expect(JSON.stringify(body)).not.toContain(room.roomId);
  });

  it('mints one row per call — a second join is a second participant', async () => {
    const room = await newRoom();
    const first = await join(room.joinCode);
    const second = await join(room.joinCode);

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.token).not.toBe(second.token);
    expect(getDatabase().prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 2 });
  });
});

/* ── 2.3 — stage poll (AC 34) ───────────────────────────────────────────── */

describe('GET /session/:id/stage', () => {
  it('reports the room flag and caches for 1 s', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    const response = await getStage(
      get(`/api/session/${session.sessionId}/stage`, session.token),
      params({ id: session.sessionId }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=1');

    const body = (await response.json()) as { stageOpen: boolean; serverTime: number };
    expect(body.stageOpen).toBe(false);
    expect(body.serverTime).toBeGreaterThan(0);
  });

  it('follows the flag once the room is opened', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    getDatabase()
      .prepare('UPDATE rooms SET stage_open = 1, opened_at = ? WHERE id = ?')
      .run(Date.now(), room.roomId);

    const response = await getStage(
      get(`/api/session/${session.sessionId}/stage`, session.token),
      params({ id: session.sessionId }),
    );
    expect(((await response.json()) as { stageOpen: boolean }).stageOpen).toBe(true);
  });

  it('401s without a token, with the wrong token, and on an unknown session', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    const id = session.sessionId;

    const rejected = [
      get(`/api/session/${id}/stage`),
      get(`/api/session/${id}/stage`, 'not-the-token'),
      get(`/api/session/${id}/stage`, `${session.token}x`),
    ];
    for (const request of rejected) {
      expect((await getStage(request, params({ id }))).status).toBe(401);
    }

    // An unknown session is 401, not 404: a 404 here would confirm which
    // session ids exist.
    const unknown = await getStage(
      get('/api/session/nope/stage', session.token),
      params({ id: 'nope' }),
    );
    expect(unknown.status).toBe(401);
  });

  it("a token from room A cannot read room B's session", async () => {
    const roomA = await newRoom();
    const roomB = await newRoom();
    const inA = await join(roomA.joinCode);
    const inB = await join(roomB.joinCode);

    const response = await getStage(
      get(`/api/session/${inB.sessionId}/stage`, inA.token),
      params({ id: inB.sessionId }),
    );
    expect(response.status).toBe(401);
  });
});

/* ── 8.5 (pulled forward for Stage 6) — the flip ────────────────────────── */

describe('POST /room/:roomId/stage', () => {
  it('opens the room and stamps the moment it opened', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    const response = await openRoomStage(
      postJson(`/api/room/${room.roomId}/stage`, { open: true }),
      params({ id: room.roomId }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as { ok: boolean; stageOpen: boolean }).toMatchObject({
      ok: true,
      stageOpen: true,
    });

    // The participant's own poll follows it, which is the whole point.
    const polled = await getStage(
      get(`/api/session/${session.sessionId}/stage`, session.token),
      params({ id: session.sessionId }),
    );
    expect(((await polled.json()) as { stageOpen: boolean }).stageOpen).toBe(true);
  });

  it('is idempotent and keeps the first `opened_at` (§2.2 one-way)', async () => {
    const room = await newRoom();
    const request = () =>
      openRoomStage(
        postJson(`/api/room/${room.roomId}/stage`, { open: true }),
        params({ id: room.roomId }),
      );

    const first = (await (await request()).json()) as { openedAt: number };
    const second = (await (await request()).json()) as { ok: boolean; openedAt: number };
    expect(second.ok).toBe(true);
    // The room's `t = 0` for *time to fit, room* (§10) does not move under a
    // facilitator's double-press.
    expect(second.openedAt).toBe(first.openedAt);
  });

  it('refuses anything but `{ open: true }` — the flag does not close', async () => {
    const room = await newRoom();
    for (const body of [{}, { open: false }, { open: 'true' }]) {
      const response = await openRoomStage(
        postJson(`/api/room/${room.roomId}/stage`, body),
        params({ id: room.roomId }),
      );
      expect(response.status).toBe(400);
    }
    const flag = getDatabase()
      .prepare('SELECT stage_open FROM rooms WHERE id = ?')
      .get(room.roomId);
    expect(flag).toEqual({ stage_open: 0 });
  });

  it('404s on an unknown room', async () => {
    const response = await openRoomStage(
      postJson('/api/room/nope/stage', { open: true }),
      params({ id: 'nope' }),
    );
    expect(response.status).toBe(404);
  });
});

/* ── 2.4 — ready and complete (AC 32) ───────────────────────────────────── */

describe('POST /session/:id/ready', () => {
  it('stores the finish snapshot and sets ready_at without touching the flag (AC 32)', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    const id = session.sessionId;

    const response = await postReady(
      postJson(`/api/session/${id}/ready`, { schedule: snapshot('finish') }, session.token),
      params({ id }),
    );
    expect(response.status).toBe(200);

    const db = getDatabase();
    expect(db.prepare('SELECT stage_open FROM rooms WHERE id = ?').get(room.roomId)).toEqual({
      stage_open: 0,
    });

    const row = db
      .prepare('SELECT ready_at, completed_at FROM sessions WHERE id = ?')
      .get(id) as { ready_at: number | null; completed_at: number | null };
    expect(row.ready_at).toBeGreaterThan(0);
    expect(row.completed_at).toBeNull();
    // Ready is not a stage transition: the participant is still where they were.
    expect(stageOf(id)).toBe('s1');

    const stored = db
      .prepare("SELECT json FROM snapshots WHERE session_id = ? AND kind = 'finish'")
      .get(id) as { json: string };
    // Slack at finish must be recoverable from this row alone (§10).
    expect((JSON.parse(stored.json) as ScheduleSnapshot).remaining.wd).toBe(2);
  });

  it('keeps the first ready_at when the client retries', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);
    const send = () =>
      postReady(
        postJson(`/api/session/${id}/ready`, { schedule: snapshot('finish') }, token),
        params({ id }),
      );
    const readyAt = () =>
      (getDatabase().prepare('SELECT ready_at FROM sessions WHERE id = ?').get(id) as {
        ready_at: number;
      }).ready_at;

    await send();
    const first = readyAt();
    await send();

    expect(readyAt()).toBe(first);
  });

  it('400s on a missing or malformed schedule, and 401s without a token', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);

    const missing = await postReady(postJson(`/api/session/${id}/ready`, {}, token), params({ id }));
    expect(missing.status).toBe(400);

    const malformed = await postReady(
      postJson(`/api/session/${id}/ready`, { schedule: { kind: 'finish' } }, token),
      params({ id }),
    );
    expect(malformed.status).toBe(400);

    const anonymous = await postReady(
      postJson(`/api/session/${id}/ready`, { schedule: snapshot('finish') }),
      params({ id }),
    );
    expect(anonymous.status).toBe(401);
  });
});

describe('POST /session/:id/complete', () => {
  it('stores the complete snapshot and the trailing batch', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);
    const events = [
      { t: 1, type: 'hours.change', activityId: 'leisure', from: 3, to: 1 },
      { t: 2, type: 'fits' },
      { t: 3, type: 'complete' },
    ];

    const response = await postComplete(
      postJson(`/api/session/${id}/complete`, { schedule: snapshot('complete'), events }, token),
      params({ id }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accepted: 3 });

    const db = getDatabase();
    expect(
      (db.prepare('SELECT completed_at FROM sessions WHERE id = ?').get(id) as {
        completed_at: number | null;
      }).completed_at,
    ).toBeGreaterThan(0);
    expect(db.prepare("SELECT count(*) AS n FROM snapshots WHERE kind = 'complete'").get()).toEqual({
      n: 1,
    });
    // Cut order is read off this table, so the reduction survives intact (§10).
    const cut = db
      .prepare("SELECT activity_id, from_h, to_h FROM events WHERE type = 'hours.change'")
      .get();
    expect(cut).toEqual({ activity_id: 'leisure', from_h: 3, to_h: 1 });
  });

  it('400s without a schedule — per-activity delta has no second chance', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);

    const response = await postComplete(
      postJson(`/api/session/${id}/complete`, { events: [] }, token),
      params({ id }),
    );
    expect(response.status).toBe(400);
  });
});

/* ── 2.5 — telemetry ingest and stage derivation ────────────────────────── */

describe('POST /session/:id/telemetry', () => {
  it('appends a batch in order and keeps the stage on stage.enter', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);

    const response = await postTelemetry(
      postJson(
        `/api/session/${id}/telemetry`,
        {
          events: [
            { t: 10, type: 'screen.view', fieldId: 'sleep.wake.wd' },
            { t: 11, type: 'stage.enter', stage: 's2' },
          ],
        },
        token,
      ),
      params({ id }),
    );
    expect(await response.json()).toEqual({ ok: true, accepted: 2 });

    const rows = getDatabase()
      .prepare('SELECT type, field_id, stage FROM events WHERE session_id = ? ORDER BY id')
      .all(id);
    expect(rows).toEqual([
      { type: 'screen.view', field_id: 'sleep.wake.wd', stage: null },
      { type: 'stage.enter', field_id: null, stage: 's2' },
    ]);
  });

  it('advances sessions.stage to the furthest stage.enter, monotonically (§6.2.2)', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);
    const send = (events: unknown[]) =>
      postTelemetry(postJson(`/api/session/${id}/telemetry`, { events }, token), params({ id }));

    expect(stageOf(id)).toBe('s1');

    await send([
      { t: 1, type: 'stage.enter', stage: 's2' },
      { t: 2, type: 'stage.enter', stage: 's4' },
      { t: 3, type: 'stage.enter', stage: 's3' },
    ]);
    expect(stageOf(id)).toBe('s4');

    // A retried, out-of-order batch must not walk the console backwards.
    await send([{ t: 4, type: 'stage.enter', stage: 's2' }]);
    expect(stageOf(id)).toBe('s4');

    await send([{ t: 5, type: 'stage.enter', stage: 's5' }]);
    expect(stageOf(id)).toBe('s5');
  });

  it('accepts a junk batch rather than 4xxing one the client retries forever', async () => {
    const room = await newRoom();
    const { sessionId: id, token } = await join(room.joinCode);

    const response = await postTelemetry(
      postJson(
        `/api/session/${id}/telemetry`,
        {
          events: [
            { t: 1, type: 'not.a.type' },
            { type: 'fits' },
            null,
            'nope',
            { t: 2, type: 'sheet.open', activityId: 'sleep' },
          ],
        },
        token,
      ),
      params({ id }),
    );
    expect(response.status).toBe(200);
    // The one well-formed member survives; the rest are dropped, not rejected.
    expect(await response.json()).toEqual({ ok: true, accepted: 1 });
  });

  it('401s on a foreign token and writes nothing', async () => {
    const roomA = await newRoom();
    const roomB = await newRoom();
    const inA = await join(roomA.joinCode);
    const inB = await join(roomB.joinCode);

    const response = await postTelemetry(
      postJson(
        `/api/session/${inB.sessionId}/telemetry`,
        { events: [{ t: 1, type: 'fits' }] },
        inA.token,
      ),
      params({ id: inB.sessionId }),
    );
    expect(response.status).toBe(401);
    expect(getDatabase().prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
  });
});

/* ── Reset (§5) ─────────────────────────────────────────────────────────── */

describe('POST /session/:id/reset', () => {
  function rows(table: string, sessionId: string): number {
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`)
      .get(sessionId);
    return (row as { n: number }).n;
  }

  it('destroys the session and its data, and returns a replacement', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    await postReady(
      postJson(`/api/session/${session.sessionId}/ready`, { schedule: snapshot('finish') }, session.token),
      params({ id: session.sessionId }),
    );
    await postTelemetry(
      postJson(`/api/session/${session.sessionId}/telemetry`, { events: [{ t: 1, type: 'fits' }] }, session.token),
      params({ id: session.sessionId }),
    );

    const response = await postReset(
      postJson(`/api/session/${session.sessionId}/reset`, {}, session.token),
      params({ id: session.sessionId }),
    );
    expect(response.status).toBe(201);

    const next = (await response.json()) as Session;
    expect(next.sessionId).not.toBe(session.sessionId);
    expect(next.token).not.toBe(session.token);
    expect(next.packUrl).toBe('/api/pack/v1');

    expect(rows('snapshots', session.sessionId)).toBe(0);
    expect(rows('events', session.sessionId)).toBe(0);
    expect(
      getDatabase().prepare('SELECT id FROM sessions WHERE id = ?').get(session.sessionId),
    ).toBeUndefined();
  });

  it('carries no roomId, like every other participant response (RD-2)', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    const response = await postReset(
      postJson(`/api/session/${session.sessionId}/reset`, {}, session.token),
      params({ id: session.sessionId }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['packUrl', 'packVersion', 'sessionId', 'token']);
    expect(JSON.stringify(body)).not.toContain(room.roomId);
  });

  it('keeps the participant in the same room, so no join code is needed again', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    const response = await postReset(
      postJson(`/api/session/${session.sessionId}/reset`, {}, session.token),
      params({ id: session.sessionId }),
    );
    const next = (await response.json()) as Session;

    const row = getDatabase()
      .prepare('SELECT room_id, stage FROM sessions WHERE id = ?')
      .get(next.sessionId);
    expect(row).toEqual({ room_id: room.roomId, stage: 's1' });
  });

  it('leaves the room at one session row per participant (§6.2.2)', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    await postReset(
      postJson(`/api/session/${session.sessionId}/reset`, {}, session.token),
      params({ id: session.sessionId }),
    );

    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE room_id = ?')
      .get(room.roomId);
    expect(row).toEqual({ n: 1 });
  });

  it('401s without a token, and destroys nothing', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);

    const response = await postReset(
      postJson(`/api/session/${session.sessionId}/reset`, {}),
      params({ id: session.sessionId }),
    );
    expect(response.status).toBe(401);
    expect(
      getDatabase().prepare('SELECT id FROM sessions WHERE id = ?').get(session.sessionId),
    ).toEqual({ id: session.sessionId });
  });

  it('401s on a foreign token — one participant cannot reset another', async () => {
    const room = await newRoom();
    const mine = await join(room.joinCode);
    const theirs = await join(room.joinCode);

    const response = await postReset(
      postJson(`/api/session/${theirs.sessionId}/reset`, {}, mine.token),
      params({ id: theirs.sessionId }),
    );
    expect(response.status).toBe(401);
    expect(
      getDatabase().prepare('SELECT id FROM sessions WHERE id = ?').get(theirs.sessionId),
    ).toEqual({ id: theirs.sessionId });
  });

  it('401s the second tap of a double reset rather than minting a third row', async () => {
    const room = await newRoom();
    const session = await join(room.joinCode);
    const request = () =>
      postReset(
        postJson(`/api/session/${session.sessionId}/reset`, {}, session.token),
        params({ id: session.sessionId }),
      );

    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(401);

    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE room_id = ?')
      .get(room.roomId);
    expect(row).toEqual({ n: 1 });
  });
});

/* ── packUrl target ─────────────────────────────────────────────────────── */

describe('GET /pack/:version', () => {
  it('serves the validated v1 pack at the url POST /session advertises', async () => {
    const response = await getPack(get('/api/pack/v1'), params({ version: 'v1' }));
    expect(response.status).toBe(200);

    const pack = (await response.json()) as { version: string; activities: unknown[] };
    expect(pack.version).toBe('v1');
    expect(pack.activities.length).toBeGreaterThan(0);
  });

  it('404s an unknown version rather than serving v1 under its name', async () => {
    const response = await getPack(get('/api/pack/v2'), params({ version: 'v2' }));
    expect(response.status).toBe(404);
  });
});
