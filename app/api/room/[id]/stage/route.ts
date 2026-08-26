/**
 * POST /api/room/:roomId/stage — §6.2.4's flip.
 *
 * Unauthenticated by decision (§6.2.6): the console has no accounts in v1, and
 * the only thing protecting the flag is that a room's `roomId` never leaves
 * the facilitator's browser (**RD-2**). A participant is never told one.
 *
 * Idempotent. §2.2 makes S3 → S4 one-way, so a second call on an open room is
 * a double-press and answers `ok` rather than an error — the console has no
 * failure to report and nothing to press twice (step 8.5).
 *
 * Pulled forward from step 8.5 so Stage 6's machine could be proved against a
 * real flag. The console UI and the `stage.open` record (step 8.6) are Stage
 * 8's and are not here.
 */

import { openStage } from '@/lib/db/queries';
import { badRequest, json, notFound, readJson } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const body = (await readJson(request)) as { open?: unknown } | null;
  // Only `true` is accepted. The flag does not close (§2.2), and a route that
  // silently ignored `{ open: false }` would read as one that closed it.
  if (body?.open !== true) return badRequest('open must be true');

  const room = openStage(id);
  if (room === null) return notFound('unknown room');

  return json({ ok: true, stageOpen: true, openedAt: room.opened_at });
}
