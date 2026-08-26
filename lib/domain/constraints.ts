/**
 * §8.2 constraints, and §8.3's school rule.
 *
 * | sleep       | >= 6 h per day        | input clamps at 6, stepper disables below |
 * | school      | 20-40 h/week, 5 h steps, workdays only |
 * | all others  | >= 0                  | input clamps at 0 |
 *
 * Clamping is silent — no error copy, the control simply stops — and emits
 * `clamp.hit` so the debrief can read "sleep floor hit" off the event log
 * (§10) without the participant ever seeing a message.
 */

import type { Activity, Constraint, DayType, Event } from './types';
import { DAYS_PER_WEEK } from './types';

export interface ClampResult {
  hours: number;
  /** True when the requested value was refused. Emit `clamp.hit`. */
  clamped: boolean;
}

const FLOOR = 0;

/** Per-day clamp for a value the participant is setting directly. */
export function clampDaily(
  activity: Pick<Activity, 'id' | 'constraint'>,
  dayType: DayType,
  hours: number,
): ClampResult {
  const constraint = activity.constraint;

  if (constraint !== undefined && dayType === 'we' && !constraint.weekendAllowed) {
    return { hours: 0, clamped: hours !== 0 };
  }

  const minimum = Math.max(FLOOR, constraint?.minDaily ?? FLOOR);
  if (!Number.isFinite(hours)) return { hours: minimum, clamped: true };
  if (hours < minimum) return { hours: minimum, clamped: true };
  return { hours, clamped: false };
}

/**
 * §8.3's weekly stepper. School is adjustable upward only, in 5 h weekly
 * increments from a 20 h floor, and contributes nothing to the weekend. The
 * decrement control is disabled at the minimum, so a request below it is a
 * clamp rather than a rejection.
 */
export function clampWeekly(
  activity: Pick<Activity, 'id' | 'constraint'>,
  weeklyHours: number,
): ClampResult {
  const constraint = activity.constraint;
  const minimum = constraint?.minWeekly ?? FLOOR;
  const step = constraint?.stepWeekly;

  const maximum = constraint?.maxWeekly;

  if (!Number.isFinite(weeklyHours)) return { hours: minimum, clamped: true };
  if (weeklyHours < minimum) return { hours: minimum, clamped: true };
  if (maximum !== undefined && weeklyHours > maximum) return { hours: maximum, clamped: true };
  if (step === undefined || step <= 0) return { hours: weeklyHours, clamped: false };

  const steps = Math.round((weeklyHours - minimum) / step);
  const snapped = minimum + steps * step;
  return { hours: snapped, clamped: snapped !== weeklyHours };
}

/** Days a weekly total is spread across, given the constraint (§8.3: 5). */
export function spreadDays(constraint: Constraint | undefined): DayType[] {
  if (constraint !== undefined && !constraint.weekendAllowed) return ['wd'];
  return ['wd', 'we'];
}

/** 20 h/week over the 5 workdays is 4 h per workday (§8.3). */
export function weeklyToDaily(
  constraint: Constraint | undefined,
  weeklyHours: number,
  dayType: DayType,
): number {
  const days = spreadDays(constraint);
  if (!days.includes(dayType)) return 0;
  const totalDays = days.reduce((sum, day) => sum + DAYS_PER_WEEK[day], 0);
  return totalDays === 0 ? 0 : weeklyHours / totalDays;
}

/** True when the decrement control is disabled (§8.3). */
export function atWeeklyMinimum(
  activity: Pick<Activity, 'constraint'>,
  weeklyHours: number,
): boolean {
  const minimum = activity.constraint?.minWeekly;
  return minimum !== undefined && weeklyHours <= minimum;
}

/**
 * True when the increment control is disabled (§8.3's ceiling).
 *
 * The mirror of `atWeeklyMinimum`, and new with the ladder. 1.2 said school
 * was "adjustable upward only" and named no maximum, which was harmless while
 * the number meant nothing but a band height; once every rung states an
 * outcome, an unbounded stepper walks past the last claim the pack can make.
 */
export function atWeeklyMaximum(
  activity: Pick<Activity, 'constraint'>,
  weeklyHours: number,
): boolean {
  const maximum = activity.constraint?.maxWeekly;
  return maximum !== undefined && weeklyHours >= maximum;
}

/**
 * The weekly levels a stepper can reach, from the constraint alone (§8.3).
 *
 * Every rung states an outcome (§9), so this is what the required-copy check
 * is derived from as well as what the stepper walks — adding one stays a pack
 * edit plus a `maxWeekly` bump rather than a client change, and a pack that
 * raises the ceiling without writing the new rung's copy fails to load.
 */
export function weeklyLevels(constraint: Constraint | undefined): number[] {
  const minimum = constraint?.minWeekly;
  const maximum = constraint?.maxWeekly;
  const step = constraint?.stepWeekly;
  if (minimum === undefined || maximum === undefined || step === undefined) return [];
  if (step <= 0 || maximum < minimum) return [];
  const levels: number[] = [];
  for (let weekly = minimum; weekly <= maximum; weekly += step) levels.push(weekly);
  return levels;
}

export function clampEvent(activityId: string, from: number, to: number, now: number): Event {
  return { t: now, type: 'clamp.hit', activityId, from, to };
}

/**
 * True when the decrement control is disabled on a per-day input (§8.2).
 *
 * The mirror of `atWeeklyMinimum` for the daily floors: sleep's 6 h, and 0 for
 * everything else. A day type the activity is not allowed on at all (§8.3's
 * weekend) is at its minimum by definition — the control has nowhere to go.
 */
export function atDailyMinimum(
  activity: Pick<Activity, 'id' | 'constraint'>,
  dayType: DayType,
  hours: number,
): boolean {
  const constraint = activity.constraint;
  if (constraint !== undefined && dayType === 'we' && !constraint.weekendAllowed) return true;
  return hours <= Math.max(FLOOR, constraint?.minDaily ?? FLOOR);
}
