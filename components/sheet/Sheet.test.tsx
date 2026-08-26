// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnswerMap, Event } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { setAnswer } from '@/lib/store/answers';
import { load, memoryStorage, type StorageLike } from '@/lib/store/persist';
import {
  renderParticipant,
  sessionState,
} from '@/components/participant/__fixtures__/harness';
import { Editor } from '@/components/stack/Editor';
import { BAND_TRANSITION_MS } from '@/components/stack/geometry';

/**
 * The sheet, driven through the editor rather than in isolation.
 *
 * §8.1's sheet is defined by what it does to the thing behind it — it occludes
 * the stack, which is why it carries the total; it locks the body scroll; and
 * its close is what animates the band. Rendering it alone would test a panel
 * and prove none of that, so every test here opens it the way a participant
 * does, from a band or from a Not-included row.
 */

/**
 * `alpha` gains sleep's floor, so §8.2's one named constraint has somewhere to
 * bite. The fixture is cloned per call, so this changes nothing for any other
 * test that uses it.
 */
function packWithFloor(): ContentPack {
  const pack = minimalPack();
  pack.activities[0]!.constraint = { minDaily: 6, weekendAllowed: true };
  return pack;
}

function renderEditor(
  options: {
    answers?: AnswerMap;
    pack?: ContentPack;
    storage?: StorageLike;
    onEvent?: (event: Event) => void;
  } = {},
) {
  return renderParticipant(<Editor />, {
    pack: options.pack,
    state: sessionState({ stage: 's2', answers: options.answers ?? {} }),
    storage: options.storage,
    onEvent: options.onEvent,
  });
}

const sheet = () => screen.getByTestId('sheet');
const band = (id: string) => screen.getByRole('button', { name: id });

