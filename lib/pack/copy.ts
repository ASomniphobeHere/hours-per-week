/**
 * §9 — every participant-facing string lives in the pack under `copy`, and
 * nothing is hardcoded in the client.
 *
 * That rule governs the questionnaire copy the pack obviously owns, and it
 * governs the client's own chrome too: the join prompt, the navigation
 * controls, the unit suffix beside a stepper. A build that hardcodes "Next"
 * has put one string beyond the reach of a pack release, and the next pack in
 * another language ships broken. The facilitator console is the stated
 * exception (§9 scope) and reads none of this.
 *
 * A missing key is not an exception here. `copy-key-exists` (§4.6) has already
 * refused to load a pack that lacks one, so the only way to reach the fallback
 * is a key the client asks for that no rule knows about — and a visible key
 * name in dev is what surfaces that, where a throw mid-render would take the
 * questionnaire down in a room.
 */

import type { ContentPack } from './types';
import { S3_LINES_PREFIX } from './validate';

/** Resolves a copy key. Returns the key itself when the pack has no entry. */
export function copyOf(pack: ContentPack, key: string): string {
  const value = pack.copy[key];
  return typeof value === 'string' && value !== '' ? value : key;
}

/**
 * `s1.progress` is `"{current} of {total}"` — the only templated string in §9's
 * table. Placeholders are named rather than positional so a translation may
 * reorder them.
 */
export function formatCopy(
  pack: ContentPack,
  key: string,
  values: Record<string, string | number>,
): string {
  return copyOf(pack, key).replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/** Unit suffix beside a numeric control, e.g. `45 min`. Untyped units have none. */
export function unitKey(unit: string | undefined): string | undefined {
  return unit === undefined || unit === 'clock' ? undefined : `unit.${unit}`;
}

/**
 * §9's `s3.lines[]`, in index order — and the second hold's `s5.lines[]`,
 * which is the same shape under a different prefix (plan 25 §E.7).
 *
 * The pack's copy map is flat, so the array is spelled `s3.lines.0` upward and
 * reassembled here — one shape for the client, one for the validator, and no
 * nested value in a table every other key reads as a string. Sorted
 * numerically rather than lexically, so a pack with ten lines does not put
 * `.10` between `.1` and `.2`.
 */
export function holdLines(pack: ContentPack, prefix: string = S3_LINES_PREFIX): string[] {
  return Object.keys(pack.copy)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, index: Number(key.slice(prefix.length)) }))
    .filter(({ index }) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ key }) => copyOf(pack, key));
}
