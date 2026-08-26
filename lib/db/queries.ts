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
    `INSERT INTO events (session_id, t, type, activity_id, field_id, stage, from_h, to_h)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        event.from ?? null,
        event.to ?? null,
      );
    }
  });
  run(events);
  return events.length;
}
