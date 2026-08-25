/**
 * POST /api/session/:id/complete — §6.1.
 *
 * Stores the post-rebalance snapshot and the trailing event batch in one call.
 * Per-activity delta is this snapshot minus the finish snapshot (§10), and the
 * trailing batch is what makes cut order complete for a participant who
 * confirms before the queue's next flush (§10.2).
 */

import { insertEvents, insertSnapshot, markComplete } from '@/lib/db/queries';
import { authenticate, badRequest, json, readJson, unauthorized } from '@/lib/api/http';
import { parseEvents, parseSnapshot } from '@/lib/api/payloads';
import { ingestStage } from '@/lib/api/ingest';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const session = authenticate(request, id);
  if (session === null) return unauthorized();

  const body = (await readJson(request)) as { schedule?: unknown; events?: unknown } | null;
  const snapshot = parseSnapshot(body?.schedule);
  if (snapshot === null) return badRequest('schedule required');

  const events = parseEvents(body?.events);
  insertSnapshot(id, 'complete', snapshot);
  insertEvents(id, events);
  ingestStage(id, events);
  markComplete(id);
  return json({ ok: true, accepted: events.length });
}
