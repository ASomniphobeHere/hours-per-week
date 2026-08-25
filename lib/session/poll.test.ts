/**
 * Step 2.3's client half — jittered polling that never surfaces a failure
 * (§6.3, AC 34).
 */

import { describe, expect, it, vi } from 'vitest';
import { nextDelay, POLL_INTERVAL_MS, POLL_JITTER_MS, startStagePoll } from './poll';
import type { FetchLike } from './client';

const CREDENTIALS = { sessionId: 'sess-1', token: 'tok-1' };

/**
 * A hand-driven timer. Real timers would make these tests wait three seconds
 * each, and the point under test is the schedule, not the wall clock.
 */
function manualTimer() {
  const queued: (() => void)[] = [];
  const delays: number[] = [];
  return {
    delays,
    setTimeoutImpl: (handler: () => void, ms: number) => {
      delays.push(ms);
      queued.push(handler);
      return queued.length;
    },
    clearTimeoutImpl: () => queued.splice(0, queued.length),
    /** Runs the pending tick and lets its awaited fetch settle. */
    async fire(): Promise<void> {
      const handler = queued.shift();
      handler?.();
      await vi.waitFor(() => expect(true).toBe(true));
      await Promise.resolve();
    },
  };
}

describe('nextDelay', () => {
  it('stays inside 3 s ± 500 ms so forty phones do not align (§6.3)', () => {
    expect(nextDelay(() => 0)).toBe(POLL_INTERVAL_MS - POLL_JITTER_MS);
    expect(nextDelay(() => 0.5)).toBe(POLL_INTERVAL_MS);
    expect(nextDelay(() => 1)).toBe(POLL_INTERVAL_MS + POLL_JITTER_MS);

    for (let i = 0; i < 200; i += 1) {
      const delay = nextDelay();
      expect(delay).toBeGreaterThanOrEqual(POLL_INTERVAL_MS - POLL_JITTER_MS);
      expect(delay).toBeLessThanOrEqual(POLL_INTERVAL_MS + POLL_JITTER_MS);
    }
  });

  it('spreads across the window rather than landing on one value', () => {
    const delays = new Set(Array.from({ length: 50 }, () => nextDelay()));
    expect(delays.size).toBeGreaterThan(40);
  });
});

describe('startStagePoll', () => {
  it('polls immediately, then reschedules with jitter', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi.fn(async () =>
      Response.json({ stageOpen: false, serverTime: 1 }),
    );
    const onStage = vi.fn();

    const poll = startStagePoll({
      credentials: CREDENTIALS,
      fetchImpl,
      onStage,
      ...timer,
      random: () => 0.5,
    });

    await vi.waitFor(() => expect(onStage).toHaveBeenCalledWith(false, 1));
    expect(timer.delays).toEqual([POLL_INTERVAL_MS]);

    await timer.fire();
    await vi.waitFor(() => expect(onStage).toHaveBeenCalledTimes(2));
    poll.stop();
  });

  it('sends the token as a bearer header on the session-scoped route (RD-2)', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi.fn(async () =>
      Response.json({ stageOpen: true, serverTime: 2 }),
    );

    const poll = startStagePoll({ credentials: CREDENTIALS, fetchImpl, onStage: vi.fn(), ...timer });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    poll.stop();

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/session/sess-1/stage');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-1');
    // No participant-facing route takes a roomId parameter.
    expect(url).not.toMatch(/room/);
  });

  it('keeps polling and surfaces nothing when the network fails (AC 34)', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ error: 'nope' }, { status: 500 }))
      .mockResolvedValue(Response.json({ stageOpen: true, serverTime: 3 }));
    const onStage = vi.fn();

    const poll = startStagePoll({ credentials: CREDENTIALS, fetchImpl, onStage, ...timer });

    await vi.waitFor(() => expect(timer.delays.length).toBe(1));
    expect(onStage).not.toHaveBeenCalled();

    await timer.fire();
    await vi.waitFor(() => expect(timer.delays.length).toBe(2));
    // A 500 is a failure too: onStage fires on success only, so the hold screen
    // is never handed a value the server did not send.
    expect(onStage).not.toHaveBeenCalled();

    await timer.fire();
    await vi.waitFor(() => expect(onStage).toHaveBeenCalledWith(true, 3));
    poll.stop();
  });

  it('stops rescheduling once stopped', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi.fn(async () =>
      Response.json({ stageOpen: false, serverTime: 4 }),
    );
    const onStage = vi.fn();

    const poll = startStagePoll({ credentials: CREDENTIALS, fetchImpl, onStage, ...timer });
    await vi.waitFor(() => expect(timer.delays.length).toBe(1));

    poll.stop();
    await timer.fire();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
