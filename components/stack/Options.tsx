'use client';

/**
 * §7.9 — the options tab, and the reset behind it.
 *
 * The affordance is a sliver on the right edge, vertically centred: a folder
 * tab three dots wide, sticking out far enough to be found and not far enough
 * to be read as part of the day. The editor's chrome is spoken for — the header
 * fills with the S4 reveal, the footer with the Not included count and Finish —
 * and §7.6's silence rule means nothing may sit near the stack that reads as an
 * alert. The right edge at mid-height is the one place that is neither.
 *
 * It is `position: fixed`, deliberately. §7.2 computes `pxPerHour` from what is
 * left of the viewport after the header, toggle and footer are measured; a tab
 * in flow would enter that measurement and shorten the day by its own width.
 *
 * Reset is two taps and a sentence, because it destroys the session on the
 * server as well as the phone (§5) and there is no undo to offer afterwards.
 *
 * **Where the tab appears** (step 10.7). §7.9 contradicts itself — "Editor
 * only. The tab appears at S2 and after" cannot be both — and the build takes
 * the second sentence: S2, the S4 stack, and S5. At S5 the run is over and
 * there is no other way off the screen, so a phone that finished would
 * otherwise be finished for good, which is wrong in a room where someone wants
 * to run it again and wrong in rehearsal, where a handful of phones drive the
 * same room repeatedly. It is absent from the join screen, the intro, S1, S3
 * and the two reveal screens: S3 is a wait, and a destructive control on a
 * wait is one somebody presses out of boredom; the reveal screens are a
 * decision being made.
 *
 * §7.9 requires the confirmation to name what is lost, and at S5 that is not
 * what is lost mid-run — the finished result goes with the answers. Hence
 * `bodyKey`, which S5 points at `options.reset.body.complete`.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import styles from './options.module.css';

/** Menu first, confirmation second — the destructive step is never the first tap. */
type View = 'menu' | 'confirm';

export interface OptionsProps {
  pack: ContentPack;
  /**
   * Destroys this session server-side and starts a fresh one (§5). Rejects on a
   * network failure, in which case nothing has been destroyed and the
   * participant can simply tap again.
   */
  onReset: () => Promise<void>;
  /**
   * Which sentence the confirmation states. Defaults to §7.9's mid-run one;
   * S5 passes `options.reset.body.complete`, because a reset there also
   * removes a completed run from the room (step 10.7).
   */
  bodyKey?: string;
}

export function Options({ pack, onReset, bodyKey = 'options.reset.body' }: OptionsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const tabRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setView('menu');
    setFailed(false);
    tabRef.current?.focus();
  }, []);

  // Escape closes from anywhere in the panel, including mid-failure. It does
  // not interrupt a reset in flight: the request is already with the server.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, close]);

  // Focus moves into the panel on open so the menu is reachable by keyboard
  // and announced by a screen reader as the thing that just appeared.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector('button')?.focus();
  }, [open, view]);

  const confirm = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onReset();
      // On success this component is unmounted with the rest of the editor —
      // the new session boots at S1 — so there is no state left to restore.
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, [onReset]);

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        className={styles.tab}
        data-testid="options-tab"
        aria-label={copyOf(pack, 'options.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <div className={styles.overlay} data-testid="options-overlay">
          {/*
            * A backdrop button rather than a click handler on a div: the panel
            * is dismissible by pointer and by keyboard, and a bare div is
            * neither focusable nor announced. It is hidden from the
            * accessibility tree because Escape already serves that role there.
            */}
          <button
            type="button"
            className={styles.backdrop}
            data-testid="options-backdrop"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => {
              if (!busy) close();
            }}
          />

          <div
            ref={panelRef}
            id={panelId}
            className={`${styles.panel} ${view === 'menu' ? styles.menu : styles.confirmPanel}`}
            role={view === 'confirm' ? 'dialog' : 'menu'}
            aria-modal={view === 'confirm' ? true : undefined}
            aria-label={view === 'menu' ? copyOf(pack, 'options.open') : undefined}
            aria-labelledby={view === 'confirm' ? `${panelId}-title` : undefined}
          >
            {view === 'menu' ? (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                data-testid="options-reset"
                onClick={() => setView('confirm')}
              >
                {copyOf(pack, 'options.reset')}
              </button>
            ) : (
              <div className={styles.confirm}>
                <p id={`${panelId}-title`} className={styles.confirmTitle}>
                  {copyOf(pack, 'options.reset.title')}
                </p>
                <p className={styles.confirmBody}>{copyOf(pack, bodyKey)}</p>
                {failed ? (
                  <p className={styles.error} role="alert" data-testid="options-error">
                    {copyOf(pack, 'options.reset.failed')}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.cancel}
                    data-testid="options-cancel"
                    disabled={busy}
                    onClick={close}
                  >
                    {copyOf(pack, 'options.reset.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.destructive}
                    data-testid="options-confirm"
                    disabled={busy}
                    onClick={() => void confirm()}
                  >
                    {copyOf(pack, 'options.reset.confirm')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
