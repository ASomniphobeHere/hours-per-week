/**
 * §10's derived table, computed from a room's event log and snapshots.
 *
 * Pure: it takes rows and returns rows, so the whole table is testable without
 * a database, and the script that writes CSV (step 10.5) is a formatter over
 * this and nothing more.
 *
 * Two things it refuses to do. It does not read activity ids as literals —
 * *sleep floor hit* is a clamp on whichever activity the pack gives a `minDaily`
 * to, and *school above minimum* is the pack's `locked` activity against the
 * pack's own `minWeekly`. A debrief that hardcoded `'sleep'` would report
 * nothing for the next pack, silently. And it does not collapse the two times
 * to fit onto one name (§10 forbids it explicitly): `timeToFitMs` runs from the
 * participant's own reveal entry (S6) and `timeToFitRoomMs` from the room's
 * `stage.open`, and for anyone force-advanced they differ by the 5 s hold plus
 * their snapshot.
 */

import type { Event, ScheduleSnapshot } from '@/lib/domain/types';
import { DAYS_PER_WEEK } from '@/lib/domain/types';
import { snapshotDelta, type ActivityDelta } from '@/lib/domain/delta';

/** One `hours.change` that reduced an activity, in the order it happened. */
export interface Cut {
  t: number;
  activityId: string;
  /*
   * No day type: §10's `Event` carries none, and the client emits one
   * `hours.change` per day value without saying which. The day type of a cut
   * is recoverable from `perActivityDelta`, which is per day type by
   * construction; the sequence is what this field exists for.
   */
  from: number;
  to: number;
}

/** What the pack contributes, so no activity id is a literal in here. */
export interface PackFacts {
  /** The `locked` activity — school in v1. Null for a pack without one. */
  lockedActivityId: string | null;
  /** Its `constraint.minWeekly`, the floor the pace screen starts at. */
  lockedMinimumWeekly: number;
  /** The activity carrying a `minDaily` — sleep in v1. */
  flooredActivityId: string | null;
}

export interface ParticipantInput {
  sessionId: string;
  /** In insertion order, which is the order the participant produced them. */
  events: readonly Event[];
  finish?: ScheduleSnapshot;
  complete?: ScheduleSnapshot;
}

export interface RoomInput {
  roomId: string;
  joinCode: string;
  /** §6.2.5's `stage.open`, the room's t = 0. Null if the flag never flipped. */
  stageOpenAt: number | null;
  pack: PackFacts;
  participants: readonly ParticipantInput[];
}

export interface ParticipantDebrief {
  sessionId: string;
  /** False for anyone who never reached `POST /complete`. */
  completed: boolean;
  /** They were pulled out of S1 or S2 by the flag rather than pressing Finish. */
  forced: boolean;

  /** §10's first field: complete − finish, per activity per day type. */
  perActivityDelta: ActivityDelta[];
  /** Every reduction after reveal entry, in the order they were made. */
  cutOrder: Cut[];
  /** The most diagnostic single field (§10). Null when nothing was cut. */
  firstCut: string | null;
  /**
   * `remaining.wd` in the finish snapshot.
   *
   * Reported beside `firstCut` and never apart from it: Unallocated absorbs
   * school before any band does and that absorption emits no event (§7.8), so
   * a participant with slack had already lost hours before the first cut they
   * had to decide about. §10: a debrief quoting first cut alone may be quoting
   * a participant who gave up two hours without making a decision.
   */
  slackAtFinishWd: number;
  /** True when `firstCut` understates the cost — there was slack to eat first. */
  firstCutFollowsSilentLoss: boolean;

  /** `sheet.open` counts after reveal entry, by activity (§10). */
  sheetOpensDuringRebalance: Record<string, number>;
  /** Any `clamp.hit` on the floored activity. */
  sleepFloorHit: boolean;

  /** Weekly school taken on the pace screen, before any cost was on screen. */
  paceAtReveal: number;
  /** Weekly school in the complete snapshot — the pace that survived. */
  schoolWeeklyAtComplete: number;
  /** §10's *school above minimum*, read at complete. */
  schoolAboveMinimum: boolean;

  /** `fits` minus this participant's reveal entry. Null if either is missing. */
  timeToFitMs: number | null;
  /** `fits` minus the room's `stage.open`. Null if either is missing. */
  timeToFitRoomMs: number | null;

  /** §10's no-squeeze: the pace fitted the slack, so nothing had to move. */
  noSqueeze: boolean;
}

export interface RoomDebrief {
  roomId: string;
  joinCode: string;
  stageOpenAt: number | null;
  participants: ParticipantDebrief[];
}

