/**
 * §7.2 and §7.4 geometry, as pure functions.
 *
 * Every number the editor draws with is computed here and nowhere else, so the
 * literal formulas the spec states can be asserted directly rather than read
 * back out of a stylesheet. The components measure the viewport and hand the
 * result in; nothing in this file touches the DOM.
 *
 * The one rule worth stating twice is the tap overlay (§7.4). A band's hit area
 * is exactly its visual box: overlays never overlap, so a tap always opens the
 * band under the finger. A thin band is correspondingly thin to hit — a floor
 * that stole area from its neighbours cost them more taps than it saved.
 */

import { HOURS_PER_DAY } from '@/lib/domain/types';

/** §7.3 — ticks at 0, 3, 6 … 24, on one continuous ruler. */
export const RULER_HOURS: readonly number[] = [0, 3, 6, 9, 12, 15, 18, 21, 24] as const;

/** §7.4 — `labelSize = clamp(13px, bandHeight × 0.16, 34px)`. */
export const LABEL_MIN_PX = 13;
export const LABEL_MAX_PX = 34;
export const LABEL_RATIO = 0.16;

/** §7.4 — `hoursSize = labelSize × 0.72`. */
export const HOURS_RATIO = 0.72;

/**
 * Below this height a band shows its label alone, without its hour count.
 *
 * §7.4 as written omits the whole label block under 20 px. Decided with the
 * user (2026-08-26): **the label is never hidden.** §7.5 is the reason —
 * "colour is orientation, not identification; the label identifies the band" —
 * so a band with no label is a band a participant can only name by its hue,
 * which is the one thing §7.5 says they must not have to do, and it has to
 * hold in greyscale. The hour count is the line that goes, because it is the
 * one the toggle and the sheet header both restate; the label is stated
 * nowhere else on the band.
 *
 * The number is unchanged, only what it governs: 20 px is where the two
 * stacked lines stop fitting — 13 px of label, a 2 px gap, and 9.4 px of hours
 * is 24 px, so a band under 20 px was never showing both honestly.
 */
export const HOURS_HIDE_BELOW_PX = 20;

/**
 * §8.1 — the sheet's close animates the changed band over 200 ms.
 *
 * The duration lives in `--band-transition` and the editor needs the same
 * number in JavaScript to know when the settle is over. `geometry.test.ts`
 * reads the token back out of the stylesheet and asserts the two agree, on the
 * pattern `ruler-contrast.test.ts` set: a value stated twice is a value that
 * drifts, unless a test refuses to let it.
 */
export const BAND_TRANSITION_MS = 200;

export interface ChromeHeights {
  viewportHeight: number;
  headerH: number;
  toggleH: number;
  footerH: number;
}

/**
 * §7.2, verbatim:
 *
 *     pxPerHour = (viewportHeight - headerH - toggleH - footerH) / 24
 *
 * Floored at zero so a mid-resize measurement that momentarily reports more
 * chrome than viewport cannot produce negative band heights.
 */
export function pxPerHour({
  viewportHeight,
  headerH,
  toggleH,
  footerH,
}: ChromeHeights): number {
  const available = viewportHeight - headerH - toggleH - footerH;
  return available > 0 ? available / HOURS_PER_DAY : 0;
}

/**
 * §7.2 — the container is `max(24, total) × pxPerHour` hours tall.
 *
 * Under 24 the surplus is Unallocated's (§7.8); over it the stack extends past
 * the viewport and is scrolled, which is intended and not a bug to fix.
 */
export function stackHours(total: number): number {
  return Math.max(HOURS_PER_DAY, total);
}

export function labelSize(bandHeight: number): number {
  return Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, bandHeight * LABEL_RATIO));
}

export function hoursSize(bandHeight: number): number {
  return labelSize(bandHeight) * HOURS_RATIO;
}

/**
 * Whether a band has room for the second line of its label block.
 *
 * The label itself has no such test: it always renders (see the constant
 * above). A thin band's label overflows its own box and is centred on it,
 * which is what makes a 0.25 h band nameable at all.
 */
export function showsHours(bandHeight: number): boolean {
  return bandHeight >= HOURS_HIDE_BELOW_PX;
}

/**
 * Unallocated's own rule, which this change does not touch.
 *
 * §7.8's bottom band is not an activity and identifies nothing — it is the
 * shape of what is left — so there is no §7.5 argument for keeping its word on
 * screen, and six minutes of slack with "Unallocated" spilling across the
 * 24-hour tick is the case step 4.7 already ruled on. Same threshold, stated
 * separately because it is a different rule that happens to agree.
 */
export function showsSlackLabel(height: number): boolean {
  return height >= HOURS_HIDE_BELOW_PX;
}

export interface BandInput {
  id: string;
  hours: number;
}

export interface BandBox<T extends BandInput = BandInput> {
  /** The input this box was laid out from, so a caller can carry a payload. */
  band: T;
  /** Visual box, in px from the top of the stack container. */
  top: number;
  height: number;
  labelPx: number;
  hoursPx: number;
  /** False on a band too thin for the hour count. The label renders regardless. */
  showsHours: boolean;
  /** Hit overlay, which covers the band exactly and nothing else (§7.4). */
  hitTop: number;
  hitHeight: number;
}

/**
 * Lays a day's bands out top to bottom in pack order, with their tap overlays.
 *
 * The overlay tracks its band exactly, so no tap can land on an activity the
 * participant is not pointing at and none can reach up into the toggle or down
 * into Not included.
 */
export function layoutBands<T extends BandInput>(
  bands: readonly T[],
  perHour: number,
): BandBox<T>[] {
  let cursor = 0;
  const boxes = bands.map((band): BandBox<T> => {
    const height = band.hours * perHour;
    const top = cursor;
    cursor += height;

    return {
      band,
      top,
      height,
      labelPx: labelSize(height),
      hoursPx: hoursSize(height),
      showsHours: showsHours(height),
      hitTop: top,
      hitHeight: height,
    };
  });

  return boxes;
}
