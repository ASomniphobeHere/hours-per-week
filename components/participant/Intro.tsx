'use client';

/**
 * §13's one statement, on its own page, before the first screen.
 *
 * Every hour belongs to exactly one activity. The instrument rests on
 * `total(dt) = Σ hours`, so a participant who counts an hour of cooking-while-
 * listening under both `household` and `leisure` breaches 24 for a reason that
 * is not a real finding — and the S4 overflow signal then fires on double
 * counting rather than on a full week. §13's fix is to say the rule once and
 * build no mechanism for it.
 *
 * The dismissal is persisted (`introSeen`), so "once" survives the refresh §11
 * requires be invisible. The page is not counted in `s1.progress`: progress is
 * over pack screens (§4.2.1) and this is client chrome.
 */

import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import styles from './participant.module.css';

export interface IntroProps {
  pack: ContentPack;
  onContinue: () => void;
}

export function Intro({ pack, onContinue }: IntroProps) {
  return (
    <main className={`${styles.page} ${styles.centred}`}>
      <div className={styles.body}>
        <p className={styles.prompt}>{copyOf(pack, 'intro.multitasking')}</p>
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.primary} onClick={onContinue}>
          {copyOf(pack, 'intro.continue')}
        </button>
      </div>
    </main>
  );
}
