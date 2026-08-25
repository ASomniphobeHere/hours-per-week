'use client';

/**
 * §7.3's hour scale, as amended by RD-1.
 *
 * One continuous ruler, absolutely positioned against the stack container
 * rather than per band, so it reads as a single scale across ten spines
 * (AC 18). Exact hairline ticks, the numbers standing alone in the tick colour,
 * and **nothing between the spine and the tick** — no plate, no scrim, no
 * translucent stripe. Legibility against every hue at full saturation is then a
 * property of the tick colour alone, checked in `ruler-contrast.test.ts`
 * (AC 19).
 *
 * Decorative to a screen reader: the scale orients the eye, and the hours a
 * participant needs read out are on the bands and the toggle.
 */

import { RULER_HOURS } from './geometry';
import styles from './stack.module.css';

export interface RulerProps {
  /** §7.2's `pxPerHour`. */
  perHour: number;
}

/**
 * Where the tick's number sits relative to its line. The first and last ticks
 * would otherwise be half-clipped by the ends of the stack; the hairline itself
 * stays on the hour either way.
 */
function anchor(hour: number): 'start' | 'end' | 'middle' {
  if (hour === RULER_HOURS[0]) return 'start';
  if (hour === RULER_HOURS[RULER_HOURS.length - 1]) return 'end';
  return 'middle';
}

export function Ruler({ perHour }: RulerProps) {
  return (
    <div className={styles.ruler} data-testid="ruler" aria-hidden="true">
      {RULER_HOURS.map((hour) => (
        <div
          key={hour}
          className={styles.tick}
          data-hour={hour}
          data-anchor={anchor(hour)}
          style={{ top: `${hour * perHour}px` }}
        >
          <span className={styles.tickRule} />
          <span className={styles.tickNumber}>{hour}</span>
        </div>
      ))}
    </div>
  );
}
