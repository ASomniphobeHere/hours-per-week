/**
 * §6.2.3 — the console's 3 s poll.
 *
 * The mirror image of `lib/session/poll.ts`, and the two differences are both
 * deliberate.
 *
 * **No jitter.** The participant poll spreads forty phones that joined within
 * a minute of each other; there is one console per room, so there is nothing
 * to spread and a wobbling interval would only make the swap cadence uneven.
 *
 * **Failures are reported, not swallowed.** §6.2.3 is explicit that this is
 * the opposite of the S3 rule: a stale hold screen worries a participant for
 * nothing, but a stale console misleads someone about to force-advance a room
 * from the numbers on it. The loop keeps polling either way — a dropped poll
 * is not a reason to stop asking.
 */

import { fetchRoomStatus, type RoomStatus } from './client';
import type { FetchLike } from '@/lib/api/client';

export const CONSOLE_POLL_INTERVAL_MS = 3_000;

export interface StatusPollOptions {
  roomId: string;
  fetchImpl: FetchLike;
  /** Called after every successful poll. */
  onStatus: (status: RoomStatus) => void;
  /** Called after every failed one, with whatever was thrown. */
  onFailure: (error: unknown) => void;
  setTimeoutImpl?: (handler: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
}

export interface StatusPoll {
  stop: () => void;
  /** Polls now and re-arms from now. Used after the flip, so the static Stage
   *  open state does not wait out the remainder of an interval. */
  refresh: () => void;
}

export function startStatusPoll({
  roomId,
  fetchImpl,
  onStatus,
  onFailure,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: StatusPollOptions): StatusPoll {
  let stopped = false;
  let handle: unknown = null;

  const tick = async (): Promise<void> => {
    try {
      const status = await fetchRoomStatus(roomId, fetchImpl);
      if (!stopped) onStatus(status);
    } catch (error) {
      if (!stopped) onFailure(error);
    }
    if (stopped) return;
    handle = setTimeoutImpl(() => void tick(), CONSOLE_POLL_INTERVAL_MS);
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (handle !== null) clearTimeoutImpl(handle);
    },
    refresh: () => {
      if (stopped) return;
      if (handle !== null) clearTimeoutImpl(handle);
      void tick();
    },
  };
}
