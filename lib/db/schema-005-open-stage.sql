-- Schema v5 — the gate becomes an ordinal (plan 25 §E.4).
--
-- `rooms.stage_open` was one boolean for one gate. There are two gates now:
-- the first opens the rating stage, the second opens the reveal. Two
-- independent booleans could express *reveal open, energy never opened*, which
-- the flow forbids, so the pair is collapsed into a single monotonic level:
--
--   0  nothing open        1  energy open        2  reveal open
--
-- The backfill is `stage_open * 2`: a room that was open was open to the
-- reveal, because the reveal is the only thing the old flag ever opened.
--
-- `room_events.to_stage` carries the level a `stage.open` row records. §6.2.5
-- becomes one record per flip — two per room — and the room's t = 0 for
-- *time to fit, room* (§10) is the `to_stage = 2` record. Existing rows are
-- backfilled to 2 for the same reason the room column is: every one of them
-- opened the reveal, and a debrief over an old room must keep measuring from
-- the moment it names.
ALTER TABLE rooms ADD COLUMN open_stage INTEGER NOT NULL DEFAULT 0;
UPDATE rooms SET open_stage = stage_open * 2;
ALTER TABLE rooms DROP COLUMN stage_open;

ALTER TABLE room_events ADD COLUMN to_stage INTEGER;
UPDATE room_events SET to_stage = 2 WHERE type = 'stage.open';
