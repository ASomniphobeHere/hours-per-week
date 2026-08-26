/**
 * Typed client for the two room-scoped routes (§6.2.2).
 *
 * Separate from `lib/session/client.ts` and deliberately so: these routes take
 * a `roomId`, and **RD-2** says no participant-facing code path may ever hold
 * one. Keeping them in a module the participant client does not import is the
 * cheapest way to keep that true as the app grows.
 */

import { expectOk, type FetchLike } from '@/lib/api/client';
import type { StageId } from '@/lib/domain/types';

export interface RoomStatus {
  total: number;
  ready: number;
  stageOpen: boolean;
  joinCode: string;
  inStage: Record<StageId, number>;
}

export async function fetchRoomStatus(
  roomId: string,
  fetchImpl: FetchLike,
): Promise<RoomStatus> {
  const response = await fetchImpl(`/api/room/${roomId}/status`, { cache: 'no-store' });
  return (await expectOk(response)) as RoomStatus;
}

/**
 * §6.2.4's flip. Idempotent server-side, so a resolved call means the stage is
 * open whether or not this press is the one that opened it.
 */
export async function openRoomStage(roomId: string, fetchImpl: FetchLike): Promise<void> {
  const response = await fetchImpl(`/api/room/${roomId}/stage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ open: true }),
  });
  await expectOk(response);
}
