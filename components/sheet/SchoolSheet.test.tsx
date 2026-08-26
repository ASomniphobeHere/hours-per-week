// @vitest-environment jsdom

/**
 * §8.3's band sheet — the same three-part control as the pace screen, and no
 * questionnaire content (AC 40).
 *
 * The point of the shared component is that a participant who reopens the band
 * cannot be shown a different ladder from the one they chose against, so what
 * is asserted here is both halves of that: the control is present with the
 * level the band is at, and nothing else is.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { Event } from '@/lib/domain/types';
import { schoolPack, SCHOOL_ID } from '@/lib/pack/__fixtures__/school';
import { renderParticipant, sessionState } from '@/components/participant/__fixtures__/harness';
import { ActivitySheet } from './ActivitySheet';

const pack = schoolPack();

/** School as the pace screen leaves it: 5 h a workday, which is 25 a week. */
function atPace(perDay: number) {
  return {
    [SCHOOL_ID]: {
      wd: { mode: 'direct' as const, hours: perDay },
      we: { mode: 'direct' as const, hours: 0 },
    },
  };
}

function mount(perDay = 5) {
  const events: Event[] = [];
  const view = renderParticipant(
    <ActivitySheet activityId={SCHOOL_ID} onClose={() => {}} />,
    {
      pack,
      state: sessionState({ stage: 's4', authored: atPace(perDay) }),
      onEvent: (event) => events.push(event),
    },
  );
  return { ...view, events };
}

describe('the school sheet (AC 40)', () => {
  it('opens on the ladder at the level the band is at', () => {
    mount(5);
    expect(screen.getByTestId('school-control')).toBeInTheDocument();
    expect(screen.getByTestId('school-weekly')).toHaveTextContent('25');
    expect(screen.getByTestId('school-per-day')).toHaveTextContent('5 h on each workday');
    expect(screen.getByTestId('school-outcome')).toHaveTextContent('Outcome at twenty-five.');
  });

  it('carries none of the questionnaire, and no direct-entry control', () => {
    mount();
    expect(screen.queryByTestId('sheet-screens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('direct-entry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('direct-hours-wd')).not.toBeInTheDocument();
  });

  it('writes a step straight through, and it appears in cut order (§8.3)', () => {
    const { events } = mount(8);
    expect(screen.getByTestId('school-weekly')).toHaveTextContent('40');
    expect(screen.getByTestId('school-up')).toBeDisabled();

    // Lowering the pace to fit is a legitimate route to completion, and it is
    // a reduction like any other.
    fireEvent.click(screen.getByTestId('school-down'));
    expect(screen.getByTestId('school-weekly')).toHaveTextContent('35');
    expect(screen.getByTestId('school-per-day')).toHaveTextContent('7 h on each workday');

    expect(events.filter((event) => event.type === 'hours.change')).toEqual([
      expect.objectContaining({ activityId: SCHOOL_ID, from: 8, to: 7 }),
    ]);
    // The weekend is untouched, so it produces no event of its own.
    expect(events.some((event) => event.type === 'mode.direct')).toBe(false);
  });
});
