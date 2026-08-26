'use client';

/**
 * S2 — the editor. §7's chrome around §7's stack.
 *
 * Layout is three fixed pieces and one that grows: a header (empty until the
 * S4 reveal fills it), the day-type toggle, the stack, and a footer. Header,
 * toggle and footer are sticky, because §7.1 requires both day totals to be
 * readable at all times and §7.7's count has to stay reachable while the
 * participant is scrolled into an overflowing stack. What is left of the
 * viewport after those three is exactly `24 × pxPerHour` — that is §7.2's
 * formula, and it is measured rather than assumed.
 *
 * Not included sits below the stack, past the 24-hour line, reached by
 * scrolling (AC 29). The stack never shrinks to bring it on screen: the stack
 * owning the viewport is what makes it read as a full day.
 *
 * **The stack is frozen while a sheet is up.** §8.1 wants the changed band
 * animated *on close*, and derivation is live: without a freeze the band has
 * already moved behind the sheet and there is nothing left to animate when it
 * comes down. So the editor snapshots the activities at open, renders that
 * snapshot for as long as the sheet occludes it, and releases it on close with
 * the 200 ms transition on. That is also what carries §7.7's arrival from Not
 * included — the newcomer is in the frozen frame at zero height, so it grows
 * into place rather than appearing on top of its neighbours.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, DayType } from '@/lib/domain/types';
import { DAY_TYPES, STAGE_ORDER } from '@/lib/domain/types';
import { buildStack, visibleActivities } from '@/lib/domain/stack';
import { isNotIncluded, total } from '@/lib/domain/totals';
import { formatCopy } from '@/lib/pack/copy';
import { useParticipant } from '@/lib/client/participant';
import { ActivitySheet } from '@/components/sheet/ActivitySheet';
import { DayToggle } from './DayToggle';
import { Stack } from './Stack';
import { NotIncluded } from './NotIncluded';
import { Options } from './Options';
import { BAND_TRANSITION_MS } from './geometry';
import { useEditorGeometry } from './useEditorGeometry';
import styles from './stack.module.css';

export interface EditorProps {
  /** Filled by the S4 reveal (Stage 7). Empty chrome takes no vertical space. */
  header?: React.ReactNode;
  /** Finish at S2, Confirm at S4 (Stages 6 and 7). */
  footer?: React.ReactNode;
}

const NONE: ReadonlySet<string> = new Set();

export function Editor({ header, footer }: EditorProps) {
  const { index, session, activities, patch, reset } = useParticipant();
  const pack = index.pack;

  // §3.3 — school exists from S4 onward and nowhere earlier.
  const includeLocked = STAGE_ORDER.indexOf(session.stage) >= STAGE_ORDER.indexOf('s4');
  const visible = useMemo(
    () => visibleActivities(activities, { includeLocked }),
    [activities, includeLocked],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  /** The activities as they stood when the sheet went up, or null when none is. */
  const [frozen, setFrozen] = useState<Activity[] | null>(null);
  const [settling, setSettling] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const openSheet = useCallback(
    (activityId: string) => {
      // Restored on close, so a keyboard participant is put back on the band
      // they opened rather than at the top of the document.
      returnFocus.current = document.activeElement as HTMLElement | null;
      setFrozen(visible);
      setOpenId(activityId);
    },
    [visible],
  );

  const closeSheet = useCallback(() => {
    setOpenId(null);
    setFrozen(null);
    setSettling(true);
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), BAND_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  const source = frozen ?? visible;

  /*
   * Activities that have hours now but had none when the sheet went up — §7.7's
   * move from Not included into the stack. They are laid out in the frozen
   * frame at their frozen zero height, which is the only reason they are named
   * at all; once the frame is released they are ordinary bands.
   */
  const emerging = useMemo<ReadonlySet<string>>(() => {
    if (frozen === null) return NONE;
    const before = new Map(frozen.map((activity) => [activity.id, activity]));
    return new Set(
      visible
        .filter((activity) => {
          const was = before.get(activity.id);
          return was !== undefined && isNotIncluded(was) && !isNotIncluded(activity);
        })
        .map((activity) => activity.id),
    );
  }, [frozen, visible]);

  const { bands, notIncluded } = useMemo(
    () => buildStack(source, { includeLocked: true }),
    [source],
  );

  const stackBands = useMemo(
    () =>
      emerging.size === 0
        ? bands
        : source.filter((activity) => !isNotIncluded(activity) || emerging.has(activity.id)),
    [bands, source, emerging],
  );

  const totals = useMemo(
    () =>
      Object.fromEntries(DAY_TYPES.map((dt) => [dt, total(source, dt)])) as Record<
        DayType,
        number
      >,
    [source],
  );

  const { perHour, headerRef, toggleRef, footerRef } = useEditorGeometry();

  const listRef = useRef<HTMLElement | null>(null);
  const scrollToList = useCallback(() => {
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    listRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const selectDay = useCallback((dayType: DayType) => patch({ dayType }), [patch]);

  return (
    <main className={styles.editor}>
      {/* Fixed to the right edge, so it takes no part in the geometry below (§7.9). */}
      <Options pack={pack} onReset={reset} />

      <div className={styles.chrome}>
        <header ref={headerRef as React.Ref<HTMLElement>} className={styles.header}>
          {header}
        </header>
        <div ref={toggleRef as React.Ref<HTMLDivElement>}>
          <DayToggle
            pack={pack}
            totals={totals}
            selected={session.dayType}
            onSelect={selectDay}
          />
        </div>
      </div>

      <div className={styles.body}>
        <Stack
          pack={pack}
          bands={stackBands}
          dayType={session.dayType}
          perHour={perHour}
          onSelect={openSheet}
          settling={settling}
          emerging={emerging}
        />
        <NotIncluded
          pack={pack}
          activities={notIncluded}
          listRef={listRef}
          onSelect={openSheet}
        />
      </div>

      <footer
        ref={footerRef as React.Ref<HTMLElement>}
        className={styles.footer}
        data-testid="editor-footer"
      >
        {footer}
        {notIncluded.length > 0 ? (
          <button
            type="button"
            className={styles.notIncludedCount}
            data-testid="not-included-count"
            onClick={scrollToList}
          >
            {formatCopy(pack, 'band.notIncludedCount', { count: notIncluded.length })}
          </button>
        ) : null}
      </footer>

      {openId === null ? null : <ActivitySheet activityId={openId} onClose={closeSheet} />}
    </main>
  );
}
