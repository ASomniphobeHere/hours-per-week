import { describe, expect, it, vi } from 'vitest';
import type { Event } from '@/lib/domain/types';
import { createTelemetryQueue, MAX_BATCH } from './queue';

const credentials = { sessionId: 'sess-1', token: 'tok-1' };

function event(type: Event['type'], t: number): Event {
  return { t, type };
}

/** A `fetch` whose every call is inspectable, and whose replies are scripted. */
function server(replies: (() => Response | Promise<Response>)[] = []) {
  const bodies: Event[][] = [];
  let call = 0;
  const fetchImpl = async (_input: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { events: Event[] };
    bodies.push(body.events);
    const reply = replies[call] ?? (() => new Response('{}', { status: 200 }));
    call += 1;
    return reply();
  };
  return { fetchImpl, bodies };
}

/** Timer control: the queue's interval is captured rather than run. */
function timers() {
  let tick: (() => void) | null = null;
  const cleared: unknown[] = [];
  return {
    setIntervalImpl: (handler: () => void) => {
      tick = handler;
      return 'handle';
    },
    clearIntervalImpl: (handle: unknown) => void cleared.push(handle),
    fire: () => tick?.(),
    cleared,
  };
}

describe('the telemetry queue (step 10.2)', () => {
  it('batches rather than sending one POST per event', async () => {
    const { fetchImpl, bodies } = server();
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.record(event('screen.view', 1));
    queue.record(event('field.answer', 2));
    queue.record(event('field.revise', 3));
    expect(bodies).toHaveLength(0);

    await queue.flush();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toHaveLength(3);
  });

  it('flushes on the interval without being asked', async () => {
    const { fetchImpl, bodies } = server();
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.record(event('screen.view', 1));
    clock.fire();
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    queue.stop();
  });

  it('sends early once a batch reaches its size cap', async () => {
    const { fetchImpl, bodies } = server();
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    for (let n = 0; n < MAX_BATCH; n += 1) queue.record(event('hours.change', n));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toHaveLength(MAX_BATCH);
  });

  /**
   * §11's row: a failed POST is retried with the next batch. The order matters
   * as much as the retry — cut order is the sequence (§10), so the failed
   * events must lead the batch that carries them, not trail it.
   */
  it('retries a failed batch with the next one, in order', async () => {
    const { fetchImpl, bodies } = server([() => Promise.reject(new Error('offline'))]);
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.record(event('hours.change', 1));
    await queue.flush();
    expect(bodies[0]?.map((e) => e.t)).toEqual([1]);

    queue.record(event('hours.change', 2));
    await queue.flush();
    expect(bodies[1]?.map((e) => e.t)).toEqual([1, 2]);
  });

  it('drops a batch the server refused — the session is gone, not the network', async () => {
    const { fetchImpl, bodies } = server([() => new Response('{}', { status: 401 })]);
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.record(event('hours.change', 1));
    await queue.flush();
    expect(queue.pending()).toHaveLength(0);

    queue.record(event('hours.change', 2));
    await queue.flush();
    expect(bodies[1]?.map((e) => e.t)).toEqual([2]);
  });

  it('never rejects, so no call site has to catch it', async () => {
    const { fetchImpl } = server([() => Promise.reject(new Error('offline'))]);
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });
    queue.record(event('finish', 1));
    await expect(queue.flush()).resolves.toBeUndefined();
  });

  /** The trailing batch `POST /complete` carries (§6.1, step 10.2). */
  it('hands its pending events to a drain and empties', () => {
    const { fetchImpl } = server();
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.record(event('hours.change', 1));
    queue.record(event('complete', 2));
    expect(queue.drain().map((e) => e.t)).toEqual([1, 2]);
    expect(queue.pending()).toHaveLength(0);
  });

  it('stops its interval and takes no further events', () => {
    const { fetchImpl } = server();
    const clock = timers();
    const queue = createTelemetryQueue({ credentials, fetchImpl, ...clock });

    queue.stop();
    queue.record(event('finish', 1));
    expect(clock.cleared).toEqual(['handle']);
    expect(queue.pending()).toHaveLength(0);
  });
});
