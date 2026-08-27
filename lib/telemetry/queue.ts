/**
 * §10's event queue — batched, fire-and-forget, and never in the participant's
 * way (§6.1, §11).
 *
 * Three properties, and the third is the reason the first two are shaped this
 * way. **Batched**, because a room of forty phones emitting one POST per
 * keystroke is a room that measures the venue's wifi rather than the exercise.
 * **Fire-and-forget**, because §6.3 keeps the network out of every transition
 * the participant can feel, and telemetry is the one payload nothing on screen
 * waits for. **Retried with the next batch** (§11), because §10 opens by
 * calling telemetry the product output: an event dropped on a flaky uplink is
 * a row missing from the debrief, and the debrief is what the workshop is for.
 *
 * So a failed batch goes back to the *front* of the queue rather than being
 * abandoned or resent on a timer of its own. Order is cut order (§10) — the
 * whole value of `hours.change` is the sequence — and a retry that let newer
 * events overtake it would deliver the participant's rebalance out of the order
 * they made it in.
 *
 * The one thing that is not retried is a batch the server refused outright.
 * `/telemetry` answers 200 to any authenticated session, malformed members and
 * all (see the route), so a 4xx here means the session itself is gone — reset,
 * or a room that no longer exists — and a queue that kept trying would spend
 * the phone's battery on a row nothing will ever read.
 */

import type { Event } from '@/lib/domain/types';
import { ApiError, postTelemetry, type FetchLike, type SessionCredentials } from '@/lib/session/client';

/** Long enough that a fast questionnaire is a handful of POSTs, not forty. */
export const FLUSH_INTERVAL_MS = 5_000;

/**
 * A rebalance emits `hours.change` faster than the interval, so size is the
 * second trigger. Sized to hold the whole of S1 for a participant who answers
 * quickly, which is what keeps the interval the usual sender.
 */
export const MAX_BATCH = 40;

export interface TelemetryQueue {
  /** §10's sink. Never throws, never blocks. */
  record: (event: Event) => void;
  /** Sends what is pending. Resolves once the attempt settles, never rejects. */
  flush: () => Promise<void>;
  /**
   * Takes the undelivered events and clears the queue.
   *
   * `POST /complete` carries a trailing batch (§6.1), and this is what fills
   * it: the last `hours.change` events of a rebalance are the ones cut order
   * most wants, and confirm can land inside a single flush interval of them.
   */
  drain: () => Event[];
  /** What has not been delivered yet. Read by tests and by nothing else. */
  pending: () => readonly Event[];
  /** Stops the interval. In-flight requests are left to settle. */
  stop: () => void;
}

export interface QueueOptions {
  credentials: SessionCredentials;
  fetchImpl: FetchLike;
  intervalMs?: number;
  maxBatch?: number;
  /** Injected by tests, which run with no timers of their own. */
  setIntervalImpl?: (handler: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
}

export function createTelemetryQueue({
  credentials,
  fetchImpl,
  intervalMs = FLUSH_INTERVAL_MS,
  maxBatch = MAX_BATCH,
  setIntervalImpl = setInterval,
  clearIntervalImpl = (handle: unknown) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
}: QueueOptions): TelemetryQueue {
  let queued: Event[] = [];
  let inFlight = false;
  let stopped = false;

  const flush = async (): Promise<void> => {
    // One request at a time. A second concurrent POST could land before the
    // first, and the log's order is the measurement.
    if (inFlight || queued.length === 0) return;
    const batch = queued;
    queued = [];
    inFlight = true;
    try {
      await postTelemetry(credentials, batch, fetchImpl);
    } catch (error) {
      const refused = error instanceof ApiError && error.status >= 400 && error.status < 500;
      // Back to the front, ahead of anything recorded while this was away.
      if (!refused) queued = [...batch, ...queued];
    } finally {
      inFlight = false;
    }
  };

  const handle = setIntervalImpl(() => void flush(), intervalMs);

  return {
    record: (event: Event) => {
      if (stopped) return;
      queued.push(event);
      if (queued.length >= maxBatch) void flush();
    },
    flush,
    drain: () => {
      const taken = queued;
      queued = [];
      return taken;
    },
    pending: () => queued,
    stop: () => {
      stopped = true;
      clearIntervalImpl(handle);
    },
  };
}
