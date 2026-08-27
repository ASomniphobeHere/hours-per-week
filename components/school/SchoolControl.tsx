'use client';

/**
 * §8.3's three-part control: the weekly stepper, the per-workday figure it
 * implies, and the outcome at the level currently set.
 *
 * **One component, two surfaces.** The pace screen (§8.3 screen 2) and the
 * band's own sheet (§8.3, AC 40) render this and nothing else between them.
 * That is the spec's requirement rather than a convenience: a participant who
 * reopens the band must meet the same ladder they chose against, and two
 * renderings of a five-rung ladder are two things to keep in step. The only
 * difference between the two call sites is what `onChange` does with the
 * number — the pace screen holds it until Continue, the sheet writes it
 * straight through.
 *
 * All three parts are live on every step (AC 39a). The outcome line is what
 * makes the stepper a decision at all: a number that changes nothing but a
 * band height is not something a participant can have a view about. It is also
 * the only expectation stated anywhere in the client, and it states one about
 * the programme — never about the participant's week, and never that a rung is
 * the right one (§9).
 *
 * **The ladder is read off the constraint, not off school.** `minWeekly`,
 * `maxWeekly` and `stepWeekly` come from the pack, so extending the ladder is
 * a pack edit plus the copy for the new rung; nothing here names 20, 40 or 5,
 * and nothing here names school.
 */

import type { Activity } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import {
  atWeeklyMaximum,
  atWeeklyMinimum,
  weeklyToDaily,
} from '@/lib/domain/constraints';
import { copyOf, formatCopy } from '@/lib/pack/copy';
import { outcomeKey } from '@/lib/pack/validate';
import { formatAmount } from '@/components/participant/fields/format';
import styles from './school.module.css';

export interface SchoolControlProps {
  pack: ContentPack;
  /** The locked activity the ladder belongs to; its constraint is the ladder. */
  activity: Activity;
  /** The level on screen now. Owned by the caller, so the sheet writes through
   *  and the pace screen can hold a choice until Continue. */
  weekly: number;
  onChange: (weekly: number) => void;
}

export function SchoolControl({ pack, activity, weekly, onChange }: SchoolControlProps) {
  const constraint = activity.constraint;
  const step = constraint?.stepWeekly ?? 0;
  const perDay = weeklyToDaily(constraint, weekly, 'wd');
  const hoursUnit = copyOf(pack, 'unit.hours');

  return (
    <div className={styles.control} data-testid="school-control">
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.step}
          data-testid="school-down"
          aria-label={copyOf(pack, 'a11y.decrease')}
          disabled={atWeeklyMinimum(activity, weekly)}
          onClick={() => onChange(weekly - step)}
        >
          −
        </button>
        <span className={styles.value} data-testid="school-weekly">
          {formatAmount(weekly)}
          <span className={styles.unit}>{hoursUnit}</span>
        </span>
        <button
          type="button"
          className={styles.step}
          data-testid="school-up"
          aria-label={copyOf(pack, 'a11y.increase')}
          disabled={atWeeklyMaximum(activity, weekly)}
          onClick={() => onChange(weekly + step)}
        >
          +
        </button>
      </div>

      {/* The one cost this control shows, and deliberately the general one: a
          participant should know that 40 h a week is eight hours of every
          workday before choosing it. What it takes from *their* week is the
          stack's to say (§8.3). */}
      <p className={styles.perDay} data-testid="school-per-day">
        {formatCopy(pack, 's6.pace.perDay', { hours: formatAmount(perDay) })}
      </p>

      <p className={styles.outcome} data-testid="school-outcome">
        {copyOf(pack, outcomeKey(weekly))}
      </p>
    </div>
  );
}
