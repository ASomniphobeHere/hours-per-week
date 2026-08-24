/**
 * `household.v1` — a linear model per day type, evaluated client-side from
 * coefficients carried in the pack (§4.3, bundled path).
 *
 * v1 uses the bundled path for every estimator, `household` included: forty
 * phones on venue wifi and a network call inside a twenty-question flow is a
 * remote estimator degrading exactly when the workshop is busiest. Nothing in
 * `estimators/household.py` reaches the client; only its coefficients ship.
 */

import type { AnswerMap, DayType } from '@/lib/domain/types';
import { HOURS_PER_DAY } from '@/lib/domain/types';
import type {
  EstimatorDef,
  Field,
  HouseholdModel,
  HouseholdParams,
  HouseholdTerm,
} from '@/lib/pack/types';
import { asNumber, makeResolver } from './inputs';

export const HOUSEHOLD_ID = 'household.v1';

export function isHouseholdParams(value: unknown): value is HouseholdParams {
  if (typeof value !== 'object' || value === null) return false;
  const params = value as Partial<HouseholdParams>;
  return isHouseholdModel(params.wd) && isHouseholdModel(params.we);
}

function isHouseholdModel(value: unknown): value is HouseholdModel {
  if (typeof value !== 'object' || value === null) return false;
  const model = value as Partial<HouseholdModel>;
  if (typeof model.intercept !== 'number') return false;
  return Array.isArray(model.terms) && model.terms.every(isHouseholdTerm);
}

function isHouseholdTerm(value: unknown): value is HouseholdTerm {
  if (typeof value !== 'object' || value === null) return false;
  const term = value as { field?: unknown; coef?: unknown; levels?: unknown };
  if (typeof term.field !== 'string') return false;
  if (typeof term.coef === 'number') return true;
  return typeof term.levels === 'object' && term.levels !== null;
}

export function householdTermInputs(params: HouseholdParams): string[] {
  const inputs = new Set<string>();
  for (const model of [params.wd, params.we]) {
    for (const term of model.terms) inputs.add(term.field);
  }
  return [...inputs];
}

export function buildHousehold(def: EstimatorDef, fieldById: Map<string, Field>) {
  const params = def.params;
  if (!isHouseholdParams(params)) {
    throw new Error(`${def.activityId}: ${HOUSEHOLD_ID} params must carry a wd and a we model`);
  }

  return (answers: AnswerMap, dayType: DayType): number => {
    const resolve = makeResolver(answers, def, fieldById);
    const model = params[dayType];
    let hours = model.intercept;

    for (const term of model.terms) {
      const value = resolve(term.field);
      if ('levels' in term) {
        // An unrecognised or unanswered level contributes its reference level,
        // which the fit folds into the intercept — so, nothing.
        hours += typeof value === 'string' ? (term.levels[value] ?? 0) : 0;
      } else {
        hours += term.coef * asNumber(value);
      }
    }

    // A linear model is unbounded; hours are not. Clamping here keeps a
    // coefficient set that extrapolates badly from producing a band taller
    // than the day.
    return Math.min(Math.max(hours, 0), HOURS_PER_DAY);
  };
}
