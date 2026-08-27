/**
 * Step 8.2's client half — the console's 3 s poll, and the failure it is
 * required to report (§6.2.3, AC 51, AC 52).
 */

import { describe, expect, it, vi } from 'vitest';
import { CONSOLE_POLL_INTERVAL_MS, startStatusPoll } from './poll';
import type { FetchLike } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import type { RoomStatus } from './client';

const STATUS: RoomStatus = {
  total: 40,
  ready: 23,
  stageOpen: false,
  joinCode: '4712',
  inStage: { s1: 9, s2: 8, s3: 23, s4: 0, s5: 0 },
};

/** Hand-driven, so the schedule is asserted rather than waited out. */
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
    async fire(): Promise<void> {
      const handler = queued.shift();
      handler?.();
      await vi.waitFor(() => expect(true).toBe(true));
      await Promise.resolve();
    },
  };
}

function ok(): FetchLike {
  return vi.fn(async () => Response.json(STATUS));
}

describe('startStatusPoll', () => {
  it('polls immediately and reschedules at a flat 3 s — one console, nothing to spread', async () => {
    const timer = manualTimer();
    const fetchImpl = ok();
    const onStatus = vi.fn();

    const poll = startStatusPoll({
      roomId: 'room-1',
      fetchImpl,
      onStatus,
      onFailure: vi.fn(),
      ...timer,
    });

    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith(STATUS));
    expect(fetchImpl).toHaveBeenCalledWith('/api/room/room-1/status', { cache: 'no-store' });

    await timer.fire();
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(2));
    expect(timer.delays).toEqual([CONSOLE_POLL_INTERVAL_MS, CONSOLE_POLL_INTERVAL_MS]);

    poll.stop();
  });

  it('reports failures rather than swallowing them — the opposite of §6.3 (AC 52)', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Response.json(STATUS));
    const onStatus = vi.fn();
    const onFailure = vi.fn();

    const poll = startStatusPoll({
      roomId: 'room-1',
      fetchImpl,
      onStatus,
      onFailure,
      ...timer,
    });

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onStatus).not.toHaveBeenCalled();

    // A dropped poll is not a reason to stop asking.
    await timer.fire();
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith(STATUS));

    poll.stop();
  });

  it('hands the failure through, so a 404 can be told from a dropped request', async () => {
    const timer = manualTimer();
    const fetchImpl: FetchLike = vi.fn(async () =>
      Response.json({ error: 'unknown room' }, { status: 404 }),
    );
    const onFailure = vi.fn();

    const poll = startStatusPoll({
      roomId: 'nope',
      fetchImpl,
      onStatus: vi.fn(),
      onFailure,
      ...timer,
    });

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    const error = onFailure.mock.calls[0]?.[0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);

    poll.stop();
  });

  it('refresh polls now and re-arms from now, so the flip does not wait out an interval', async () => {
    const timer = manualTimer();
    const onStatus = vi.fn();

    const poll = startStatusPoll({
      roomId: 'room-1',
      fetchImpl: ok(),
      onStatus,
      onFailure: vi.fn(),
      ...timer,
    });
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(1));

    poll.refresh();
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(2));

    poll.stop();
  });

  it('stops for good: no callback and no reschedule after stop', async () => {
    const timer = manualTimer();
    const onStatus = vi.fn();

    const poll = startStatusPoll({
      roomId: 'room-1',
      fetchImpl: ok(),
      onStatus,
      onFailure: vi.fn(),
      ...timer,
    });
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(1));

    poll.stop();
    poll.refresh();
    await Promise.resolve();
    expect(onStatus).toHaveBeenCalledTimes(1);
  });
});
