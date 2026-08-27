/**
 * §3.4 derived state.
 *
 *   total(dt)     = Σ activity.hours(dt)
 *   remaining(dt) = 24 - total(dt)
 *   overflow(dt)  = max(0, total(dt) - 24)
 *   fits()        = overflow('wd') === 0 && overflow('we') === 0
 *
 * `remaining` may be negative and nothing clamps it — §11 admits an answer set
 * over 24 h at S1 and calls it a real finding, so the editor is expected to
 * open already striped.
 */

import type { Activity, DayType, DerivedState } from './types';
import { DAY_TYPES, DAYS_PER_WEEK, HOURS_PER_DAY } from './types';

export function hoursOf(activity: Activity, dayType: DayType): number {
  return activity[dayType].hours;
}

export function total(activities: readonly Activity[], dayType: DayType): number {
  return activities.reduce((sum, activity) => sum + hoursOf(activity, dayType), 0);
}

export function remaining(activities: readonly Activity[], dayType: DayType): number {
  return HOURS_PER_DAY - total(activities, dayType);
}

export function overflow(activities: readonly Activity[], dayType: DayType): number {
  return Math.max(0, total(activities, dayType) - HOURS_PER_DAY);
}

/**
 * §3.4's completion condition, in its general both-day-types form.
 *
 * School is workday-only, so this is *effectively* a workday condition — but
 * §11 lets a participant arrive at the reveal with a weekend already over 24 for a
 * cause school did not create. Keeping the general form is what makes that
 * case block confirm rather than slip through, and what spares a rewrite if a
 * future commitment ever bears on the weekend.
 */
export function fits(activities: readonly Activity[]): boolean {
  return DAY_TYPES.every((dayType) => overflow(activities, dayType) === 0);
}

export function derivedState(activities: readonly Activity[]): DerivedState {
  const totals = { wd: total(activities, 'wd'), we: total(activities, 'we') };
  return {
    total: totals,
    remaining: { wd: HOURS_PER_DAY - totals.wd, we: HOURS_PER_DAY - totals.we },
    overflow: {
      wd: Math.max(0, totals.wd - HOURS_PER_DAY),
      we: Math.max(0, totals.we - HOURS_PER_DAY),
    },
    fits: totals.wd <= HOURS_PER_DAY && totals.we <= HOURS_PER_DAY,
  };
}

/** §3.1: `hours('wd') × 5 + hours('we') × 2`. */
export function weekly(activity: Activity): number {
  return DAY_TYPES.reduce(
    (sum, dayType) => sum + hoursOf(activity, dayType) * DAYS_PER_WEEK[dayType],
    0,
  );
}

/**
 * §7.7 membership: zero on *both* day types. An activity with zero on one and
 * hours on the other stays in the stack and renders a band only where it has
 * hours.
 */
export function isNotIncluded(activity: Activity): boolean {
  return DAY_TYPES.every((dayType) => hoursOf(activity, dayType) === 0);
}

export function stackActivities(activities: readonly Activity[]): Activity[] {
  return activities.filter((activity) => !isNotIncluded(activity));
}

export function notIncludedActivities(activities: readonly Activity[]): Activity[] {
  return activities.filter(isNotIncluded);
}
