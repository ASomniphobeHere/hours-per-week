'use client';

/**
 * §8.1's direct entry, at the bottom of every sheet, and §8.2's clamps on it.
 *
 * "Set directly" flips the activity to `mode: 'direct'` for both day types at
 * once — §8.1 says it flips *the activity* and exposes an input for workday and
 * weekend hours, so one control governs the pair. The values it starts from are
 * whatever the activity currently derives to, so the flip changes who owns the
 * number and not the number itself.
 *
 * **It does not erase the answers underneath** (§4.3 rule 4, AC 26). Reverting
 * clears the override and the next derivation pass reads the same answer map it
 * would have read had the participant never touched this control.
 *
 * **Clamping is silent** (§8.2). Sleep stops at 6 h with the decrement disabled
 * there, everything else at 0, and no error copy appears anywhere — the control
 * simply stops, and `clamp.hit` carries what was refused to §10 instead. The
 * clamp itself lives in `lib/domain/constraints`, so the sheet does not know
 * that sleep is the activity with a floor.
 */

import { useCallback, useState } from 'react';
import type { Activity, DayType } from '@/lib/domain/types';
import { DAY_TYPES } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { atDailyMinimum } from '@/lib/domain/constraints';
import { copyOf } from '@/lib/pack/copy';
import { formatAmount } from '@/components/participant/fields/format';
import styles from './sheet.module.css';

/** A press is worth a quarter hour — the granularity the stack is drawn at. */
export const HOURS_STEP = 0.25;

export interface DirectEntryProps {
  pack: ContentPack;
  activity: Activity;
  /** True when either day type is already the participant's own value. */
  direct: boolean;
  onSet: (dayType: DayType, hours: number) => void;
  /** Flips the whole activity, both day types, in one action. */
  onTake: () => void;
  onRevert: () => void;
}

export function DirectEntry({
  pack,
  activity,
  direct,
  onSet,
  onTake,
  onRevert,
}: DirectEntryProps) {
  const toggle = useCallback(() => {
    if (direct) onRevert();
    else onTake();
  }, [direct, onTake, onRevert]);

  return (
    <div className={styles.direct} data-testid="direct-entry">
      <button
        type="button"
        className={styles.directToggle}
        data-testid="direct-toggle"
        aria-pressed={direct}
        onClick={toggle}
      >
        {copyOf(pack, 'sheet.setDirect')}
      </button>

      {direct
        ? DAY_TYPES.map((dayType) => (
            <HoursField
              key={dayType}
              pack={pack}
              activity={activity}
              dayType={dayType}
              onSet={onSet}
            />
          ))
        : null}
    </div>
  );
}

interface HoursFieldProps {
  pack: ContentPack;
  activity: Activity;
  dayType: DayType;
  onSet: (dayType: DayType, hours: number) => void;
}

/**
 * One day type's hours: decrement, a typed value, increment.
 *
 * The text is held as a draft while it is being typed and committed on blur or
 * Enter, because the clamp is applied on commit. Clamping every keystroke would
 * make "10" unreachable on a field with a floor of 6 — the participant types
 * `1`, the control refuses it and answers `6`, and the `0` lands on the wrong
 * number. The buttons commit immediately: there is nothing half-typed about a
 * press.
 */
function HoursField({ pack, activity, dayType, onSet }: HoursFieldProps) {
  const hours = activity[dayType].hours;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = useCallback(
    (raw: string) => {
      setDraft(null);
      const parsed = Number(raw);
      // An unparseable box is not an edit. Leaving the value alone is what the
      // participant sees anyway, since the draft is dropped on the same pass.
      if (raw.trim() === '' || !Number.isFinite(parsed)) return;
      onSet(dayType, parsed);
    },
    [dayType, onSet],
  );

  const atMinimum = atDailyMinimum(activity, dayType, hours);

  return (
    <div className={styles.hoursField} data-day={dayType}>
      <span className={styles.hoursLabel} id={`direct-${activity.id}-${dayType}`}>
        {copyOf(pack, `toggle.${dayType}`)}
      </span>
      <div className={styles.hoursControl}>
        <button
          type="button"
          className={styles.hoursStep}
          data-testid={`direct-down-${dayType}`}
          aria-label={copyOf(pack, 'a11y.decrease')}
          disabled={atMinimum}
          onClick={() => onSet(dayType, hours - HOURS_STEP)}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          className={styles.hoursInput}
          data-testid={`direct-hours-${dayType}`}
          aria-labelledby={`direct-${activity.id}-${dayType}`}
          step={HOURS_STEP}
          value={draft ?? formatAmount(hours)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(event.currentTarget.value);
          }}
        />
        <span className={styles.hoursUnit}>{copyOf(pack, 'unit.hours')}</span>
        <button
          type="button"
          className={styles.hoursStep}
          data-testid={`direct-up-${dayType}`}
          aria-label={copyOf(pack, 'a11y.increase')}
          onClick={() => onSet(dayType, hours + HOURS_STEP)}
        >
          +
        </button>
      </div>
    </div>
  );
}