async function openBand(name: string) {
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('the sheet shell (§8.1, AC 24)', () => {
  it('opens on a band tap, naming the activity it belongs to (AC 23)', async () => {
    renderEditor();
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();

    await openBand('Alpha');

    expect(sheet()).toHaveAttribute('data-activity', 'alpha');
    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(sheet()).toHaveAccessibleName('Alpha');
  });

  it('locks body scroll while it is up, and gives it back on close', async () => {
    renderEditor();
    await openBand('Alpha');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByTestId('sheet-done'));

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('focuses the first focusable element on open (§8.1)', async () => {
    renderEditor();
    await openBand('Alpha');
    expect(document.activeElement).toBe(screen.getByTestId('sheet-grabber'));
  });

  it('closes on Escape', async () => {
    renderEditor();
    await openBand('Alpha');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('closes on a backdrop tap', async () => {
    renderEditor();
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('traps Tab inside the sheet (§8.1)', async () => {
    renderEditor();
    await openBand('Alpha');
    const panel = sheet();
    const stops = [...panel.querySelectorAll('button, input')] as HTMLElement[];

    // Forward off the end wraps to the front, not out into the stack.
    stops[stops.length - 1]!.focus();
    await userEvent.tab();
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(stops[0]);

    // And backward off the front wraps to the end.
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it('returns focus to the band that opened it', async () => {
    renderEditor();
    const opener = band('Alpha');
    await userEvent.click(opener);
    await userEvent.click(screen.getByTestId('sheet-done'));
    expect(document.activeElement).toBe(opener);
  });
});

describe('drag to dismiss (§8.1)', () => {
  /** jsdom measures nothing, so the sheet is given a height to be a quarter of. */
  function stubHeight(height: number) {
    return vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height, width: 320, top: 0, left: 0, bottom: height, right: 320, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  }

  function drag(from: number, to: number) {
    const header = sheet().querySelector('header')!;
    act(() => {
      header.dispatchEvent(
        new PointerEvent('pointerdown', { clientY: from, bubbles: true, pointerId: 1 }),
      );
      header.dispatchEvent(
        new PointerEvent('pointermove', { clientY: to, bubbles: true, pointerId: 1 }),
      );
      header.dispatchEvent(
        new PointerEvent('pointerup', { clientY: to, bubbles: true, pointerId: 1 }),
      );
    });
  }

  it('closes on a downward drag past a quarter of the sheet height', async () => {
    renderEditor();
    await openBand('Alpha');
    const rect = stubHeight(600);
    drag(0, 200);
    rect.mockRestore();
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('stays up for a drag that does not reach the quarter', async () => {
    renderEditor();
    await openBand('Alpha');
    const rect = stubHeight(600);
    drag(0, 100);
    rect.mockRestore();
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });
});

describe('replay and the live header total (§8.1, AC 23)', () => {
  it('shows the section’s screens, prefilled from the answer map', async () => {
    renderEditor({ answers: setAnswer({}, 'alpha.minutes.wd', 90) });
    await openBand('Alpha');

    const content = screen.getByTestId('sheet-content');
    expect(within(content).getByText('How long does alpha take?')).toBeInTheDocument();
    // 90 on the workday, and the pack default of 120 still standing on the weekend.
    expect(within(content).getAllByRole('status').map((node) => node.textContent)).toEqual([
      '90min',
      '120min',
    ]);
  });

  it('shows only its own section’s screens', async () => {
    renderEditor();
    await openBand('Alpha');
    const content = screen.getByTestId('sheet-content');
    expect(within(content).queryByText('How long does beta take?')).not.toBeInTheDocument();
  });

  it('carries both day totals, and moves them as fields change (AC 23)', async () => {
    renderEditor();
    await openBand('Alpha');
    // 60 min and 120 min from the pack defaults.
    expect(screen.getByTestId('sheet-total-wd')).toHaveTextContent('1 hr');
    expect(screen.getByTestId('sheet-total-we')).toHaveTextContent('2 hr');

    const content = screen.getByTestId('sheet-content');
    await userEvent.click(within(content).getAllByRole('button', { name: 'Increase' })[0]!);

    // The workday field steps by its pack `step`; the weekend is untouched.
    expect(screen.getByTestId('sheet-total-wd')).not.toHaveTextContent('1 hr');
    expect(screen.getByTestId('sheet-total-we')).toHaveTextContent('2 hr');
  });

  it('is a scroll, not a pager: no next control inside the sheet', async () => {
    renderEditor();
    await openBand('Beta');
    const content = screen.getByTestId('sheet-content');
    // Beta has a gate screen and a time screen; both are on screen at once.
    expect(within(content).getByText('Do you do beta?')).toBeInTheDocument();
    expect(within(content).getByText('How long does beta take?')).toBeInTheDocument();
    expect(within(content).queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});

describe('constraints in the sheet (§8.2, AC 25)', () => {
  async function openDirect(options: Parameters<typeof renderEditor>[0] = {}) {
    const result = renderEditor({ pack: packWithFloor(), ...options });
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));
    return result;
  }

  it('refuses a value below the floor, and says nothing about it', async () => {
    await openDirect();
    // Alpha derives to 1 h; taking it over brings it up to its floor.
    expect(screen.getByTestId('direct-hours-wd')).toHaveValue(6);

    await userEvent.clear(screen.getByTestId('direct-hours-wd'));
    await userEvent.type(screen.getByTestId('direct-hours-wd'), '3{Enter}');

    expect(screen.getByTestId('direct-hours-wd')).toHaveValue(6);
    expect(screen.getByTestId('sheet-total-wd')).toHaveTextContent('6 hr');
    // §8.2: clamping is silent. Nothing announces it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the decrement at the floor (§8.2)', async () => {
    await openDirect();
    expect(screen.getByTestId('direct-down-wd')).toBeDisabled();

    await userEvent.click(screen.getByTestId('direct-up-wd'));

    expect(screen.getByTestId('direct-hours-wd')).toHaveValue(6.25);
    expect(screen.getByTestId('direct-down-wd')).toBeEnabled();
  });

  it('clamps everything without a floor at zero', async () => {
    renderEditor();
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));

    await userEvent.clear(screen.getByTestId('direct-hours-wd'));
    await userEvent.type(screen.getByTestId('direct-hours-wd'), '-4{Enter}');

    expect(screen.getByTestId('direct-hours-wd')).toHaveValue(0);
    expect(screen.getByTestId('direct-down-wd')).toBeDisabled();
  });

  it('emits clamp.hit carrying what was refused (§8.2, §10)', async () => {
    const onEvent = vi.fn();
    await openDirect({ onEvent });
    onEvent.mockClear();

    await userEvent.clear(screen.getByTestId('direct-hours-wd'));
    await userEvent.type(screen.getByTestId('direct-hours-wd'), '3{Enter}');

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clamp.hit', activityId: 'alpha', from: 3, to: 6 }),
    );
  });
});

describe('direct entry (§8.1, §4.3 rules 4–5, AC 26)', () => {
  it('overrides derivation without touching the answers underneath', async () => {
    const storage = memoryStorage();
    renderEditor({ answers: setAnswer({}, 'alpha.minutes.wd', 90), storage });
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));

    await userEvent.clear(screen.getByTestId('direct-hours-wd'));
    await userEvent.type(screen.getByTestId('direct-hours-wd'), '5{Enter}');

    expect(screen.getByTestId('sheet-total-wd')).toHaveTextContent('5 hr');
    const stored = load(storage)!;
    expect(stored.authored['alpha']?.wd).toEqual({ mode: 'direct', hours: 5 });
    // The answer that used to produce 1.5 h is exactly where it was.
    expect(stored.answers['alpha.minutes.wd']?.value).toBe(90);
  });

  it('restores derivation from those unchanged answers on revert (AC 26)', async () => {
    renderEditor({ answers: setAnswer({}, 'alpha.minutes.wd', 90) });
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));
    await userEvent.clear(screen.getByTestId('direct-hours-wd'));
    await userEvent.type(screen.getByTestId('direct-hours-wd'), '5{Enter}');
    expect(screen.getByTestId('sheet-total-wd')).toHaveTextContent('5 hr');

    await userEvent.click(screen.getByTestId('direct-toggle'));

    expect(screen.queryByTestId('direct-hours-wd')).not.toBeInTheDocument();
    expect(screen.getByTestId('sheet-total-wd')).toHaveTextContent('1.5 hr');
  });

  it('survives a close and reopen, and a refresh (§5, §11)', async () => {
    const storage = memoryStorage();
    const { unmount } = renderEditor({ storage });
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));
    await userEvent.click(screen.getByTestId('direct-up-wd'));
    await userEvent.click(screen.getByTestId('sheet-done'));
    unmount();

    // The same storage record a refresh restores from.
    renderParticipant(<Editor />, { state: load(storage)!, storage });
    await openBand('Alpha');

    expect(screen.getByTestId('direct-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('direct-hours-wd')).toHaveValue(1.25);
  });

  it('announces the takeover once, not once per day type (§10)', async () => {
    const onEvent = vi.fn();
    renderEditor({ onEvent });
    await openBand('Alpha');
    onEvent.mockClear();

    await userEvent.click(screen.getByTestId('direct-toggle'));

    // §10's `mode.direct` names an activity and no day type, so the flip that
    // takes both days has exactly one of them to report.
    const takeovers = onEvent.mock.calls.filter(
      (call) => (call[0] as Event).type === 'mode.direct',
    );
    expect(takeovers).toHaveLength(1);
    // And it moved nothing: alpha is nowhere near a floor.
    expect(onEvent.mock.calls.map((call) => (call[0] as Event).type)).not.toContain('hours.change');
  });

  it('then reports plain hour changes (§10)', async () => {
    const onEvent = vi.fn();
    renderEditor({ onEvent });
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('direct-toggle'));
    onEvent.mockClear();

    await userEvent.click(screen.getByTestId('direct-up-wd'));

    const types = onEvent.mock.calls.map((call) => (call[0] as Event).type);
    expect(types).not.toContain('mode.direct');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hours.change', activityId: 'alpha', from: 1, to: 1.25 }),
    );
  });
});

describe('a Not-included row opens the same sheet (§7.7, AC 30)', () => {
  /** Beta gated out: zero on both day types, so it is not in the stack. */
  const GATED = setAnswer({}, 'beta.any', 'no');

  it('opens prefilled, with the gate at the falsy value it was given', async () => {
    renderEditor({ answers: GATED });
    expect(screen.getByTestId('not-included')).toHaveTextContent('Beta');

    await userEvent.click(
      within(screen.getByTestId('not-included')).getByRole('button', { name: 'Beta' }),
    );

    expect(sheet()).toHaveAttribute('data-activity', 'beta');
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
  });

  it('shows the gate alone while the section is skipped, and the rest once it is not', async () => {
    renderEditor({ answers: GATED });
    await userEvent.click(
      within(screen.getByTestId('not-included')).getByRole('button', { name: 'Beta' }),
    );
    const content = screen.getByTestId('sheet-content');
    expect(within(content).queryByText('How long does beta take?')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));

    expect(within(content).getByText('How long does beta take?')).toBeInTheDocument();
  });

  it('moves the activity into the stack at its pack order on close (AC 30)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderEditor({ answers: GATED });
      await userEvent.click(
        within(screen.getByTestId('not-included')).getByRole('button', { name: 'Beta' }),
      );
      await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));

      // The stack is frozen behind the sheet: beta is laid out, at nothing.
      const stack = screen.getByTestId('stack');
      expect(stack.querySelector('[data-activity="beta"]')).toHaveStyle({ height: '0px' });

      await userEvent.click(screen.getByTestId('sheet-done'));

      const ids = [...stack.querySelectorAll('[data-activity]')].map((node) =>
        node.getAttribute('data-activity'),
      );
      expect(ids).toEqual(['alpha', 'beta']);
      expect(screen.queryByTestId('not-included')).not.toBeInTheDocument();

      // §8.1's 200 ms, and then the stack is still again.
      expect(stack).toHaveAttribute('data-settling', 'true');
      act(() => void vi.advanceTimersByTime(BAND_TRANSITION_MS));
      expect(stack).not.toHaveAttribute('data-settling');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the stack behind the sheet (§8.1)', () => {
  it('holds still while the sheet is up, so the close has something to animate', async () => {
    renderEditor();
    const heightOf = () =>
      screen.getByTestId('stack').querySelector('[data-activity="alpha"]')!.getAttribute('style');

    await openBand('Alpha');
    const frozen = heightOf();

    const content = screen.getByTestId('sheet-content');
    await userEvent.click(within(content).getAllByRole('button', { name: 'Increase' })[0]!);

    // The band has not moved, but the sheet's own total has.
    expect(heightOf()).toBe(frozen);
    expect(screen.getByTestId('sheet-total-wd')).not.toHaveTextContent('1 hr');
  });

  it('keeps the selected day type across an open and close (AC 15)', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /weekend/i }));
    await openBand('Alpha');
    await userEvent.click(screen.getByTestId('sheet-done'));
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
  });

  it('reports the opening and the dismissal to §10', async () => {
    const onEvent = vi.fn();
    renderEditor({ onEvent });
    await openBand('Alpha');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sheet.open', activityId: 'alpha' }),
    );

    await userEvent.click(screen.getByTestId('sheet-done'));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sheet.close', activityId: 'alpha' }),
    );
  });
});
