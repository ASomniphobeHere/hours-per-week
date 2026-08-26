'use client';

/**
 * §7.6 — the 24-hour rim and the stripes below it.
 *
 * **The rim is a rim, not an alert.** One appearance, always: same weight,
 * same colour, before and after breach (AC 41). Nothing about it is
 * conditional, which is why it takes no props but the scale — a rule that
 * thickened or reddened at 24.25 h would be the message §7.6 spends its length
 * refusing to send.
 *
 * **The stripes are one overlay, not a per-band decoration.** A single clipped
 * element from the rim to the bottom of the container, so a band straddling
 * the line is striped on its lower portion and nowhere else, and ten bands
 * over the line carry one continuous field of stripes rather than ten. There
 * is no over-by text, no toast and no count of the excess anywhere near it
 * (§7.6, AC 42): the striped region is the size of the problem, and the only
 * number in the client that speaks to it is the toggle segment's own occupied
 * hours (§7.1).
 *
 * Both are inert and both are decorative to a screen reader. A participant who
 * cannot see the stripes learns the same fact from the toggle's hour count,
 * which is announced as text; a live region repeating "over" on every quarter
 * hour would be the running commentary §7.6 forbids in visual form.
 */

import { HOURS_PER_DAY } from '@/lib/domain/types';
import styles from './stack.module.css';

export interface OverflowProps {
  /** §7.2's `pxPerHour`. */
  perHour: number;
  /** The day's occupied hours. Only its relation to 24 matters here. */
  total: number;
}

export function Overflow({ perHour, total }: OverflowProps) {
  const rimTop = HOURS_PER_DAY * perHour;

  return (
    <>
      {total > HOURS_PER_DAY ? (
        <div
          className={styles.stripes}
          data-testid="overflow-stripes"
          aria-hidden="true"
          style={{ top: `${rimTop}px` }}
        />
      ) : null}
      <div
        className={styles.rim}
        data-testid="overflow-rim"
        aria-hidden="true"
        style={{ top: `${rimTop}px` }}
      />
    </>
  );
}
