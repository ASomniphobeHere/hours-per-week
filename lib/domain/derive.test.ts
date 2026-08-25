import { beforeEach, describe, expect, it } from 'vitest';
import type { AnswerMap } from './types';
import { indexPack, type PackIndex } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { buildEstimators } from '@/lib/estimators/registry';
import type { Estimator } from '@/lib/pack/types';
import { clearDirect, derive, setDirect, type ScheduleState } from './derive';
import { setAnswer } from '@/lib/store/answers';

let index: PackIndex;
let estimators: Map<string, Estimator>;

beforeEach(() => {
  index = indexPack(minimalPack());
  estimators = buildEstimators(index.pack.estimators, index.fieldById);
});

function hours(state: ScheduleState | undefined, answers: AnswerMap = {}) {
  const result = derive({ index, answers, estimators, state, now: 1_000 });
  const byId = Object.fromEntries(result.activities.map((a) => [a.id, a]));
  return { ...result, byId };
}

describe('derivation (§4.4)', () => {
  it('derives from field defaults when nothing is answered', () => {
    const { byId } = hours(undefined);
    expect(byId.alpha!.wd).toEqual({ mode: 'derived', hours: 1 });
    expect(byId.beta!.we).toEqual({ mode: 'derived', hours: 0.5 });
  });

  it('recomputes from the answer map, never from stored hours (§3.2)', () => {
    const answers = setAnswer({}, 'alpha.minutes.wd', 180);
    const first = hours(undefined, answers);
    expect(first.byId.alpha!.wd.hours).toBe(3);

    // Feed the previous state back in with a *different* answer: the stored
    // hours must not survive.
    const second = hours(first.state, setAnswer(answers, 'alpha.minutes.wd', 30));
    expect(second.byId.alpha!.wd.hours).toBe(0.5);
  });

  it('returns activities in pack order', () => {
    const { activities } = hours(undefined);
    expect(activities.map((a) => a.id)).toEqual(['alpha', 'beta']);
  });
});

describe('gates (§4.2.1)', () => {
  it('resolves a gated-out section to zero on both day types', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    const { byId } = hours(undefined, answers);
    expect(byId.beta!.wd.hours).toBe(0);
    expect(byId.beta!.we.hours).toBe(0);
  });

  it('leaves other sections untouched', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    const { byId } = hours(undefined, answers);
    expect(byId.alpha!.wd.hours).toBe(1);
  });

  /* §4.2.1 rule 6 — an unanswered gate is truthy, so a force-advanced
     participant reaches S4 with a full stack rather than a hollow one. */
  it('treats an unanswered gate as truthy', () => {
    const { byId } = hours(undefined, {});
    expect(byId.beta!.wd.hours).toBeGreaterThan(0);
  });

  it('keeps zero as `derived`, not `fallback` — zero is what the answers derive to', () => {
    const { byId } = hours(undefined, setAnswer({}, 'beta.any', 'no'));
    expect(byId.beta!.wd.mode).toBe('derived');
  });
});

describe('the mode machine (§4.3 rules 4–5, AC 27)', () => {
  function throwingEstimators(): Map<string, Estimator> {
    const map = new Map(estimators);
    map.set('alpha', () => {
      throw new Error('estimator exploded');
    });
    return map;
  }

  it('an estimator failure sets `fallback`, not `direct`, and returns the pack default', () => {
    const result = derive({ index, answers: {}, estimators: throwingEstimators(), now: 5 });
    const alpha = result.activities.find((a) => a.id === 'alpha')!;
    expect(alpha.wd.mode).toBe('fallback');
    expect(alpha.wd.hours).toBe(1); // fallbackHours.wd from the pack
  });

  it('logs `estimator.fallback` on entry, and not again on a repeated failure', () => {
    const failing = throwingEstimators();
    const first = derive({ index, answers: {}, estimators: failing, now: 5 });
    expect(first.events.filter((e) => e.type === 'estimator.fallback')).toHaveLength(2);

    const second = derive({ index, answers: {}, estimators: failing, state: first.state, now: 6 });
    expect(second.events).toHaveLength(0);
  });

  it('a later successful evaluation returns the activity to `derived`', () => {
    const failed = derive({ index, answers: {}, estimators: throwingEstimators(), now: 5 });
    expect(failed.state.alpha!.wd.mode).toBe('fallback');

    const recovered = derive({ index, answers: {}, estimators, state: failed.state, now: 6 });
    const alpha = recovered.activities.find((a) => a.id === 'alpha')!;
    expect(alpha.wd.mode).toBe('derived');
    expect(alpha.wd.hours).toBe(1);
  });

  it('treats a non-finite result as a failure — NaN must not reach a total', () => {
    const nan = new Map(estimators);
    nan.set('alpha', () => Number.NaN);
    const result = derive({ index, answers: {}, estimators: nan, now: 5 });
    const alpha = result.activities.find((a) => a.id === 'alpha')!;
    expect(alpha.wd.mode).toBe('fallback');
    expect(Number.isFinite(alpha.wd.hours)).toBe(true);
  });

  it('`direct` is never re-evaluated, however the answers change', () => {
    const answers = setAnswer({}, 'alpha.minutes.wd', 60);
    const state = setDirect({}, 'alpha', 'wd', 5);

    const result = hours(state, setAnswer(answers, 'alpha.minutes.wd', 600));
    expect(result.byId.alpha!.wd).toEqual({ mode: 'direct', hours: 5 });
  });

  it('`direct` outranks the gate, so hours given from a Not-included row survive (§7.7)', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    const state = setDirect({}, 'beta', 'wd', 2);
    const { byId } = hours(state, answers);
    expect(byId.beta!.wd).toEqual({ mode: 'direct', hours: 2 });
  });

  it('direct entry does not erase the answers; reverting restores derivation (AC 26)', () => {
    const answers = setAnswer({}, 'alpha.minutes.wd', 90);
    const direct = setDirect({}, 'alpha', 'wd', 12);
    expect(hours(direct, answers).byId.alpha!.wd.hours).toBe(12);

    const reverted = clearDirect(direct, 'alpha', 'wd');
    expect(hours(reverted, answers).byId.alpha!.wd).toEqual({ mode: 'derived', hours: 1.5 });
  });

  it('a `fallback` day type does not drag its sibling out of `derived`', () => {
    const halfFailing = new Map(estimators);
    halfFailing.set('alpha', (_answers, dayType) => {
      if (dayType === 'wd') throw new Error('workday only');
      return 3;
    });
    const result = derive({ index, answers: {}, estimators: halfFailing, now: 5 });
    const alpha = result.activities.find((a) => a.id === 'alpha')!;
    expect(alpha.wd.mode).toBe('fallback');
    expect(alpha.we).toEqual({ mode: 'derived', hours: 3 });
  });
});
