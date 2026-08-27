'use client';

/**
 * The facilitator console (§6.2). One screen, one button.
 *
 * It exists to answer a single question — *has enough of the room finished?* —
 * and to act on the answer. It holds no local state worth the name: everything
 * on screen comes from the last poll, which is what makes AC 56 true by
 * construction rather than by a restore path. Reloading at any moment shows
 * the same screen again from the next response.
 *
 * Strings are hardcoded. §9's copy table is the participant's, and no `fac.*`
 * keys exist in the pack: this is operator tooling for one known person, and
 * a pack key per label would be indirection with no second audience behind it.
 *
 * **Poll failure keeps the numbers.** §6.2.3 makes this the deliberate
 * opposite of the S3 rule (§6.3): a stale hold screen worries a participant
 * for nothing, but a stale console misleads someone about to force-advance a
 * room from the figures in front of them. The last values stay, dimmed, under
 * a reconnecting note (AC 52).
 */

import { useEffect, useRef, useState } from 'react';
import { ApiError, type FetchLike } from '@/lib/api/client';
import { openRoomStage, type RoomStatus } from '@/lib/console/client';
import { startStatusPoll, type StatusPoll } from '@/lib/console/poll';
import { STAGE_ORDER, type OpenLevel } from '@/lib/domain/types';
import { StageButton } from './StageButton';
import styles from './console.module.css';

const DEFAULT_FETCH: FetchLike = (input, init) => fetch(input, init);

/** The gate level that opens the reveal (plan 25 §E.4). */
const REVEAL_LEVEL: OpenLevel = 2;

export interface ConsoleProps {
  roomId: string;
  fetchImpl?: FetchLike;
}

export function Console({ roomId, fetchImpl = DEFAULT_FETCH }: ConsoleProps) {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [stale, setStale] = useState(false);
  const [missing, setMissing] = useState(false);
  const poll = useRef<StatusPoll | null>(null);

  useEffect(() => {
    const handle = startStatusPoll({
      roomId,
      fetchImpl,
      onStatus: (next) => {
        setStatus(next);
        setStale(false);
        setMissing(false);
      },
      onFailure: (error) => {
        // A 404 before the first successful poll is a bad URL, not a bad
        // network, and it is the one failure worth naming: dimming values
        // that never existed would leave a facilitator staring at nothing.
        if (error instanceof ApiError && error.status === 404) {
          setMissing(true);
          return;
        }
        setStale(true);
      },
      // The poll owns the interval; re-polling immediately after the flip is
      // what keeps the Stage open state from waiting out the remainder of one.
    });
    poll.current = handle;
    return () => {
      handle.stop();
      poll.current = null;
    };
  }, [roomId, fetchImpl]);

  // One button still, opening straight to the reveal. The second gate and its
  // own sequence are plan 25 §E.8; §E.4 only changed what the press says.
  const open = async (): Promise<void> => {
    await openRoomStage(roomId, REVEAL_LEVEL, fetchImpl);
    poll.current?.refresh();
  };

  if (missing) {
    return (
      <main className={styles.console}>
        <p className={styles.note} data-testid="console-missing">
          No room with that id.
        </p>
      </main>
    );
  }

  if (status === null) {
    return (
      <main className={styles.console}>
        <p className={styles.note} data-testid="console-connecting">
          Connecting…
        </p>
      </main>
    );
  }

  return (
    <main className={styles.console} data-testid="console">
      <div
        className={`${styles.values} ${stale ? styles.stale : ''}`}
        data-testid="console-values"
        data-stale={stale ? 'true' : 'false'}
      >
        <div className={styles.room}>
          <p className={styles.roomLabel}>Room</p>
          <p className={styles.joinCode} data-testid="console-joincode">
            {status.joinCode}
          </p>
        </div>

        <div className={styles.ready}>
          <p className={styles.readyCount} data-testid="console-ready">
            {status.ready} / {status.total}
          </p>
          <p className={styles.readyLabel}>ready</p>
        </div>

        <div className={styles.stages}>
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className={styles.stage}>
              <span className={styles.stageLabel}>{stage.toUpperCase()}</span>
              <span className={styles.stageCount} data-testid={`console-stage-${stage}`}>
                {status.inStage[stage]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.action}>
        <StageButton
          total={status.total}
          stageOpen={status.openStage >= REVEAL_LEVEL}
          onOpen={open}
        />
        {stale ? (
          <p className={styles.note} role="status" data-testid="console-reconnecting">
            Reconnecting…
          </p>
        ) : null}
      </div>
    </main>
  );
}
