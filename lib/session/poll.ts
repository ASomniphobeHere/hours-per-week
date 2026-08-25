/**
 * §6.3 — poll the stage flag, do not open a socket.
 *
 * One boolean, a room on venue wifi, a session measured in minutes. The jitter
 * is the point of this module: forty phones that all joined within a minute of
 * each other would otherwise poll in lockstep and arrive as a spike every three
 * seconds.
 *
 * Failures are swallowed. §6.3 forbids surfacing a connection warning during
 * S3 — on the hold screen it reads as a broken app — so the loop reports
 * successes and simply keeps going otherwise.
 */

import { fetchStage, type FetchLike, type SessionCredentials } from './client';

export const POLL_INTERVAL_MS = 3_000;
export const POLL_JITTER_MS = 500;

/** Uniform in [3000 − 500, 3000 + 500]. */
export function nextDelay(random: () => number = Math.random): number {
  return POLL_INTERVAL_MS + (random() * 2 - 1) * POLL_JITTER_MS;
}

export interface StagePollOptions {
  credentials: SessionCredentials;
  fetchImpl: FetchLike;
  /** Called after every successful poll, never after a failure. */
  onStage: (stageOpen: boolean, serverTime: number) => void;
  /** Injected for tests; defaults to the platform timer. */
  setTimeoutImpl?: (handler: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  random?: () => number;
}

export interface StagePoll {
  stop: () => void;
}

/**
 * Starts polling immediately and reschedules after each attempt, successful or
 * not. Returns a stop handle; the loop never stops itself, not even once the
 * flag is true, because S3 → S4 is driven by the participant's own 5 s hold
 * (§6.3) and the caller decides when it has what it needs.
 */
export function startStagePoll({
  credentials,
  fetchImpl,
  onStage,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  random = Math.random,
}: StagePollOptions): StagePoll {
  let stopped = false;
  let handle: unknown = null;

  const tick = async (): Promise<void> => {
    try {
      const { stageOpen, serverTime } = await fetchStage(credentials, fetchImpl);
      if (!stopped) onStage(stageOpen, serverTime);
    } catch {
      // Silent by §6.3. Network failure keeps polling and surfaces nothing.
    }
    if (stopped) return;
    handle = setTimeoutImpl(() => void tick(), nextDelay(random));
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (handle !== null) clearTimeoutImpl(handle);
    },
  };
}
