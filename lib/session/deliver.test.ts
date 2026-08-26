/**
 * Step 6.2's delivery half — `/ready` retried until it lands (§6.1, AC 32).
 */

import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, deliverReady, RETRY_BASE_MS, RETRY_CEILING_MS } from './deliver';
import type { FetchLike } from './client';
import type { ScheduleSnapshot } from '@/lib/domain/types';

const CREDENTIALS = { sessionId: 'sess-1', token: 'tok-1' };

const SCHEDULE: ScheduleSnapshot = {
  kind: 'finish',
  t: 0,
  packVersion: 'v1',
  activities: [],
  total: { wd: 0, we: 0 },
  remaining: { wd: 24, we: 24 },
  fits: true,
};

/** Hand-driven timer: the point under test is the schedule, not the clock. */
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
    pending: () => queued.length,
    async fire(): Promise<void> {
      const handler = queued.shift();
      handler?.();
      await vi.waitFor(() => expect(true).toBe(true));
      await Promise.resolve();
    },
  };
}

function respond(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('backoffDelay', () => {
  it('doubles from the base', () => {
    expect(backoffDelay(0)).toBe(RETRY_BASE_MS);
    expect(backoffDelay(1)).toBe(RETRY_BASE_MS * 2);
    expect(backoffDelay(2)).toBe(RETRY_BASE_MS * 4);
  });

  it('caps, so a room off the air does not retry forever at the base rate', () => {
    expect(backoffDelay(20)).toBe(RETRY_CEILING_MS);
  });
});

describe('deliverReady', () => {
  it('posts the snapshot once when the first attempt lands (AC 32)', async () => {
    const timer = manualTimer();
    const fetchImpl = vi.fn<FetchLike>(async () => respond(200));

    deliverReady({ credentials: CREDENTIALS, schedule: SCHEDULE, fetchImpl, ...timer });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/api/session/sess-1/ready');
    expect(JSON.parse(String(init?.body))).toEqual({ schedule: SCHEDULE });
    expect(timer.pending()).toBe(0);
  });

  it('retries a network failure with a capped exponential backoff', async () => {
    const timer = manualTimer();
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(respond(200));

    deliverReady({ credentials: CREDENTIALS, schedule: SCHEDULE, fetchImpl, ...timer });
    await vi.waitFor(() => expect(timer.pending()).toBe(1));
    await timer.fire();
    await vi.waitFor(() => expect(timer.pending()).toBe(1));
    await timer.fire();

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    expect(timer.delays).toEqual([RETRY_BASE_MS, RETRY_BASE_MS * 2]);
    expect(timer.pending()).toBe(0);
  });

  it('retries a 5xx — the server may yet come back', async () => {
    const timer = manualTimer();
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValue(respond(200));

    deliverReady({ credentials: CREDENTIALS, schedule: SCHEDULE, fetchImpl, ...timer });
    await vi.waitFor(() => expect(timer.pending()).toBe(1));
    await timer.fire();

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(timer.pending()).toBe(0);
  });

  it('gives up on a 4xx — the same request will never be accepted', async () => {
    const timer = manualTimer();
    const fetchImpl = vi.fn<FetchLike>(async () => respond(401));

    deliverReady({ credentials: CREDENTIALS, schedule: SCHEDULE, fetchImpl, ...timer });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(timer.pending()).toBe(0);
  });

  it('stops retrying once cancelled', async () => {
    const timer = manualTimer();
    const fetchImpl = vi.fn<FetchLike>(async () => respond(500));

    const delivery = deliverReady({
      credentials: CREDENTIALS,
      schedule: SCHEDULE,
      fetchImpl,
      ...timer,
    });
    await vi.waitFor(() => expect(timer.pending()).toBe(1));
    delivery.cancel();

    expect(timer.pending()).toBe(0);
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
