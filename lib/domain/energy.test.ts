import { describe, expect, it } from 'vitest';
import type { Activity, EnergyLevel, EnergyLevels } from './types';
import {
  ENERGY_LEVELS,
  energyOf,
  isEnergyLevel,
  netEnergy,
  netWeekly,
  polarity,
} from './energy';

function activity(
  id: string,
  wd: number,
  we: number,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    label: id,
    hue: 0,
    order: 0,
    wd: { mode: 'derived', hours: wd },
    we: { mode: 'derived', hours: we },
    locked: false,
    ...extra,
  };
}

/** The workday of §3.3's set, near enough: 24 h across five activities. */
function week(): Activity[] {
  return [
    activity('sleep', 8, 9),
    activity('work', 8, 0),
    activity('commute', 1, 0),
    activity('household', 2, 3),
    activity('leisure', 5, 12),
  ];
}

describe('energyOf (§E.1)', () => {
  it('reads the participant’s level for an unlocked activity', () => {
    expect(energyOf(activity('work', 8, 0), { work: -2 })).toBe(-2);
  });

  it('reads neutral for an activity the participant has not rated', () => {
    expect(energyOf(activity('work', 8, 0), {})).toBe(0);
  });

  /* School is not on the rating screen, so a level under its id could only
     have arrived by accident. The pack constant is the answer. */
  it('takes the pack constant for a locked activity and ignores the levels map', () => {
    const school = activity('school', 4, 0, { locked: true, energy: 2 });
    expect(energyOf(school, {})).toBe(2);
    expect(energyOf(school, { school: -2 })).toBe(2);
  });

  it('reads neutral for a locked activity whose pack declares no level', () => {
    expect(energyOf(activity('school', 4, 0, { locked: true }), {})).toBe(0);
  });
});

describe('netEnergy (§E.1)', () => {
  it('weighs each activity by its hours on that day type', () => {
    const levels: EnergyLevels = { sleep: 2, work: -1, commute: -2, household: -1, leisure: 1 };
    // wd: 8×2 − 8 − 1×2 − 2 + 5 = 16 − 8 − 2 − 2 + 5
    expect(netEnergy(week(), levels, 'wd')).toBe(9);
    // we: 9×2 + 0 + 0 − 3 + 12
    expect(netEnergy(week(), levels, 'we')).toBe(27);
  });

  it('is zero when nothing is rated, whatever the hours', () => {
    expect(netEnergy(week(), {}, 'wd')).toBe(0);
    expect(netEnergy(week(), {}, 'we')).toBe(0);
  });

  /* Why the rating screen can leave zero-hour activities off without changing
     any figure (§Decisions). */
  it('gives a zero-hour activity no weight at any level', () => {
    const stack = [activity('work', 8, 0), activity('care', 0, 0)];
    expect(netEnergy(stack, { work: 1, care: -2 }, 'wd')).toBe(8);
    expect(netEnergy(stack, { work: 1, care: -2 }, 'we')).toBe(0);
  });

  it('counts school at its pack level alongside the participant’s own', () => {
    const stack = [...week(), activity('school', 4, 0, { locked: true, energy: 2 })];
    expect(netEnergy(stack, { work: -1 }, 'wd')).toBe(-8 + 8);
  });

  it('separates the two day types — a workday-only activity leaves the weekend alone', () => {
    const stack = [activity('work', 8, 0)];
    expect(netEnergy(stack, { work: -2 }, 'wd')).toBe(-16);
    expect(netEnergy(stack, { work: -2 }, 'we')).toBe(0);
  });
});

describe('netWeekly (§3.1, §E.1)', () => {
  it('is five workdays and two weekend days', () => {
    const levels: EnergyLevels = { sleep: 2, work: -1, commute: -2, household: -1, leisure: 1 };
    // 9 × 5 + 27 × 2
    expect(netWeekly(week(), levels)).toBe(99);
  });

  it('agrees with the two day figures it is composed from', () => {
    const levels: EnergyLevels = { sleep: 1, work: -2, leisure: 2 };
    const stack = week();
    expect(netWeekly(stack, levels)).toBe(
      netEnergy(stack, levels, 'wd') * 5 + netEnergy(stack, levels, 'we') * 2,
    );
  });

  it('is negative for a week whose draining hours outweigh its gaining ones', () => {
    const stack = [activity('work', 10, 4), activity('leisure', 1, 6)];
    expect(netWeekly(stack, { work: -2, leisure: 1 })).toBe(-100 - 16 + 5 + 12);
  });
});

describe('polarity (§E.1)', () => {
  it('names the sign and nothing else', () => {
    expect(polarity(12)).toBe('positive');
    expect(polarity(-0.25)).toBe('negative');
    expect(polarity(0)).toBe('neutral');
  });

  /* An all-neutral week is exact — every term is a product with zero — and it
     is the zero that actually happens. */
  it('reads an unrated week as neutral', () => {
    expect(polarity(netWeekly(week(), {}))).toBe('neutral');
  });

  /* Pack fallbacks carry values like 1.7 and the estimator emits arbitrary
     reals, so a week that cancels can miss zero by an ulp. It must not read
     as negative. */
  it('reads float dust as neutral rather than as a sign', () => {
    const stack = [
      activity('household', 0.1, 0),
      activity('care', 0.2, 0),
      activity('admin', 0.3, 0),
    ];
    const net = netEnergy(stack, { household: 1, care: 1, admin: -1 }, 'wd');
    expect(net).not.toBe(0);
    expect(polarity(net)).toBe('neutral');
  });

  it('does not swallow a tie a participant could produce — a quarter-hour at one rung', () => {
    expect(polarity(0.25)).toBe('positive');
    expect(polarity(-0.25)).toBe('negative');
  });
});

describe('the scale itself', () => {
  it('is the five rungs, ascending', () => {
    expect(ENERGY_LEVELS).toEqual([-2, -1, 0, 1, 2]);
  });

  it('accepts every rung and rejects everything else', () => {
    for (const level of ENERGY_LEVELS) expect(isEnergyLevel(level)).toBe(true);
    for (const value of [-3, 3, 1.5, '1', null, undefined, NaN] as unknown[]) {
      expect(isEnergyLevel(value)).toBe(false);
    }
  });

  it('types every rung as an EnergyLevel', () => {
    const levels: EnergyLevels = Object.fromEntries(
      ENERGY_LEVELS.map((level: EnergyLevel, i) => [`a${i}`, level]),
    );
    expect(Object.keys(levels)).toHaveLength(5);
  });
});
