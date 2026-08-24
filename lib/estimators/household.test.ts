import { describe, expect, it } from 'vitest';
import type { AnswerMap } from '@/lib/domain/types';
import type { EstimatorDef, Field } from '@/lib/pack/types';
import { buildHousehold, householdTermInputs, isHouseholdParams } from './household';

function answer(map: Record<string, unknown>): AnswerMap {
  return Object.fromEntries(
    Object.entries(map).map(([id, value]) => [id, { value, at: 0, revision: 1 }]),
  );
}

const numberField = (id: string, fallback?: number): Field => ({
  id,
  label: id,
  type: 'number',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

const choiceField = (id: string, fallback?: string): Field => ({
  id,
  label: id,
  type: 'choice',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

const PARAMS = {
  wd: {
    intercept: 1,
    terms: [
      { field: 'size', coef: 0.25 },
      { field: 'status', levels: { full: 0, none: 0.8 } },
    ],
  },
  we: {
    intercept: 2,
    terms: [{ field: 'size', coef: 0.5 }],
  },
};

function def(defaults?: Record<string, unknown>): EstimatorDef {
  return {
    id: 'household.v1',
    activityId: 'household',
    inputs: ['size', 'status'],
    outputs: ['wd', 'we'],
    params: PARAMS,
    ...(defaults === undefined ? {} : { defaults }),
  };
}

const fieldMap = new Map<string, Field>([
  ['size', numberField('size', 2)],
  ['status', choiceField('status', 'full')],
]);

describe('household.v1', () => {
  it('evaluates a separate model per day type', () => {
    const estimate = buildHousehold(def(), fieldMap);
    const answers = answer({ size: 4, status: 'full' });
    expect(estimate(answers, 'wd')).toBe(1 + 0.25 * 4);
    expect(estimate(answers, 'we')).toBe(2 + 0.5 * 4);
  });

  it('adds the coefficient for a categorical level', () => {
    const estimate = buildHousehold(def(), fieldMap);
    expect(estimate(answer({ size: 2, status: 'none' }), 'wd')).toBeCloseTo(1 + 0.5 + 0.8, 10);
  });

  it('treats an unrecognised level as the reference level the fit folded into the intercept', () => {
    const estimate = buildHousehold(def(), fieldMap);
    expect(estimate(answer({ size: 2, status: 'unknown' }), 'wd')).toBeCloseTo(1.5, 10);
  });

  /* §4.3 rule 1 — pure: no time, no randomness, no session state. */
  it('is pure — the same answer map gives the same hours every call', () => {
    const estimate = buildHousehold(def(), fieldMap);
    const answers = answer({ size: 3, status: 'full' });
    const first = estimate(answers, 'wd');
    expect(estimate(answers, 'wd')).toBe(first);
    expect(estimate(answers, 'wd')).toBe(first);
  });

  /* §4.3 rule 2 — a value for any answer map, missing inputs and all. */
  it('returns a number for an empty answer map, from the field defaults', () => {
    const estimate = buildHousehold(def(), fieldMap);
    expect(estimate({}, 'wd')).toBe(1.5);
    expect(Number.isNaN(estimate({}, 'we'))).toBe(false);
  });

  it('clamps a coefficient set that extrapolates past a day', () => {
    const estimate = buildHousehold(def(), fieldMap);
    expect(estimate(answer({ size: 1000, status: 'full' }), 'wd')).toBe(24);
    expect(estimate(answer({ size: -1000, status: 'full' }), 'wd')).toBe(0);
  });

  it('rejects params missing a day-type model at build time', () => {
    const broken = { ...def(), params: { wd: PARAMS.wd } };
    expect(() => buildHousehold(broken, fieldMap)).toThrow();
    expect(isHouseholdParams({ wd: PARAMS.wd })).toBe(false);
  });

  it('reports the fields its coefficients read, for validation', () => {
    expect(householdTermInputs(PARAMS)).toEqual(['size', 'status']);
  });
});
