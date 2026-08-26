'use client';

/**
 * §8.1 — the bottom sheet a band tap opens.
 *
 * It rises to 88% of the viewport, dims what is behind it, and is dismissed
 * four ways: the backdrop, Escape, a downward drag past a quarter of its own
 * height, and Done. All four land on the same `onClose`, because §8.1 gives
 * them one meaning — the participant is finished looking at this activity —
 * and the stack's 200 ms settle is the editor's response to it, not the
 * sheet's.
 *
 * **Why the header carries two numbers.** The sheet occludes the stack, so
 * §8.1 puts the activity's current computed total in the header: the number
 * substitutes for the band the participant can no longer see. A section's
 * screens capture both day types at once ("On a workday" beside "On a weekend
 * day"), so one number would sit still while half the controls moved. Both are
 * shown, live, in the toggle's own idiom (§7.1) — decided with the user.
 *
 * **Scroll, not pages.** §8.1: replay is review, and paging through four
 * screens to fix one number is worse than scrolling past three.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Activity, DayType } from '@/lib/domain/types';
import { DAY_TYPES } from '@/lib/domain/types';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf, formatCopy } from '@/lib/pack/copy';
import { formatAmount } from '@/components/participant/fields/format';
import styles from './sheet.module.css';

/** §8.1 — a drag past a quarter of the sheet's height dismisses it. */
export const DRAG_CLOSE_FRACTION = 0.25;

export interface SheetProps {
  pack: ContentPack;
  /** The activity being replayed, with hours as they currently derive. */
  activity: Activity;
  onClose: () => void;
  children: React.ReactNode;
}

/** Focusable descendants, in DOM order — the order Tab has to be held to. */
function focusables(root: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

export function Sheet({ pack, activity, onClose, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  /*
   * Live drag offset, in pixels, and never negative: §8.1 asks for a downward
   * drag, and letting the sheet be pulled up past 88% would be inventing a
   * second height the spec does not have.
   */
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);
  /*
   * How far the drag has actually travelled, kept alongside the state.
   * `dragY` is what the panel is drawn at and is therefore one render behind
   * the pointer; the dismissal threshold has to read the pointer itself, or a
   * flick that crosses the quarter in a single batch is measured at zero.
   */
  const dragged = useRef(0);

  /*
   * §8.1 — the scroll behind the sheet is locked for as long as it is up, so a
   * drag that misses the panel does not move the stack underneath it.
   *
   * Both elements, not just `body`: which of the two is the scrolling box
   * depends on the document, and here it is the root — an overflowing stack
   * (§7.2) scrolls `documentElement`, so hiding the body's overflow alone locks
   * nothing. Neither is given a `position: fixed` in exchange, because that
   * would drop the participant back to the top of a stack they had scrolled
   * into and §8.1 asks for a sheet, not a navigation.
   */
  useEffect(() => {
    const boxes = [document.documentElement, document.body];
    const previous = boxes.map((box) => box.style.overflow);
    for (const box of boxes) box.style.overflow = 'hidden';
    return () => {
      boxes.forEach((box, index) => {
        box.style.overflow = previous[index]!;
      });
    };
  }, []);

  // Focus the first focusable element on open (§8.1). The grabber is a button
  // and comes first, so the participant's first Tab is into the screens rather
  // than out of the sheet.
  useEffect(() => {
    focusables(panelRef.current ?? document.body)[0]?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // The trap. Without it Tab walks out of a modal sheet into the stack
      // underneath, which is inert but still focusable.
      const panel = panelRef.current;
      if (panel === null) return;
      const stops = focusables(panel);
      if (stops.length === 0) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    dragFrom.current = event.clientY;
    dragged.current = 0;
    // Capture keeps the drag with the header once the finger leaves it, which
    // it does immediately — the sheet is being pulled downward past its own
    // edge. Guarded because the drag has to work without it: pointer capture is
    // the refinement, not the mechanism.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragFrom.current === null) return;
    dragged.current = Math.max(0, event.clientY - dragFrom.current);
    setDragY(dragged.current);
  }, []);

  const onPointerUp = useCallback(() => {
    const travelled = dragged.current;
    dragFrom.current = null;
    dragged.current = 0;
    setDragY(0);
    const height = panelRef.current?.getBoundingClientRect().height ?? 0;
    if (height > 0 && travelled > height * DRAG_CLOSE_FRACTION) onClose();
  }, [onClose]);

  const label = copyOf(pack, activity.label);

  return (
    <div className={styles.overlay} data-testid="sheet-overlay">
      {/* Focusable-by-pointer only: Escape is the keyboard's way out, and a
          backdrop in the tab order is a stop that says nothing. */}
      <button
        type="button"
        className={styles.backdrop}
        data-testid="sheet-backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={styles.panel}
        data-testid="sheet"
        data-activity={activity.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dragY === 0 ? undefined : { transform: `translateY(${dragY}px)` }}
      >
        <header
          className={styles.header}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/*
            * The grabber is the drag handle and the first focusable element, so
            * it doubles as the keyboard's Done — a participant who lands here
            * and presses Enter gets the same dismissal a downward drag gives.
            */}
          <button
            type="button"
            className={styles.grabber}
            data-testid="sheet-grabber"
            aria-label={copyOf(pack, 'sheet.done')}
            onClick={onClose}
          />
          <h2 id={titleId} className={styles.title}>
            {label}
          </h2>
          <SheetTotals pack={pack} activity={activity} />
        </header>

        {/* The section's screens, stacked and scrolled — not paged (§8.1). */}
        <div className={styles.content} data-testid="sheet-content">
          {children}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.done}
            data-testid="sheet-done"
            onClick={onClose}
          >
            {copyOf(pack, 'sheet.done')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * The live figure §8.1 asks for, per day type.
 *
 * `toggle.wd`, `toggle.we` and `toggle.hours` rather than three keys of the
 * sheet's own: these are the same two words for the same two day types the
 * toggle behind the sheet is showing, and §9's rule is that no string is
 * hardcoded — not that every surface owns a private copy of one.
 */
function SheetTotals({ pack, activity }: { pack: ContentPack; activity: Activity }) {
  return (
    <p className={styles.totals}>
      {DAY_TYPES.map((dayType: DayType) => (
        <span key={dayType} className={styles.total}>
          <span className={styles.totalLabel}>{copyOf(pack, `toggle.${dayType}`)}</span>
          <span className={styles.totalHours} data-testid={`sheet-total-${dayType}`}>
            {formatCopy(pack, 'toggle.hours', {
              hours: formatAmount(activity[dayType].hours),
            })}
          </span>
        </span>
      ))}
    </p>
  );
}
