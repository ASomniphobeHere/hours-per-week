/**
 * POST /api/session — §6.1, and RD-2.
 *
 * The response deliberately carries no `roomId`. Participants hold a join code
 * and a session id; the server resolves session → room on every later call.
 * That separation is the whole of §6.2.6's protection for the stage flag, so it
 * is asserted by a test rather than left to review.
 */

import { createSession, findRoomByJoinCode } from '@/lib/db/queries';
import { json, notFound, readJson } from '@/lib/api/http';
import { isJoinCode } from '@/lib/db/ids';
import { V1_PACK_VERSION } from '@/lib/pack/v1';
import { packUrl } from '@/lib/api/pack-url';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const joinCode = (body as { joinCode?: unknown } | null)?.joinCode;

  // A malformed code is shaped wrong, not wrong about a room — but both are
  // the same mistake to the participant who mistyped, so both read as 404.
  if (!isJoinCode(joinCode)) return notFound('unknown join code');

  const room = findRoomByJoinCode(joinCode);
  if (room === null) return notFound('unknown join code');

  const session = createSession(room.id);
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
