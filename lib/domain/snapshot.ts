/**
 * §10's `ScheduleSnapshot`, built from the live activity set.
 *
 * Three are taken over a run — end of S1, at Finish, at complete — and the
 * debrief reads all three the same way: per-activity delta is `complete −
 * finish` per activity per day type, and *slack at finish* is `remaining.wd`
 * in the finish snapshot. Nothing is recomputed server-side, so what is not in
 * here is not recoverable.
 *
 * Every pack activity is carried, including ones sitting at zero and including
 * `locked` school before S4 reveals it. A snapshot is the whole schedule at a
 * moment, not the stack that was on screen: an activity absent from the finish
 * snapshot and present in the complete one is indistinguishable from one that
 * went 0 → 4, and the delta the debrief exists to produce would have to guess
 * which. Zero contributes zero to `total`, so carrying them costs nothing.
 */

import type { Activity, ScheduleSnapshot, SnapshotKind } from './types';
import { derivedState } from './totals';

export interface SnapshotInput {
  kind: SnapshotKind;
  activities: readonly Activity[];
  packVersion: string;
  /** Injected, so a snapshot is a pure function of what it is given. */
  t: number;
}

export function buildSnapshot({
  kind,
  activities,
  packVersion,
  t,
}: SnapshotInput): ScheduleSnapshot {
  const state = derivedState(activities);
  return {
    kind,
    t,
    packVersion,
    // Mode travels with the hours: a `fallback` 4 h and a `direct` 4 h are the
    // same number and different facts about the participant (§4.3 rule 5).
    activities: activities.map((activity) => ({
      id: activity.id,
      wd: { ...activity.wd },
      we: { ...activity.we },
    })),
    total: state.total,
    remaining: state.remaining,
    fits: state.fits,
  };
}
