/**
 * Domain types — transcribed from §3.2, §3.4, §5 and §10.
 *
 * The invariant that governs this file: hours for a derived activity are never
 * stored as source of truth (§3.2). They are recomputed from the answer map on
 * every read, which is what makes question replay safe.
 */

/* ── §3.1 Day types ─────────────────────────────────────────────────────── */

export type DayType = 'wd' | 'we';

export const DAY_TYPES: readonly DayType[] = ['wd', 'we'] as const;

/** Fixed in v1, not configurable. */
export const DAYS_PER_WEEK: Record<DayType, number> = { wd: 5, we: 2 };

export const HOURS_PER_DAY = 24;

/* ── §3.2 Activity ──────────────────────────────────────────────────────── */

/**
 * `fallback` is recoverable and `direct` is not (§4.3 rule 5). The three-member
 * union is load-bearing from the outset: a boolean cannot express the
 * difference between "the participant decided this" and "an estimator threw".
 */
export type DayValueMode = 'derived' | 'direct' | 'fallback';

export interface DayValue {
  mode: DayValueMode;
  /** Authoritative when mode !== 'derived'; recomputed from answers otherwise. */
  hours: number;
}

export interface Constraint {
  minWeekly?: number; // school: 20
  maxWeekly?: number; // school: 40
  minDaily?: number; // sleep: 6
  stepWeekly?: number; // school: 5
  weekendAllowed: boolean; // school: false
}

/**
 * How an activity sits with the participant, on the five-point scale of
 * plan 25 §E.1: −2 drains, +2 gains, 0 neutral.
 *
 * It is a level, not a rate: the hours are the weighting, applied once in
 * `netEnergy`. An activity carries one level across both day types — a run is
 * a run whether it happens on a Tuesday or a Sunday.
 */
export type EnergyLevel = -2 | -1 | 0 | 1 | 2;

/**
 * Keyed by activity id, and sparse: an activity the participant has not rated
 * is absent rather than zero, so "unset" and "called it neutral" stay
 * distinguishable everywhere except in the arithmetic, where both weigh
 * nothing (plan 25 §E.1, §Decisions).
 */
export type EnergyLevels = Record<string, EnergyLevel>;

export interface Activity {
  /** Stable, and matches a questionnaire section id. */
  id: string;
  label: string;
  /** 0–360, at `order × (360 / activityCount)` — see §7.5. */
  hue: number;
  /** Ascending = top to bottom. */
  order: number;
  wd: DayValue;
  we: DayValue;
  /** school only. */
  locked: boolean;
  constraint?: Constraint;
  /**
   * Pack-declared, and only for `locked` activities (plan 25 §E.2). School is
   * not revealed until the reveal stage, which is after the participant rates
   * their week, so its level is content rather than an answer. A level on an
   * unlocked activity is a pack validation failure — that value is the
   * participant's.
   */
  energy?: EnergyLevel;
}

/* ── §3.4 Derived state ─────────────────────────────────────────────────── */

/**
 * `remaining` may go negative and nothing clamps it; `fits()` is the S4
 * completion condition and evaluates both day types.
 */
export interface DerivedState {
  total: Record<DayType, number>;
  remaining: Record<DayType, number>;
  overflow: Record<DayType, number>;
  fits: boolean;
}

/* ── §5 Answer store ────────────────────────────────────────────────────── */

export interface Answer {
  value: unknown;
  /** epoch ms */
  at: number;
  /** increments on each edit, for telemetry */
  revision: number;
}

/** Flat, keyed by field id. Derived hours are never written here. */
export type AnswerMap = Record<string, Answer>;

/* ── §2.2 Stage machine ─────────────────────────────────────────────────── */

export type StageId = 's1' | 's2' | 's3' | 's4' | 's5';

export const STAGE_ORDER: readonly StageId[] = ['s1', 's2', 's3', 's4', 's5'] as const;

/** Minimum time in S3 before the flag may advance a participant (§2.2). */
export const S3_HOLD_MS = 5_000;

/* ── §10 Telemetry ──────────────────────────────────────────────────────── */

export type EventType =
  | 'screen.view'
  | 'field.answer'
  | 'field.revise'
  | 'stage.enter'
  | 'finish'
  | 'forced.advance'
  | 'sheet.open'
  | 'sheet.close'
  | 'hours.change'
  | 'mode.direct'
  | 'clamp.hit'
  | 'estimator.fallback'
  | 'fits'
  | 'complete';

export interface Event {
  /** epoch ms */
  t: number;
  type: EventType;
  activityId?: string;
  fieldId?: string;
  /**
   * The stage entered, on `stage.enter` only. §10's union carries no such
   * field; it is added because §6.2.2's `inStage` is derived from these events
   * server-side and *time to fit* is measured from the S4 entry in the log
   * (§10). Carrying it in `activityId` would leave that column holding two
   * unrelated kinds of value.
   */
  stage?: StageId;
  /** hours, for edits */
  from?: number;
  to?: number;
}

/** A room-level fact the server records itself (§6.2.5). `stage.open` only in v1. */
export interface RoomEvent {
  type: 'stage.open';
  t: number;
  ready: number;
  total: number;
}

/**
 * Taken at three points (§10): end of S1, at Finish (pre-reveal), and at
 * complete (post-rebalance).
 *
 * The shape is not spelled out in the spec; it is fixed by what the debrief
 * reads off it — per-activity delta is `complete − finish` per activity per day
 * type, and slack at finish is `remaining.wd` in the finish snapshot.
 */
export type SnapshotKind = 's1' | 'finish' | 'complete';

export interface SnapshotActivity {
  id: string;
  wd: DayValue;
  we: DayValue;
}

export interface ScheduleSnapshot {
  kind: SnapshotKind;
  /** epoch ms */
  t: number;
  packVersion: string;
  activities: SnapshotActivity[];
  total: Record<DayType, number>;
  remaining: Record<DayType, number>;
  fits: boolean;
}
