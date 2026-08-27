'use client';

/**
 * §6.2.4 — the arming button.
 *
 * Pressing it does not open the stage. It arms it.
 *
 *   Idle ──press──> Armed ──press──> POST ──> Stage open
 *                     │
 *                     └─ 5 s, no second press ─> Idle
 *
 * **The armed label restates `total`, not `ready`.** The flag force-advances
 * the whole room (§6.3), including everyone who has not finished, and the
 * label names the number about to be acted on: a press at 3/40 should look
 * wrong at the moment of confirming it.
 *
 * **Open is not a state this component decides.** `stageOpen` arrives from the
 * poll (§6.2.3 — the console holds no local state), so a reload lands on the
 * static Stage open state from the next response rather than from anything
 * remembered here (AC 56). A failed POST returns to Idle with an inline error
 * and never to a state implying the stage opened (AC 55).
 *
 * Enabled as soon as the room has one participant, and never gated on a ready
 * threshold: waiting is a facilitation judgement, and a console that refuses
 * to open the stage at 3/40 is wrong about who is running the room.
 */

import { useEffect, useState } from 'react';
import styles from './console.module.css';

/** Armed reverts to idle after this long without a second press. */
export const ARM_MS = 5_000;

export interface StageButtonProps {
  total: number;
  stageOpen: boolean;
  onOpen: () => Promise<void>;
}

type Phase = 'idle' | 'armed' | 'posting' | 'failed';

export function StageButton({ total, stageOpen, onOpen }: StageButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');

  // The disarm timer, re-armed from scratch on every entry to `armed`. There
  // is no armed → armed transition — a press while armed posts — so keying it
  // on the phase alone cannot leave a second press inheriting the remainder of
  // an older five seconds.
  useEffect(() => {
    if (phase !== 'armed') return;
    const timer = setTimeout(() => setPhase('idle'), ARM_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (stageOpen) {
    return (
      <div className={styles.open} data-testid="stage-open">
        Stage open
      </div>
    );
  }

  const press = async (): Promise<void> => {
    if (phase === 'posting') return;
    if (phase !== 'armed') {
      setPhase('armed');
      return;
    }
    setPhase('posting');
    try {
      await onOpen();
      // Deliberately no success state here: `stageOpen` comes back from the
      // poll the parent kicks immediately after this resolves, and the static
      // Stage open state above is what replaces the button.
    } catch {
      setPhase('failed');
    }
  };

  const label =
    phase === 'armed'
      ? `Confirm — opens for ${total} participant${total === 1 ? '' : 's'}`
      : phase === 'posting'
        ? 'Opening…'
        : 'Open the reveal';

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${phase === 'armed' ? styles.armed : ''}`}
        disabled={total === 0 || phase === 'posting'}
        onClick={() => void press()}
        data-testid="stage-button"
        data-phase={phase}
      >
        {label}
      </button>
      {phase === 'failed' ? (
        <p className={styles.error} role="alert" data-testid="stage-error">
          Could not open the stage. Try again.
        </p>
      ) : null}
    </>
  );
}
