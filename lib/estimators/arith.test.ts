import { describe, expect, it } from 'vitest';
import type { AnswerMap } from '@/lib/domain/types';
import type { EstimatorDef, Field } from '@/lib/pack/types';
import { buildArith, clockSpanHours } from './arith';
import { asClockMinutes } from './inputs';

function answer(map: Record<string, unknown>): AnswerMap {
  return Object.fromEntries(
    Object.entries(map).map(([id, value]) => [id, { value, at: 0, revision: 1 }]),
  );
}

function fields(...list: Field[]): Map<string, Field> {
  return new Map(list.map((field) => [field.id, field]));
}

const minutes = (id: string, fallback?: number): Field => ({
  id,
  label: id,
  type: 'duration',
  unit: 'minutes',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

const hours = (id: string, fallback?: number): Field => ({
  id,
  label: id,
  type: 'duration',
  unit: 'hours',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

const times = (id: string, fallback?: number): Field => ({
  id,
  label: id,
  type: 'count',
  unit: 'times',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

const clock = (id: string, fallback?: string): Field => ({
  id,
  label: id,
  type: 'clock',
  unit: 'clock',
  required: true,
  ...(fallback === undefined ? {} : { default: fallback }),
});

function def(params: unknown, defaults?: Record<string, unknown>): EstimatorDef {
  return {
    id: 'arith.freqDuration',
    activityId: 'test',
    inputs: [],
    outputs: ['wd', 'we'],
    params: params as Record<string, unknown>,
    ...(defaults === undefined ? {} : { defaults }),
  };
}

describe('clockSpanHours', () => {
  it('wraps midnight — 23:00 to 07:00 is 8 h, not −16', () => {
    expect(clockSpanHours(23 * 60, 7 * 60)).toBe(8);
  });

  it('handles a span inside one day', () => {
    expect(clockSpanHours(1 * 60, 9 * 60 + 30)).toBe(8.5);
  });

  it('is zero for equal times rather than a whole day', () => {
    expect(clockSpanHours(420, 420)).toBe(0);
  });
});

describe('asClockMinutes', () => {
  it('parses "HH:MM" and a raw minute count alike', () => {
    expect(asClockMinutes('07:30')).toBe(450);
    expect(asClockMinutes('7:30')).toBe(450);
    expect(asClockMinutes(450)).toBe(450);
  });

  it('rejects a value that is not a clock time', () => {
    expect(asClockMinutes('half past seven')).toBeNull();
    expect(asClockMinutes('25:00')).toBeNull();
    expect(asClockMinutes('07:99')).toBeNull();
    expect(asClockMinutes(undefined)).toBeNull();
  });
});

describe('arith.freqDuration', () => {
  it('sums a frequency × duration pair, converting minutes to hours', () => {
    const estimate = buildArith(
      def({
        terms: [{ kind: 'freqDuration', freq: 'n', duration: 'm', dayType: 'wd' }],
      }),
      fields(times('n'), minutes('m')),
    );
    expect(estimate(answer({ n: 3, m: 30 }), 'wd')).toBe(1.5);
  });

  it('reads a duration field in its declared unit', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'duration', field: 'h' }] }),
      fields(hours('h')),
    );
    expect(estimate(answer({ h: 8 }), 'wd')).toBe(8);
  });

  it('scopes a term to its day type — work is 8 h on a workday and 0 on a weekend day', () => {
    const estimate = buildArith(
      def({
        terms: [
          { kind: 'duration', field: 'wd', dayType: 'wd' },
          { kind: 'duration', field: 'we', dayType: 'we' },
        ],
      }),
      fields(hours('wd'), hours('we')),
    );
    const answers = answer({ wd: 8, we: 0 });
    expect(estimate(answers, 'wd')).toBe(8);
    expect(estimate(answers, 'we')).toBe(0);
  });

  it('contributes an unscoped term to both day types', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'duration', field: 'h' }] }),
      fields(hours('h')),
    );
    const answers = answer({ h: 2 });
    expect(estimate(answers, 'wd')).toBe(2);
    expect(estimate(answers, 'we')).toBe(2);
  });

  it('derives sleep from a clock pair', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'clockSpan', from: 'bed', to: 'wake', dayType: 'wd' }] }),
      fields(clock('bed'), clock('wake')),
    );
    expect(estimate(answer({ bed: '23:00', wake: '07:00' }), 'wd')).toBe(8);
  });

  /* §4.3 rule 2 — a value for any answer map, including one with nothing in it. */
  it('falls back to the field default when an input is unanswered', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'freqDuration', freq: 'n', duration: 'm' }] }),
      fields(times('n', 3), minutes('m', 20)),
    );
    expect(estimate({}, 'wd')).toBe(1);
  });

  it('prefers the estimator’s declared default over the field’s', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'duration', field: 'h' }] }, { h: 5 }),
      fields(hours('h', 8)),
    );
    expect(estimate({}, 'wd')).toBe(5);
  });

  it('resolves a missing input to zero rather than NaN when nothing declares a default', () => {
    const estimate = buildArith(
      def({ terms: [{ kind: 'duration', field: 'h' }] }),
      fields(hours('h')),
    );
    expect(estimate({}, 'wd')).toBe(0);
  });

  it('drops an unparseable clock answer rather than poisoning the sum with NaN', () => {
    const estimate = buildArith(
      def({
        terms: [
          { kind: 'clockSpan', from: 'bed', to: 'wake' },
          { kind: 'duration', field: 'h' },
        ],
      }),
      fields(clock('bed'), clock('wake'), hours('h')),
    );
    expect(estimate(answer({ bed: 'nonsense', wake: '07:00', h: 2 }), 'wd')).toBe(2);
  });

  it('rejects malformed params at build time, not inside a derivation pass', () => {
    expect(() => buildArith(def({ terms: 'nope' }), fields())).toThrow();
    expect(() => buildArith(def({ terms: [{ kind: 'mystery' }] }), fields())).toThrow();
  });
});
