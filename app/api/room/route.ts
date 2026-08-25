/**
 * POST /api/room — §6.2.1 room lifecycle.
 *
 * Unauthenticated by decision (§6.2.6): the console has no accounts in v1, and
 * the only thing protecting a room's stage flag is that its `roomId` never
 * leaves the facilitator's browser.
 */

import { createRoom } from '@/lib/db/queries';
import { json } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const room = createRoom();
  return json(
    {
      roomId: room.id,
      joinCode: room.join_code,
      consoleUrl: `/facilitate/${room.id}`,
    },
    { status: 201 },
  );
}
