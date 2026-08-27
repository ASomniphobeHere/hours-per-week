-- Schema v3 — the screen an `Event` of type `screen.view` names.
--
-- Same reasoning as v2's `stage`: §10's Event union carries no field for it,
-- and a `screen.view` without one records that a screen was seen without
-- recording which. The event's `activity_id` carries the screen's section, so
-- grouping by activity stays a single-column read (§10).
ALTER TABLE events ADD COLUMN screen_id TEXT;
