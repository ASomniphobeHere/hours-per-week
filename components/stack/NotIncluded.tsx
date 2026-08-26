'use client';

/**
 * §7.7 — the Not included list, below the stack.
 *
 * Membership is `hours('wd') === 0 && hours('we') === 0` and lives in
 * `isNotIncluded`; this renders whatever it is handed. Cause is deliberately
 * not distinguished — a section gated out at S1 and one answered with zeros
 * look identical, because the participant's route to zero is telemetry, not UI.
 *
 * Inventory, not instrument: no hue, no spine, no hour count, muted throughout.
 * Absent entirely when empty, with no empty-state copy (AC 31).
 */

import type { Activity } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import styles from './stack.module.css';

export interface NotIncludedProps {
  pack: ContentPack;
  activities: readonly Activity[];
  listRef?: React.RefObject<HTMLElement | null>;
  /** Opens the activity's sheet, exactly as a band tap does (§7.7, step 5.5). */
  onSelect?: (activityId: string) => void;
}

export function NotIncluded({ pack, activities, listRef, onSelect }: NotIncludedProps) {
  if (activities.length === 0) return null;

  return (
    <section ref={listRef as React.Ref<HTMLElement>} className={styles.notIncluded} data-testid="not-included">
      <h2 className={styles.notIncludedHeading}>{copyOf(pack, 'band.notIncluded')}</h2>
      {activities.map((activity) => (
        <button
          key={activity.id}
          type="button"
          className={styles.notIncludedRow}
          data-activity={activity.id}
          onClick={() => onSelect?.(activity.id)}
        >
          {copyOf(pack, activity.label)}
        </button>
      ))}
    </section>
  );
}
