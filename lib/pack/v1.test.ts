import { describe, expect, it } from 'vitest';
import { DAY_TYPES } from '@/lib/domain/types';
import { derive } from '@/lib/domain/derive';
import { derivedState, total } from '@/lib/domain/totals';
import { buildEstimators } from '@/lib/estimators/registry';
import { setAnswer } from '@/lib/store/answers';
import { fieldIds } from './index';
import { holdLines } from './copy';
import { outcomeKey, S5_LINES_PREFIX, validatePack } from './validate';
import { weeklyLevels } from '@/lib/domain/constraints';
import { v1Index, v1Pack } from './v1';

describe('the v1 pack (§3.3, §4.1, §9)', () => {
  it('passes all seventeen §4.6 rules', () => {
    expect(validatePack(v1Pack)).toEqual([]);
  });

  it('carries the §3.3 activity set, in order', () => {
    expect(v1Index().activities.map((a) => a.id)).toEqual([
      'school',
      'sleep',
      'work',
      'commute',
      'eating',
      'household',
      'care',
      'hygiene',
      'admin',
      'leisure',
    ]);
  });

  /* AC 20 — an even ring at 360/n, which at ten activities is 36°. */
  it('spaces hues evenly at 36°', () => {
    const hues = v1Index().activities.map((a) => a.hue);
    expect(hues).toEqual([0, 36, 72, 108, 144, 180, 216, 252, 288, 324]);
  });

  it('gives every field a unique id', () => {
    const ids = fieldIds(v1Pack);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('states the multitasking rule once, in the questionnaire intro (§13)', () => {
    expect(v1Pack.copy['intro.multitasking']).toBeTruthy();
    // The statement has its own page before the first screen, so no screen
    // carries it as a note — that is what makes "once" checkable: a second
    // placement would be a second reading of the same rule.
    const notes = v1Pack.screens.map((screen) => screen.note).filter(Boolean);
    expect(notes).not.toContain('intro.multitasking');
  });

  /* Plan 25 §E.2 — the rating stage is content like everything else. The five
     rungs are the unit `netEnergy` multiplies by, so the pack declaring four
     of them, or six, would silently re-scale every figure the room produces. */
  it('carries the five-rung energy scale, ascending, each rung with its copy', () => {
    expect(v1Pack.energy.scale.map((rung) => rung.value)).toEqual([-2, -1, 0, 1, 2]);
    for (const rung of v1Pack.energy.scale) expect(v1Pack.copy[rung.label]).toBeTruthy();
    expect(v1Pack.copy[v1Pack.energy.prompt]).toBeTruthy();
  });

  /* The one activity nobody rates, because it is revealed after the stage that
     rates them. Its level is content, and the pack has to carry it. */
  it('declares an energy level for the locked activity and for nothing else', () => {
    for (const activity of v1Pack.activities) {
      if (activity.locked === true) expect(activity.energy).toBe(2);
      else expect(activity.energy).toBeUndefined();
    }
  });

  /* §9's register, applied to the rungs: they name what an activity does to
     the participant, and characterise neither the activity nor the answer. */
  it('states no norm, benchmark or judgement on any rung of the scale', () => {
    const labels = v1Pack.energy.scale.map((rung) => v1Pack.copy[rung.label] ?? '');
    for (const label of labels) {
      expect(label).not.toMatch(
        /most people|others|average|typical|everyone|healthy|productive|wasted|should/i,
      );
    }
  });

  /* §6.3's silence rule reaches both holds, and plan 25 §E.7 keeps them
     distinct: the same four lines cycling again reads as a stuck app. */
  it('gives the second hold its own four lines, sharing none with the first', () => {
    const first = holdLines(v1Pack);
    const second = holdLines(v1Pack, S5_LINES_PREFIX);
    expect(second.length).toBeGreaterThanOrEqual(4);
    expect(second.filter((line) => first.includes(line))).toEqual([]);
  });

  /* §8.3's ladder, as content. The client walks the constraint and addresses
     the copy by weekly value, so a pack that raises the ceiling without
     writing the new rung's copy fails to load — which is what makes extending
     the ladder a pack edit rather than a client change. */
  it('carries a five-rung ladder from 20 h to 40 h, each rung with its copy', () => {
    const school = v1Pack.activities.find((activity) => activity.locked === true);
    expect(school?.constraint).toMatchObject({
      minWeekly: 20,
      maxWeekly: 40,
      stepWeekly: 5,
      weekendAllowed: false,
    });
    expect(weeklyLevels(school?.constraint)).toEqual([20, 25, 30, 35, 40]);
    for (const weekly of weeklyLevels(school?.constraint)) {
      expect(v1Pack.copy[outcomeKey(weekly)]).toBeTruthy();
    }
  });

  /* §9 — the ladder is content and the register applies to it in full. It is
     not question copy, but the prohibition on comparison survives the move. */
  it('states no norm, benchmark or comparison at any rung', () => {
    const rungs = weeklyLevels(
      v1Pack.activities.find((activity) => activity.locked === true)?.constraint,
    ).map((weekly) => v1Pack.copy[outcomeKey(weekly)] ?? '');
    for (const rung of rungs) {
      expect(rung).not.toMatch(/most people|others|average|typical|everyone|than you/i);
    }
  });

  it('gates care and nothing else', () => {
    const gated = v1Pack.activities.filter((a) => a.gateField !== undefined).map((a) => a.id);
    expect(gated).toEqual(['care']);
  });
});

describe('deriving the v1 pack', () => {
  const index = v1Index();
  const estimators = buildEstimators(index.pack.estimators, index.fieldById);

  function hoursFrom(answers = {}) {
    const result = derive({ index, answers, estimators, now: 0 });
    return {
      ...result,
      byId: Object.fromEntries(result.activities.map((a) => [a.id, a])),
    };
  }

  /* AC 10 / §4.2.1 rule 6 — a force-advanced participant with nothing answered
     reaches the reveal with a full stack of pack-default hours, not an empty one. */
  it('derives a full stack from field defaults alone', () => {
    const { byId } = hoursFrom();
    for (const id of ['sleep', 'work', 'commute', 'eating', 'household', 'care', 'hygiene', 'admin', 'leisure']) {
      expect(byId[id]!.wd.hours + byId[id]!.we.hours).toBeGreaterThan(0);
    }
  });

  it('lands the default workday just inside 24 h, so the squeeze at the reveal is real', () => {
    const { activities } = hoursFrom();
    // school is not in the stack until the reveal (§3.3) and derives to 0 before then.
    const workday = total(activities, 'wd');
    expect(workday).toBeGreaterThan(23);
    expect(workday).toBeLessThanOrEqual(24);
  });

  it('leaves the default weekend day with slack', () => {
    const { activities } = hoursFrom();
    expect(derivedState(activities).remaining.we).toBeGreaterThan(0);
  });

  it('derives sleep from the clock pair, wrapping midnight on both day types', () => {
    const { byId } = hoursFrom();
    expect(byId.sleep!.wd.hours).toBe(8);
    expect(byId.sleep!.we.hours).toBe(8.5);
  });

  it('keeps work and commute off the weekend by default', () => {
    const { byId } = hoursFrom();
    expect(byId.work!.we.hours).toBe(0);
    expect(byId.commute!.we.hours).toBe(0);
  });

  it('holds school out of the stack until the reveal (§3.3)', () => {
    const { byId } = hoursFrom();
    expect(byId.school!.wd.hours).toBe(0);
    expect(byId.school!.we.hours).toBe(0);
  });

  it('runs the household model off demographic answers, not durations', () => {
    const base = hoursFrom().byId.household!.wd.hours;
    let answers = setAnswer({}, 'household.size', 5);
    answers = setAnswer(answers, 'household.children', 2);
    expect(hoursFrom(answers).byId.household!.wd.hours).toBeGreaterThan(base);
  });

  it('reads employment from the work section, which is not gated', () => {
    const base = hoursFrom().byId.household!.wd.hours;
    const answers = setAnswer({}, 'work.status', 'none');
    expect(hoursFrom(answers).byId.household!.wd.hours).toBeGreaterThan(base);
  });

  it('drops care to zero when its gate is answered "no"', () => {
    const answers = setAnswer({}, 'care.any', 'no');
    const { byId } = hoursFrom(answers);
    expect(byId.care!.wd.hours).toBe(0);
    expect(byId.care!.we.hours).toBe(0);
  });

  it('declares fallback hours for every estimator-backed activity (§4.3 rule 3)', () => {
    for (const activity of v1Pack.activities) {
      for (const dayType of DAY_TYPES) {
        expect(typeof activity.fallbackHours?.[dayType]).toBe('number');
      }
    }
  });
});

/* AC 5 — no question copy implies a norm, benchmark, comparison, or
   expectation. §9 applies this to every section without exception, including
   screen time, sleep, and leisure. */
describe('§9 copy register', () => {
  const FORBIDDEN = [
    'most people',
    'other people spend',
    'average',
    'typical',
    'normal',
    'you should',
    'should be',
    'recommend',
    'compared',
    'comparison',
    'than others',
    'benchmark',
    'expected',
    'ideal',
    'too much',
    'too little',
    'experts',
    'research shows',
    'healthy amount',
    'a lot of',
  ];

  const questionKeys = Object.keys(v1Pack.copy).filter(
    (key) => key.startsWith('q.') || key.startsWith('opt.') || key.startsWith('intro.'),
  );

  it('has question copy to audit', () => {
    expect(questionKeys.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('never says "%s"', (phrase) => {
    const offenders = questionKeys.filter((key) =>
      v1Pack.copy[key]!.toLowerCase().includes(phrase),
    );
    expect(offenders).toEqual([]);
  });

  it('asks in sentence case and ends questions with a question mark', () => {
    // Taken from the screens rather than by key suffix: the client's own
    // chrome has a `join.prompt` that is an instruction, not a question.
    const prompts = v1Pack.screens.map((screen) => screen.prompt);
    expect(prompts.length).toBeGreaterThan(10);
    for (const key of prompts) {
      const text = v1Pack.copy[key]!;
      expect(text.endsWith('?')).toBe(true);
      expect(text).not.toMatch(/!/);
    }
  });

  it('carries at least four S3 status lines (§9)', () => {
    const lines = Object.keys(v1Pack.copy).filter((key) => key.startsWith('s3.lines.'));
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('holds no facilitator strings — the console is not content (§9)', () => {
    expect(Object.keys(v1Pack.copy).filter((key) => key.startsWith('fac.'))).toEqual([]);
  });
});
