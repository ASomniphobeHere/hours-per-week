/**
 * POST /api/session/:id/ready — §6.1.
 *
 * Marks the participant ready and stores the finish snapshot. It does **not**
 * touch the room's stage flag (AC 32): finishing is a participant's statement
 * about themselves, and opening the reveal is the facilitator's decision alone
 * (§6.2.4).
 */

import { insertSnapshot, markReady } from '@/lib/db/queries';
import { authenticate, badRequest, json, readJson, unauthorized } from '@/lib/api/http';
import { parseSnapshot } from '@/lib/api/payloads';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const session = authenticate(request, id);
  if (session === null) return unauthorized();

  const body = await readJson(request);
  const snapshot = parseSnapshot((body as { schedule?: unknown } | null)?.schedule);
  // Unlike telemetry, a malformed snapshot is refused: *slack at finish* is
  // read out of this row (§10) and there is no later batch that repairs it.
  if (snapshot === null) return badRequest('schedule required');

  insertSnapshot(id, 'finish', snapshot);
  markReady(id);
  return json({ ok: true });
}
