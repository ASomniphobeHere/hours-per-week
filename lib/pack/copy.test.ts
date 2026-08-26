import { describe, expect, it } from 'vitest';
import { minimalPack } from './__fixtures__/minimal';
import { copyOf, formatCopy, holdLines, unitKey } from './copy';
import { REQUIRED_COPY_KEYS, S3_LINES_MINIMUM } from './validate';
import { v1Pack } from './v1';

const pack = minimalPack();

describe('§9 copy resolution', () => {
  it('resolves a key to its string', () => {
    expect(copyOf(pack, 'act.alpha')).toBe('Alpha');
  });

  it('falls back to the key rather than throwing', () => {
    // `copy-key-exists` has already refused a pack missing a declared key, so
    // this path is a client asking for one no rule knows about. A visible key
    // name says so; a throw would take the questionnaire down in a room.
    expect(copyOf(pack, 'no.such.key')).toBe('no.such.key');
  });

  it('interpolates named placeholders (s1.progress)', () => {
    expect(formatCopy(pack, 's1.progress', { current: 3, total: 17 })).toBe('3 of 17');
  });

  it('leaves a placeholder it has no value for intact', () => {
    expect(formatCopy(pack, 's1.progress', { current: 3 })).toBe('3 of {total}');
  });

  it('names a unit key per unit, and none for a clock', () => {
    expect(unitKey('minutes')).toBe('unit.minutes');
    expect(unitKey('hours')).toBe('unit.hours');
    expect(unitKey('clock')).toBeUndefined();
    expect(unitKey(undefined)).toBeUndefined();
  });
});

describe('§9: no string is hardcoded in the client', () => {
  it('ships every key the client chrome asks for', () => {
    // The join screen, the intro page, the navigation controls and the unit
    // suffixes are participant-facing and appear in no §9 table. Requiring
    // them is what stops a replacement pack shipping without them.
    for (const key of REQUIRED_COPY_KEYS) {
      expect(typeof v1Pack.copy[key], key).toBe('string');
    }
  });
});

describe('§9 s3.lines[]', () => {
  it('reassembles the flat keys into index order', () => {
    expect(holdLines(pack)).toEqual(['One', 'Two', 'Three', 'Four']);
  });

  it('sorts numerically, so a tenth line does not land between the first two', () => {
    const wide = minimalPack();
    for (let i = 4; i < 11; i += 1) wide.copy[`s3.lines.${i}`] = `Line ${i}`;
    expect(holdLines(wide).slice(4)).toEqual([
      'Line 4',
      'Line 5',
      'Line 6',
      'Line 7',
      'Line 8',
      'Line 9',
      'Line 10',
    ]);
  });

  it('ships at least four in the v1 pack (§9)', () => {
    expect(holdLines(v1Pack).length).toBeGreaterThanOrEqual(S3_LINES_MINIMUM);
  });
});
