'use client';

/**
 * S4's footer control (§8.4, §9 `s4.confirm`, AC 43).
 *
 * Enabled when `fits()` holds on **both** day types, and disabled otherwise —
 * which is the whole of its logic. It does not advance on its own: §8.4 is
 * explicit that a participant who lands under 24 by accident gets to look at
 * what they did, and may keep adjusting before confirming. So fitting enables
 * a button and does not press it.
 *
 * Disabled, it says nothing about why. The cause is on screen already — the
 * stripes on the day that breaches, the bold red hour count on the segment
 * that does (§7.6) — and a control that explained itself here would be the
 * over-by message §7.6 spends its length refusing.
 *
 * It takes Finish's place rather than sitting beside it: the two are the same
 * control at two moments, and a footer holding both would offer a participant
 * at S4 a button whose stage is behind them.
 */

import { copyOf } from '@/lib/pack/copy';
import type { ContentPack } from '@/lib/pack/types';
import styles from './stack.module.css';

export interface ConfirmProps {
  pack: ContentPack;
  /** §3.4's `fits()`, over both day types. */
  enabled: boolean;
  onConfirm: () => void;
}

export function Confirm({ pack, enabled, onConfirm }: ConfirmProps) {
  return (
    <button
      type="button"
      className={styles.finish}
      data-testid="confirm"
      disabled={!enabled}
      onClick={onConfirm}
    >
      {copyOf(pack, 's4.confirm')}
    </button>
  );
}
