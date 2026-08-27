// @vitest-environment jsdom

/**
 * S7 (steps 10.6 and 10.7).
 *
 * §12 names no criterion for this screen, so the plan states its proof
 * instead: a breaching participant driven through the rebalance whose rows
 * equal the snapshot delta exactly, and a slack-rich participant who lands on
 * the no-cut copy with an empty list behind it. Both are here, plus the two
 * things that would quietly break the screen — school appearing as a row, and
 * an increase appearing as one.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { ScheduleSnapshot, SnapshotKind } from '@/lib/domain/types';
import { schoolPack } from '@/lib/pack/__fixtures__/school';
import { renderParticipant, sessionState } from './__fixtures__/harness';
import { Summary } from './Summary';

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
    total: { wd: 24, we: 24 },
    remaining: { wd: 0, we: 0 },
    fits: true,
  };
}

function mount(
  finish: ScheduleSnapshot,
  complete: ScheduleSnapshot,
  reset: () => Promise<void> = () => Promise.resolve(),
) {
  return renderParticipant(<Summary />, {
    pack: schoolPack(),
    reset,
    state: sessionState({ stage: 's5', snapshots: { finish, complete } }),
  });
}

const rowText = (activityId: string, dayType: 'wd' | 'we' = 'wd') =>
  screen.getByTestId(`cut-${activityId}-${dayType}`).textContent;

describe('S7 — what it cost (step 10.6)', () => {
  it('names one row per cut, from → to, and nothing else', () => {
    mount(
      snapshot('finish', { school: [0, 0], sleep: [8, 9], leisure: [4, 6], admin: [2, 2] }),
      snapshot('complete', { school: [4, 0], sleep: [8, 9], leisure: [2, 6], admin: [1, 2] }),
    );

    expect(screen.getByTestId('summary-cuts').children).toHaveLength(2);
    expect(rowText('leisure')).toBe('4 h → 2 h');
    expect(rowText('admin')).toBe('2 h → 1 h');
  });

  /*
   * The screen's whole claim: the rows *are* the snapshot delta. A participant
   * who cut leisure to 2, thought better of it and settled at 3 reads one row
   * — the decision they arrived at — and not the route they took to it.
   */
  it('reads the settled figure, not the route taken to it', () => {
    mount(
      snapshot('finish', { school: [0, 0], leisure: [6, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [5, 6] }),
    );

    expect(screen.getByTestId('summary-cuts').children).toHaveLength(1);
    expect(rowText('leisure')).toBe('6 h → 5 h');
  });

  /** It went up, and it is the reason for the list rather than a member of it. */
  it('never lists school', () => {
    mount(
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [2, 6] }),
    );

    expect(screen.queryByTestId('cut-school-wd')).not.toBeInTheDocument();
  });

  it('never lists an increase', () => {
    mount(
      snapshot('finish', { school: [0, 0], sleep: [7, 8], leisure: [5, 6] }),
      snapshot('complete', { school: [4, 0], sleep: [8, 8], leisure: [1, 6] }),
    );

    expect(screen.queryByTestId('cut-sleep-wd')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-cuts').children).toHaveLength(1);
  });

  /**
   * A cut on a workday and a cut on a weekend day are two decisions. The day
   * label appears only when there is a weekend row to tell apart — a repeated
   * "Work day" down a list that is nothing else is chrome, not information.
   */
  it('labels day types only when the list holds a weekend row', () => {
    const { unmount } = mount(
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [2, 6] }),
    );
    expect(screen.queryByText('Work day')).not.toBeInTheDocument();
    unmount();

    mount(
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [2, 4] }),
    );
    expect(screen.getByText('Work day')).toBeInTheDocument();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
  });

  /**
   * §7.8, §11 — Unallocated absorbed school without an event and nothing else
   * in the week moved. A real finding, and not a consolation: the copy states
   * the figure and where it came from, and says nothing about the week.
   */
  it('gives the no-cut participant their own screen, not an empty list', () => {
    mount(
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [4, 6] }),
    );

    expect(screen.queryByTestId('summary-cuts')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-no-cuts')).toBeInTheDocument();
    expect(screen.getByText(/20 hours a week/)).toBeInTheDocument();
  });

  /** No stack, no bands: there is nothing left to edit here (step 10.6). */
  it('draws no instrument', () => {
    mount(
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [2, 6] }),
    );

    expect(screen.queryByTestId('stack')).not.toBeInTheDocument();
    expect(screen.queryByTestId('day-toggle')).not.toBeInTheDocument();
  });
});

describe('the options tab at S7 (step 10.7)', () => {
  const snapshots = () =>
    [
      snapshot('finish', { school: [0, 0], leisure: [4, 6] }),
      snapshot('complete', { school: [4, 0], leisure: [2, 6] }),
    ] as const;

  /** §7.9's second sentence: S2, the S6 stack, and S7 (AC 22a as amended). */
  it('is present, because S7 is terminal and has no other way off it', () => {
    mount(...snapshots());
    expect(screen.getByTestId('options-tab')).toBeInTheDocument();
  });

  /** §7.9 requires the confirmation to name what is lost, and here that differs. */
  it('names the finished result among what a reset destroys', () => {
    mount(...snapshots());
    fireEvent.click(screen.getByTestId('options-tab'));
    fireEvent.click(screen.getByTestId('options-reset'));

    expect(screen.getByText(/finished result/)).toBeInTheDocument();
  });

  it('runs the same reset as everywhere else', () => {
    const reset = vi.fn(() => Promise.resolve());
    mount(...snapshots(), reset);

    fireEvent.click(screen.getByTestId('options-tab'));
    fireEvent.click(screen.getByTestId('options-reset'));
    fireEvent.click(screen.getByTestId('options-confirm'));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
