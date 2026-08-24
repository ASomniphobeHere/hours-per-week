/**
 * Content pack types — transcribed from §4.1 through §4.5.
 *
 * The question bank and the estimators are content: they ship as a versioned
 * pack fetched at session start and can be replaced without a client release.
 */

import type { AnswerMap, Constraint, DayType } from '@/lib/domain/types';

/* ── §4.5 Media ─────────────────────────────────────────────────────────── */

export interface Media {
  /** CDN URL, or pack-relative path. */
  src: string;
  /** Copy key. Required at validation — every question must be answerable
   *  with images failed to load. */
  alt: string;
  /** width / height — declared so layout space is reserved before load. */
  aspect: number;
}

/* ── §4.2 Screens and fields ────────────────────────────────────────────── */

export type FieldType = 'count' | 'duration' | 'clock' | 'number' | 'choice' | 'multichoice';

export type FieldUnit = 'minutes' | 'hours' | 'times' | 'clock';

export interface FieldOption {
  id: string;
  label: string;
}

export interface Field {
  /** Stable answer key, e.g. "sleep.wake.wd". Unique across the pack. */
  id: string;
  /** Copy key. */
  label: string;
  type: FieldType;
  /** Set when the field is day-scoped. Two day-scoped fields on one screen
   *  capture independently. */
  dayType?: DayType;
  unit?: FieldUnit;
  min?: number;
  max?: number;
  step?: number;
  options?: FieldOption[];
  required: boolean;
  default?: unknown;
}

export interface Screen {
  id: string;
  /** Activity id this screen contributes to. */
  sectionId: string;
  /** Copy key. */
  prompt: string;
  /** Copy key, secondary line. */
  note?: string;
  /** 0–2 images (§4.5). A third is a validation error. */
  media?: Media[];
  fields: Field[];
  /** This screen gates its section (§4.2.1). At most one per section, and it
   *  sits on that section's first screen. */
  gate?: true;
}

/* ── §4.3 Estimators ────────────────────────────────────────────────────── */

/**
 * v1 uses the bundled path for every estimator, `household` included: the model
 * is fitted offline against the ATUS extract and only its coefficients ship.
 * `params` carries them, shaped by the estimator implementation.
 */
export interface EstimatorDef {
  /** Names the *implementation*, e.g. "arith.freqDuration" or "household.v1".
   *  Not unique across the pack: eight v1 activities share `arith.freqDuration`.
   *  `activityId` is what is unique — one estimator per activity. */
  id: string;
  activityId: string;
  /** Field ids it reads. Must resolve to existing fields. */
  inputs: string[];
  /** Which day types it produces. */
  outputs: DayType[];
  /** Shaped by the implementation named in `id`. */
  params?: Record<string, unknown>;
  /** Values for inputs this estimator may find unanswered (§4.3 rule 2).
   *  §4.6 requires one here for any input that lives in a gated section, since
   *  a field's own default is unreachable once its section is gated out. */
  defaults?: Record<string, unknown>;
}

/* ── arith.freqDuration params ──────────────────────────────────────────── */

/**
 * §4.4's third branch is "Σ over the activity's frequency × duration field
 * pairs". §4.2's own worked example is wake time on workdays beside wake time
 * on weekend days — a clock pair, which no frequency × duration expression can
 * reach. So the branch is a declarative sum over *terms*, of which the
 * frequency × duration pair is one kind. Still one estimator and one code path;
 * nothing is special-cased per activity.
 *
 * A term with no `dayType` contributes to both days. One scoped to a day type
 * contributes only there, which is how "work 8 h on a workday, 0 on a weekend
 * day" is expressed without two estimators.
 */
export type ArithTerm =
  | { kind: 'freqDuration'; freq: string; duration: string; dayType?: DayType }
  | { kind: 'duration'; field: string; dayType?: DayType }
  | { kind: 'clockSpan'; from: string; to: string; dayType?: DayType };

export interface ArithParams {
  terms: ArithTerm[];
}

/* ── household.v1 params ────────────────────────────────────────────────── */

/**
 * A linear model per day type, fitted offline against the ATUS extract
 * (Stage 9). ATUS gives one diary day per respondent, so `wd` and `we` are two
 * models over two disjoint subsamples rather than one model with a day term.
 */
export type HouseholdTerm =
  /** Numeric input: contributes `coef × value`. */
  | { field: string; coef: number }
  /** Categorical input: contributes the coefficient for the chosen option id. */
  | { field: string; levels: Record<string, number> };

export interface HouseholdModel {
  intercept: number;
  terms: HouseholdTerm[];
}

export interface HouseholdParams {
  wd: HouseholdModel;
  we: HouseholdModel;
}

/** Pure: no time, no randomness, no session state (§4.3 rule 1). */
export type Estimator = (answers: AnswerMap, dayType: DayType) => number;

/* ── §4.1 Pack shape ────────────────────────────────────────────────────── */

export interface ActivityDef {
  id: string;
  /** Copy key. */
  label: string;
  /** 0–360, at `order × (360 / activities.length)` (§7.5). */
  hue: number;
  order: number;
  /** school only. */
  locked?: boolean;
  constraint?: Constraint;
  /** Field id whose skipping value skips the section (§4.2.1). */
  gateField?: string;
  /** The gate answer that skips the section. §4.2.1 rule 1 admits a choice
   *  gate, whose answer is an option id and so is never JS-falsy; naming the
   *  value here is also what makes §4.6's "its default is not the skipping
   *  value" checkable. Absent, the skipping value is JS falsiness — which is
   *  what a `count` gate answered 0 wants. An unanswered gate is never
   *  skipping (§4.2.1 rule 6). */
  gateSkipValue?: unknown;
  /** Per-day-type default hours, used when this activity's estimator throws
   *  (§4.3 rule 3). Required for every activity with a fallback path (§4.6). */
  fallbackHours?: Record<DayType, number>;
}

export interface ContentPack {
  version: string;
  /** The §3.3 table, as data. The set is not hardcoded. */
  activities: ActivityDef[];
  /** The questionnaire, ordered. */
  screens: Screen[];
  estimators: EstimatorDef[];
  /** §9. Every referenced copy key must exist. */
  copy: Record<string, string>;
}
