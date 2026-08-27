/**
 * Net energy — plan 25 §E.1, amending §3.2 and §3.4.
 *
 *   energy(a)    = pack constant when `a` is locked, the participant's level
 *                  otherwise, 0 when unset
 *   net(dt)      = Σ hours(a, dt) × energy(a)
 *   netWeekly    = net('wd') × 5 + net('we') × 2
 *
 * The unit is **energy-hours**: an hour of a +2 activity and two hours of a +1
 * activity weigh the same. That is the whole content of the model, and it is
 * the reason the rating screen shows no hours (plan 25 §E.6) — the participant
 * rates the experience and the instrument applies the weight.
 *
 * Pure, DOM-free, and no view state. This module is what the summary screen
 * reads; it computes no strings and takes no position on what a negative week
 * means.
 */

import type { Activity, DayType, EnergyLevel, EnergyLevels } from './types';
import { DAY_TYPES, DAYS_PER_WEEK } from './types';
import { hoursOf } from './totals';

export type { EnergyLevel, EnergyLevels } from './types';

/** The scale, ascending. Pack validation checks `energy.scale` against it. */
export const ENERGY_LEVELS: readonly EnergyLevel[] = [-2, -1, 0, 1, 2] as const;

/** Absent, unrated, or unratable — all weigh nothing. */
export const NEUTRAL: EnergyLevel = 0;

export function isEnergyLevel(value: unknown): value is EnergyLevel {
  return ENERGY_LEVELS.includes(value as EnergyLevel);
}

/**
 * The level that applies to one activity.
 *
 * A `locked` activity takes the pack's constant and ignores `levels` entirely:
 * school is not on the rating screen, so a level under its id could only have
 * arrived by accident. Everything else takes the participant's, and an
 * unrated activity reads neutral — which is what force-advance produces
 * (plan 25 §E.5) and why the screen refuses to continue on an unrated row
 * (§E.6): the arithmetic cannot tell the two apart, so the interface must.
 */
export function energyOf(activity: Activity, levels: EnergyLevels): EnergyLevel {
  if (activity.locked) return activity.energy ?? NEUTRAL;
  return levels[activity.id] ?? NEUTRAL;
}

/**
 * One day's net, in energy-hours.
 *
 * Every activity in the stack contributes, zero-hour ones included — they
 * contribute zero, which is why the rating screen can leave them out without
 * changing any figure here (plan 25 §Decisions).
 */
export function netEnergy(
  activities: readonly Activity[],
  levels: EnergyLevels,
  dayType: DayType,
): number {
  return activities.reduce(
    (sum, activity) => sum + hoursOf(activity, dayType) * energyOf(activity, levels),
    0,
  );
}

/**
 * The week, at §3.1's five workdays and two weekend days.
 *
 * Composed from `netEnergy` rather than summing `weekly(activity) × level`, so
 * the week is defined in exactly one place and cannot drift from `weekly()`.
 */
export function netWeekly(activities: readonly Activity[], levels: EnergyLevels): number {
  return DAY_TYPES.reduce(
    (sum, dayType) => sum + netEnergy(activities, levels, dayType) * DAYS_PER_WEEK[dayType],
    0,
  );
}

export type Polarity = 'positive' | 'neutral' | 'negative';

/**
 * Half an ulp of nothing.
 *
 * Plan 25 §E.1 called for an exact comparison on the grounds that hours land
 * on quarter-hours and levels are integers. Half of that holds: a week whose
 * levels are all 0 sums to exactly 0, because every term is a product with
 * zero. The other half does not — pack fallbacks carry values like 1.7 and the
 * household estimator emits arbitrary reals, so two terms that cancel in
 * arithmetic can miss each other by an ulp and report `negative` for a week
 * that is level.
 *
 * The granularity that means anything here is 0.25 energy-hours — a quarter of
 * an hour at one rung. A tolerance nine orders of magnitude below that hides
 * no tie a participant could produce, and catches the dust.
 */
const ZERO_TOLERANCE = 1e-9;

/** Exactly what its name says, and nothing about what it is worth. */
export function polarity(net: number): Polarity {
  if (Math.abs(net) <= ZERO_TOLERANCE) return 'neutral';
  return net > 0 ? 'positive' : 'negative';
}
