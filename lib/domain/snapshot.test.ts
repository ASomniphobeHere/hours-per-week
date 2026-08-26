import { describe, expect, it } from 'vitest';
import type { Activity } from './types';
import { buildSnapshot } from './snapshot';

function activity(id: string, wd: number, we: number, locked = false): Activity {
  return {
    id,
    label: id,
    hue: 0,
    order: 0,
    wd: { mode: 'derived', hours: wd },
    we: { mode: 'derived', hours: we },
    locked,
  };
}

describe('§10 schedule snapshot', () => {
  const stack = [activity('sleep', 8, 9), activity('work', 8, 0)];

  it('carries the kind, the clock it was given, and the pack version', () => {
    const snapshot = buildSnapshot({ kind: 'finish', activities: stack, packVersion: 'v1', t: 42 });
    expect(snapshot).toMatchObject({ kind: 'finish', t: 42, packVersion: 'v1' });
  });

  it('records slack at finish as `remaining.wd` (§10, AC 48)', () => {
    const snapshot = buildSnapshot({ kind: 'finish', activities: stack, packVersion: 'v1', t: 0 });
    expect(snapshot.total).toEqual({ wd: 16, we: 9 });
    expect(snapshot.remaining).toEqual({ wd: 8, we: 15 });
    expect(snapshot.fits).toBe(true);
  });

  it('reports `fits: false` for a day already over 24 h (§11)', () => {
    const over = [activity('work', 26, 0)];
    expect(buildSnapshot({ kind: 's1', activities: over, packVersion: 'v1', t: 0 }).fits).toBe(
      false,
    );
  });

  it('carries every activity, including zeros and unrevealed school', () => {
    const full = [...stack, activity('care', 0, 0), activity('school', 0, 0, true)];
    const snapshot = buildSnapshot({ kind: 'finish', activities: full, packVersion: 'v1', t: 0 });
    expect(snapshot.activities.map((entry) => entry.id)).toEqual([
      'sleep',
      'work',
      'care',
      'school',
    ]);
    // A zero contributes zero: carrying it costs the totals nothing.
    expect(snapshot.total).toEqual({ wd: 16, we: 9 });
  });

  it('carries the mode beside the hours, so a fallback is not read as a choice', () => {
    const fallen: Activity[] = [
      { ...activity('household', 2, 3), wd: { mode: 'fallback', hours: 2 } },
    ];
    const snapshot = buildSnapshot({ kind: 'finish', activities: fallen, packVersion: 'v1', t: 0 });
    expect(snapshot.activities[0]?.wd).toEqual({ mode: 'fallback', hours: 2 });
  });

  it('copies the day values rather than aliasing the live activity', () => {
    const live = activity('sleep', 8, 9);
    const snapshot = buildSnapshot({ kind: 'finish', activities: [live], packVersion: 'v1', t: 0 });
    live.wd.hours = 3;
    expect(snapshot.activities[0]?.wd.hours).toBe(8);
  });
});
