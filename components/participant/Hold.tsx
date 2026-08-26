'use client';

/**
 * S3 — the hold (§6.3, §9, AC 33).
 *
 * `s3.title` over a status line that cycles through `s3.lines[]`. The lines
 * are plausible and dull on purpose: §9 forbids a joke here because a joke
 * says the wait is theatre, and the pause is the beat the reveal lands on.
 *
 * There is no progress bar and no connection state. The screen cannot know
 * when the facilitator will flip the flag — the 5 s floor is a minimum, not a
 * duration — so a bar would either lie about the remaining time or sit at an
 * arbitrary fraction. §6.3 forbids the connection warning outright: on this
 * screen it reads as a broken app.
 *
 * The cycling line is `aria-hidden`. A live region announcing five status
 * lines in five seconds is noise over nothing a screen-reader participant can
 * act on; the heading carries what the screen is for, and it is announced
 * once.
 */

import { useEffect, useState } from 'react';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf, holdLines } from '@/lib/pack/copy';
import styles from './participant.module.css';

/**
 * Slow enough to read, fast enough that a five-line pack shows every line
 * inside the 5 s floor (§6.3) rather than stopping halfway through a list the
 * participant can see is a list.
 */
export const HOLD_LINE_MS = 1_000;

export interface HoldProps {
  pack: ContentPack;
  /** Injected by tests; the pack's own lines otherwise. */
  lineIntervalMs?: number;
}

export function Hold({ pack, lineIntervalMs = HOLD_LINE_MS }: HoldProps) {
  const lines = holdLines(pack);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (lines.length < 2) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % lines.length),
      lineIntervalMs,
    );
    return () => clearInterval(timer);
  }, [lines.length, lineIntervalMs]);

  return (
    <main className={`${styles.page} ${styles.centred}`} data-testid="hold">
      <h1 className={styles.prompt}>{copyOf(pack, 's3.title')}</h1>
      <p className={styles.holdLine} aria-hidden="true" data-testid="hold-line">
        {lines[index % Math.max(1, lines.length)]}
      </p>
    </main>
  );
}
