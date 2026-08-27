'use client';

/**
 * `/facilitate` — the way into the console (step 8.7).
 *
 * §6.2.1 specifies `POST /room` and gives it no affordance, which left opening
 * a workshop a raw POST and a hand-assembled URL. This is the button.
 *
 * **Creating a room takes one press, not two.** `StageButton` arms because the
 * flip force-advances a whole room and cannot be undone; a room that nobody
 * joins is inert, so a confirm step here would be ceremony. What it does do is
 * disable itself while the request is in flight: a double-press that minted
 * two rooms would have a facilitator reading one code aloud while the console
 * showed another, which is the one failure this screen could introduce.
 *
 * **The list is this browser's, not the server's.** There is no endpoint that
 * enumerates rooms and there must not be one — §6.2.6 accepts an exposure of
 * one boolean in one room, and that argument holds only while `roomId` is
 * unguessable and unlistable (§6.2.1, **RD-2**). So the way back to a room is
 * a note this browser wrote to itself. It shows what it knows — a code and a
 * date — and nothing live: polling every remembered room would cost more than
 * the console does, for a screen that is looked at for two seconds.
 *
 * A row whose room is gone — a deleted database, or Stage 12.4's separate
 * rehearsal file — clicks through to the console's own "No room with that id."
 * That state exists for the facilitator who mistypes a URL, and this is the
 * other way to reach it.
 */

import { useState, useSyncExternalStore } from 'react';
import { type FetchLike } from '@/lib/api/client';
import { createRoom } from '@/lib/console/client';
import {
  forgetRoom,
  rememberRoom,
  roomsSnapshot,
  serverRoomsSnapshot,
  subscribeRooms,
} from '@/lib/console/rooms';
import styles from './console.module.css';

const DEFAULT_FETCH: FetchLike = (input, init) => fetch(input, init);

export interface RoomLauncherProps {
  fetchImpl?: FetchLike;
  /** Injected the way `fetchImpl` is, so the tests need no router. */
  navigate?: (href: string) => void;
}

/**
 * A document navigation, not a client-side one, and the rows below are plain
 * anchors for the same reason. The console is `force-dynamic` and starts its
 * poll on mount, so there is nothing on this screen worth preserving across
 * the move; going through `next/link` and `useRouter` would buy a soft
 * transition on a screen reached once a workshop, and cost every test a router
 * harness for it.
 */
const DEFAULT_NAVIGATE = (href: string): void => window.location.assign(href);

type Phase = 'idle' | 'creating' | 'failed';

const CREATED_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function RoomLauncher({ fetchImpl = DEFAULT_FETCH, navigate }: RoomLauncherProps) {
  const go = navigate ?? DEFAULT_NAVIGATE;

  const [phase, setPhase] = useState<Phase>('idle');

  /*
   * The list is not state this component holds — it is storage, read through
   * the hook built for reading things React does not own. The server has no
   * browser to ask, so it renders none and the real list arrives on hydration;
   * writing it as `useState` + an effect would be the same two renders with a
   * mismatch in between.
   */
  const rooms = useSyncExternalStore(subscribeRooms, roomsSnapshot, serverRoomsSnapshot);

  const create = async (): Promise<void> => {
    if (phase === 'creating') return;
    setPhase('creating');
    try {
      const room = await createRoom(fetchImpl);
      rememberRoom({ roomId: room.roomId, joinCode: room.joinCode, createdAt: Date.now() });
      // Straight to the console. The room's own screen is where the code is
      // read from, and `consoleUrl` is the server's to shape (§6.2.1).
      go(room.consoleUrl);
    } catch {
      setPhase('failed');
    }
  };

  return (
    <main className={styles.console} data-testid="launcher">
      <div className={styles.create}>
        <button
          type="button"
          className={styles.button}
          disabled={phase === 'creating'}
          onClick={() => void create()}
          data-testid="new-room"
        >
          {phase === 'creating' ? 'Opening a room…' : 'New room'}
        </button>
        {phase === 'failed' ? (
          <p className={styles.error} role="alert" data-testid="new-room-error">
            Could not open a room. Try again.
          </p>
        ) : null}
      </div>

      {rooms.length > 0 ? (
        <section className={styles.rooms} data-testid="remembered-rooms">
          <h2 className={styles.roomLabel}>Rooms from this browser</h2>
          <ul className={styles.roomList}>
            {rooms.map((room) => (
              <li key={room.roomId} className={styles.roomRow}>
                <a
                  href={`/facilitate/${room.roomId}`}
                  className={styles.roomLink}
                  data-testid={`remembered-${room.joinCode}`}
                >
                  <span className={styles.roomCode}>{room.joinCode}</span>
                  <span className={styles.roomWhen}>{CREATED_FORMAT.format(room.createdAt)}</span>
                </a>
                <button
                  type="button"
                  className={styles.forget}
                  onClick={() => forgetRoom(room.roomId)}
                  aria-label={`Forget room ${room.joinCode}`}
                  data-testid={`forget-${room.joinCode}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
