'use client';

/**
 * S4, screen two of two — the pace (§8.3, AC 39a).
 *
 * `s4.pace.title` over the three-part control, under Continue. The control is
 * the same component the band's sheet renders (§8.3: "the pace screen and the
 * sheet render **one** control"), so the ladder a participant chooses against
 * is the ladder they meet again on the band.
 *
 * **The level is held here and committed on Continue.** Writing every tick
 * through to the schedule would put four `hours.change` events in the log for
 * a participant who walked the stepper to 40 and back, and §10 reads the
 * chosen pace off exactly one of them. It would also mean the band existed
 * before the screen that creates it was finished with. So the choice is local
 * until Continue, which commits it once — measured against the floor, so the
 * default logs nothing (see `setWeekly`).
 *
 * The stack is on neither reveal screen. What the pace costs *this*
 * participant is off-screen until they continue, and that is the measurement.
 */

import { useState } from 'react';
import type { Activity } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import { SchoolControl } from '@/components/school/SchoolControl';
import styles from './participant.module.css';

export interface PaceProps {
  pack: ContentPack;
  /** The locked activity whose constraint is the ladder. */
  activity: Activity;
  /** Commits the chosen level and enters the stack at it. */
  onCommit: (weekly: number) => void;
}

export function Pace({ pack, activity, onCommit }: PaceProps) {
  // The floor is the default (§8.3), and it is the pack's number rather than
  // this file's: a ladder that starts somewhere else is a pack edit.
  const [weekly, setWeekly] = useState(activity.constraint?.minWeekly ?? 0);

  return (
    <main className={`${styles.page} ${styles.centred}`} data-testid="pace">
      <div className={styles.body}>
        <h1 className={styles.prompt}>{copyOf(pack, 's4.pace.title')}</h1>
        <SchoolControl
          pack={pack}
          activity={activity}
          weekly={weekly}
          onChange={setWeekly}
        />
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primary}
          data-testid="pace-continue"
          onClick={() => onCommit(weekly)}
        >
          {copyOf(pack, 's4.pace.continue')}
        </button>
      </div>
    </main>
  );
}
