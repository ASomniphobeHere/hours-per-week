'use client';

/**
 * §2.2's stage machine, and the three §6.3 entry paths into S3.
 *
 * ```
 * S1 questionnaire ──Finish──> S3 hold ──flag──> S4 reveal
 *        │                        ▲                  │
 *        └──> S2 editor ──────────┘                  └──> S5 done
 *               ▲   │
 *               └───┘  (band tap → replay questions)
 * ```
 *
 * Two facts about time govern everything here.
 *
 * **The flag is the facilitator's and the hold is the participant's.** Finish
 * marks a participant ready and does not advance anyone (AC 32); the flag
 * opens the reveal for the room. Neither alone gets a participant to S4 —
 * every path waits for both, and for the 5 s floor besides.
 *
 * **The floor is measured on this client, in memory.** §11 restarts it on a
 * refresh during S3, so persisting the entry time would be a bug rather than a
 * feature: the beat exists to let someone stop editing and look up, and a
 * participant who has just reloaded has not had it.
 *
 * The poll runs through S1 and S2 as well as S3, because force-advance (§6.3)
 * is a thing that happens *to* a participant who is still answering questions.
 * It stops at S4: the one boolean it watches only ever goes one way, and there
 * is nothing left to react to.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { S3_HOLD_MS } from '@/lib/domain/types';
import { buildSnapshot } from '@/lib/domain/snapshot';
import { startStagePoll } from '@/lib/session/poll';
import { deliverReady, type Delivery } from '@/lib/session/deliver';
import type { FetchLike } from '@/lib/session/client';
import { useParticipant } from '@/lib/client/participant';
import { Editor } from '@/components/stack/Editor';
import { Finish } from '@/components/stack/Finish';
import { Hold } from './Hold';
import { Intro } from './Intro';
import { Questionnaire } from './Questionnaire';

const DEFAULT_FETCH: FetchLike = (input, init) => fetch(input, init);

export interface StagesProps {
  /** Injected by tests; the platform's `fetch` otherwise. */
  fetchImpl?: FetchLike;
}

export function Stages({ fetchImpl = DEFAULT_FETCH }: StagesProps) {
  const { index, session, activities, patch, advance, record } = useParticipant();
  const pack = index.pack;
  const { stage, sessionId, token } = session;

  /**
   * The flag as last polled, and whether this client has ever seen it false.
   *
   * The pair is what separates §6.3's third row from §11's late joiner, which
   * the spec states as two rules that read as one contradiction. §6.3
   * force-advances a participant "still in S1 or S2 **when the flag flips**";
   * §11 gives a participant who *joins* with the flag already true a full
   * S1 → S2 "at their own pace". Both hold if force-advance keys off the
   * observed false → true transition rather than off a truthy reading: someone
   * who was in the room when the facilitator opened the stage is pulled
   * forward, and someone who arrived afterwards is never yanked out of a
   * question they are in the middle of. Decided with the user, 2026-08-26.
   */
  const [stageOpen, setStageOpen] = useState(false);
  const sawClosed = useRef(false);

  /** When *this client* entered S3. Never persisted — see the docblock. */
  const [heldSince, setHeldSince] = useState(() => Date.now());

  /** One `/ready` per participant, whichever path got them here. */
  const readied = useRef(false);
  const delivery = useRef<Delivery | null>(null);

  const credentials = useMemo(() => ({ sessionId, token }), [sessionId, token]);

  const watching = stage === 's1' || stage === 's2' || stage === 's3';

  useEffect(() => {
    if (!watching) return;
    const poll = startStagePoll({
      credentials,
      fetchImpl,
      onStage: (open) => {
        if (!open) sawClosed.current = true;
        setStageOpen(open);
      },
    });
    return () => poll.stop();
  }, [watching, credentials, fetchImpl]);

  useEffect(() => () => delivery.current?.cancel(), []);

  /**
   * The one way into S3, from both the button and the flag.
   *
   * The transition does not wait on the network. §6.3's floor is a beat in the
   * room rather than a request, and a phone that sat on the editor until a
   * POST returned would be exactly the pause the spec is careful to avoid — so
   * the snapshot is handed to a delivery that retries in the background
   * (`deliverReady`) and the participant is moved on the same tick.
   */
  const enterHold = useCallback(
    (forced: boolean) => {
      if (readied.current) return;
      readied.current = true;

      const t = Date.now();
      const schedule = buildSnapshot({
        kind: 'finish',
        activities,
        packVersion: pack.version,
        t,
      });
      // Emitted before the advance, so the log reads the way the run happened:
      // a forced participant did not finish, and the distinction is what
      // separates the two times to fit (§10).
      record({ t, type: forced ? 'forced.advance' : 'finish' });
      delivery.current = deliverReady({ credentials, schedule, fetchImpl });

      setHeldSince(t);
      advance('s3');
    },
    [activities, pack.version, record, credentials, fetchImpl, advance],
  );

  /**
   * §6.3 row 3 — force-advance. Unanswered gates already resolve truthy
   * (§4.2.1 rule 6) and unanswered sections already derive from their field
   * defaults (§4.6), so the snapshot `enterHold` takes is a full stack without
   * anything here reaching into the answer map to make it one.
   */
  useEffect(() => {
    if (!stageOpen || !sawClosed.current) return;
    if (stage !== 's1' && stage !== 's2') return;
    enterHold(true);
  }, [stageOpen, stage, enterHold]);

  /** §6.3's floor, applied identically to all three entry paths (AC 33). */
  useEffect(() => {
    if (stage !== 's3' || !stageOpen) return;
    const remaining = S3_HOLD_MS - (Date.now() - heldSince);
    // Already spent — the flag arrived long after the hold began, which is the
    // ordinary case for anyone who finished early. Nothing is owed, so nothing
    // is deferred.
    if (remaining <= 0) {
      advance('s4');
      return;
    }
    const timer = setTimeout(() => advance('s4'), remaining);
    return () => clearTimeout(timer);
  }, [stage, stageOpen, heldSince, advance]);

  if (!session.introSeen) {
    return <Intro pack={pack} onContinue={() => patch({ introSeen: true })} />;
  }

  if (stage === 's1') return <Questionnaire onComplete={() => advance('s2')} />;
  if (stage === 's3') return <Hold pack={pack} />;

  // S2's editor, and — until Stage 7's reveal lands — S4's. The editor owns
  // the sheet a band tap opens (§8.1), so nothing about the replay surfaces
  // here; only the footer control differs between the two.
  const footer =
    stage === 's2' ? <Finish pack={pack} onFinish={() => enterHold(false)} /> : undefined;
  return <Editor footer={footer} />;
}
