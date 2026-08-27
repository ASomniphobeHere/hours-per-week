/**
 * §10's first derived field: **per-activity delta**, the complete snapshot
 * minus the finish snapshot.
 *
 * It is computed here rather than twice — the debrief reports it for the room
 * (step 10.5) and S5 shows the participant their own half of it (step 10.6),
 * and a screen that derived the same figure by its own arithmetic would be a
 * second definition of the one field §10 says everything else exists to
 * produce.
 *
 * **Per day type, never summed.** A cut on a workday and a cut on a weekend
 * day are two different decisions about two different days, and an hour taken
 * from each is not "two hours" of anything the participant did. The weekly
 * figure is recoverable from these rows by anyone who wants it; the reverse is
 * not.
 *
 * **Both snapshots must name the activity.** One that appears on only one side
 * is skipped rather than read against zero: an activity absent from the finish
 * snapshot is indistinguishable from one that went 0 → 4, and guessing which
 * would put a fabricated row in front of the participant. `buildSnapshot`
 * carries every pack activity for exactly this reason, so the case only arises
 * across a pack change.
 */

import type { DayType, ScheduleSnapshot } from './types';
import { DAY_TYPES } from './types';

export interface ActivityDelta {
  activityId: string;
  dayType: DayType;
  /** Hours in the finish snapshot. */
  from: number;
  /** Hours in the complete snapshot. */
  to: number;
}

export interface DeltaOptions {
  /** Activity ids to leave out — school, on S5 (step 10.6). */
  exclude?: (activityId: string) => boolean;
}

/**
 * Every day value that moved between the two snapshots, in pack order and
 * `wd` before `we` within an activity — which is stack order, so a list of
 * them reads down the week the way the editor drew it.
 */
export function snapshotDelta(
  finish: ScheduleSnapshot,
  complete: ScheduleSnapshot,
  { exclude }: DeltaOptions = {},
): ActivityDelta[] {
  const after = new Map(complete.activities.map((activity) => [activity.id, activity]));
  const deltas: ActivityDelta[] = [];

  for (const before of finish.activities) {
    if (exclude?.(before.id) === true) continue;
    const now = after.get(before.id);
    if (now === undefined) continue;
    for (const dayType of DAY_TYPES) {
      const from = before[dayType].hours;
      const to = now[dayType].hours;
      if (from === to) continue;
      deltas.push({ activityId: before.id, dayType, from, to });
    }
  }

  return deltas;
}

/**
 * The reductions alone — what the commitment cost.
 *
 * S5 shows these and nothing else (step 10.6). An activity the participant
 * nudged *up* while cutting elsewhere is a real change and stays in
 * `snapshotDelta` for the debrief, but it is not part of the answer to what
 * their week gave up, and putting it on the summary would turn a record of a
 * cost into a ledger.
 */
export function cuts(
  finish: ScheduleSnapshot,
  complete: ScheduleSnapshot,
  options: DeltaOptions = {},
): ActivityDelta[] {
  return snapshotDelta(finish, complete, options).filter((delta) => delta.to < delta.from);
}
