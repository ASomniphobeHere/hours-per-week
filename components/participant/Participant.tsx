'use client';

/**
 * The participant client's boot: join or resume, and nothing else.
 *
 * Boot is §5 and AC 36 in three lines: look for a stored session, resume it if
 * there is one, and only mint a new one from a join code when there is not.
 * `total` on the facilitator console counts session rows (§6.2.2), so a refresh
 * that calls `POST /session` again inflates the one number the facilitator's
 * decision rests on.
 *
 * The pack is the bundled v1 pack. §4.1 fetches it from `packUrl` at session
 * start so content can be replaced without a client release; the fetch, its
 * three backed-off retries and the last-good cache are §11's, and land with
 * Stage 11. Nothing above this line assumes which of the two produced it.
 *
 * §2.2's stage machine begins one level down, in `Stages`. It is separated
 * because the two answer different questions: this file decides *whose*
 * session is on the phone, and that decision is settled before any stage
 * exists — a reset replaces the session, and remounting the provider on its id
 * is what stops the new one inheriting the old one's state.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { v1Index } from '@/lib/pack/v1';
import { fieldIds } from '@/lib/pack';
import { browserStorage, restore, type PersistedState, type StorageLike } from '@/lib/store/persist';
import { ensureSession, resetToNewSession } from '@/lib/session/bootstrap';
import { ParticipantProvider } from '@/lib/client/participant';
import { Join } from './Join';
import { Stages } from './Stages';

/** A session in hand: the restored record, or the one a join just created. */
interface Ready {
  state: PersistedState;
  storage: StorageLike;
}

const index = v1Index();
const pack = index.pack;
const identity = { version: pack.version, fieldIds: fieldIds(pack) };

/**
 * Hydration, as an external store. `localStorage` does not exist on the server,
 * so the first pass has nothing to say about which session this is; this is the
 * subscription-free way to ask "am I on the client yet" without a state update
 * inside an effect, which would cost a cascading render on every boot.
 */
const NO_SUBSCRIPTION = () => () => {};

export function Participant() {
  const hydrated = useSyncExternalStore(
    NO_SUBSCRIPTION,
    () => true,
    () => false,
  );
  /*
   * Boxed, so "no override yet" and "overridden to nothing" are distinguishable.
   * A join overrides the restored record with a new session; a reset that
   * cannot mint one overrides it with `null`, and an unboxed `Ready | null`
   * would fall straight back through to the stale record `restored` still
   * holds — resuming the session the participant just destroyed.
   */
  const [override, setOverride] = useState<{ value: Ready | null } | null>(null);

  /*
   * §5's restore. It writes back on a pack-version change — pruning answers to
   * the field ids that still exist — which makes it idempotent rather than
   * pure: running it twice prunes an already-pruned map to itself.
   */
  const restored = useMemo<Ready | null>(() => {
    if (!hydrated) return null;
    const storage = browserStorage();
    if (storage === null) return null;
    const result = restore(storage, identity);
    return result === null ? null : { state: result.state, storage };
  }, [hydrated]);

  const join = useCallback(async (joinCode: string): Promise<void> => {
    const storage = browserStorage();
    if (storage === null) throw new Error('no storage: a session cannot survive a refresh');
    const result = await ensureSession({
      storage,
      pack: identity,
      joinCode,
      fetchImpl: (input, init) => fetch(input, init),
    });
    setOverride({ value: { state: result.state, storage } });
  }, []);

  const ready = override === null ? restored : override.value;

  /*
   * §5's reset. `resetToNewSession` clears local state only once the server has
   * confirmed the delete, so a rejection here has destroyed nothing and the
   * participant can tap again; `null` back means even the reset could not be
   * authorised, and the join screen is the only honest place left to go.
   */
  const reset = useCallback(async (): Promise<void> => {
    if (ready === null) return;
    const next = await resetToNewSession({
      storage: ready.storage,
      state: ready.state,
      fetchImpl: (input, init) => fetch(input, init),
    });
    setOverride({ value: next === null ? null : { state: next, storage: ready.storage } });
  }, [ready]);

  if (!hydrated) return <main />;
  if (ready === null) return <Join pack={pack} onJoin={join} />;

  return (
    /*
     * Keyed by session id, so a reset remounts the provider rather than
     * patching it. `initial` seeds `useState` once; without the key the new
     * session's empty answer map would never reach the tree.
     */
    <ParticipantProvider
      key={ready.state.sessionId}
      index={index}
      initial={ready.state}
      storage={ready.storage}
      reset={reset}
    >
      <Stages />
    </ParticipantProvider>
  );
}
