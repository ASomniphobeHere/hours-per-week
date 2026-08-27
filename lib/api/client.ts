/**
 * The two things every typed client in this repo needs and neither the
 * participant nor the console owns: an injected `fetch`, and an error that
 * carries the status code the caller has to branch on.
 *
 * Extracted from `lib/session/client.ts` when the facilitator console arrived
 * (Stage 8). The console talks to room-scoped routes a participant may never
 * touch (§6.2.1), so it must not import a module named for the session — but
 * `ApiError` was never about sessions, and a second copy of it would make
 * `instanceof` depend on which half of the app threw.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function expectOk(response: Response): Promise<unknown> {
  if (!response.ok) throw new ApiError(response.status, `request failed: ${response.status}`);
  return response.json();
}
