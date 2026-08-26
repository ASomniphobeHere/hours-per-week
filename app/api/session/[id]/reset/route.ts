/**
 * POST /api/session/:id/reset — §5, and RD-2.
 *
 * Clears the participant's server-side record and hands back a fresh session in
 * the same room, so starting over costs neither the join code nor a duplicate
 * row in `total` (§6.2.2). The response is deliberately the same shape as
 * `POST /session`: the client stores it the same way, and neither response
 * carries a `roomId` (**RD-2**).
 *
 * Authenticated like every other session route, so a reset needs the token that
 * only the participant's own device holds. An unknown session and a wrong token
 * are both 401 — this route destroys data, and an oracle for which session ids
 * exist is the last thing it should be.
 */

import { resetSession } from '@/lib/db/queries';
import { authenticate, json, unauthorized } from '@/lib/api/http';
import { V1_PACK_VERSION } from '@/lib/pack/v1';
import { packUrl } from '@/lib/api/pack-url';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (authenticate(request, id) === null) return unauthorized();

  // Authenticated a line ago, so null here is a concurrent reset from the
  // participant's own second tap. Nothing was destroyed twice; say so as 401
  // and let the client fall back to the join screen.
  const session = resetSession(id);
  if (session === null) return unauthorized();

  return json(
    {
      sessionId: session.id,
      token: session.token,
      packVersion: V1_PACK_VERSION,
      packUrl: packUrl(V1_PACK_VERSION),
    },
    { status: 201 },
  );
}
