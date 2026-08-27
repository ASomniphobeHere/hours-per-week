/**
 * Typed client for the §6.1 endpoints.
 *
 * `fetch` is injected rather than reached for, so the bootstrap and poll tests
 * run in node with no network and no DOM.
 */

import type { Event, ScheduleSnapshot } from '@/lib/domain/types';
import { ApiError, expectOk, type FetchLike } from '@/lib/api/client';

/** Re-exported: every existing caller imports these from here, and the split
 *  in Stage 8 was about who may import what, not about moving the names. */
export { ApiError };
export type { FetchLike };

export interface SessionCredentials {
  sessionId: string;
  token: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  token: string;
  packVersion: string;
  packUrl: string;
}

export interface StageResponse {
  stageOpen: boolean;
  serverTime: number;
}

function auth({ token }: SessionCredentials): HeadersInit {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export async function createSession(
  joinCode: string,
  fetchImpl: FetchLike,
): Promise<CreateSessionResponse> {
  const response = await fetchImpl('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ joinCode }),
  });
  return (await expectOk(response)) as CreateSessionResponse;
}

/**
 * §5's reset. Destroys the session server-side and returns its replacement in
 * the same room — same response shape as `createSession`, because the client
 * stores the two identically.
 */
export async function resetSession(
  credentials: SessionCredentials,
  fetchImpl: FetchLike,
): Promise<CreateSessionResponse> {
  const response = await fetchImpl(`/api/session/${credentials.sessionId}/reset`, {
    method: 'POST',
    headers: auth(credentials),
  });
  return (await expectOk(response)) as CreateSessionResponse;
}

export async function fetchStage(
  credentials: SessionCredentials,
  fetchImpl: FetchLike,
): Promise<StageResponse> {
  const response = await fetchImpl(`/api/session/${credentials.sessionId}/stage`, {
    headers: auth(credentials),
  });
  return (await expectOk(response)) as StageResponse;
}

export async function postReady(
  credentials: SessionCredentials,
  schedule: ScheduleSnapshot,
  fetchImpl: FetchLike,
): Promise<void> {
  const response = await fetchImpl(`/api/session/${credentials.sessionId}/ready`, {
    method: 'POST',
    headers: auth(credentials),
    body: JSON.stringify({ schedule }),
  });
  await expectOk(response);
}

export async function postComplete(
  credentials: SessionCredentials,
  schedule: ScheduleSnapshot,
  events: readonly Event[],
  fetchImpl: FetchLike,
): Promise<void> {
  const response = await fetchImpl(`/api/session/${credentials.sessionId}/complete`, {
    method: 'POST',
    headers: auth(credentials),
    body: JSON.stringify({ schedule, events }),
  });
  await expectOk(response);
}

export async function postTelemetry(
  credentials: SessionCredentials,
  events: readonly Event[],
  fetchImpl: FetchLike,
): Promise<void> {
  const response = await fetchImpl(`/api/session/${credentials.sessionId}/telemetry`, {
    method: 'POST',
    headers: auth(credentials),
    body: JSON.stringify({ events }),
  });
  await expectOk(response);
}
