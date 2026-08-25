'use client';

/**
 * The stack the questionnaire ends on (step 3.5, AC 9 / AC 10).
 *
 * One band per non-zero activity in pack order, every activity at zero on both
 * day types in Not included, and school in neither — it is inserted at S4
 * (§3.3). Both day types are shown at once because the day-type toggle is
 * §7.1's, and §7.1 is the editor.
 *
 * **This is not the editor.** §7's geometry — full-bleed bands at
 * `hours × pxPerHour`, the spine, the continuous ruler, Not included below the
 * 24 h line — is Stage 4. What this renders is the *contents* of the generated
 * stack, which is what AC 9 and AC 10 are about, in a form that shows them
 * plainly before the instrument exists to draw them.
 */

import type { Activity, DayType } from '@/lib/domain/types';
import { DAY_TYPES } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { buildStack } from '@/lib/domain/stack';
import { copyOf, unitKey } from '@/lib/pack/copy';
import { hoursOf } from '@/lib/domain/totals';
import { formatAmount } from './fields/format';
import styles from './participant.module.css';

export interface StackSummaryProps {
  pack: ContentPack;
  activities: readonly Activity[];
}

function hoursLabel(pack: ContentPack, activity: Activity, dayType: DayType): string {
  return `${formatAmount(hoursOf(activity, dayType))} ${copyOf(pack, unitKey('hours') ?? '')}`;
}

export function StackSummary({ pack, activities }: StackSummaryProps) {
  const { bands, notIncluded } = buildStack(activities);

  return (
    <main className={styles.page}>
      <div className={styles.stack} data-testid="stack">
        {bands.map((activity) => (
          <div
            key={activity.id}
            className={styles.band}
            data-activity={activity.id}
            style={{ '--band-hue': `${activity.hue}deg` } as React.CSSProperties}
          >
            <span className={styles.bandLabel}>{copyOf(pack, activity.label)}</span>
            <span className={styles.bandHours}>
              {DAY_TYPES.map((dayType) => hoursLabel(pack, activity, dayType)).join(' · ')}
            </span>
          </div>
        ))}
      </div>

      {notIncluded.length === 0 ? null : (
        <section className={styles.notIncluded} data-testid="not-included">
          <h2 className={styles.notIncludedHeading}>{copyOf(pack, 'band.notIncluded')}</h2>
          {notIncluded.map((activity) => (
            <div key={activity.id} className={styles.notIncludedRow} data-activity={activity.id}>
              {copyOf(pack, activity.label)}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
