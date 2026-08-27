/**
 * GET /api/session/:id/stage — the participant's poll (§6.1, §6.3, RD-2).
 *
 * Room-scoped by resolution, not by route. The participant never names a room;
 * the server reads `session.room_id` and reports that room's gate level
 * (plan 25 §E.4) — an ordinal, not the boolean it replaced. The cost is
 * that the response caches per session rather than per room, which §6.2.1
 * accepts explicitly: a route that handed every participant the roomId would
 * hand them the one secret protecting the flag.
 */

import { findRoomById } from '@/lib/db/queries';
import { authenticate, notFound, unauthorized } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const session = authenticate(request, id);
  if (session === null) return unauthorized();

  const room = findRoomById(session.room_id);
  if (room === null) return notFound('unknown room');

  return Response.json(
    { openStage: room.open_stage, serverTime: Date.now() },
    {
      headers: {
        // §6.1: cheap, cacheable for 1 s. Private — the body is one
        // participant's view and must never be served from a shared cache.
        'Cache-Control': 'private, max-age=1',
      },
    },
  );
}
