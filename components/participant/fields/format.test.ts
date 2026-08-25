import { describe, expect, it } from 'vitest';
import type { Field } from '@/lib/pack/types';
import { boundToField, displayNumber, formatAmount } from './format';

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 'test.field',
    label: 'q.test',
    type: 'duration',
    unit: 'minutes',
    min: 0,
    max: 240,
    step: 5,
    required: true,
    default: 30,
    ...overrides,
  };
}

describe('numeric field display', () => {
  it('drops a trailing zero and the float artefact behind it', () => {
    expect(formatAmount(8)).toBe('8');
    expect(formatAmount(8.5)).toBe('8.5');
    expect(formatAmount(0.1 + 0.2)).toBe('0.3');
  });

  it('holds a value inside min and max', () => {
    expect(boundToField(field(), 32)).toBe(32);
    expect(boundToField(field(), -10)).toBe(0);
    expect(boundToField(field(), 9999)).toBe(240);
  });

  it('leaves a pack default where the pack put it', () => {
    // `min: 6`, `step: 5`, `default: 30`. Snapping to a grid anchored at min
    // would open this field on 31 — a number no one wrote.
    expect(displayNumber(field({ min: 6 }), undefined)).toBe(30);
  });

  it('shows the pack default until there is an answer (§4.2, §4.2.1 rule 5)', () => {
    expect(displayNumber(field(), undefined)).toBe(30);
    expect(displayNumber(field(), 45)).toBe(45);
  });

  it('never shows NaN for an answer it cannot read', () => {
    // §4.3 rule 2's principle applied to the control: a participant sees a
    // number, never an error.
    expect(displayNumber(field(), 'nonsense')).toBe(0);
    expect(displayNumber(field({ min: 6 }), null)).toBe(30);
    expect(displayNumber(field({ min: 6, default: undefined }), 'x')).toBe(6);
  });
});
