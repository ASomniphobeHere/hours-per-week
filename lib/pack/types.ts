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
  /** e.g. "household.v1" */
  id: string;
  activityId: string;
  /** Field ids it reads. Must resolve to existing fields. */
  inputs: string[];
  /** Which day types it produces. */
  outputs: DayType[];
  params?: Record<string, unknown>;
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
  /** Field id whose falsy value skips the section (§4.2.1). */
  gateField?: string;
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
