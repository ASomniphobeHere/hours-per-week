import { describe, expect, it } from 'vitest';
import { DAY_TYPES } from '@/lib/domain/types';
import { derive } from '@/lib/domain/derive';
import { derivedState, total } from '@/lib/domain/totals';
import { buildEstimators } from '@/lib/estimators/registry';
import { setAnswer } from '@/lib/store/answers';
import { fieldIds } from './index';
import { validatePack } from './validate';
import { v1Index, v1Pack } from './v1';

describe('the v1 pack (§3.3, §4.1, §9)', () => {
  it('passes all fourteen §4.6 rules', () => {
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
    const notes = v1Pack.screens.map((screen) => screen.note).filter(Boolean);
    expect(notes.filter((note) => note === 'intro.multitasking')).toHaveLength(1);
    expect(v1Pack.screens[0]!.note).toBe('intro.multitasking');
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
     reaches S4 with a full stack of pack-default hours, not an empty one. */
  it('derives a full stack from field defaults alone', () => {
    const { byId } = hoursFrom();
    for (const id of ['sleep', 'work', 'commute', 'eating', 'household', 'care', 'hygiene', 'admin', 'leisure']) {
      expect(byId[id]!.wd.hours + byId[id]!.we.hours).toBeGreaterThan(0);
    }
  });

  it('lands the default workday just inside 24 h, so the S4 squeeze is real', () => {
    const { activities } = hoursFrom();
    // school is not in the stack until S4 (§3.3) and derives to 0 before then.
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

  it('holds school out of the stack until S4 (§3.3)', () => {
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
    const prompts = Object.keys(v1Pack.copy).filter((key) => key.endsWith('.prompt'));
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
