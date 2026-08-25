'use client';

/**
 * §7.2–§7.5 — the stack for one day type.
 *
 * Full-bleed and absolutely positioned: every band's top and height comes from
 * `layoutBands`, so the bands, the ruler and the tap overlays are all in one
 * coordinate system measured in `pxPerHour`. Band height is unclamped, and the
 * container is `max(24, total) × pxPerHour` — over 24 the stack runs past the
 * viewport and is scrolled, which §7.2 asks for on purpose.
 *
 * Three layers, bottom to top: the bands, the ruler over their spines (AC 18),
 * and the transparent hit overlays (§7.4). The bands themselves take no
 * pointer events; the overlays are the tap targets, and they are sized and
 * ordered so a 0.25 h band is as easy to hit as an 8 h one (AC 21).
 */

import { useMemo } from 'react';
import type { Activity, DayType } from '@/lib/domain/types';
import { HOURS_PER_DAY } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { hoursOf } from '@/lib/domain/totals';
import { copyOf } from '@/lib/pack/copy';
import { formatAmount } from '@/components/participant/fields/format';
import { layoutBands, stackHours } from './geometry';
import { Ruler } from './Ruler';
import { Unallocated } from './Unallocated';
import styles from './stack.module.css';

export interface StackProps {
  pack: ContentPack;
  /** The day's bands, in pack order. Zero-hour activities are not among them. */
  bands: readonly Activity[];
  dayType: DayType;
  /** §7.2's `pxPerHour`. */
  perHour: number;
  /** Opens the band's sheet (Stage 5). */
  onSelect?: (activityId: string) => void;
}

export function Stack({ pack, bands, dayType, perHour, onSelect }: StackProps) {
  /*
   * A band with zero hours on *this* day type still belongs to the stack — §7.7
   * only moves an activity out when both day types are zero — and it renders
   * nothing here. Laying it out anyway would give it a 44 px tap overlay on a
   * day it has no presence on.
   */
  const present = useMemo(
    () =>
      bands
        .map((activity) => ({ id: activity.id, activity, hours: hoursOf(activity, dayType) }))
        .filter((entry) => entry.hours > 0),
    [bands, dayType],
  );

  const total = present.reduce((sum, entry) => sum + entry.hours, 0);
  const containerHeight = stackHours(total) * perHour;
  const boxes = layoutBands(present, perHour, containerHeight);

  const remaining = HOURS_PER_DAY - total;
  const hoursUnit = copyOf(pack, 'unit.hours');

  return (
    <div
      className={styles.stack}
      data-testid="stack"
      data-daytype={dayType}
      style={{ height: `${containerHeight}px` }}
    >
      {boxes.map(({ band: { id, activity, hours }, ...box }) => (
        <div
          key={id}
          className={styles.band}
          data-activity={id}
          style={{
            top: `${box.top}px`,
            height: `${box.height}px`,
            '--band-hue': `${activity.hue}deg`,
            '--label-size': `${box.labelPx}px`,
            '--hours-size': `${box.hoursPx}px`,
          } as React.CSSProperties}
        >
          <span className={styles.spine} />
          <span className={styles.fill} />
          {box.labelled ? (
            <span className={styles.labels}>
              <span className={styles.bandLabel}>{copyOf(pack, activity.label)}</span>
              <span className={styles.bandHours}>
                {formatAmount(hours)} {hoursUnit}
              </span>
            </span>
          ) : null}
        </div>
      ))}

      {remaining > 0 ? (
        <Unallocated pack={pack} top={total * perHour} height={remaining * perHour} />
      ) : null}

      <Ruler perHour={perHour} />

      <div className={styles.hits}>
        {boxes.map(({ band: { id, activity }, ...box }) => (
          <button
            key={id}
            type="button"
            className={styles.hit}
            data-hit={id}
            style={{ top: `${box.hitTop}px`, height: `${box.hitHeight}px`, zIndex: box.hitZ }}
            onClick={() => onSelect?.(id)}
          >
            <span className={styles.hitName}>{copyOf(pack, activity.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
