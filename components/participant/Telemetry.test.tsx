// @vitest-environment jsdom

/**
 * Step 10.1 — every member of §10's `EventType` union emitted at its moment.
 *
 * Six of the fourteen landed with this stage; the other eight were emitted by
 * the stages that created their moments and are covered where they happen
 * (`Stages.test.tsx`, `Sheet.test.tsx`, `S4.test.tsx`). What this file adds is
 * the union's own completeness check, which is the property the step actually
 * claims: a type nothing emits is a column the debrief will always find empty,
 * and nothing else in the suite would notice.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Event } from '@/lib/domain/types';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import type { ContentPack } from '@/lib/pack/types';
import { Questionnaire } from './Questionnaire';
import { renderParticipant } from './__fixtures__/harness';

function collect() {
  const events: Event[] = [];
  return { events, onEvent: (event: Event) => events.push(event) };
}

const typesOf = (events: Event[]) => events.map((event) => event.type);

describe('§10 event emission (step 10.1)', () => {
  it('logs a screen.view for the screen on show, with its section', async () => {
    const user = userEvent.setup();
    const { events, onEvent } = collect();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { onEvent });

    const views = () => events.filter((event) => event.type === 'screen.view');
    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({ screenId: 'alpha.time', activityId: 'alpha' });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(views()).toHaveLength(2);
    expect(views()[1]?.screenId).toBe('beta.gate');
  });

  /**
   * The first value a field takes is an answer and every one after it is a
   * revision. The two are told apart by the answer map, which is what the
   * debrief needs to see a participant going back over a question.
   */
  it('tells a first answer from a revision', async () => {
    const user = userEvent.setup();
    const { events, onEvent } = collect();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { onEvent });

    const increase = screen.getAllByLabelText('Increase')[0]!;
    await user.click(increase);
    await user.click(increase);

    const fieldEvents = events.filter((event) => event.type.startsWith('field.'));
    expect(typesOf(fieldEvents)).toEqual(['field.answer', 'field.revise']);
    expect(fieldEvents[0]?.fieldId).toBe('alpha.minutes.wd');
  });

  /**
   * Agreeing with what is on screen writes the pack default (§4.2) and logs
   * nothing: an event for it would be indistinguishable from the participant
   * typing that same number, and the debrief reads engagement off these.
   */
  it('logs nothing for a default committed by agreement', async () => {
    const user = userEvent.setup();
    const { events, onEvent } = collect();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { onEvent });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(typesOf(events).filter((type) => type.startsWith('field.'))).toEqual([]);
  });

  /**
   * §11's row: an estimator that fails falls back silently for the participant
   * and loudly for the log. Once per entry into `fallback`, not once per
   * render — the estimator is retried on every derivation pass (§4.3 rule 5),
   * and a repeated failure is the same failure.
   *
   * The failure is induced as a non-finite result rather than a throw. Every
   * bundled implementation is deliberately written not to throw on any answer
   * map (§4.3 rule 2, `inputs.ts`), so a pack cannot make one — and `estimate`
   * treats the two identically, because a `NaN` that propagates into every
   * total in the system is a failed evaluation whether or not it announced
   * itself.
   */
  it('logs estimator.fallback once when an estimator stops producing a number', async () => {
    const pack = minimalPack();
    const broken: ContentPack = {
      ...pack,
      estimators: pack.estimators.map((estimator) =>
        estimator.activityId === 'alpha'
          ? {
              id: 'household.v1',
              activityId: 'alpha',
              inputs: [],
              outputs: ['wd', 'we'] as const,
              params: {
                wd: { intercept: Number.NaN, terms: [] },
                we: { intercept: Number.NaN, terms: [] },
              },
            }
          : estimator,
      ),
    };

    const user = userEvent.setup();
    const { events, onEvent } = collect();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { pack: broken, onEvent });

    // A second derivation pass over the same failure — the retry §4.3 rule 5
    // requires, and the one a per-render emitter would report twice.
    await user.click(screen.getAllByLabelText('Increase')[0]!);

    const fallbacks = events.filter((event) => event.type === 'estimator.fallback');
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]?.activityId).toBe('alpha');
  });
});
