import { describe, expect, it } from 'vitest';
import type { Activity } from './types';
import {
  atWeeklyMaximum,
  atWeeklyMinimum,
  clampDaily,
  clampEvent,
  clampWeekly,
  spreadDays,
  weeklyLevels,
  weeklyToDaily,
} from './constraints';

const sleep: Pick<Activity, 'id' | 'constraint'> = {
  id: 'sleep',
  constraint: { minDaily: 6, weekendAllowed: true },
};

const school: Pick<Activity, 'id' | 'constraint'> = {
  id: 'school',
  constraint: { minWeekly: 20, maxWeekly: 40, stepWeekly: 5, weekendAllowed: false },
};

const leisure: Pick<Activity, 'id' | 'constraint'> = { id: 'leisure' };

describe('§8.2 — sleep floors at 6 h per day (AC 25)', () => {
  it('clamps a request below 6 and reports it', () => {
    expect(clampDaily(sleep, 'wd', 4)).toEqual({ hours: 6, clamped: true });
  });

  it('lets 6 through untouched', () => {
    expect(clampDaily(sleep, 'wd', 6)).toEqual({ hours: 6, clamped: false });
  });

  it('applies on the weekend too', () => {
    expect(clampDaily(sleep, 'we', 0)).toEqual({ hours: 6, clamped: true });
  });
});

describe('§8.2 — everything else floors at 0', () => {
  it('clamps a negative request', () => {
    expect(clampDaily(leisure, 'wd', -3)).toEqual({ hours: 0, clamped: true });
  });

  it('permits zero, which is how an activity reaches Not included', () => {
    expect(clampDaily(leisure, 'wd', 0)).toEqual({ hours: 0, clamped: false });
  });

  it('refuses a non-finite value rather than passing NaN into a total', () => {
    expect(clampDaily(leisure, 'wd', Number.NaN)).toEqual({ hours: 0, clamped: true });
  });
});

describe('§8.3 — school', () => {
  it('contributes zero on weekend days', () => {
    expect(clampDaily(school, 'we', 4)).toEqual({ hours: 0, clamped: true });
    expect(clampDaily(school, 'we', 0)).toEqual({ hours: 0, clamped: false });
  });

  it('floors the weekly total at 20 h', () => {
    expect(clampWeekly(school, 15)).toEqual({ hours: 20, clamped: true });
  });

  it('moves upward in 5 h weekly increments', () => {
    expect(clampWeekly(school, 25)).toEqual({ hours: 25, clamped: false });
    expect(clampWeekly(school, 23)).toEqual({ hours: 25, clamped: true });
    expect(clampWeekly(school, 30)).toEqual({ hours: 30, clamped: false });
  });

  it('disables the decrement control at the minimum', () => {
    expect(atWeeklyMinimum(school, 20)).toBe(true);
    expect(atWeeklyMinimum(school, 25)).toBe(false);
  });

  it('spreads 20 h/week over the 5 workdays as 4 h per workday', () => {
    expect(spreadDays(school.constraint)).toEqual(['wd']);
    expect(weeklyToDaily(school.constraint, 20, 'wd')).toBe(4);
    expect(weeklyToDaily(school.constraint, 20, 'we')).toBe(0);
    expect(weeklyToDaily(school.constraint, 25, 'wd')).toBe(5);
  });

  /* The ceiling, new with the outcome ladder: once every rung states an
     outcome, an unbounded stepper walks past the last claim the pack can
     make. 40 h is also 8 h of every workday. */
  it('caps the weekly total at 40 h', () => {
    expect(clampWeekly(school, 45)).toEqual({ hours: 40, clamped: true });
    expect(clampWeekly(school, 40)).toEqual({ hours: 40, clamped: false });
  });

  it('disables the increment control at the maximum', () => {
    expect(atWeeklyMaximum(school, 40)).toBe(true);
    expect(atWeeklyMaximum(school, 35)).toBe(false);
  });

  it('walks the ladder from its own constraint', () => {
    expect(weeklyLevels(school.constraint)).toEqual([20, 25, 30, 35, 40]);
    expect(weeklyToDaily(school.constraint, 40, 'wd')).toBe(8);
  });

  /* An activity with no ceiling has no rungs to speak for, and the stepper
     that walks them has nothing to disable. */
  it('has no ladder without a constraint that bounds one', () => {
    expect(weeklyLevels(leisure.constraint)).toEqual([]);
    expect(atWeeklyMaximum(leisure, 1_000)).toBe(false);
  });
});

describe('clamping is silent but observable (§10 "sleep floor hit")', () => {
  it('produces a clamp.hit event carrying the refused value', () => {
    expect(clampEvent('sleep', 4, 6, 99)).toEqual({
      t: 99,
      type: 'clamp.hit',
      activityId: 'sleep',
      from: 4,
      to: 6,
    });
  });
});
