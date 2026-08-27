/**
 * Every statement that touches the file lives here, so the route handlers stay
 * thin and the SQL is testable without a request.
 *
 * Statements are prepared per call rather than cached at module scope: the
 * handle is swapped between test files, and a statement outlives its database
 * only as a segfault.
 */

import type Database from 'better-sqlite3';
import type { Event, ScheduleSnapshot, SnapshotKind, StageId } from '@/lib/domain/types';
import { STAGE_ORDER } from '@/lib/domain/types';
import { getDatabase } from './index';
import { newJoinCode, newRoomId, newSessionId, newToken } from './ids';

export interface RoomRow {
  id: string;
  join_code: string;
  stage_open: number;
  opened_at: number | null;
  created_at: number;
}

export interface SessionRow {
  id: string;
  room_id: string;
  token: string;
  stage: StageId;
  ready_at: number | null;
  completed_at: number | null;
  created_at: number;
}

/* ── Rooms (§6.2.1) ─────────────────────────────────────────────────────── */

/**
 * `join_code` is UNIQUE, so a collision surfaces as a constraint failure rather
 * than a silent overwrite. Retried with a fresh code; the attempt cap only
 * exists so an exhausted code space fails loudly instead of spinning.
 */
export function createRoom(db: Database.Database = getDatabase(), now = Date.now()): RoomRow {
  const insert = db.prepare(
    'INSERT INTO rooms (id, join_code, stage_open, created_at) VALUES (?, ?, 0, ?)',
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const room: RoomRow = {
      id: newRoomId(),
      join_code: newJoinCode(),
      stage_open: 0,
      opened_at: null,
      created_at: now,
    };
    try {
      insert.run(room.id, room.join_code, room.created_at);
      return room;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error('could not mint a unique join code');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

/**
 * §6.2.4's flip, and the only write that opens a room.
 *
 * Idempotent, and `opened_at` records the *first* flip: S3 → S4 is one-way
 * (§2.2), so a second call is a facilitator's double-press rather than a
 * second event, and overwriting the timestamp would move the room's `t = 0`
 * for *time to fit, room* (§10) after participants had already been measured
 * against it.
 *
 * Pulled forward from step 8.5 so Stage 6's machine could be driven by a real
 * flag rather than a faked one; the console that presses it, and the
 * `stage.open` record it writes (step 8.6), are still Stage 8's.
 *
 * Returns the room as it stands, or null when there is none.
 */
export function openStage(
  roomId: string,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): RoomRow | null {
  const room = findRoomById(roomId, db);
  if (room === null) return null;
  if (room.stage_open === 1) return room;

  // The flip and its record are one transaction. §6.2.5 makes `stage.open` the
  // room's t = 0 for *time to fit, room* (§10); a flag that opened without the
  // row would leave every participant in the room measured against a moment
  // with no timestamp.
  const flip = db.transaction((): void => {
    db.prepare('UPDATE rooms SET stage_open = 1, opened_at = ? WHERE id = ?').run(now, roomId);
    const { total, ready } = countSessions(roomId, db);
    db.prepare(
      "INSERT INTO room_events (room_id, type, t, ready, total) VALUES (?, 'stage.open', ?, ?, ?)",
    ).run(roomId, now, ready, total);
  });
  flip();

  return { ...room, stage_open: 1, opened_at: now };
}

export interface RoomEventRow {
  id: number;
  room_id: string;
  type: string;
  t: number;
  ready: number | null;
  total: number | null;
}

/** §6.2.5's log. Read by the debrief (§10) and by the tests that check the row
 *  is written exactly once per room. */
export function roomEvents(roomId: string, db: Database.Database = getDatabase()): RoomEventRow[] {
  return db
    .prepare('SELECT * FROM room_events WHERE room_id = ? ORDER BY t, id')
    .all(roomId) as RoomEventRow[];
}

/* ── Console status (§6.2.2) ────────────────────────────────────────────── */

export interface RoomStatus {
  total: number;
  ready: number;
  stageOpen: boolean;
  joinCode: string;
  inStage: Record<StageId, number>;
}

function countSessions(
  roomId: string,
  db: Database.Database,
): { total: number; ready: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(ready_at) AS ready FROM sessions WHERE room_id = ?`,
    )
    .get(roomId) as { total: number; ready: number };
  return row;
}

/**
 * Everything the console shows, in one read.
 *
 * `inStage` is seeded at zero for all five stages and then filled, so a room
 * whose participants are all in S1 still reports `s4: 0` rather than omitting
 * the key — §6.2.3 renders five counts whatever the room is doing, and a
 * missing count would render as blank rather than as none.
 *
 * The counts sum to `total` because `sessions.stage` is NOT NULL with a 's1'
 * default (§6.2.2): a session is in exactly one stage from the moment it is
 * created, and the column only ever moves forward (`advanceStage`).
 *
 * Returns null for an unknown room, which the route turns into a 404 — the
 * console is the only caller and a facilitator with a bad URL should be told
 * so rather than shown an empty room.
 */
export function roomStatus(roomId: string, db: Database.Database = getDatabase()): RoomStatus | null {
  const room = findRoomById(roomId, db);
  if (room === null) return null;

  const { total, ready } = countSessions(roomId, db);

  const inStage = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])) as Record<
    StageId,
    number
  >;
  const rows = db
    .prepare('SELECT stage, COUNT(*) AS n FROM sessions WHERE room_id = ? GROUP BY stage')
    .all(roomId) as { stage: StageId; n: number }[];
  for (const row of rows) {
    if (row.stage in inStage) inStage[row.stage] = row.n;
  }

  return {
    total,
    ready,
    stageOpen: room.stage_open === 1,
    joinCode: room.join_code,
    inStage,
  };
}

export function findRoomById(roomId: string, db: Database.Database = getDatabase()): RoomRow | null {
  return (db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined) ?? null;
}

export function findRoomByJoinCode(
  joinCode: string,
  db: Database.Database = getDatabase(),
): RoomRow | null {
  return (
    (db.prepare('SELECT * FROM rooms WHERE join_code = ?').get(joinCode) as RoomRow | undefined) ??
    null
  );
}

/* ── Sessions (§6.1) ────────────────────────────────────────────────────── */

/** A session starts at `s1`, which is what makes `inStage` sum to `total` from
 *  the first row (§6.2.2). */
export function createSession(
  roomId: string,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): SessionRow {
  const session: SessionRow = {
    id: newSessionId(),
    room_id: roomId,
    token: newToken(),
    stage: 's1',
    ready_at: null,
    completed_at: null,
    created_at: now,
  };
  db.prepare(
    "INSERT INTO sessions (id, room_id, token, stage, created_at) VALUES (?, ?, ?, 's1', ?)",
  ).run(session.id, session.room_id, session.token, session.created_at);
  return session;
}

export function findSession(
  sessionId: string,
  db: Database.Database = getDatabase(),
): SessionRow | null {
  return (
    (db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined) ??
    null
  );
}

export function markReady(
  sessionId: string,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): void {
  // Ready is set once. A re-POST after a retry must not move the timestamp the
  // debrief measures against (§10).
  db.prepare('UPDATE sessions SET ready_at = ? WHERE id = ? AND ready_at IS NULL').run(
    now,
    sessionId,
  );
}

export function markComplete(
  sessionId: string,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): void {
  db.prepare('UPDATE sessions SET completed_at = ? WHERE id = ? AND completed_at IS NULL').run(
    now,
    sessionId,
  );
}

/**
 * Monotonic (§6.2.2). Stage is derived from the `stage.enter` events arriving in
 * telemetry batches, and batches can arrive out of order after a retry, so a
 * lower stage is discarded rather than written.
 */
export function advanceStage(
  sessionId: string,
  stage: StageId,
  db: Database.Database = getDatabase(),
): void {
  const rank = STAGE_ORDER.indexOf(stage);
  if (rank < 0) return;
  const current = db.prepare('SELECT stage FROM sessions WHERE id = ?').get(sessionId) as
    | { stage: StageId }
    | undefined;
  if (current === undefined) return;
  if (STAGE_ORDER.indexOf(current.stage) >= rank) return;
  db.prepare('UPDATE sessions SET stage = ? WHERE id = ?').run(stage, sessionId);
}

/**
 * §5 reset — the participant's server-side record is deleted outright and a
 * fresh session minted in the same room.
 *
 * Deleted rather than flagged, because `total` on the console counts session
 * rows (§6.2.2): a reset that left the old row behind would count one
 * participant twice and break `inStage` summing to `total`. The snapshots and
 * events go with it, which is the point of a reset rather than a side effect —
 * an abandoned run in the §10 debrief is a participant who never existed.
 *
 * Room membership survives. The reset is about the answers, not about which
 * room the phone is in, and **RD-2** leaves the client no `roomId` to rejoin
 * one with — so the new row is minted here, where session → room is already
 * resolved, rather than sending the participant back to the join code.
 *
 * Returns null when the session is already gone, so a repeated reset reads as
 * a failed lookup rather than minting a room-less row.
 */
export function resetSession(
  sessionId: string,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): SessionRow | null {
  const existing = findSession(sessionId, db);
  if (existing === null) return null;

  // One transaction: a half-deleted session is a row the participant can no
  // longer authenticate against and a debrief counting events with no session.
  return db.transaction((): SessionRow => {
    db.prepare('DELETE FROM events WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM snapshots WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return createSession(existing.room_id, db, now);
  })();
}

/* ── Snapshots and events (§10) ─────────────────────────────────────────── */

export function insertSnapshot(
  sessionId: string,
  kind: SnapshotKind,
  snapshot: ScheduleSnapshot,
  db: Database.Database = getDatabase(),
  now = Date.now(),
): void {
  db.prepare('INSERT INTO snapshots (session_id, kind, json, t) VALUES (?, ?, ?, ?)').run(
    sessionId,
    kind,
    JSON.stringify(snapshot),
    now,
  );
}

/**
 * One transaction per batch. Insertion order is cut order (§10), so the rows go
 * in in the order the client recorded them and `events.id` breaks ties within a
 * millisecond.
 */
export function insertEvents(
  sessionId: string,
  events: readonly Event[],
  db: Database.Database = getDatabase(),
): number {
  if (events.length === 0) return 0;
  const insert = db.prepare(
    `INSERT INTO events (session_id, t, type, activity_id, field_id, stage, screen_id, from_h, to_h)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const run = db.transaction((batch: readonly Event[]) => {
    for (const event of batch) {
      insert.run(
        sessionId,
        event.t,
        event.type,
        event.activityId ?? null,
        event.fieldId ?? null,
        event.stage ?? null,
        event.screenId ?? null,
        event.from ?? null,
        event.to ?? null,
      );
    }
  });
  run(events);
  return events.length;
}

/* ── Debrief reads (§10, step 10.5) ─────────────────────────────────────── */

/** Every session in a room, oldest first, so a debrief lists joiners in order. */
export function sessionsInRoom(
  roomId: string,
  db: Database.Database = getDatabase(),
): SessionRow[] {
  return db
    .prepare('SELECT * FROM sessions WHERE room_id = ? ORDER BY created_at, id')
    .all(roomId) as SessionRow[];
}

/**
 * One session's events, in the order they were inserted.
 *
 * `ORDER BY t, id` and not `t` alone: a rebalance emits several `hours.change`
 * inside one millisecond, and cut order is the whole value of the field (§10).
 * `id` is the tiebreak, which is why the events table has one.
 */
export function sessionEvents(
  sessionId: string,
  db: Database.Database = getDatabase(),
): Event[] {
  const rows = db
    .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY t, id')
    .all(sessionId) as {
    t: number;
    type: string;
    activity_id: string | null;
    field_id: string | null;
    stage: string | null;
    screen_id: string | null;
    from_h: number | null;
    to_h: number | null;
  }[];

  return rows.map((row) => ({
    t: row.t,
    type: row.type as Event['type'],
    ...(row.activity_id === null ? {} : { activityId: row.activity_id }),
    ...(row.field_id === null ? {} : { fieldId: row.field_id }),
    ...(row.stage === null ? {} : { stage: row.stage as StageId }),
    ...(row.screen_id === null ? {} : { screenId: row.screen_id }),
    ...(row.from_h === null ? {} : { from: row.from_h }),
    ...(row.to_h === null ? {} : { to: row.to_h }),
  }));
}

/**
 * A session's snapshots by kind, newest of each kind winning.
 *
 * A kind can appear twice: `/ready` and `/complete` are both delivered with
 * retry (§11), and a POST that lands after its own timeout is a duplicate row
 * rather than an error. The last write is the one the participant's phone
 * finished with, so the read takes it.
 */
export function sessionSnapshots(
  sessionId: string,
  db: Database.Database = getDatabase(),
): Partial<Record<SnapshotKind, ScheduleSnapshot>> {
  const rows = db
    .prepare('SELECT kind, json FROM snapshots WHERE session_id = ? ORDER BY t, id')
    .all(sessionId) as { kind: SnapshotKind; json: string }[];

  const byKind: Partial<Record<SnapshotKind, ScheduleSnapshot>> = {};
  for (const row of rows) {
    try {
      byKind[row.kind] = JSON.parse(row.json) as ScheduleSnapshot;
    } catch {
      // A row that will not parse is one participant's snapshot, not the
      // room's debrief. Skipped, and the derivation reports the field absent.
    }
  }
  return byKind;
}
