'use client';

/**
 * S3 — the hold (§6.3, §9, AC 33).
 *
 * `s3.title` over a status line that cycles through `s3.lines[]`. The lines
 * are plausible and dull on purpose: §9 forbids a joke here because a joke
 * says the wait is theatre, and the pause is the beat the reveal lands on.
 *
 * **The line is paced like something working, not like a carousel.** Each one
 * grows an ellipsis a dot at a time, holds complete for a moment, then swaps
 * for the next. That cadence is the whole of the screen's honesty: a line that
 * flicked past every second would read as a list being recited, and this one
 * reads as a step taking a while. The full cycle is longer than the 5 s floor
 * on purpose — a participant who finishes just before the flag sees one line
 * finish its ellipsis, and one who waits three minutes watches the list go
 * round. Neither is told how long is left, because nothing on this phone knows.
 *
 * There is no progress bar and no connection state. The screen cannot know
 * when the facilitator will flip the flag — the 5 s floor is a minimum, not a
 * duration — so a bar would either lie about the remaining time or sit at an
 * arbitrary fraction. §6.3 forbids the connection warning outright: on this
 * screen it reads as a broken app.
 *
 * The whole line is `aria-hidden`. A live region announcing five status lines
 * and their punctuation is noise over nothing a screen-reader participant can
 * act on; the heading carries what the screen is for, and it is announced once.
 */

import { useEffect, useState } from 'react';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf, holdLines } from '@/lib/pack/copy';
import styles from './participant.module.css';

/** One dot every two seconds, to three. */
export const HOLD_DOT_MS = 2_000;
export const HOLD_DOTS = 3;

/** Complete, and held there, before the line is replaced. */
export const HOLD_PAUSE_MS = 3_000;

/** The swap itself. Must match `holdLineOut` in the stylesheet. */
export const HOLD_SWAP_MS = 240;

export interface HoldProps {
  pack: ContentPack;
}

export function Hold({ pack }: HoldProps) {
  const lines = holdLines(pack);
  const count = lines.length;

  const [index, setIndex] = useState(0);
  const [dots, setDots] = useState(0);
  /** True for the length of the exit animation, before the text is replaced. */
  const [leaving, setLeaving] = useState(false);

  /*
   * One timer at a time, re-armed from whatever state the last one left. A
   * single chained effect rather than three concurrent intervals, because the
   * phases are strictly sequential and two timers running against the same
   * line is how a swap lands mid-ellipsis.
   */
  useEffect(() => {
    if (count === 0) return;

    if (leaving) {
      const timer = setTimeout(() => {
        setIndex((current) => (current + 1) % count);
        setDots(0);
        setLeaving(false);
      }, HOLD_SWAP_MS);
      return () => clearTimeout(timer);
    }

    if (dots < HOLD_DOTS) {
      const timer = setTimeout(() => setDots((current) => current + 1), HOLD_DOT_MS);
      return () => clearTimeout(timer);
    }

    // A one-line pack fills its ellipsis and stops. §9 requires four, so this
    // is a degenerate pack rather than a case worth animating a swap for — and
    // a swap to the same string is a flicker with nothing behind it.
    if (count < 2) return;

    const timer = setTimeout(() => setLeaving(true), HOLD_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [count, dots, leaving]);

  return (
    <main className={`${styles.page} ${styles.centred}`} data-testid="hold">
      <h1 className={styles.prompt}>{copyOf(pack, 's3.title')}</h1>
      <p
        /*
         * Keyed by line, so the incoming text mounts rather than being patched
         * into the outgoing one — which is what gives the enter animation
         * something to run on.
         */
        key={index}
        className={`${styles.holdLine} ${leaving ? styles.holdLineLeaving : ''}`}
        aria-hidden="true"
        data-testid="hold-line"
      >
        {lines[index]}
        {'.'.repeat(dots)}
      </p>
    </main>
  );
}
