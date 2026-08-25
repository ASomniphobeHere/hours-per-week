/**
 * GET /api/pack/:version — serves the content pack named by `packUrl` (§6.1).
 *
 * Validation runs here (§4.6) so a pack that would break forty phones fails at
 * one server instead. `assertValidPack` throws, which is the "fail loudly"
 * half of §4.6; the client's own last-good cache is the other half (§11).
 *
 * Only v1 exists. Unknown versions 404 rather than falling through to v1: a
 * client asking for a pack this build does not have should hit its retry and
 * last-good path, not be handed different content under the version it asked
 * for.
 */

import { notFound } from '@/lib/api/http';
import { assertValidPack } from '@/lib/pack/loader';
import { V1_PACK_VERSION, v1Pack } from '@/lib/pack/v1';

export async function GET(
  _request: Request,
  context: { params: Promise<{ version: string }> },
): Promise<Response> {
  const { version } = await context.params;
  if (version !== V1_PACK_VERSION) return notFound('unknown pack version');

  const pack = assertValidPack(v1Pack);
  return Response.json(pack, {
    headers: {
      // A pack is immutable under its version, so it is cached hard; replacing
      // content means shipping a new version (§4.1).
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
