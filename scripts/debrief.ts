/**
 * §10's debrief, off the database and onto disk (step 10.5).
 *
 *   npm run debrief -- <roomId | joinCode> [outDir]
 *
 * Build tooling rather than runtime: it opens the SQLite file directly and is
 * never reached from a route. The facilitator runs it on the machine the room
 * ran on, between the exercise and the discussion, which is the whole window
 * it has to be fast enough for.
 *
 * A join code is accepted as well as a room id because the join code is the
 * number that was on the screen in the room, and nobody writes down a room id.
 * The code is only unique among live rooms (§6.2.1), so a room id is what to
 * pass when several rooms have run.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDatabase, databasePath, getDatabase } from '@/lib/db/index';
import {
  findRoomById,
  findRoomByJoinCode,
  roomEvents,
  sessionEvents,
  sessionSnapshots,
  sessionsInRoom,
} from '@/lib/db/queries';
import { deriveRoom, type PackFacts } from '@/lib/debrief/derive';
import { toCsv, toJson } from '@/lib/debrief/format';
import { v1Index } from '@/lib/pack/v1';

/**
 * The pack's own answer to "which activity is school" and "which has a floor".
 *
 * Read off the bundled pack rather than named here, so the derivation stays
 * true for a replacement pack. v1 is the only pack that ships (§4.1), and a
 * room run against another one would want this argument-driven — noted rather
 * than built, because nothing can produce such a room yet.
 */
function packFacts(): PackFacts {
  const index = v1Index();
  const locked = index.activities.find((activity) => activity.locked === true);
  const floored = index.activities.find(
    (activity) => activity.constraint?.minDaily !== undefined,
  );
  return {
    lockedActivityId: locked?.id ?? null,
    lockedMinimumWeekly: locked?.constraint?.minWeekly ?? 0,
    flooredActivityId: floored?.id ?? null,
  };
}

function main(): void {
  const [target, outDir = 'debriefs'] = process.argv.slice(2);
  if (target === undefined || target === '') {
    process.stderr.write('usage: npm run debrief -- <roomId | joinCode> [outDir]\n');
    process.exit(2);
  }

  const db = getDatabase();
  const room = findRoomById(target, db) ?? findRoomByJoinCode(target, db);
  if (room === null) {
    process.stderr.write(`no room "${target}" in ${databasePath()}\n`);
    process.exit(1);
  }

  // Two `stage.open` rows per room since plan 25 §E.4, one per gate. The
  // room's t = 0 for *time to fit, room* is the one that opened the reveal
  // (§6.2.5) — the rebalance the measure is about cannot start before it.
  // Rows written before v5 are backfilled to 2 by the migration.
  const stageOpen = roomEvents(room.id, db).find(
    (event) => event.type === 'stage.open' && event.to_stage === 2,
  );

  const debrief = deriveRoom({
    roomId: room.id,
    joinCode: room.join_code,
    // §6.2.5's row, not `rooms.opened_at`: both are written in the same
    // transaction, and the event log is where §10 says the room's clock lives.
    stageOpenAt: stageOpen?.t ?? null,
    pack: packFacts(),
    participants: sessionsInRoom(room.id, db).map((session) => ({
      sessionId: session.id,
      events: sessionEvents(session.id, db),
      ...sessionSnapshots(session.id, db),
    })),
  });

  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, `debrief-${room.join_code}-${room.id}.csv`);
  const jsonPath = join(outDir, `debrief-${room.join_code}-${room.id}.json`);
  writeFileSync(csvPath, toCsv(debrief), 'utf8');
  writeFileSync(jsonPath, toJson(debrief), 'utf8');

  const completed = debrief.participants.filter((participant) => participant.completed).length;
  process.stdout.write(
    `room ${room.join_code} (${room.id}): ${debrief.participants.length} sessions, ` +
      `${completed} completed\n${csvPath}\n${jsonPath}\n`,
  );

  closeDatabase();
}

main();
