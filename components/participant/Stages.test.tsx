// @vitest-environment jsdom

/**
 * §2.2's stage machine and §6.3's three entry paths (AC 32–36).
 *
 * Timers are faked throughout: the subject is a 3 s poll and a 5 s floor, and
 * a test that waited for either in wall time would take longer than the
 * behaviour it asserts. `fetch` is injected, so the flag is a variable a test
 * flips at the moment it means to.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import type { Event, OpenStage, ScheduleSnapshot } from '@/lib/domain/types';
import { S3_HOLD_MS } from '@/lib/domain/types';
import type { FetchLike } from '@/lib/session/client';
import { POLL_INTERVAL_MS, POLL_JITTER_MS } from '@/lib/session/poll';
import { load, memoryStorage, type StorageLike } from '@/lib/store/persist';
import { renderParticipant, sessionState } from './__fixtures__/harness';
import { Stages } from './Stages';

/** Long enough for one poll however the jitter fell. */
const POLL_MAX_MS = POLL_INTERVAL_MS + POLL_JITTER_MS;

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** The room, as far as one phone can see it: a gate level and a call log. */
function room({ open = false, fail = false } = {}) {
  const calls: Call[] = [];
  let level: OpenStage = open ? 2 : 0;
  const broken = fail;

  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    if (broken) throw new TypeError('offline');
    const body = url.endsWith('/stage') ? { openStage: level, serverTime: Date.now() } : { ok: true };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    calls,
    fetchImpl,
    openStage: (to: OpenStage = 2) => {
      level = to;
    },
    ready: () => calls.filter((call) => call.url.endsWith('/ready')),
    polls: () => calls.filter((call) => call.url.endsWith('/stage')),
  };
}

function mount(
  server: ReturnType<typeof room>,
  options: {
    stage?: 's1' | 's2' | 's3' | 's4';
    storage?: StorageLike;
    onEvent?: (event: Event) => void;
  } = {},
) {
  return renderParticipant(<Stages fetchImpl={server.fetchImpl} />, {
    state: sessionState({ stage: options.stage ?? 's2' }),
    storage: options.storage ?? memoryStorage(),
    onEvent: options.onEvent,
  });
}

/**
 * Runs pending timers, lets the awaited fetch inside them settle, and flushes
 * the React updates that follow.
 *
 * `act` is what makes the last of those three true: a poll result arriving on
 * a timer is a state update React has not been told to expect, and without the
 * wrapper the assertion reads the render before it. `userEvent` is absent from
 * this file for the same territory — it hangs under `vi.useFakeTimers`, and
 * every test here needs the clock.
 */
function tick(ms: number): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const held = () => screen.queryByTestId('hold');
const stack = () => screen.queryByTestId('stack');
const finish = () => screen.getByTestId('finish');

