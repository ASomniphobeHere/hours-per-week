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
 * Four layers, bottom to top: the bands, §7.6's rim and stripes, the ruler over
 * their spines (AC 18), and the transparent hit overlays (§7.4). The bands themselves take no
 * pointer events; the overlays are the tap targets, and they are sized and
 * ordered so a 0.25 h band is as easy to hit as an 8 h one (AC 21).
 *
 * `settling` and `emerging` are §8.1's 200 ms close animation, and they arrive
 * together. The editor freezes this stack while a sheet is up and releases it
 * on close with `settling` on, which is what turns a re-layout into a movement
 * the participant can follow. `emerging` names the activities that are about
 * to arrive from Not included (§7.7): they are laid out at zero height in the
 * frozen frame purely so they have somewhere to grow from, and a zero-height
 * band still gets no tap target.
 */

import { useMemo } from 'react';
import type { Activity, DayType } from '@/lib/domain/types';
import { HOURS_PER_DAY } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { hoursOf } from '@/lib/domain/totals';
import { copyOf } from '@/lib/pack/copy';
import { formatAmount } from '@/components/participant/fields/format';
import { layoutBands, stackHours } from './geometry';
import { Overflow } from './Overflow';
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
  /** Opens the band's sheet. */
  onSelect?: (activityId: string) => void;
  /** Run the §8.1 close animation on this render's geometry. */
  settling?: boolean;
  /** Ids to lay out even at zero hours, so they can grow from nothing (§7.7). */
  emerging?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

export function Stack({
  pack,
  bands,
  dayType,
  perHour,
  onSelect,
  settling = false,
  emerging = NONE,
}: StackProps) {
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
        .filter((entry) => entry.hours > 0 || emerging.has(entry.id)),
    [bands, dayType, emerging],
  );

  const total = present.reduce((sum, entry) => sum + entry.hours, 0);
  const containerHeight = stackHours(total) * perHour;
  const boxes = layoutBands(present, perHour);

  const remaining = HOURS_PER_DAY - total;
  const hoursUnit = copyOf(pack, 'unit.hours');

  return (
    <div
      className={`${styles.stack}${settling ? ` ${styles.settling}` : ''}`}
      data-testid="stack"
      data-daytype={dayType}
      data-settling={settling ? 'true' : undefined}
      style={{ height: `${containerHeight}px` }}
    >
      {boxes.map(({ band: { id, activity, hours }, ...box }) => (
        <div
          key={id}
          /*
           * `locked` rather than an id: it is the domain's own marker for a
           * band the participant did not choose and cannot remove (§3.3), and
           * a stylesheet keyed on the string 'school' would be a second
           * definition of which activity that is.
           */
          className={`${styles.band}${activity.locked ? ` ${styles.bandLocked}` : ''}`}
          data-activity={id}
          data-locked={activity.locked ? 'true' : undefined}
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
          {/*
            * The label always renders — §7.5 makes it the band's only
            * identification, and a band with no name is unusable in greyscale.
            * The hour count is what a thin band drops: the toggle and the sheet
            * header both restate it, and the label is restated nowhere.
            */}
          <span className={styles.labels}>
            <span className={styles.bandLabel}>{copyOf(pack, activity.label)}</span>
            {box.showsHours ? (
              <span className={styles.bandHours}>
                {formatAmount(hours)} {hoursUnit}
              </span>
            ) : null}
          </span>
        </div>
      ))}

      {remaining > 0 ? (
        <Unallocated pack={pack} top={total * perHour} height={remaining * perHour} />
      ) : null}

      {/* Under the ruler in the paint order, so the ticks stay legible over a
          striped region — §7.3's contrast is measured against the hues, and a
          red field laid over the numbers would put it back in question. */}
      <Overflow perHour={perHour} total={total} />

      <Ruler perHour={perHour} />

      <div className={styles.hits}>
        {/* A band with no height has no tap target: §7.7 moved zero-hour
            activities out of the stack precisely so there is nothing to aim
            at, and an emerging band is not there yet. */}
        {boxes
          .filter(({ band }) => band.hours > 0)
          .map(({ band: { id, activity }, ...box }) => (
          <button
            key={id}
            type="button"
            className={styles.hit}
            data-hit={id}
            style={{ top: `${box.hitTop}px`, height: `${box.hitHeight}px` }}
            onClick={() => onSelect?.(id)}
          >
            <span className={styles.hitName}>{copyOf(pack, activity.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
