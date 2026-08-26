// @vitest-environment jsdom

/**
 * S4 — the two reveal screens, the school band, the stripes and confirm
 * (AC 37, 37a, 38, 39, 39a, 41, 42, 43, 44, 45).
 *
 * The machine is driven through `Stages` against the school fixture, so what
 * is asserted is the participant's route rather than a component's props: the
 * commitment, then the pace, then a stack that has school at the top of it and
 * a confirm control that will not move until the week fits.
 *
 * Breaches are seeded as direct values rather than answered into existence.
 * §11 admits an answer set over 24 h at S1 and the editor is expected to open
 * already striped — a `direct` 21 h is the same arithmetic with one line of
 * setup instead of nine, and the schedule cannot tell the difference.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { DayType, Event } from '@/lib/domain/types';
import type { ScheduleState } from '@/lib/domain/derive';
import type { FetchLike } from '@/lib/session/client';
import { memoryStorage, load, type StorageLike } from '@/lib/store/persist';
import { schoolPack, SCHOOL_ID } from '@/lib/pack/__fixtures__/school';
import { renderParticipant, sessionState } from './__fixtures__/harness';
import { Stages } from './Stages';

const pack = schoolPack();

interface Call {
  url: string;
  body: unknown;
}

/** A room with the stage already open: every test here starts at the reveal. */
function room() {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
    const body = url.endsWith('/stage') ? { stageOpen: true, serverTime: Date.now() } : { ok: true };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    fetchImpl,
    completes: () => calls.filter((call) => call.url.endsWith('/complete')),
  };
}

/** One activity's direct hours, as the persisted override map. */
function authored(entries: Record<string, Partial<Record<DayType, number>>>): ScheduleState {
  const state: ScheduleState = {};
  for (const [id, days] of Object.entries(entries)) {
    state[id] = {
      wd: { mode: days.wd === undefined ? 'derived' : 'direct', hours: days.wd ?? 0 },
      we: { mode: days.we === undefined ? 'derived' : 'direct', hours: days.we ?? 0 },
    };
  }
  return state;
}

function mount(
  options: {
    server?: ReturnType<typeof room>;
    authored?: ScheduleState;
    dayType?: DayType;
    storage?: StorageLike;
    onEvent?: (event: Event) => void;
  } = {},
) {
  const server = options.server ?? room();
  const view = renderParticipant(<Stages fetchImpl={server.fetchImpl} />, {
    pack,
    state: sessionState({
      stage: 's3',
      dayType: options.dayType ?? 'wd',
      authored: options.authored ?? {},
    }),
    storage: options.storage ?? memoryStorage(),
    onEvent: options.onEvent,
  });
  return { ...view, server };
}

/** Past the 5 s floor and into the reveal. */
function toReveal(): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(6_000);
  });
}

function click(testId: string): void {
  fireEvent.click(screen.getByTestId(testId));
}

const stack = () => screen.queryByTestId('stack');
const confirm = () => screen.getByTestId('confirm');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the reveal is two screens, and the stack is on neither (AC 37a)', () => {
  it('opens on the commitment: the ask, one control, no number and no stack', async () => {
    mount();
    await toReveal();

    const reveal = screen.getByTestId('reveal');
    expect(within(reveal).getByText('One more commitment')).toBeInTheDocument();
    expect(stack()).not.toBeInTheDocument();
    // It states that a commitment exists; it does not ask for a number.
    expect(screen.queryByTestId('school-control')).not.toBeInTheDocument();
  });

  it('continues to the pace, which asks for the number and still shows no stack', async () => {
    mount();
    await toReveal();
    click('reveal-continue');

    expect(screen.getByTestId('pace')).toBeInTheDocument();
    expect(screen.getByTestId('school-control')).toBeInTheDocument();
    expect(stack()).not.toBeInTheDocument();
  });

  it('reaches the stack only once the pace is committed', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    expect(stack()).not.toBeInTheDocument();

    click('pace-continue');
    expect(stack()).toBeInTheDocument();
    expect(screen.queryByTestId('pace')).not.toBeInTheDocument();
  });
});

