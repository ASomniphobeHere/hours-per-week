-- Schema v1 — §2.1, §6.1, §6.2, §10.
--
-- There is no per-participant server state beyond a session row and a
-- telemetry log (§2.1): the schedule lives in the client and is uploaded at
-- the three snapshot checkpoints (§10).

-- A room is one workshop. `stage_open` is the single room-scoped boolean the
-- whole gate mechanism turns on (§6.3). `join_code` is four digits, no leading
-- zero, unique among live rooms, and is not derivable from `id` (§6.2.1).
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  join_code  TEXT NOT NULL UNIQUE,
  stage_open INTEGER NOT NULL DEFAULT 0,
  opened_at  INTEGER,
  created_at INTEGER NOT NULL
);

-- One row per participant. `total` on the console counts these (§6.2.2), so a
-- refresh must never mint a second row (§5).
-- `stage` is the furthest stage reached, advanced monotonically from the
-- `stage.enter` events arriving in telemetry batches; it is what makes
-- `inStage` sum to `total` (§6.2.2). A session starts at 's1' on creation.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  token        TEXT NOT NULL,
  stage        TEXT NOT NULL DEFAULT 's1',
  ready_at     INTEGER,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_room ON sessions(room_id);

-- Schedule snapshots at the two points this build takes them: at Finish
-- (pre-reveal, end of S2) and at complete (post-rebalance, end of S4).
-- Per-activity delta is the complete snapshot minus the finish snapshot.
-- §10 names an end-of-S1 third; it is not taken (see `SnapshotKind`), and the
-- CHECK still admits it so an older file needs no rebuild to stay valid.
CREATE TABLE IF NOT EXISTS snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind       TEXT NOT NULL CHECK (kind IN ('s1', 'finish', 'complete')),
  json       TEXT NOT NULL,
  t          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id, kind);

-- The participant event log (§10). Cut order is read off this table, so
-- insertion order matters and `id` is the tiebreak within a millisecond.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  t           INTEGER NOT NULL,
  type        TEXT NOT NULL,
  activity_id TEXT,
  field_id    TEXT,
  from_h      REAL,
  to_h        REAL
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, t, id);

-- Room-level facts the server records with no client involvement (§6.2.5).
-- `stage.open` and nothing else in v1. This is the room's t = 0, against which
-- *time to fit, room* is measured (§10).
CREATE TABLE IF NOT EXISTS room_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  type    TEXT NOT NULL,
  t       INTEGER NOT NULL,
  ready   INTEGER,
  total   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_room_events_room ON room_events(room_id, t);
