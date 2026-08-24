/**
 * §4.4 derivation and the §4.3 mode machine.
 *
 *   hours(activity, dt):
 *     if mode == 'direct':          return stored hours
 *     if an estimator exists:       try it; on throw -> 'fallback', pack default
 *     else:                         zero
 *
 * The asymmetry in rule 5 is the whole point of the three-member mode union:
 * `fallback` is recoverable and `direct` is not. A `fallback` activity takes
 * the estimator branch on every pass and returns to `derived` the moment one
 * succeeds; only `direct` short-circuits. Collapsing the two would let one
 * dropped evaluation pin an activity to a pack default for the rest of the
 * session — including after the participant edits the very inputs the
 * estimator reads — and would record a transient failure as a participant
 * decision.
 */

import type { Activity, AnswerMap, DayType, DayValue, Event } from './types';
import { DAY_TYPES } from './types';
import type { Estimator } from '@/lib/pack/types';
import type { PackIndex } from '@/lib/pack';
import { fallbackHours } from '@/lib/pack';
import { gatedOutSections } from './gates';

/**
 * The mutable half of an activity: what the participant set directly and which
 * mode each day type is in. Hours for a `derived` activity are not state —
 * they are recomputed on every pass (§3.2's invariant) — but the mode is, and
 * so is the value behind `direct` and `fallback`.
 */
export type ActivityState = Record<DayType, DayValue>;

/** Activity id → its state. Activities absent here start out fully derived. */
export type ScheduleState = Record<string, ActivityState>;

export function initialDayValue(): DayValue {
  return { mode: 'derived', hours: 0 };
}

export function initialActivityState(): ActivityState {
  return { wd: initialDayValue(), we: initialDayValue() };
}

export interface DeriveInput {
  index: PackIndex;
  answers: AnswerMap;
  estimators: Map<string, Estimator>;
  /** Previous pass's state. Omitted on the first pass. */
  state?: ScheduleState;
  /** Injected so derivation stays pure — §4.3 rule 1 admits no clock. */
  now?: number;
}

export interface DeriveResult {
  /** Every pack activity, in `order`, with hours resolved for both day types. */
  activities: Activity[];
  /** Feed back into the next pass. */
  state: ScheduleState;
  /**
   * `estimator.fallback` events for activities that entered `fallback` on this
   * pass (§4.3 rule 3). Emitted on entry only — a retry that throws again is
   * the same failure, not a new one.
   */
  events: Event[];
}

function estimate(
  estimator: Estimator,
  answers: AnswerMap,
  dayType: DayType,
): { ok: true; hours: number } | { ok: false } {
  try {
    const hours = estimator(answers, dayType);
    // A non-finite result is a failed evaluation even without a throw; it
    // would otherwise propagate into every total in the system.
    if (!Number.isFinite(hours)) return { ok: false };
    return { ok: true, hours };
  } catch {
    return { ok: false };
  }
}

export function derive({
  index,
  answers,
  estimators,
  state = {},
  now = Date.now(),
}: DeriveInput): DeriveResult {
  const skipped = gatedOutSections(index.pack, answers);
  const nextState: ScheduleState = {};
  const activities: Activity[] = [];
  const events: Event[] = [];

  for (const def of index.activities) {
    const previous = state[def.id] ?? initialActivityState();
    const estimator = estimators.get(def.id);
    const resolved: ActivityState = initialActivityState();

    for (const dayType of DAY_TYPES) {
      const before = previous[dayType];

      // `direct` is the only short-circuit (§4.4), and it outranks the gate:
      // §7.7 has a participant give hours to a gated-out activity from its
      // Not-included row, and that edit must survive the next pass.
      if (before.mode === 'direct') {
        resolved[dayType] = { mode: 'direct', hours: before.hours };
        continue;
      }

      // A skipped section resolves to zero hours and lands in Not included
      // (§4.2.1 rule 4). It stays `derived`: zero is what its answers derive
      // to, not a failure.
      if (skipped.has(def.id)) {
        resolved[dayType] = { mode: 'derived', hours: 0 };
        continue;
      }

      if (estimator === undefined) {
        resolved[dayType] = { mode: 'derived', hours: before.hours };
        continue;
      }

      const outcome = estimate(estimator, answers, dayType);
      if (outcome.ok) {
        resolved[dayType] = { mode: 'derived', hours: outcome.hours };
        continue;
      }

      resolved[dayType] = { mode: 'fallback', hours: fallbackHours(def, dayType) };
      if (before.mode !== 'fallback') {
        events.push({ t: now, type: 'estimator.fallback', activityId: def.id });
      }
    }

    nextState[def.id] = resolved;
    activities.push({
      id: def.id,
      label: def.label,
      hue: def.hue,
      order: def.order,
      wd: resolved.wd,
      we: resolved.we,
      locked: def.locked === true,
      ...(def.constraint !== undefined ? { constraint: def.constraint } : {}),
    });
  }

  return { activities, state: nextState, events };
}

/**
 * §4.3 rule 4 — the participant edited this activity directly, so the
 * estimator no longer runs for it. Underlying answers are untouched: reverting
 * restores derivation from them unchanged (§8.1, AC 26).
 */
export function setDirect(
  state: ScheduleState,
  activityId: string,
  dayType: DayType,
  hours: number,
): ScheduleState {
  const current = state[activityId] ?? initialActivityState();
  return {
    ...state,
    [activityId]: { ...current, [dayType]: { mode: 'direct', hours } },
  };
}

/** Reverts a `direct` day value so the next pass derives it again. */
export function clearDirect(
  state: ScheduleState,
  activityId: string,
  dayType: DayType,
): ScheduleState {
  const current = state[activityId];
  if (current === undefined) return state;
  return {
    ...state,
    [activityId]: { ...current, [dayType]: { mode: 'derived', hours: current[dayType].hours } },
  };
}

/** True when neither day type is authored by the participant. */
export function isFullyDerived(state: ScheduleState, activityId: string): boolean {
  const current = state[activityId];
  if (current === undefined) return true;
  return DAY_TYPES.every((dayType) => current[dayType].mode !== 'direct');
}