describe('school in the stack (AC 38, 39, 39a)', () => {
  it('enters at the committed level, at the top of the stack, above sleep', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    const bands = [...screen.getByTestId('stack').querySelectorAll('[data-activity]')];
    expect(bands[0]?.getAttribute('data-activity')).toBe(SCHOOL_ID);
    // 20 h a week over five workdays is 4 h, on top of the 1.5 h the fixture
    // derives — read off the toggle, which is where the participant reads it.
    expect(screen.getByTestId('toggle-hours-wd')).toHaveTextContent('5.5 hr');
  });

  it('enters at 8 h a workday when the participant chose 40 (AC 39a)', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    for (let press = 0; press < 4; press += 1) click('school-up');
    expect(screen.getByTestId('school-per-day')).toHaveTextContent('8 h on each workday');

    click('pace-continue');
    expect(
      screen.getByTestId('stack').querySelector(`[data-activity="${SCHOOL_ID}"]`),
    ).toBeInTheDocument();
    expect(screen.getByTestId('toggle-hours-wd')).toHaveTextContent('9.5 hr');
  });

  it('is zero on the weekend, so the reveal leaves that stack alone', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    const before = screen.getByTestId('toggle-hours-we').textContent;
    fireEvent.click(screen.getByTestId('day-toggle').querySelector('[data-daytype="we"]')!);
    expect(
      screen.getByTestId('stack').querySelector(`[data-activity="${SCHOOL_ID}"]`),
    ).toBeNull();
    expect(screen.getByTestId('toggle-hours-we').textContent).toBe(before);
  });

  it('persists the committed level, so a refresh returns to the stack (§11)', async () => {
    const storage = memoryStorage();
    const view = mount({ storage });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');
    view.unmount();

    // The same record, remounted — which is what a refresh is.
    const stored = load(storage);
    expect(stored?.stage).toBe('s4');
    expect(stored?.authored[SCHOOL_ID]?.wd).toEqual({ mode: 'direct', hours: 4 });
  });
});

describe('what the commit puts in the log (§10, step 7.2)', () => {
  /*
   * The pace chosen before any cost was visible is one of the two figures the
   * debrief reports under *school above minimum*; the other is the pace held at
   * complete. One event makes the pair recoverable — and the default is the
   * absence of it, because a participant who took what they were offered chose
   * nothing.
   */
  it('logs nothing for a participant who takes the default', async () => {
    const events: Event[] = [];
    mount({ onEvent: (event) => events.push(event) });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    expect(events.filter((event) => event.type === 'hours.change')).toEqual([]);
    // And no `mode.direct`: school was never on an estimator to be taken off.
    expect(events.some((event) => event.type === 'mode.direct')).toBe(false);
  });

  it('logs one change, in per-workday hours, for a raised pace', async () => {
    const events: Event[] = [];
    mount({ onEvent: (event) => events.push(event) });
    await toReveal();
    click('reveal-continue');
    for (let press = 0; press < 4; press += 1) click('school-up');
    // Walking the stepper writes nothing: the level is held until Continue.
    expect(events.filter((event) => event.type === 'hours.change')).toEqual([]);

    click('pace-continue');
    expect(events.filter((event) => event.type === 'hours.change')).toEqual([
      expect.objectContaining({ activityId: SCHOOL_ID, from: 4, to: 8 }),
    ]);
  });
});

describe('the day type at S4 (AC 37)', () => {
  it('forces the selection to wd on entry, and leaves the toggle operable', async () => {
    mount({ dayType: 'we' });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'wd');

    fireEvent.click(screen.getByTestId('day-toggle').querySelector('[data-daytype="we"]')!);
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
  });
});

