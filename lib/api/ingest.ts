/**
 * Server-side stage derivation (§6.2.2).
 *
 * §6.2.2 requires `inStage` to sum to `total`, but §6.1 defines no endpoint
 * that reports a participant's stage. Rather than invent one, the server reads
 * the `stage.enter` events already arriving in telemetry batches and advances
 * `sessions.stage` to the furthest seen.
 *
 * Monotonic, because batches retry and can arrive out of order (§11), and a
 * console that walks a participant backwards from S4 to S2 is reporting a
 * delivery accident as a fact about the room.
 */

import type { Event } from '@/lib/domain/types';
import { advanceStage } from '@/lib/db/queries';
import { maxStageEnter } from './payloads';

export function ingestStage(sessionId: string, events: readonly Event[]): void {
  const furthest = maxStageEnter(events);
  if (furthest === null) return;
  advanceStage(sessionId, furthest);
}