function firstEventAt(events: readonly Event[], match: (event: Event) => boolean): number | null {
  const found = events.find(match);
  return found === undefined ? null : found.t;
}

/** Weekly hours for one activity in a snapshot, over both day types. */
function weeklyIn(snapshot: ScheduleSnapshot | undefined, activityId: string | null): number {
  if (snapshot === undefined || activityId === null) return 0;
  const activity = snapshot.activities.find((candidate) => candidate.id === activityId);
  if (activity === undefined) return 0;
  return activity.wd.hours * DAYS_PER_WEEK.wd + activity.we.hours * DAYS_PER_WEEK.we;
}

export function deriveParticipant(
  input: ParticipantInput,
  { pack, stageOpenAt }: Pick<RoomInput, 'pack' | 'stageOpenAt'>,
): ParticipantDebrief {
  const { events, finish, complete } = input;

  const revealEntryAt = firstEventAt(
    events,
    (event) => event.type === 'stage.enter' && event.stage === 's6',
  );
  const fitsAt = firstEventAt(events, (event) => event.type === 'fits');
  // After reveal entry, or all of them when the log has no reveal entry to cut at —
  // a session that never reached the reveal has no rebalance to report, and an
  // unbounded window there would count the S2 pass as one.
  const afterReveal = revealEntryAt === null ? [] : events.filter((event) => event.t >= revealEntryAt);

  const cutOrder: Cut[] = afterReveal
    .filter(
      (event) =>
        event.type === 'hours.change' &&
        event.from !== undefined &&
        event.to !== undefined &&
        event.to < event.from,
    )
    .map((event) => ({
      t: event.t,
      activityId: event.activityId ?? '',
      from: event.from!,
      to: event.to!,
    }));

  const sheetOpensDuringRebalance: Record<string, number> = {};
  for (const event of afterReveal) {
    if (event.type !== 'sheet.open' || event.activityId === undefined) continue;
    sheetOpensDuringRebalance[event.activityId] =
      (sheetOpensDuringRebalance[event.activityId] ?? 0) + 1;
  }

  const sleepFloorHit =
    pack.flooredActivityId !== null &&
    events.some(
      (event) => event.type === 'clamp.hit' && event.activityId === pack.flooredActivityId,
    );

  /*
   * The pace, read at the reveal (§10: "record the pace twice").
   *
   * The pace screen commits once, measured against the floor, so a participant
   * who took the default logs nothing and their pace *is* the floor. Anyone
   * who moved the stepper logs one `hours.change` per day type the constraint
   * spreads over — school is workday-only, so one — and the weekly figure is
   * that daily value times the days in its own day type.
   */
  const paceCommit = afterReveal.find(
    (event) =>
      event.type === 'hours.change' &&
      event.activityId === pack.lockedActivityId &&
      event.to !== undefined,
  );
  const paceAtReveal =
    paceCommit === undefined ? pack.lockedMinimumWeekly : paceCommit.to! * DAYS_PER_WEEK.wd;

  const schoolWeeklyAtComplete = weeklyIn(complete, pack.lockedActivityId);
  const slackAtFinishWd = finish?.remaining.wd ?? 0;

  return {
    sessionId: input.sessionId,
    completed: complete !== undefined,
    forced: events.some((event) => event.type === 'forced.advance'),

    perActivityDelta:
      finish === undefined || complete === undefined ? [] : snapshotDelta(finish, complete),
    cutOrder,
    firstCut: cutOrder[0]?.activityId ?? null,
    slackAtFinishWd,
    firstCutFollowsSilentLoss: slackAtFinishWd > 0,

    sheetOpensDuringRebalance,
    sleepFloorHit,

    paceAtReveal,
    schoolWeeklyAtComplete,
    schoolAboveMinimum: schoolWeeklyAtComplete > pack.lockedMinimumWeekly,

    timeToFitMs: fitsAt === null || revealEntryAt === null ? null : fitsAt - revealEntryAt,
    timeToFitRoomMs: fitsAt === null || stageOpenAt === null ? null : fitsAt - stageOpenAt,

    // §11's "school fits inside existing slack": the workday slack at finish
    // covered the daily cost of the pace they chose, so `fits()` was already
    // true on reveal entry and cut order is empty.
    noSqueeze: slackAtFinishWd >= paceAtReveal / DAYS_PER_WEEK.wd,
  };
}

export function deriveRoom(input: RoomInput): RoomDebrief {
  return {
    roomId: input.roomId,
    joinCode: input.joinCode,
    stageOpenAt: input.stageOpenAt,
    participants: input.participants.map((participant) =>
      deriveParticipant(participant, input),
    ),
  };
}
