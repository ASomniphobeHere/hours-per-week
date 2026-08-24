/**
 * The v1 content pack, imported rather than fetched.
 *
 * §4.1 has packs fetched at session start so content can be replaced without a
 * client release; this module is the build-time handle on the pack that ships
 * *with* this release — the last-good fallback of §4.6, the fixture every
 * domain test runs against, and what `/packs/v1/pack.json` is served from.
 */

import raw from '@/packs/v1/pack.json';
import type { ContentPack } from './types';
import { indexPack, type PackIndex } from './index';
import { assertValidPack } from './loader';

export const V1_PACK_VERSION = 'v1';

/** Not validated at import: `assertValidPack` is called explicitly, by tests
 *  and by the route that serves the pack, so a bad pack never becomes a module
 *  load error inside a request. */
export const v1Pack: ContentPack = raw as unknown as ContentPack;

let index: PackIndex | null = null;

export function v1Index(): PackIndex {
  index ??= indexPack(assertValidPack(v1Pack));
  return index;
}
