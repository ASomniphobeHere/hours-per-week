/**
 * §4.3 rule 2: an estimator must return a value for any answer map, including
 * one where its inputs are unanswered. Missing inputs fall back to
 * pack-defined defaults — never to NaN and never to a throw.
 *
 * Three sources, in order: the answer, the estimator's own declared default,
 * then the field's default. The estimator's default comes first because §4.6
 * requires one for any input in a gated section — where the field's own
 * default is unreachable, the section having been skipped.
 */

import type { AnswerMap } from '@/lib/domain/types';
import type { EstimatorDef, Field } from '@/lib/pack/types';
import { isAnswered } from '@/lib/store/answers';

export interface InputResolver {
  (fieldId: string): unknown;
}

export function makeResolver(
  answers: AnswerMap,
  def: EstimatorDef,
  fieldById: Map<string, Field>,
): InputResolver {
  return (fieldId: string): unknown => {
    if (isAnswered(answers, fieldId)) return answers[fieldId]?.value;
    const declared = def.defaults?.[fieldId];
    if (declared !== undefined) return declared;
    return fieldById.get(fieldId)?.default;
  };
}

/** Coerces an answer to a finite number, or `fallback` when it is not one. */
export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Minutes from midnight for a `clock` answer. Accepts "HH:MM" and a raw minute
 * count, so a stepper and a time input can write the same field.
 */
export function asClockMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return ((value % 1440) + 1440) % 1440;
  }
  if (typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match === null) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

/** Converts a duration answer to hours using its field's declared unit. */
export function durationToHours(value: unknown, field: Field | undefined): number {
  const amount = asNumber(value);
  return field?.unit === 'hours' ? amount : amount / 60;
}
