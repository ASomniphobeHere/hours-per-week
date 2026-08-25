/**
 * §3.3 and §7.7 — the stack the participant is shown, split from the full
 * activity set.
 *
 * Two filters, and both are load-bearing.
 *
 * **Zero-hour activities leave the stack** (§7.7). A 0-height band is a dead
 * tap target and a band at some arbitrary minimum misrepresents the total, so
 * they move to Not included instead. Membership is zero on *both* day types:
 * an activity with hours on one day and none on the other stays in the stack
 * and simply renders no band on the empty day.
 *
 * **`locked` activities are absent before S4** (§3.3). School is inserted at
 * the reveal and exists nowhere earlier, so at the end of S1 it is neither a
 * band nor a Not-included row — it is not yet part of the participant's week.
 * `locked` is the pack's own marker for an activity that carries none of the
 * questionnaire (§4.6 `activity-covered` already exempts it on that basis),
 * so nothing here names school.
 */

import type { Activity } from './types';
import { isNotIncluded } from './totals';

export interface Stack {
  /** One band per non-zero activity, in pack `order`. */
  bands: Activity[];
  /** Zero on both day types, in pack `order` (§7.7). */
  notIncluded: Activity[];
}

export interface StackOptions {
  /** True from S4 onward, when school has been revealed (§3.3). */
  includeLocked?: boolean;
}

/** Activities the participant can see at this point in the stage machine. */
export function visibleActivities(
  activities: readonly Activity[],
  { includeLocked = false }: StackOptions = {},
): Activity[] {
  return includeLocked ? [...activities] : activities.filter((activity) => !activity.locked);
}

export function buildStack(
  activities: readonly Activity[],
  options: StackOptions = {},
): Stack {
  const visible = visibleActivities(activities, options);
  return {
    bands: visible.filter((activity) => !isNotIncluded(activity)),
    notIncluded: visible.filter(isNotIncluded),
  };
}
