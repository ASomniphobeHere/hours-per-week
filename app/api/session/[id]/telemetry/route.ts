/**
 * POST /api/session/:id/telemetry — §6.1, §10.
 *
 * Batched and fire-and-forget. Always 200s on an authenticated session, even
 * for an empty or unparseable batch: the client retries a failed batch with the
 * next one (§11), so a 4xx here costs the debrief every good event riding
 * alongside one bad member, permanently.
 */

import { insertEvents } from '@/lib/db/queries';
import { authenticate, json, readJson, unauthorized } from '@/lib/api/http';
import { parseEvents } from '@/lib/api/payloads';
import { ingestStage } from '@/lib/api/ingest';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const session = authenticate(request, id);
  if (session === null) return unauthorized();

  const body = await readJson(request);
  const events = parseEvents((body as { events?: unknown } | null)?.events);
  insertEvents(id, events);
  ingestStage(id, events);
  return json({ ok: true, accepted: events.length });
}
