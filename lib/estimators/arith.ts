/**
 * `arith.freqDuration` — §4.4's third branch.
 *
 * The branch is declared as a pack estimator like any other so there is
 * exactly one code path and nothing is special-cased per activity. Its params
 * are a list of terms summed to hours for the requested day type; a term with
 * no `dayType` contributes to both days.
 */

import type { AnswerMap, DayType } from '@/lib/domain/types';
import type { ArithParams, ArithTerm, EstimatorDef, Field } from '@/lib/pack/types';
import { asClockMinutes, asNumber, durationToHours, makeResolver } from './inputs';

export const ARITH_ID = 'arith.freqDuration';

export function isArithParams(value: unknown): value is ArithParams {
  if (typeof value !== 'object' || value === null) return false;
  const terms = (value as Partial<ArithParams>).terms;
  return Array.isArray(terms) && terms.every(isArithTerm);
}

export function isArithTerm(value: unknown): value is ArithTerm {
  if (typeof value !== 'object' || value === null) return false;
  const term = value as { kind?: unknown; [key: string]: unknown };
  if (term.dayType !== undefined && term.dayType !== 'wd' && term.dayType !== 'we') return false;
  switch (term.kind) {
    case 'freqDuration':
      return typeof term.freq === 'string' && typeof term.duration === 'string';
    case 'duration':
      return typeof term.field === 'string';
    case 'clockSpan':
      return typeof term.from === 'string' && typeof term.to === 'string';
    default:
      return false;
  }
}

/** Field ids a term reads, for validation and for `EstimatorDef.inputs`. */
export function arithTermInputs(term: ArithTerm): string[] {
  switch (term.kind) {
    case 'freqDuration':
      return [term.freq, term.duration];
    case 'duration':
      return [term.field];
    case 'clockSpan':
      return [term.from, term.to];
  }
}

/**
 * Hours between two clock answers, wrapping midnight — 23:00 to 07:00 is 8 h,
 * not −16. Equal times are zero rather than 24: a participant who has not
 * answered one of the two should not be handed a whole day.
 */
export function clockSpanHours(fromMinutes: number, toMinutes: number): number {
  return (((toMinutes - fromMinutes) % 1440) + 1440) % 1440 / 60;
}

export function buildArith(def: EstimatorDef, fieldById: Map<string, Field>) {
  const params = def.params;
  if (!isArithParams(params)) {
    throw new Error(`${def.activityId}: ${ARITH_ID} params must be { terms: ArithTerm[] }`);
  }

  return (answers: AnswerMap, dayType: DayType): number => {
    const resolve = makeResolver(answers, def, fieldById);
    let hours = 0;

    for (const term of params.terms) {
      if (term.dayType !== undefined && term.dayType !== dayType) continue;

      switch (term.kind) {
        case 'freqDuration': {
          const times = asNumber(resolve(term.freq));
          const each = durationToHours(resolve(term.duration), fieldById.get(term.duration));
          hours += times * each;
          break;
        }
        case 'duration': {
          hours += durationToHours(resolve(term.field), fieldById.get(term.field));
          break;
        }
        case 'clockSpan': {
          const from = asClockMinutes(resolve(term.from));
          const to = asClockMinutes(resolve(term.to));
          // An unparseable clock answer contributes nothing rather than NaN;
          // §4.3 rule 2 forbids poisoning the sum.
          if (from === null || to === null) break;
          hours += clockSpanHours(from, to);
          break;
        }
      }
    }

    return hours;
  };
}
