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
 */

import { useCallback, useMemo, useRef } from 'react';
import type { DayType } from '@/lib/domain/types';
import { DAY_TYPES, STAGE_ORDER } from '@/lib/domain/types';
import { buildStack, visibleActivities } from '@/lib/domain/stack';
import { total } from '@/lib/domain/totals';
import { formatCopy } from '@/lib/pack/copy';
import { useParticipant } from '@/lib/client/participant';
import { DayToggle } from './DayToggle';
import { Stack } from './Stack';
import { NotIncluded } from './NotIncluded';
import { Options } from './Options';
import { useEditorGeometry } from './useEditorGeometry';
import styles from './stack.module.css';

export interface EditorProps {
  /** Opens an activity's sheet. Wired at Stage 5; a band tap is inert until then. */
  onSelect?: (activityId: string) => void;
  /** Filled by the S4 reveal (Stage 7). Empty chrome takes no vertical space. */
  header?: React.ReactNode;
  /** Finish at S2, Confirm at S4 (Stages 6 and 7). */
  footer?: React.ReactNode;
}

export function Editor({ onSelect, header, footer }: EditorProps) {
  const { index, session, activities, patch, reset } = useParticipant();
  const pack = index.pack;

  // §3.3 — school exists from S4 onward and nowhere earlier.
  const includeLocked = STAGE_ORDER.indexOf(session.stage) >= STAGE_ORDER.indexOf('s4');
  const visible = useMemo(
    () => visibleActivities(activities, { includeLocked }),
    [activities, includeLocked],
  );
  const { bands, notIncluded } = useMemo(
    () => buildStack(visible, { includeLocked: true }),
    [visible],
  );

  const totals = useMemo(
    () =>
      Object.fromEntries(DAY_TYPES.map((dt) => [dt, total(visible, dt)])) as Record<
        DayType,
        number
      >,
    [visible],
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
          bands={bands}
          dayType={session.dayType}
          perHour={perHour}
          onSelect={onSelect}
        />
        <NotIncluded
          pack={pack}
          activities={notIncluded}
          listRef={listRef}
          onSelect={onSelect}
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
    </main>
  );
}
