'use client';

/**
 * S2's footer control (§2.2, §9 `s2.finish`).
 *
 * It marks the participant ready and enters the hold; it does not open the
 * stage (AC 32). Stage advance is the facilitator's flag and nothing a
 * participant presses can move it (§6.2.4) — so this button says "Finish", not
 * "Continue", and what follows it is a wait rather than a screen.
 */

import { copyOf } from '@/lib/pack/copy';
import type { ContentPack } from '@/lib/pack/types';
import styles from './stack.module.css';

export interface FinishProps {
  pack: ContentPack;
  onFinish: () => void;
}

export function Finish({ pack, onFinish }: FinishProps) {
  return (
    <button type="button" className={styles.finish} data-testid="finish" onClick={onFinish}>
      {copyOf(pack, 's2.finish')}
    </button>
  );
}
