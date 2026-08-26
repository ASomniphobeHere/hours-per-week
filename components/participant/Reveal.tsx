'use client';

/**
 * S4, screen one of two — the commitment (§8.3, AC 37a).
 *
 * `s4.reveal.title` over `s4.reveal.body` under a single continue control, and
 * nothing else. It states that a commitment exists; it does not ask for a
 * number and it shows no stack.
 *
 * **Why this is its own screen.** §7.1 as written delivered the ask and the
 * stack in one moment, and that was sound while the ask was a fixed 4 h. The
 * ask is now a choice, and a choice made in the same frame as its consequence
 * is a different choice: a participant looking at a striped stack picks the
 * number that makes the stripes go away, which is the floor for everyone and
 * measures nothing. Splitting the commitment from the pace, and both from the
 * stack, is what puts the decision before the cost.
 *
 * It reuses `s4.reveal.title` / `s4.reveal.body` unchanged — the two-screen
 * amendment added the pace screen, it did not rewrite the ask.
 */

import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import styles from './participant.module.css';

export interface RevealProps {
  pack: ContentPack;
  onContinue: () => void;
}

export function Reveal({ pack, onContinue }: RevealProps) {
  return (
    <main className={`${styles.page} ${styles.centred}`} data-testid="reveal">
      <div className={styles.body}>
        <h1 className={styles.prompt}>{copyOf(pack, 's4.reveal.title')}</h1>
        <p className={styles.note}>{copyOf(pack, 's4.reveal.body')}</p>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primary}
          data-testid="reveal-continue"
          onClick={onContinue}
        >
          {copyOf(pack, 's4.pace.continue')}
        </button>
      </div>
    </main>
  );
}
