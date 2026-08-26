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
 *
 * **S4 is three screens, and only the third is the editor** (§8.3,
 * AC 37a): the commitment, the pace, then the stack with school in it. The
 * first two are steps within one stage rather than stages of their own — §2.2's
 * machine has five members and the console counts sessions in them (§6.2.2),
 * so a sixth would be a stage the server has no column for. Which of the three
 * is on screen is read off the schedule rather than held in a second persisted
 * field: school is a `locked` activity with no estimator and no questions, so
 * the only way it can carry a value the participant authored is the pace
 * screen's commit. A refresh mid-rebalance therefore returns to the stack, and
 * a refresh on the reveal returns to the reveal — which is right, because the
 * commitment is a thing to have read rather than work to have done.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { S3_HOLD_MS } from '@/lib/domain/types';
import { buildSnapshot } from '@/lib/domain/snapshot';
import { isFullyDerived } from '@/lib/domain/derive';
import { fits } from '@/lib/domain/totals';
import { startStagePoll } from '@/lib/session/poll';
import { deliverComplete, deliverReady, type Delivery } from '@/lib/session/deliver';
import type { FetchLike } from '@/lib/session/client';
import { useParticipant } from '@/lib/client/participant';
import { Editor } from '@/components/stack/Editor';
import { Confirm } from '@/components/stack/Confirm';
import { Finish } from '@/components/stack/Finish';
import { Hold } from './Hold';
import { Intro } from './Intro';
import { Pace } from './Pace';
import { Questionnaire } from './Questionnaire';
import { Reveal } from './Reveal';
import styles from './participant.module.css';

const DEFAULT_FETCH: FetchLike = (input, init) => fetch(input, init);

export interface StagesProps {
  /** Injected by tests; the platform's `fetch` otherwise. */
  fetchImpl?: FetchLike;
}

export function Stages({ fetchImpl = DEFAULT_FETCH }: StagesProps) {
  const { index, session, activities, patch, advance, record, setWeekly } = useParticipant();
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

  /**
   * §7.1 — entry to S4 forces the day-type selection to `wd`, the only stage
   * transition that touches view state. School is workday-only, so a
   * participant sitting on the weekend segment would experience the reveal as
   * nothing happening.
   *
   * It runs *at the transition*, not on every render at S4 and not on a resume
   * into it. Forcing it at S4 broadly would pin the toggle to the workday and
   * take §8.3's weekend cause off the table; forcing it on a refresh would
   * cost AC 15 the selection it promises survives one. The toggle is live from
   * the moment the stack is reached, which is what AC 37 asks for.
   */
  const enterReveal = useCallback(() => {
    patch({ dayType: 'wd' });
    advance('s4');
  }, [patch, advance]);

  /** §6.3's floor, applied identically to all three entry paths (AC 33). */
  useEffect(() => {
    if (stage !== 's3' || !stageOpen) return;
    const remaining = S3_HOLD_MS - (Date.now() - heldSince);
    // Already spent — the flag arrived long after the hold began, which is the
    // ordinary case for anyone who finished early. Nothing is owed, so nothing
    // is deferred.
    if (remaining <= 0) {
      enterReveal();
      return;
    }
    const timer = setTimeout(enterReveal, remaining);
    return () => clearTimeout(timer);
  }, [stage, stageOpen, heldSince, enterReveal]);

  /* ── S4 (§8.3, §8.4) ──────────────────────────────────────────────────── */

  const school = useMemo(() => activities.find((activity) => activity.locked), [activities]);

  /** True once the pace screen has committed a level — see the docblock. */
  const committed = school !== undefined && !isFullyDerived(session.authored, school.id);

  /** Which reveal screen is up before the commit. Not persisted, and not owed. */
  const [revealed, setRevealed] = useState(false);

  const fitsNow = fits(activities);
  const wasFitting = useRef(false);

  /**
   * §10's `fits`, at the transition into fitting and not on the renders that
   * follow it.
   *
   * Emitted on every false → true crossing rather than the first alone: a
   * participant who fits, keeps adjusting, breaches again and refits has done
   * the thing twice, and *time to fit* is read off the first of them by
   * whoever reads the log. The guard on `committed` is what keeps a crossing
   * caused by the reveal itself in the record — a slack-rich participant
   * (§8.4, AC 45) arrives at the stack already fitting, and that arrival is
   * their crossing.
   */
  useEffect(() => {
    if (stage !== 's4' || !committed) return;
    if (fitsNow === wasFitting.current) return;
    wasFitting.current = fitsNow;
    if (fitsNow) record({ t: Date.now(), type: 'fits' });
  }, [stage, committed, fitsNow, record]);

  /**
   * §8.4 — confirm. The complete snapshot is what the debrief takes every
   * per-activity delta against (§10), so it is delivered on the same persistent
   * terms `/ready` is, and the participant moves on the same tick.
   */
  const confirm = useCallback(() => {
    const t = Date.now();
    const schedule = buildSnapshot({
      kind: 'complete',
      activities,
      packVersion: pack.version,
      t,
    });
    record({ t, type: 'complete' });
    delivery.current?.cancel();
    delivery.current = deliverComplete({ credentials, schedule, fetchImpl });
    advance('s5');
  }, [activities, pack.version, record, credentials, fetchImpl, advance]);

  if (!session.introSeen) {
    return <Intro pack={pack} onContinue={() => patch({ introSeen: true })} />;
  }

  if (stage === 's1') return <Questionnaire onComplete={() => advance('s2')} />;
  if (stage === 's3') return <Hold pack={pack} />;

  /*
   * S5 — done (§2.2). Nothing is drawn: §9's table names no `s5` key and the
   * spec describes no screen, so anything here would be a string the client
   * invented rather than content the pack owns. §10.4's debrief is what
   * eventually lands on this stage.
   */
  if (stage === 's5') return <main className={styles.page} data-testid="done" />;

  /*
   * The two reveal screens, and the stack on neither of them (AC 37a). A pack
   * with no `locked` activity has no commitment to reveal and goes straight to
   * the stack — the reveal is content like everything else, and a client that
   * insisted on it would refuse to run a pack that dropped school.
   */
  if (stage === 's4' && school !== undefined && !committed) {
    if (!revealed) return <Reveal pack={pack} onContinue={() => setRevealed(true)} />;
    return (
      <Pace
        pack={pack}
        activity={school}
        onCommit={(weeklyHours) =>
          // Measured against the floor, so the default pace logs nothing and a
          // raised one logs the decision (§10, step 7.2).
          setWeekly(school.id, weeklyHours, school.constraint?.minWeekly ?? 0)
        }
      />
    );
  }

  // S2's editor and S4's. The editor owns the sheet a band tap opens (§8.1),
  // so nothing about the replay surfaces here; only the footer control differs
  // between the two.
  const footer =
    stage === 's2' ? (
      <Finish pack={pack} onFinish={() => enterHold(false)} />
    ) : (
      <Confirm pack={pack} enabled={fitsNow} onConfirm={confirm} />
    );
  return <Editor footer={footer} />;
}
