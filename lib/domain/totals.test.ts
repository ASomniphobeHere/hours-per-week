import { describe, expect, it } from 'vitest';
import type { Activity } from './types';
import {
  derivedState,
  fits,
  isNotIncluded,
  notIncludedActivities,
  overflow,
  remaining,
  stackActivities,
  total,
  weekly,
} from './totals';

function activity(id: string, wd: number, we: number, order = 0): Activity {
  return {
    id,
    label: id,
    hue: 0,
    order,
    wd: { mode: 'derived', hours: wd },
    we: { mode: 'derived', hours: we },
    locked: false,
  };
}

describe('§3.4 derived state', () => {
  it('totals each day type independently', () => {
    const stack = [activity('sleep', 8, 9), activity('work', 8, 0)];
    expect(total(stack, 'wd')).toBe(16);
    expect(total(stack, 'we')).toBe(9);
  });

  it('lets `remaining` go negative — nothing clamps it (§3.4, §11)', () => {
    const stack = [activity('work', 30, 0)];
    expect(remaining(stack, 'wd')).toBe(-6);
    expect(overflow(stack, 'wd')).toBe(6);
  });

  it('reports zero overflow when the day fits exactly', () => {
    const stack = [activity('all', 24, 24)];
    expect(overflow(stack, 'wd')).toBe(0);
    expect(fits(stack)).toBe(true);
  });

  it('computes the weekly total at 5 workdays and 2 weekend days (§3.1)', () => {
    expect(weekly(activity('work', 8, 0))).toBe(40);
    expect(weekly(activity('sleep', 8, 9))).toBe(58);
  });
});

describe('fits() in its general both-day-types form (§3.4, §8.3)', () => {
  it('is false when the workday breaches', () => {
    expect(fits([activity('a', 25, 10)])).toBe(false);
  });

  /* §11 — a weekend already over 24 at the reveal is a cause school did not create and
     the forced workday view does not show. The general form is what blocks
     confirm for it. */
  it('is false when only the *weekend* breaches', () => {
    expect(fits([activity('a', 10, 25)])).toBe(false);
  });

  it('is true only when both days fit', () => {
    expect(fits([activity('a', 24, 24)])).toBe(true);
  });
});

describe('derivedState', () => {
  it('reports total, remaining, overflow and fits together', () => {
    const stack = [activity('a', 26, 10)];
    expect(derivedState(stack)).toEqual({
      total: { wd: 26, we: 10 },
      remaining: { wd: -2, we: 14 },
      overflow: { wd: 2, we: 0 },
      fits: false,
    });
  });
});

describe('§7.7 Not included membership', () => {
  it('is zero on *both* day types', () => {
    expect(isNotIncluded(activity('a', 0, 0))).toBe(true);
  });

  it('keeps an activity with hours on one day type in the stack', () => {
    expect(isNotIncluded(activity('work', 8, 0))).toBe(false);
    expect(isNotIncluded(activity('leisure', 0, 5))).toBe(false);
  });

  it('splits a stack into bands and inventory', () => {
    const stack = [activity('work', 8, 0, 0), activity('care', 0, 0, 1)];
    expect(stackActivities(stack).map((a) => a.id)).toEqual(['work']);
    expect(notIncludedActivities(stack).map((a) => a.id)).toEqual(['care']);
  });

  it('handles every activity zeroed — the whole day is Unallocated (§11)', () => {
    const stack = [activity('a', 0, 0, 0), activity('b', 0, 0, 1)];
    expect(stackActivities(stack)).toEqual([]);
    expect(remaining(stack, 'wd')).toBe(24);
    expect(fits(stack)).toBe(true);
  });
});