describe('overflow and completion (AC 41, 42, 43, 45)', () => {
  /** 21 h of alpha leaves 2.5 h of the workday; 4 h of school will not fit. */
  const breaching = authored({ alpha: { wd: 21 } });

  it('stripes the region below the rim and disables confirm (AC 41, 43)', async () => {
    mount({ authored: breaching });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    expect(screen.getByTestId('overflow-stripes')).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
  });

  it('says nothing about the excess anywhere on the page (AC 42)', async () => {
    mount({ authored: breaching });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    // The one numeric signal is the segment's occupied hours, bold and red.
    expect(screen.getByTestId('toggle-hours-wd')).toHaveAttribute('data-breach', 'true');
    expect(screen.getByTestId('toggle-hours-wd')).toHaveTextContent('25.5 hr');
    // And nothing states the excess: 25.5 − 24 appears nowhere, signed or not.
    expect(document.body.textContent).not.toMatch(/1\.5|\+|over/i);
  });

  it('lets the participant rebalance to fit, then confirms (AC 43)', async () => {
    const server = room();
    const events: Event[] = [];
    const { container } = mount({ server, authored: breaching, onEvent: (e) => events.push(e) });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');
    expect(confirm()).toBeDisabled();

    // Cut alpha to 19 h: the workday now sums to 23.5. It is already the
    // participant's own value here, so the sheet opens with its box on show.
    fireEvent.click(container.querySelector('[data-hit="alpha"]')!);
    const box = screen.getByTestId('direct-hours-wd');
    fireEvent.change(box, { target: { value: '19' } });
    fireEvent.blur(box);
    click('sheet-done');

    expect(screen.queryByTestId('overflow-stripes')).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    expect(events.filter((event) => event.type === 'fits')).toHaveLength(1);

    // §8.4 — fitting enables the control and does not press it.
    expect(screen.getByTestId('stack')).toBeInTheDocument();

    click('confirm');
    expect(screen.getByTestId('done')).toBeInTheDocument();
    expect(server.completes()).toHaveLength(1);
    const { schedule } = server.completes()[0]!.body as { schedule: { kind: string; fits: boolean } };
    expect(schedule.kind).toBe('complete');
    expect(schedule.fits).toBe(true);
  });

  it('a slack-rich participant meets no stripe and a live confirm (AC 45)', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    expect(screen.queryByTestId('overflow-stripes')).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
  });

  it('the rim looks the same fitting and breaching (AC 41)', async () => {
    mount();
    await toReveal();
    click('reveal-continue');
    click('pace-continue');
    const fitting = screen.getByTestId('overflow-rim').className;

    // Same pack, same scale, a week that breaches.
    const breached = mount({ authored: breaching });
    await toReveal();
    fireEvent.click(within(breached.container).getByTestId('reveal-continue'));
    fireEvent.click(within(breached.container).getByTestId('pace-continue'));
    const rims = screen.getAllByTestId('overflow-rim');
    expect(rims.at(-1)?.className).toBe(fitting);
  });
});

describe('a weekend that already breaches (AC 44)', () => {
  /** 23 h of beta on the weekend, on top of alpha's 2 h: 25, and school is not the cause. */
  const weekendBreach = authored({ beta: { we: 23 } });

  it('blocks confirm from the forced workday view, with the cause on the toggle', async () => {
    mount({ authored: weekendBreach });
    await toReveal();
    click('reveal-continue');
    click('pace-continue');

    // The workday fits and shows no stripe — the cause is off this stack.
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'wd');
    expect(screen.queryByTestId('overflow-stripes')).not.toBeInTheDocument();
    expect(confirm()).toBeDisabled();

    // Both things §8.3 requires: the unselected segment names it, and the
    // toggle reaches it.
    expect(screen.getByTestId('toggle-hours-we')).toHaveAttribute('data-breach', 'true');
    fireEvent.click(screen.getByTestId('day-toggle').querySelector('[data-daytype="we"]')!);
    expect(screen.getByTestId('overflow-stripes')).toBeInTheDocument();
  });
});
