/**
 * §6.1's `POST /ready` and `POST /complete`, delivered rather than fired.
 *
 * Neither §6.1 nor §11 says what happens when this call fails, and the two
 * halves of the answer pull apart. The participant must not be blocked: the
 * 5 s hold is a beat in the room, not a network wait, and a phone that sat on
 * the editor until a POST returned would be the one thing §6.3 is careful to
 * avoid. But `ready / total` is the number the facilitator decides from
 * (§6.2.2), and a dropped POST silently undercounts a participant who is in
 * fact finished and staring at the loader.
 *
 * So the transition is immediate and the delivery is persistent: retry until
 * it lands, backing off exponentially to a ceiling so a room that loses its
 * uplink for two minutes does not come back to forty phones retrying every
 * 500 ms. Decided with the user, 2026-08-26.
 *
 * A 4xx is not retried. It means the request will never be accepted as sent —
 * a session the server has forgotten (401) or a snapshot it refused (400) —
 * and repeating it forever spends battery to no end. A 5xx and a network
 * throw are both a server that may yet come back, and are retried.
 */

import {
  ApiError,
  postComplete,
  postReady,
  type FetchLike,
  type SessionCredentials,
} from './client';
import type { Event, ScheduleSnapshot } from '@/lib/domain/types';

export const RETRY_BASE_MS = 500;
export const RETRY_CEILING_MS = 30_000;

/** `base × 2^attempt`, capped. Attempt 0 is the delay after the first failure. */
export function backoffDelay(
  attempt: number,
  base = RETRY_BASE_MS,
  ceiling = RETRY_CEILING_MS,
): number {
  return Math.min(ceiling, base * 2 ** attempt);
}

export interface DeliverOptions {
  credentials: SessionCredentials;
  schedule: ScheduleSnapshot;
  fetchImpl: FetchLike;
  setTimeoutImpl?: (handler: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  base?: number;
  ceiling?: number;
}

/** Retained under its old name: `deliverReady` took exactly these. */
export type DeliverReadyOptions = DeliverOptions;

export interface Delivery {
  /** Stops further attempts. In-flight requests are simply ignored. */
  cancel: () => void;
}

/**
 * The retry itself, over any one request that carries a snapshot.
 *
 * Starts the first attempt immediately and returns without waiting for it.
 * Nothing is surfaced: success and permanent failure are both silent, on the
 * same §6.3 reasoning that keeps the poll quiet.
 */
function deliver(
  attemptOnce: () => Promise<void>,
  {
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = (handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    base = RETRY_BASE_MS,
    ceiling = RETRY_CEILING_MS,
  }: Omit<DeliverOptions, 'credentials' | 'schedule' | 'fetchImpl'>,
): Delivery {
  let cancelled = false;
  let handle: unknown = null;
  let attempt = 0;

  const send = async (): Promise<void> => {
    try {
      await attemptOnce();
      return;
    } catch (error) {
      // Refused, not dropped: sending it again changes nothing.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) return;
    }
    if (cancelled) return;
    handle = setTimeoutImpl(() => void send(), backoffDelay(attempt, base, ceiling));
    attempt += 1;
  };

  void send();

  return {
    cancel: () => {
      cancelled = true;
      if (handle !== null) clearTimeoutImpl(handle);
    },
  };
}

export function deliverReady({
  credentials,
  schedule,
  fetchImpl,
  ...retry
}: DeliverOptions): Delivery {
  return deliver(() => postReady(credentials, schedule, fetchImpl), retry);
}

/**
 * §8.4's `POST /complete`, on the same terms and for a stronger reason.
 *
 * Confirm is the end of the participant's work and S5 is not a screen they can
 * retry from, so a dropped POST costs the debrief the one snapshot the whole
 * measurement is a delta against (§10). The transition is still immediate:
 * making a participant watch a spinner after the last press would be the
 * network wait §6.3 keeps out of the room, one stage later.
 *
 * The trailing event batch is Stage 10's — §6.1 accepts it here so cut order is
 * complete for a participant who confirms before the queue's next flush, and
 * until that queue exists the batch is empty.
 */
export function deliverComplete({
  credentials,
  schedule,
  events = [],
  fetchImpl,
  ...retry
}: DeliverOptions & { events?: readonly Event[] }): Delivery {
  return deliver(() => postComplete(credentials, schedule, events, fetchImpl), retry);
}
