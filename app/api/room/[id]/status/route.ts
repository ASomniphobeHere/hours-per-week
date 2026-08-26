/**
 * GET /api/room/:roomId/status — §6.2.2, the console's only read.
 *
 * Unauthenticated by decision (§6.2.6), on the same terms as the flip beside
 * it: the room-scoped routes are the console's alone, and what protects them
 * is that a `roomId` never reaches a participant client (§6.2.1, **RD-2**).
 *
 * `no-store`, because the whole screen is this response and a cached one is a
 * facilitator deciding from a stale count (§6.2.3).
 */

import { roomStatus } from '@/lib/db/queries';
import { json, notFound } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const status = roomStatus(id);
  if (status === null) return notFound('unknown room');

  return json(status, { headers: { 'cache-control': 'no-store' } });
}
