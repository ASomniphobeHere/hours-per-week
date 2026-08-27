/**
 * POST /api/room/:roomId/stage — §6.2.4's flip, now at two levels.
 *
 * Unauthenticated by decision (§6.2.6): the console has no accounts in v1, and
 * the only thing protecting the gate is that a room's `roomId` never leaves
 * the facilitator's browser (**RD-2**). A participant is never told one.
 *
 * `{ to: 1 }` opens the rating stage, `{ to: 2 }` the reveal (plan 25 §E.4).
 * `{ open: true }` is not accepted: it names a boolean that no longer exists,
 * and a route that guessed which level it meant would guess wrong half the
 * time.
 *
 * Idempotent, and monotonic with it — a call at or below the level the room
 * already holds returns `ok` and changes nothing, so a double-press and a
 * facilitator pressing gate 1 after gate 2 are both non-events (AC 63).
 */

import { openStage } from '@/lib/db/queries';
import { isOpenLevel } from '@/lib/domain/types';
import { badRequest, json, notFound, readJson } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const body = (await readJson(request)) as { to?: unknown } | null;
  if (!isOpenLevel(body?.to)) return badRequest('to must be 1 or 2');

  const room = openStage(id, body.to);
  if (room === null) return notFound('unknown room');

  return json({ ok: true, openStage: room.open_stage, openedAt: room.opened_at });
}
