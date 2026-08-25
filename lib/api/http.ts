/**
 * Shared response and auth helpers for the §6.1 route handlers.
 *
 * All endpoints are JSON. Errors carry a machine-readable `error` and nothing
 * else: a participant never sees these strings, and a fuller message would only
 * tell an unauthenticated caller which half of the guess was right.
 */

import { timingSafeEqual } from 'node:crypto';
import { findSession, type SessionRow } from '@/lib/db/queries';

export function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export function notFound(error: string): Response {
  return Response.json({ error }, { status: 404 });
}

/** Bodyless requests and malformed JSON both resolve to null, never a throw. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Length-independent, so a mismatch reveals nothing through timing. */
function tokensMatch(presented: string, stored: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer (.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Resolves `:id` and its bearer token to a session row.
 *
 * A wrong token and an unknown session both return 401, deliberately: a 404
 * here would turn the endpoint into an oracle for which session ids exist, and
 * §6.2.6's scope argument already rests on a thin secret.
 *
 * Because the token is checked against the row named by `:id`, a token issued
 * for a session in room A cannot read a session in room B — there is no room in
 * the lookup at all.
 */
export function authenticate(request: Request, sessionId: string): SessionRow | null {
  const presented = bearerToken(request);
  if (presented === null) return null;
  const session = findSession(sessionId);
  if (session === null) return null;
  return tokensMatch(presented, session.token) ? session : null;
}
