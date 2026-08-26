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

/** §7.4 — below this the band renders no label block at all. */
export const LABEL_HIDE_BELOW_PX = 20;

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
 * §7.4 — the label is omitted below a 20 px band. The hour count goes with it:
 * §7.3 calls the two one *label block*, and a 9 px number alone in a 14 px band
 * is not a smaller version of the band, it is a different thing.
 */
export function showsLabel(bandHeight: number): boolean {
  return bandHeight >= LABEL_HIDE_BELOW_PX;
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
  labelled: boolean;
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
      labelled: showsLabel(height),
      hitTop: top,
      hitHeight: height,
    };
  });

  return boxes;
}
