/**
 * Identifier minting for rooms and sessions (§6.2.1).
 *
 * The security property this file carries: `roomId` is not derivable from
 * `joinCode`. That separation is the only thing standing between a participant
 * and the stage flag (§6.2.6), so the code is drawn from its own random source
 * and never from the id.
 */

import { randomUUID, randomBytes, randomInt } from 'node:crypto';

export function newRoomId(): string {
  return randomUUID();
}

export function newSessionId(): string {
  return randomUUID();
}

/** 32 bytes of entropy; the only credential a participant holds (§6.1). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Four digits, no leading zero — short enough to read aloud across a room
 * (§6.2.1). 9000 codes, which is ample for the live rooms a self-hosted
 * instance holds at once; collisions are handled by the caller regenerating.
 */
export function newJoinCode(): string {
  return String(randomInt(1000, 10_000));
}

export function isJoinCode(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{3}$/.test(value);
}
