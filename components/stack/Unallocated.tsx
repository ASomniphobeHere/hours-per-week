'use client';

/**
 * §7.8 — the bottom band. Dashed 1 px outline, no fill, no spine, and no tap
 * target: it is the shape of what is left, not an activity.
 *
 * Absent entirely when `remaining <= 0`; the caller decides that, because at
 * that point the stack is over 24 and the space below the line belongs to the
 * overflow stripes (§7.6, Stage 7) rather than to slack.
 */

import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import { showsLabel } from './geometry';
import styles from './stack.module.css';

export interface UnallocatedProps {
  pack: ContentPack;
  /** px from the top of the stack container. */
  top: number;
  height: number;
}

export function Unallocated({ pack, top, height }: UnallocatedProps) {
  return (
    <div
      className={styles.unallocated}
      data-testid="unallocated"
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      {/*
       * §7.4's label rule, applied here too: §7.8 calls this the bottom band,
       * and a participant with six minutes of slack gets a two-pixel dashed
       * rule with a 13 px word spilling out of it over the 24-hour tick.
       */}
      {showsLabel(height) ? (
        <span className={styles.unallocatedLabel}>{copyOf(pack, 'band.unallocated')}</span>
      ) : null}
    </div>
  );
}
