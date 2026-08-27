/**
 * Typed client for the two room-scoped routes (§6.2.2).
 *
 * Separate from `lib/session/client.ts` and deliberately so: these routes take
 * a `roomId`, and **RD-2** says no participant-facing code path may ever hold
 * one. Keeping them in a module the participant client does not import is the
 * cheapest way to keep that true as the app grows.
 */

import { expectOk, type FetchLike } from '@/lib/api/client';
import type { OpenLevel, OpenStage, StageId } from '@/lib/domain/types';

export interface RoomStatus {
  total: number;
  ready: number;
  openStage: OpenStage;
  joinCode: string;
  inStage: Record<StageId, number>;
}

export interface CreatedRoom {
  roomId: string;
  joinCode: string;
  consoleUrl: string;
}

/**
 * §6.2.1's room lifecycle, from the landing screen (step 8.7).
 *
 * `consoleUrl` is used as returned rather than reassembled from `roomId`: the
 * server owns the shape of that path, and a client that built its own would be
 * a second definition of it.
 */
export async function createRoom(fetchImpl: FetchLike): Promise<CreatedRoom> {
  const response = await fetchImpl('/api/room', { method: 'POST' });
  return (await expectOk(response)) as CreatedRoom;
}

export async function fetchRoomStatus(
  roomId: string,
  fetchImpl: FetchLike,
): Promise<RoomStatus> {
  const response = await fetchImpl(`/api/room/${roomId}/status`, { cache: 'no-store' });
  return (await expectOk(response)) as RoomStatus;
}

/**
 * §6.2.4's flip, at the level named. Idempotent and monotonic server-side, so
 * a resolved call means the room is open to at least `to` whether or not this
 * press is the one that opened it (plan 25 §E.4).
 */
export async function openRoomStage(
  roomId: string,
  to: OpenLevel,
  fetchImpl: FetchLike,
): Promise<void> {
  const response = await fetchImpl(`/api/room/${roomId}/stage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  await expectOk(response);
}
