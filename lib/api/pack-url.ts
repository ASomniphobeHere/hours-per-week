/**
 * Where a participant fetches the content pack (§4.1, §6.1's `packUrl`).
 *
 * The pack is served by a route handler rather than as a static file under
 * `public/`, so `packs/v1/pack.json` stays the single canonical copy and §4.6
 * validation runs before the bytes leave the server. Relative because the
 * client, console, and API are one deploy on one origin (see the plan's
 * Decisions table): no CORS, and no hostname to configure for Stage 12's LAN
 * rehearsal or Stage 13's tunnel.
 */

export function packUrl(version: string): string {
  return `/api/pack/${version}`;
}
