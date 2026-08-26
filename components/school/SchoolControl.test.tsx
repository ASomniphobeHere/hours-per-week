// @vitest-environment jsdom

/**
 * §8.3's ladder, as a control (AC 39, AC 39a).
 *
 * The subject is the three-part control alone: the stepper's bounds and step,
 * the per-workday figure it implies, and the rung's outcome — all three live on
 * every press. Where the number goes afterwards is the pace screen's business
 * and the sheet's, and both are tested where they live.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { indexPack } from '@/lib/pack';
import { schoolPack, SCHOOL_ID } from '@/lib/pack/__fixtures__/school';
import { derive } from '@/lib/domain/derive';
import { buildEstimators } from '@/lib/estimators/registry';
import type { Activity } from '@/lib/domain/types';
import { SchoolControl } from './SchoolControl';

const pack = schoolPack();
const index = indexPack(pack);

function school(): Activity {
  const { activities } = derive({
    index,
    answers: {},
    estimators: buildEstimators(pack.estimators, index.fieldById),
  });
  const found = activities.find((activity) => activity.id === SCHOOL_ID);
  if (found === undefined) throw new Error('the fixture has no locked activity');
  return found;
}

function mount(weekly: number) {
  const onChange = vi.fn();
  render(
    <SchoolControl pack={pack} activity={school()} weekly={weekly} onChange={onChange} />,
  );
  return onChange;
}

const down = () => screen.getByTestId('school-down');
const up = () => screen.getByTestId('school-up');

describe('the stepper (AC 39)', () => {
  it('steps by the pack increment, in weekly hours', () => {
    const onChange = mount(25);
    fireEvent.click(up());
    expect(onChange).toHaveBeenCalledWith(30);
    fireEvent.click(down());
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('disables the decrement at the floor and the increment at the ceiling', () => {
    mount(20);
    expect(down()).toBeDisabled();
    expect(up()).toBeEnabled();
  });

  it('disables the increment at 40 h — the last rung the pack can speak for', () => {
    mount(40);
    expect(up()).toBeDisabled();
    expect(down()).toBeEnabled();
  });

  it('is operable in both directions between the two bounds', () => {
    mount(30);
    expect(down()).toBeEnabled();
    expect(up()).toBeEnabled();
  });
});

describe('the per-workday figure and the outcome (AC 39a)', () => {
  /** 20 → 4, 25 → 5, 30 → 6, 35 → 7, 40 → 8 — the whole of §8.3's table. */
  it.each([
    [20, '4', 'Outcome at twenty.'],
    [25, '5', 'Outcome at twenty-five.'],
    [30, '6', 'Outcome at thirty.'],
    [35, '7', 'Outcome at thirty-five.'],
    [40, '8', 'Outcome at forty.'],
  ])('at %i h a week: %s h per workday, and its own rung', (weekly, perDay, outcome) => {
    mount(weekly as number);
    expect(screen.getByTestId('school-weekly')).toHaveTextContent(String(weekly));
    expect(screen.getByTestId('school-per-day')).toHaveTextContent(
      `${perDay} h on each workday`,
    );
    expect(screen.getByTestId('school-outcome')).toHaveTextContent(outcome as string);
  });

  /*
   * The point of the outcome line: the stepper is a decision about the
   * programme, not about a band height. If a rung's copy is missing the pack
   * would not have loaded (§4.6), so the only thing this can catch is the
   * client reading the wrong key.
   */
  it('says something different at every rung', () => {
    const seen = new Set<string>();
    for (const weekly of [20, 25, 30, 35, 40]) {
      const view = render(
        <SchoolControl pack={pack} activity={school()} weekly={weekly} onChange={() => {}} />,
      );
      seen.add(screen.getAllByTestId('school-outcome').at(-1)?.textContent ?? '');
      view.unmount();
    }
    expect(seen.size).toBe(5);
  });
});
