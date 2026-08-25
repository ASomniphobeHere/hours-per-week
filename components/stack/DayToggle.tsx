'use client';

/**
 * §7.1 — the day-type toggle. Two segments above the stack, and the only chrome
 * between the header and the ruler.
 *
 * Each segment carries its own day's **occupied hours** — `total(dt)`, not
 * `remaining` — live, selected or not. That is what makes a weekend breach
 * discoverable from the workday view, and it is the only reason `fits()` can
 * fail at S4 for a reason the participant can see (AC 12, AC 44).
 *
 * Selecting a segment changes which stack renders and nothing else: no answer,
 * no derivation, no telemetry beyond a view event (AC 11).
 *
 * **Breach** (§7.6, AC 13). Over 24 h, that segment's hour count goes bold and
 * overflow-red. It is the single deliberate exception to the stripes-only rule,
 * and it states occupied hours — `27.7 hr` — never the excess.
 */

import type { ContentPack } from '@/lib/pack/types';
import type { DayType } from '@/lib/domain/types';
import { DAY_TYPES, HOURS_PER_DAY } from '@/lib/domain/types';
import { copyOf, formatCopy } from '@/lib/pack/copy';
import { formatAmount } from '@/components/participant/fields/format';
import styles from './stack.module.css';

export interface DayToggleProps {
  pack: ContentPack;
  /** `total(dt)` for both day types, whichever is selected. */
  totals: Record<DayType, number>;
  selected: DayType;
  onSelect: (dayType: DayType) => void;
}

/** The copy key naming a day type on the toggle. Questionnaire phrasing is its own. */
export function toggleKey(dayType: DayType): string {
  return `toggle.${dayType}`;
}

export function DayToggle({ pack, totals, selected, onSelect }: DayToggleProps) {
  return (
    <div className={styles.toggle} data-testid="day-toggle">
      {DAY_TYPES.map((dayType) => {
        const isSelected = dayType === selected;
        const breached = totals[dayType] > HOURS_PER_DAY;
        return (
          <button
            key={dayType}
            type="button"
            aria-pressed={isSelected}
            data-daytype={dayType}
            data-selected={isSelected || undefined}
            className={`${styles.segment} ${isSelected ? styles.segmentSelected : ''}`}
            onClick={() => onSelect(dayType)}
          >
            <span className={styles.segmentLabel}>{copyOf(pack, toggleKey(dayType))}</span>
            <span
              className={`${styles.segmentHours} ${breached ? styles.segmentBreach : ''}`}
              data-breach={breached || undefined}
              data-testid={`toggle-hours-${dayType}`}
            >
              {formatCopy(pack, 'toggle.hours', { hours: formatAmount(totals[dayType]) })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
