import { describe, expect, it } from 'vitest';
import type { ScheduleSnapshot, SnapshotKind } from './types';
import { cuts, snapshotDelta } from './delta';

function snapshot(
  kind: SnapshotKind,
  hours: Record<string, [number, number]>,
): ScheduleSnapshot {
  return {
    kind,
    t: 0,
    packVersion: 'test',
    activities: Object.entries(hours).map(([id, [wd, we]]) => ({
      id,
      wd: { mode: 'derived', hours: wd },
      we: { mode: 'derived', hours: we },
    })),
    total: { wd: 0, we: 0 },
    remaining: { wd: 0, we: 0 },
    fits: true,
  };
}

describe('per-activity delta (§10)', () => {
  it('reports one row per day value that moved, and none for those that did not', () => {
    const finish = snapshot('finish', { sleep: [8, 9], leisure: [4, 6] });
    const complete = snapshot('complete', { sleep: [8, 9], leisure: [2, 6] });

    expect(snapshotDelta(finish, complete)).toEqual([
      { activityId: 'leisure', dayType: 'wd', from: 4, to: 2 },
    ]);
  });

  /** Summing the two would report neither decision. */
  it('keeps a workday cut and a weekend cut apart', () => {
    const finish = snapshot('finish', { leisure: [4, 6] });
    const complete = snapshot('complete', { leisure: [3, 5] });

    expect(snapshotDelta(finish, complete)).toEqual([
      { activityId: 'leisure', dayType: 'wd', from: 4, to: 3 },
      { activityId: 'leisure', dayType: 'we', from: 6, to: 5 },
    ]);
  });

  it('carries increases, which the debrief wants and S7 does not', () => {
    const finish = snapshot('finish', { sleep: [7, 7] });
    const complete = snapshot('complete', { sleep: [8, 7] });

    expect(snapshotDelta(finish, complete)).toHaveLength(1);
    expect(cuts(finish, complete)).toEqual([]);
  });

  it('drops the excluded activity — school, on the summary screen', () => {
    const finish = snapshot('finish', { school: [0, 0], leisure: [4, 4] });
    const complete = snapshot('complete', { school: [4, 0], leisure: [1, 4] });

    expect(cuts(finish, complete, { exclude: (id) => id === 'school' })).toEqual([
      { activityId: 'leisure', dayType: 'wd', from: 4, to: 1 },
    ]);
  });

  /**
   * An activity on one side only is indistinguishable from one that went
   * 0 → 4, and guessing would put a fabricated row in front of a participant.
   */
  it('skips an activity the two snapshots do not share', () => {
    const finish = snapshot('finish', { leisure: [4, 4] });
    const complete = snapshot('complete', { leisure: [4, 4], newcomer: [3, 3] });

    expect(snapshotDelta(finish, complete)).toEqual([]);
  });

  it('lists rows in pack order, workday before weekend', () => {
    const finish = snapshot('finish', { sleep: [8, 9], work: [8, 0], leisure: [4, 6] });
    const complete = snapshot('complete', { sleep: [7, 8], work: [7, 0], leisure: [3, 5] });

    expect(cuts(finish, complete).map((cut) => `${cut.activityId}.${cut.dayType}`)).toEqual([
      'sleep.wd',
      'sleep.we',
      'work.wd',
      'leisure.wd',
      'leisure.we',
    ]);
  });
});
