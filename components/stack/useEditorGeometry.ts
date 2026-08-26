'use client';

/**
 * The measured half of §7.2: viewport height, and the height of the three
 * pieces of chrome the stack does not get.
 *
 * The chrome is measured rather than read from tokens. `--header-h` and friends
 * exist and are honoured as `min-height`, but the footer grows a Finish button
 * at Stage 6 and the header a reveal banner at Stage 7, and a stack sized from
 * a token the chrome has outgrown puts the 24-hour line somewhere other than
 * where the ruler says it is.
 *
 * `useLayoutEffect` rather than `useEffect`: the first measurement has to land
 * before paint or every band is drawn at zero height for a frame. The editor
 * renders only after the participant shell has hydrated, so this never runs on
 * the server.
 */

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pxPerHour, type ChromeHeights } from './geometry';

/** Observes an element's border-box height. Null ref, or no element, reads 0. */
function useMeasuredHeight(): [React.RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const read = () => setHeight(element.getBoundingClientRect().height);
    read();

    // jsdom has no ResizeObserver; a component test measures once and that is
    // the whole of what a component test can observe about layout anyway.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
}

/**
 * The viewport, as an external store rather than state kept in sync by an
 * effect — `window.innerHeight` is exactly that, something React does not own.
 *
 * Orientation change fires without a resize on some mobile browsers, and a
 * resize without an orientation change on every desktop one (§7.2).
 */
function subscribeViewport(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

function readViewport(): number {
  return window.innerHeight;
}

export interface EditorGeometry extends ChromeHeights {
  /** §7.2's `pxPerHour`. Zero until the first measurement lands. */
  perHour: number;
  headerRef: React.RefObject<HTMLElement | null>;
  toggleRef: React.RefObject<HTMLElement | null>;
  footerRef: React.RefObject<HTMLElement | null>;
}

export function useEditorGeometry(): EditorGeometry {
  const [headerRef, headerH] = useMeasuredHeight();
  const [toggleRef, toggleH] = useMeasuredHeight();
  const [footerRef, footerH] = useMeasuredHeight();

  const viewportHeight = useSyncExternalStore(subscribeViewport, readViewport, () => 0);

  const chrome = { viewportHeight, headerH, toggleH, footerH };
  return { ...chrome, perHour: pxPerHour(chrome), headerRef, toggleRef, footerRef };
}
