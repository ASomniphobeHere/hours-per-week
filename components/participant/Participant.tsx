'use client';

/**
 * The participant client's boot, and the S1 leg of §2.2's stage machine.
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
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { v1Index } from '@/lib/pack/v1';
import { fieldIds } from '@/lib/pack';
import { browserStorage, restore, type PersistedState, type StorageLike } from '@/lib/store/persist';
import { ensureSession } from '@/lib/session/bootstrap';
import { ParticipantProvider, useParticipant } from '@/lib/client/participant';
import { Intro } from './Intro';
import { Join } from './Join';
import { Questionnaire } from './Questionnaire';
import { StackSummary } from './StackSummary';

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
  const [joined, setJoined] = useState<Ready | null>(null);

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
    setJoined({ state: result.state, storage });
  }, []);

  const ready = joined ?? restored;

  if (!hydrated) return <main />;
  if (ready === null) return <Join pack={pack} onJoin={join} />;

  return (
    <ParticipantProvider index={index} initial={ready.state} storage={ready.storage}>
      <Stages />
    </ParticipantProvider>
  );
}

/**
 * S1 only. The Finish button, the S3 hold, the reveal and the rebalance are
 * Stages 4 through 7; `session.stage` is the seam they attach to, and it is
 * already persisted and already restored (§5).
 */
function Stages() {
  const { index: packIndex, session, activities, patch } = useParticipant();

  if (!session.introSeen) {
    return <Intro pack={packIndex.pack} onContinue={() => patch({ introSeen: true })} />;
  }

  if (session.stage === 's1') {
    return <Questionnaire onComplete={() => patch({ stage: 's2' })} />;
  }

  return <StackSummary pack={packIndex.pack} activities={activities} />;
}
