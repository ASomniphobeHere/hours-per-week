import { describe, expect, it } from 'vitest';
import { indexPack } from '@/lib/pack';
import { buildEstimators } from '@/lib/estimators/registry';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { setAnswer } from '@/lib/store/answers';
import { derive } from './derive';
import { buildStack, visibleActivities } from './stack';
import type { Activity, AnswerMap } from './types';

function band(id: string, wd: number, we: number, locked = false): Activity {
  return {
    id,
    label: `act.${id}`,
    hue: 0,
    order: 0,
    wd: { mode: 'derived', hours: wd },
    we: { mode: 'derived', hours: we },
    locked,
  };
}

describe('§7.7 stack membership', () => {
  it('splits on zero across both day types, not one', () => {
    const { bands, notIncluded } = buildStack([
      band('work', 8, 0),
      band('care', 0, 0),
      band('leisure', 2, 5),
    ]);
    // Zero on one day only keeps the activity in the stack (§7.7).
    expect(bands.map((a) => a.id)).toEqual(['work', 'leisure']);
    expect(notIncluded.map((a) => a.id)).toEqual(['care']);
  });

  it('holds school out of the stack until the reveal (§3.3)', () => {
    const activities = [band('school', 0, 0, true), band('sleep', 8, 9)];

    const before = buildStack(activities);
    expect(before.bands.map((a) => a.id)).toEqual(['sleep']);
    // Not a band and not a Not-included row: school is not yet part of the week.
    expect(before.notIncluded).toEqual([]);

    const after = buildStack(activities, { includeLocked: true });
    expect(after.notIncluded.map((a) => a.id)).toEqual(['school']);
    expect(visibleActivities(activities, { includeLocked: true })).toHaveLength(2);
  });

  it('is empty of bands when every activity is zeroed (§11)', () => {
    const { bands, notIncluded } = buildStack([band('a', 0, 0), band('b', 0, 0)]);
    expect(bands).toEqual([]);
    expect(notIncluded).toHaveLength(2);
  });
});

describe('the stack generated at the end of S1 (step 3.5)', () => {
  const pack = minimalPack();
  const index = indexPack(pack);
  const estimators = buildEstimators(pack.estimators, index.fieldById);

  function stackFor(answers: AnswerMap) {
    return buildStack(derive({ index, answers, estimators }).activities);
  }

  it('gives a wholly unanswered section non-zero hours from its defaults (AC 10)', () => {
    const { bands, notIncluded } = stackFor({});
    // Nothing has been answered at all, yet every section derives from the
    // defaults §4.6 requires — this is what makes §4.2.1 rule 6 honest.
    expect(bands.map((a) => a.id)).toEqual(['alpha', 'beta']);
    expect(notIncluded).toEqual([]);
  });

  it('puts a gated-out section in Not included (AC 9, §4.2.1 rule 4)', () => {
    const { bands, notIncluded } = stackFor(setAnswer({}, 'beta.any', 'no'));
    expect(bands.map((a) => a.id)).toEqual(['alpha']);
    expect(notIncluded.map((a) => a.id)).toEqual(['beta']);
  });

  it('orders bands by pack order', () => {
    const { bands } = stackFor({});
    expect(bands.map((a) => a.order)).toEqual([...bands.map((a) => a.order)].sort((x, y) => x - y));
  });

  it('moves a section answered to zero into Not included, same as a gated one', () => {
    const answers = setAnswer(setAnswer({}, 'beta.minutes.wd', 0), 'beta.minutes.we', 0);
    const { notIncluded } = stackFor(answers);
    // §7.7: cause is not distinguished. Gated out and answered to zero look
    // identical here, and the route to zero is telemetry rather than UI.
    expect(notIncluded.map((a) => a.id)).toEqual(['beta']);
  });
});
