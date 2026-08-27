// @vitest-environment jsdom

/**
 * The console screen and its button (§6.2.3, §6.2.4 — AC 50–56).
 *
 * Driven through an injected `fetch`, so what is under test is the console's
 * own behaviour: what it shows, what it dims, and what the two presses do. The
 * endpoints behind it are proved in `app/api/routes.test.ts`, and the two
 * halves meet in `e2e/console.spec.ts`.
 *
 * The clock is faked because two of the criteria are durations — the 3 s poll
 * and the 5 s disarm — and a test that waited them out would spend eight
 * seconds proving what one step of the timer proves exactly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Console } from './Console';
import { ARM_MS } from './StageButton';
import { CONSOLE_POLL_INTERVAL_MS } from '@/lib/console/poll';
import type { FetchLike } from '@/lib/api/client';
import type { RoomStatus } from '@/lib/console/client';

const ROOM = 'room-1';

function statusOf(overrides: Partial<RoomStatus> = {}): RoomStatus {
  return {
    total: 40,
    ready: 23,
    stageOpen: false,
    joinCode: '4712',
    inStage: { s1: 9, s2: 8, s3: 23, s4: 0, s5: 0 },
    ...overrides,
  };
}

/**
 * A stub room the test drives directly: `status` is what the next poll
 * returns, `fail` makes it drop (true) or 404 (a status code), and `flips`
 * counts the presses that reached the endpoint.
 */
function stubRoom(initial: RoomStatus = statusOf()) {
  const room = {
    status: initial,
    fail: false as boolean | number,
    openFails: false,
    polls: 0,
    flips: 0,
  };

  const fetchImpl: FetchLike = async (url, init) => {
    if (init?.method === 'POST') {
      if (room.openFails) return Response.json({ error: 'nope' }, { status: 500 });
      room.flips += 1;
      room.status = { ...room.status, stageOpen: true };
      return Response.json({ ok: true });
    }
    room.polls += 1;
    if (room.fail === true) throw new Error('offline');
    if (typeof room.fail === 'number') {
      return Response.json({ error: 'unknown room' }, { status: room.fail });
    }
    return Response.json(room.status);
  };

  return { room, fetchImpl };
}