function snapshotOf(server: ReturnType<typeof room>): ScheduleSnapshot {
  return (server.ready()[0]?.body as { schedule: ScheduleSnapshot }).schedule;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('S2 → S3: Finish (AC 32)', () => {
  it('enters the hold, marks ready, and does not open the stage', async () => {
    const server = room();
    const storage = memoryStorage();
    mount(server, { storage });

    await tick(0);
    expect(stack()).toBeInTheDocument();

    fireEvent.click(finish());

    expect(held()).toBeInTheDocument();
    expect(stack()).not.toBeInTheDocument();
    expect(load(storage)?.stage).toBe('s3');

    expect(server.ready()).toHaveLength(1);
    const snapshot = snapshotOf(server);
    expect(snapshot.kind).toBe('finish');
    // 1 h alpha + 0.5 h beta from the pack defaults; slack at finish is what
    // the debrief reads off `remaining.wd` (§10).
    expect(snapshot.total.wd).toBeCloseTo(1.5);
    expect(snapshot.remaining.wd).toBeCloseTo(22.5);

    // Stage advance is the facilitator's alone (§6.2.4): nothing here touches
    // a room route.
    expect(server.calls.every((call) => call.url.includes('/session/'))).toBe(true);
  });

  it('emits `finish` and `stage.enter` at the moment of the press (§10)', async () => {
    const server = room();
    const events: Event[] = [];
    mount(server, { onEvent: (event) => events.push(event) });

    await tick(0);
    fireEvent.click(finish());

    expect(events.map((event) => event.type)).toEqual(['finish', 'stage.enter']);
    expect(events[1]?.stage).toBe('s3');
  });

  it('holds the full 5 s even when the flag was already open (§6.3 row 2)', async () => {
    const server = room({ open: true });
    mount(server);

    await tick(0);
    fireEvent.click(finish());
    expect(held()).toBeInTheDocument();

    await tick(S3_HOLD_MS - 1);
    expect(held()).toBeInTheDocument();

    await tick(1);
    expect(stack()).toBeInTheDocument();
  });
});

describe('S3: the hold (AC 33, AC 34)', () => {
  it('waits for the flag however long it takes', async () => {
    const server = room();
    mount(server);

    await tick(0);
    fireEvent.click(finish());

    // A minute of holding with the flag closed advances nobody.
    await tick(60_000);
    expect(held()).toBeInTheDocument();

    server.openStage();
    await tick(POLL_MAX_MS);
    // The floor was spent a minute ago, so the flag reaching the phone is the
    // moment they move.
    expect(stack()).toBeInTheDocument();
  });

  it('shows the pack line under one heading, and no connection state (AC 34)', async () => {
    const server = room({ fail: true });
    mount(server, { stage: 's3' });

    await tick(0);
    expect(screen.getByRole('heading')).toHaveTextContent('Working through your answers');
    // The line and its ellipsis are `Hold.test.tsx`'s; what matters here is
    // that the hold is what a failing poll leaves on screen.
    expect(screen.getByTestId('hold-line')).toHaveTextContent('One');

    // The poll has been failing the whole time and the screen says nothing
    // about it: §6.3 forbids a warning here.
    await tick(POLL_MAX_MS);
    await tick(POLL_MAX_MS);
    expect(server.polls().length).toBeGreaterThan(1);
    expect(held()?.textContent).not.toMatch(/connect|error|offline|retry/i);
  });

  it('restarts the floor on a refresh, and does not mark ready twice (§11)', async () => {
    const server = room({ open: true });
    mount(server, { stage: 's3' });

    await tick(0);
    expect(held()).toBeInTheDocument();

    await tick(S3_HOLD_MS - 1);
    expect(held()).toBeInTheDocument();

    await tick(1);
    expect(stack()).toBeInTheDocument();

    // The POST went with the Finish that preceded the refresh; a remount is
    // not a second finish.
    expect(server.ready()).toHaveLength(0);
  });
});

describe('S1/S2 → S3: force-advance (AC 35, §6.3 row 3)', () => {
  it('pulls a participant out of the questionnaire with a full stack', async () => {
    const server = room();
    const events: Event[] = [];
    const storage = memoryStorage();
    mount(server, { stage: 's1', storage, onEvent: (event) => events.push(event) });

    await tick(0);
    expect(screen.getByRole('heading')).toHaveTextContent('How long does alpha take?');

    server.openStage();
    await tick(POLL_MAX_MS);

    expect(held()).toBeInTheDocument();
    expect(events.map((event) => event.type)).toContain('forced.advance');
    expect(load(storage)?.stage).toBe('s3');

    // §4.2.1 rule 6 and §4.6's defaults: nothing was answered and nothing is
    // at zero — a full stack, not a hollow one.
    expect(server.ready()).toHaveLength(1);
    expect(snapshotOf(server).activities.map((entry) => entry.wd.hours)).toEqual([1, 0.5]);

    await tick(S3_HOLD_MS);
    expect(stack()).toBeInTheDocument();
    expect(stack()?.querySelectorAll('[data-activity]')).toHaveLength(2);
  });

  it('pulls a participant out of the editor too', async () => {
    const server = room();
    mount(server, { stage: 's2' });

    await tick(0);
    expect(stack()).toBeInTheDocument();

    server.openStage();
    await tick(POLL_MAX_MS);
    expect(held()).toBeInTheDocument();
  });

  it('leaves a late joiner at their own pace (§11)', async () => {
    // The flag was already open when this phone made its first poll, so it
    // never saw the flip. §11 gives them the full questionnaire.
    const server = room({ open: true });
    mount(server, { stage: 's1' });

    await tick(POLL_MAX_MS * 5);

    expect(held()).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('How long does alpha take?');
    expect(server.ready()).toHaveLength(0);
  });

  it('marks ready once, even with the flag flipping under a Finish press', async () => {
    const server = room();
    mount(server, { stage: 's2' });

    await tick(0);
    server.openStage();
    fireEvent.click(finish());
    await tick(POLL_MAX_MS * 2);

    expect(server.ready()).toHaveLength(1);
  });
});

describe('the persisted stage (step 6.1, AC 36)', () => {
  it('stops polling once the reveal is reached', async () => {
    const server = room({ open: true });
    mount(server, { stage: 's4' });

    await tick(POLL_MAX_MS * 3);
    expect(server.polls()).toHaveLength(0);
  });

  it('never runs backwards: S6 shows no Finish to return to S3 with', async () => {
    const server = room();
    const storage = memoryStorage();
    mount(server, { stage: 's4', storage });

    await tick(0);
    expect(screen.queryByTestId('finish')).not.toBeInTheDocument();
    expect(load(storage)?.stage).toBe('s4');
  });
});