/** Flushes the in-flight request without moving the clock. */
function settle(): Promise<void> {
  return act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

function tick(ms: number): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** One poll interval, and the response that comes back on it. */
function poll(): Promise<void> {
  return tick(CONSOLE_POLL_INTERVAL_MS);
}

const button = () => screen.getByTestId('stage-button');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the console screen (§6.2.3)', () => {
  it('renders the join code, ready / total and all five stage counts (AC 50)', async () => {
    const { fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    expect(screen.getByTestId('console-joincode')).toHaveTextContent('4712');
    expect(screen.getByTestId('console-ready')).toHaveTextContent('23 / 40');
    for (const [stage, count] of Object.entries({ s1: 9, s2: 8, s3: 23, s4: 0, s5: 0 })) {
      expect(screen.getByTestId(`console-stage-${stage}`)).toHaveTextContent(String(count));
    }
  });

  it('swaps values on the 3 s poll (AC 51)', async () => {
    const { room, fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();
    expect(screen.getByTestId('console-ready')).toHaveTextContent('23 / 40');

    room.status = statusOf({ ready: 31, inStage: { s1: 0, s2: 6, s3: 31, s4: 3, s5: 0 } });
    await poll();

    expect(screen.getByTestId('console-ready')).toHaveTextContent('31 / 40');
    expect(screen.getByTestId('console-stage-s4')).toHaveTextContent('3');
  });

  it('keeps the last values, dimmed, under a reconnecting note when the poll fails (AC 52)', async () => {
    const { room, fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    room.fail = true;
    await poll();

    expect(screen.getByTestId('console-ready')).toHaveTextContent('23 / 40');
    expect(screen.getByTestId('console-values')).toHaveAttribute('data-stale', 'true');
    expect(screen.getByTestId('console-reconnecting')).toBeInTheDocument();

    // And it keeps asking: recovery needs no interaction.
    room.fail = false;
    room.status = statusOf({ ready: 40 });
    await poll();
    expect(screen.getByTestId('console-ready')).toHaveTextContent('40 / 40');
    expect(screen.getByTestId('console-values')).toHaveAttribute('data-stale', 'false');
    expect(screen.queryByTestId('console-reconnecting')).not.toBeInTheDocument();
  });

  it('names a bad room id rather than dimming values it never had', async () => {
    const { room, fetchImpl } = stubRoom();
    room.fail = 404;
    render(<Console roomId="nope" fetchImpl={fetchImpl} />);
    await settle();

    expect(screen.getByTestId('console-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('console-values')).not.toBeInTheDocument();
    expect(screen.queryByTestId('console-reconnecting')).not.toBeInTheDocument();
  });

  it('restores the same screen from the next poll after a remount (AC 56)', async () => {
    const { room, fetchImpl } = stubRoom(statusOf({ stageOpen: true, ready: 40 }));
    const first = render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();
    expect(screen.getByTestId('stage-open')).toBeInTheDocument();
    first.unmount();

    // Nothing survives the unmount but the room itself, which is the point:
    // the console holds no local state (§6.2.3).
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();
    expect(screen.getByTestId('console-ready')).toHaveTextContent('40 / 40');
    expect(screen.getByTestId('stage-open')).toBeInTheDocument();
    expect(room.flips).toBe(0);
  });

  it('stops polling once unmounted', async () => {
    const { room, fetchImpl } = stubRoom();
    const view = render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();
    const polled = room.polls;

    view.unmount();
    await poll();
    await poll();
    expect(room.polls).toBe(polled);
  });
});

describe('the button (§6.2.4)', () => {
  it('takes two presses, and the armed label restates total (AC 53)', async () => {
    const { room, fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    expect(button()).toHaveTextContent('Open the reveal');

    await act(async () => button().click());
    // `total`, not `ready`: the flag force-advances the whole room (§6.3), and
    // a press at 23/40 should name the forty.
    expect(button()).toHaveTextContent('Confirm — opens for 40 participants');
    expect(room.flips).toBe(0);

    await act(async () => button().click());
    await settle();
    expect(room.flips).toBe(1);
  });

  it('reverts to idle after 5 s without a second press (AC 53)', async () => {
    const { room, fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    await act(async () => button().click());
    expect(button()).toHaveAttribute('data-phase', 'armed');

    await tick(ARM_MS);
    expect(button()).toHaveAttribute('data-phase', 'idle');
    expect(button()).toHaveTextContent('Open the reveal');
    expect(room.flips).toBe(0);
  });

  it('is replaced by a static Stage open state that cannot be pressed again (AC 54)', async () => {
    const { room, fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    await act(async () => button().click());
    await act(async () => button().click());
    await settle();

    expect(screen.getByTestId('stage-open')).toHaveTextContent('Stage open');
    expect(screen.queryByTestId('stage-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(room.flips).toBe(1);
  });

  it('returns to idle with an inline error when the POST fails (AC 55)', async () => {
    const { room, fetchImpl } = stubRoom();
    room.openFails = true;
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    await act(async () => button().click());
    await act(async () => button().click());
    await settle();

    expect(screen.queryByTestId('stage-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('stage-error')).toBeInTheDocument();
    expect(button()).toHaveTextContent('Open the reveal');
    expect(room.flips).toBe(0);

    // And it can be armed and pressed again.
    room.openFails = false;
    await act(async () => button().click());
    await act(async () => button().click());
    await settle();
    expect(screen.getByTestId('stage-open')).toBeInTheDocument();
  });

  it('is disabled on an empty room and enabled by one participant, never by a ready threshold', async () => {
    const { room, fetchImpl } = stubRoom(statusOf({ total: 0, ready: 0 }));
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();
    expect(button()).toBeDisabled();

    room.status = statusOf({ total: 1, ready: 0, inStage: { s1: 1, s2: 0, s3: 0, s4: 0, s5: 0 } });
    await poll();
    expect(button()).toBeEnabled();

    await act(async () => button().click());
    expect(button()).toHaveTextContent('Confirm — opens for 1 participant');
  });

  it('shows Stage open without waiting out a poll interval', async () => {
    const { fetchImpl } = stubRoom();
    render(<Console roomId={ROOM} fetchImpl={fetchImpl} />);
    await settle();

    await act(async () => button().click());
    await act(async () => button().click());
    await settle();

    // No clock advance between the press and this assertion.
    expect(screen.getByTestId('stage-open')).toBeInTheDocument();
  });
});
