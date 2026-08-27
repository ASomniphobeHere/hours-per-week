'use client';

/**
 * The participant's live state: the pack, the session, the answer map, and the
 * schedule derived from them.
 *
 * §5 puts persistence on the write path rather than on a timer — every field
 * change is written through to localStorage — so this provider owns both the
 * React state and the storage record, and they cannot drift. Everything a
 * refresh must not cost (§11) is in the one record: answers, session identity,
 * selected day type, furthest stage.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  AnswerMap,
  DayType,
  Event,
  ScheduleSnapshot,
  StageId,
} from '@/lib/domain/types';
import { DAY_TYPES } from '@/lib/domain/types';
import { clearDirect, derive, isFullyDerived, setDirect } from '@/lib/domain/derive';
import { clampDaily, clampEvent, clampWeekly, weeklyToDaily } from '@/lib/domain/constraints';
import { isAnswered, setAnswer } from '@/lib/store/answers';
import { furthestStage, save, type PersistedState, type StorageLike } from '@/lib/store/persist';
import { buildEstimators } from '@/lib/estimators/registry';
import type { Field } from '@/lib/pack/types';
import type { PackIndex } from '@/lib/pack';

/**
 * The fields of the session record a screen is allowed to move.
 *
 * `stage` is deliberately not among them. §2.2's machine only ever runs
 * forward — S3 → S4 is one-way and nothing re-enters S1 — and §11 resumes a
 * refresh at the *furthest* stage reached, so the one mover is `advance`,
 * which cannot go backwards.
 */
export type SessionPatch = Partial<Pick<PersistedState, 'dayType' | 'introSeen'>>;

export interface Participant {
  index: PackIndex;
  session: PersistedState;
  answers: AnswerMap;
  /** Every pack activity with hours resolved for both day types (§4.4). */
  activities: Activity[];
  answer: (fieldId: string, value: unknown) => void;
  /**
   * Writes the pack default for every one of `fields` still unanswered, in a
   * single storage write.
   *
   * §4.2 gives a field a `default` and §4.2.1 rule 5 has a revealed screen show
   * it — so a participant who agrees with what is on screen and moves on has
   * answered, and the answer map should say so. Without this the advance
   * condition "all screens answered" (§2.2) could never be met by agreement,
   * and §5's resume would send a returning participant back to screen one
   * however far they had got.
   */
  commitDefaults: (fields: readonly Field[]) => void;
  patch: (partial: SessionPatch) => void;
  /**
   * §2.2's one stage mover, and §11's "resume at furthest stage reached".
   *
   * Monotonic: a call naming an earlier stage is a no-op. That is what makes
   * the persisted `stage` a high-water mark rather than a cursor, and it is
   * why S2's band replay — which re-enters S2 from itself — cannot undo a
   * participant's progress by asking for the stage they are already in.
   *
   * `stage.enter` is emitted here rather than at each call site, because an
   * entry that logs nothing is one the server cannot count: §6.2.2 derives
   * `inStage` from these events, and *time to fit* is measured from the S4
   * entry in the log (§10).
   */
  advance: (stage: StageId) => void;
  /**
   * §4.3 rule 4 — the participant set this activity's hours themselves, so the
   * estimator stops running for it.
   *
   * Clamped on the way in (§8.2), and silently: the value is refused, no error
   * copy appears, and a `clamp.hit` goes to telemetry instead. The underlying
   * answers are untouched, which is what makes `revertToDerived` lossless.
   */
  setHours: (activityId: string, dayType: DayType, hours: number) => void;
  /**
   * §8.3's weekly stepper — school's one control, in weekly hours.
   *
   * The level is clamped to the ladder, spread over the day types the
   * constraint allows (5 workdays, nothing at the weekend), and written as the
   * participant's own values. There is no `mode.direct` here: that event says
   * the participant took an activity *off its estimator* (§10), and school has
   * never been on one — it has no questions, no estimator and no derived value
   * to displace.
   *
   * `fromWeekly` is the level the change is measured against, and the pace
   * screen is why it is a parameter. School enters the stack from nothing, so
   * measured against what is on screen every commit is a rise — including the
   * default one nobody chose. §10 reads the pace the participant picked off
   * this event, so the commit passes the floor as its baseline and logs
   * nothing at 20 h; the sheet passes the level it is leaving, and every step
   * there is a real change appearing in cut order like any other (§8.3).
   */
  setWeekly: (activityId: string, weeklyHours: number, fromWeekly: number) => void;
  /**
   * §8.1's "Set directly" — takes the whole activity off its estimator, both
   * day types at once, seeded from what it derives to now.
   *
   * One call rather than two `setHours`, because §8.1 flips *the activity* and
   * §10's `mode.direct` names an activity and no day type: two calls would
   * report the same takeover twice. The seed is clamped like any other direct
   * value, so an activity already below its floor comes up to it here (§8.2).
   */
  takeDirect: (activityId: string) => void;
  /**
   * Undoes `takeDirect` for both day types, so the next pass derives the activity
   * from its answers again (§8.1, AC 26). Not the same as `fallback`: this is
   * the participant handing the estimator back, and it is theirs to hand back.
   */
  revertToDerived: (activityId: string) => void;
  /**
   * §10's event sink.
   *
   * A seam onto the queue (step 10.2), which owns batching, retry and
   * delivery. What every call site owes is that each event is emitted *at its
   * moment* — a clamp that logs nothing as it clamps cannot be recovered
   * afterwards from any amount of state.
   */
  record: (event: Event) => void;
  /**
   * Takes the queue's undelivered events and clears it (step 10.2).
   *
   * `POST /complete` carries a trailing batch (§6.1) so cut order is complete
   * for a participant who confirms between two flushes — the last few
   * `hours.change` events of a rebalance are the ones the debrief most wants,
   * and a queue interval is long enough to lose all of them.
   */
  drainEvents: () => Event[];
  /**
   * Keeps a §10 snapshot on the phone as well as sending it (step 10.6).
   *
   * S5 differences the finish snapshot against the complete one and shows the
   * participant what it cost. Both are already built here and posted; holding
   * them in the persisted record is what lets that screen survive the refresh
   * §11 allows at every stage, and it is the only client state S5 needs.
   */
  recordSnapshot: (snapshot: ScheduleSnapshot) => void;
  /**
   * §5's reset — destroys the session on the server and on the phone, then
   * starts a fresh one in the same room.
   *
   * It is supplied from above rather than implemented here, because what
   * follows a reset is a different session record entirely: this provider is
   * seeded once from `initial`, so the component that owns that value is the
   * one that can replace it. Rejects on a network failure, with nothing
   * destroyed.
   */
  reset: () => Promise<void>;
}

const ParticipantContext = createContext<Participant | null>(null);

export function useParticipant(): Participant {
  const value = useContext(ParticipantContext);
  if (value === null) throw new Error('useParticipant outside a ParticipantProvider');
  return value;
}

export interface ParticipantProviderProps {
  index: PackIndex;
  initial: PersistedState;
  storage: StorageLike;
  reset: () => Promise<void>;
  /** Where §10's events go — the queue in the app, a spy in a test. */
  onEvent?: (event: Event) => void;
  /** The queue's undelivered batch, for the trailing `/complete` payload. */
  drainEvents?: () => Event[];
  children: React.ReactNode;
}

export function ParticipantProvider({
  index,
  initial,
  storage,
  reset,
  onEvent,
  drainEvents,
  children,
}: ParticipantProviderProps) {
  const [session, setSession] = useState<PersistedState>(initial);

  const estimators = useMemo(
    () => buildEstimators(index.pack.estimators, index.fieldById),
    [index],
  );

  /**
   * What the participant authored, and nothing else — the `direct` values of
   * §4.3 rule 4, set from the sheet and from the school stepper. It lives in
   * the persisted record, so a refresh mid-rebalance costs nothing (§11).
   *
   * Derivation's own output is deliberately *not* fed back in. Hours for a
   * `derived` activity are not state (§3.2's invariant) and `fallback` is
   * recomputed from the estimator's outcome on every pass anyway (rule 5), so
   * the only thing a write-back would carry is the mode flag that decides
   * whether an `estimator.fallback` event is new. That belongs to the
   * telemetry queue (Stage 10), which has to dedupe against the previous batch
   * regardless; keeping it out here is what lets derivation run as a pure
   * function of state during render.
   */
  const authored = session.authored;

  const activities = useMemo(
    () => derive({ index, answers: session.answers, estimators, state: authored }).activities,
    [index, session.answers, estimators, authored],
  );

  const record = useCallback((event: Event) => onEvent?.(event), [onEvent]);
  const drain = useCallback(() => drainEvents?.() ?? [], [drainEvents]);

  /**
   * Activities sitting in `fallback` as of the last pass (§4.3 rule 3).
   *
   * `derive` emits its own `estimator.fallback` on entry, but it is fed
   * `authored` — which holds `direct` values only — so every pass looks like a
   * first failure to it and it would report one throw once per render. The
   * entry condition is therefore evaluated here, against the modes the last
   * pass actually produced: a retry that throws again is the same failure, and
   * an estimator that recovers re-arms the event for the next one.
   */
  const inFallback = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const current = new Set(
      activities
        .filter((activity) => DAY_TYPES.some((dt) => activity[dt].mode === 'fallback'))
        .map((activity) => activity.id),
    );
    const now = Date.now();
    for (const activityId of current) {
      if (inFallback.current.has(activityId)) continue;
      record({ t: now, type: 'estimator.fallback', activityId });
    }
    inFallback.current = current;
  }, [activities, record]);

  /**
   * A field write, and the one place §10's two field events are told apart.
   *
   * `field.answer` is the first value a field receives and `field.revise` is
   * every one after it, read off whether the map already holds the field
   * rather than off the answer's own revision — the two agree, and the map is
   * what this function already has in hand.
   */
  const answer = useCallback(
    (fieldId: string, value: unknown) => {
      const revising = isAnswered(session.answers, fieldId);
      setSession((current) => {
        const next = { ...current, answers: setAnswer(current.answers, fieldId, value) };
        save(storage, next);
        return next;
      });
      record({ t: Date.now(), type: revising ? 'field.revise' : 'field.answer', fieldId });
    },
    [session.answers, storage, record],
  );

  /*
   * Deliberately silent. Writing a pack default is the participant agreeing
   * with what was on screen (§4.2), and a `field.answer` for it would be
   * indistinguishable in the log from their having typed that same number.
   * The debrief reads engagement off these events, so absence is the signal:
   * a field with no event is one nobody touched.
   */
  const commitDefaults = useCallback(
    (fields: readonly Field[]) => {
      setSession((current) => {
        let answers = current.answers;
        for (const field of fields) {
          if (field.default === undefined) continue;
          if (isAnswered(answers, field.id)) continue;
          answers = setAnswer(answers, field.id, field.default);
        }
        if (answers === current.answers) return current;
        const next = { ...current, answers };
        save(storage, next);
        return next;
      });
    },
    [storage],
  );

  const patch = useCallback(
    (partial: SessionPatch) => {
      setSession((current) => {
        const next = { ...current, ...partial };
        save(storage, next);
        return next;
      });
    },
    [storage],
  );

  const recordSnapshot = useCallback(
    (snapshot: ScheduleSnapshot) => {
      setSession((current) => {
        const next = {
          ...current,
          snapshots: { ...current.snapshots, [snapshot.kind]: snapshot },
        };
        save(storage, next);
        return next;
      });
    },
    [storage],
  );

  const advance = useCallback(
    (stage: StageId) => {
      const next = furthestStage(session.stage, stage);
      if (next === session.stage) return;
      setSession((current) => {
        const updated = { ...current, stage: furthestStage(current.stage, stage) };
        save(storage, updated);
        return updated;
      });
      record({ t: Date.now(), type: 'stage.enter', stage: next });
    },
    [session.stage, storage, record],
  );

  /**
   * The write path for a direct edit: clamp, log what the clamp refused, then
   * store the value and log the change.
   *
   * `mode.direct` fires only on the *transition* into `direct`. Every later
   * edit of the same day value is an `hours.change` and nothing more — §10
   * reads cut order off `hours.change`, and a `mode.direct` per press would
   * say the participant took the activity off the estimator ten times.
   */
  const setHours = useCallback(
    (activityId: string, dayType: DayType, hours: number) => {
      const definition = index.activityById.get(activityId);
      if (definition === undefined) return;

      const current = activities.find((activity) => activity.id === activityId);
      const from = current?.[dayType].hours ?? 0;
      const wasDerived = isFullyDerived(authored, activityId);

      const clamped = clampDaily(definition, dayType, hours);
      const now = Date.now();
      if (clamped.clamped) record(clampEvent(activityId, hours, clamped.hours, now));

      setSession((state) => {
        const next = {
          ...state,
          authored: setDirect(state.authored, activityId, dayType, clamped.hours),
        };
        save(storage, next);
        return next;
      });

      if (wasDerived) record({ t: now, type: 'mode.direct', activityId });
      if (clamped.hours !== from) {
        record({ t: now, type: 'hours.change', activityId, from, to: clamped.hours });
      }
    },
    [index, activities, authored, record, storage],
  );

  const setWeekly = useCallback(
    (activityId: string, weeklyHours: number, fromWeekly: number) => {
      const definition = index.activityById.get(activityId);
      if (definition === undefined) return;
      const constraint = definition.constraint;

      const clamped = clampWeekly(definition, weeklyHours);
      const now = Date.now();
      if (clamped.clamped) record(clampEvent(activityId, weeklyHours, clamped.hours, now));

      // Both day types, from the one number: the constraint decides which of
      // them the week is spread over, so nothing here knows that school is the
      // activity the weekend is closed to.
      const spread = DAY_TYPES.map((dayType) => ({
        dayType,
        from: weeklyToDaily(constraint, fromWeekly, dayType),
        to: weeklyToDaily(constraint, clamped.hours, dayType),
      }));

      setSession((state) => {
        let authoredNext = state.authored;
        for (const { dayType, to } of spread) {
          authoredNext = setDirect(authoredNext, activityId, dayType, to);
        }
        const next = { ...state, authored: authoredNext };
        save(storage, next);
        return next;
      });

      for (const { from, to } of spread) {
        if (to !== from) record({ t: now, type: 'hours.change', activityId, from, to });
      }
    },
    [index, record, storage],
  );

  const takeDirect = useCallback(
    (activityId: string) => {
      const definition = index.activityById.get(activityId);
      const current = activities.find((activity) => activity.id === activityId);
      if (definition === undefined || current === undefined) return;

      const now = Date.now();
      const seeded = DAY_TYPES.map((dayType) => {
        const from = current[dayType].hours;
        const clamped = clampDaily(definition, dayType, from);
        if (clamped.clamped) record(clampEvent(activityId, from, clamped.hours, now));
        return { dayType, from, to: clamped.hours };
      });

      setSession((state) => {
        let authoredNext = state.authored;
        for (const { dayType, to } of seeded) {
          authoredNext = setDirect(authoredNext, activityId, dayType, to);
        }
        const next = { ...state, authored: authoredNext };
        save(storage, next);
        return next;
      });

      record({ t: now, type: 'mode.direct', activityId });
      for (const { from, to } of seeded) {
        // Only where the clamp moved it: taking an activity over at the number
        // it already showed is not a change to anyone's day.
        if (to !== from) record({ t: now, type: 'hours.change', activityId, from, to });
      }
    },
    [index, activities, record, storage],
  );

  const revertToDerived = useCallback(
    (activityId: string) => {
      setSession((state) => {
        let next = state.authored;
        for (const dayType of DAY_TYPES) next = clearDirect(next, activityId, dayType);
        if (next === state.authored) return state;
        const updated = { ...state, authored: next };
        save(storage, updated);
        return updated;
      });
    },
    [storage],
  );

  const value = useMemo<Participant>(
    () => ({
      index,
      session,
      answers: session.answers,
      activities,
      answer,
      commitDefaults,
      patch,
      advance,
      setHours,
      setWeekly,
      takeDirect,
      revertToDerived,
      record,
      drainEvents: drain,
      recordSnapshot,
      reset,
    }),
    [
      index,
      session,
      activities,
      answer,
      commitDefaults,
      patch,
      advance,
      setHours,
      setWeekly,
      takeDirect,
      revertToDerived,
      record,
      drain,
      recordSnapshot,
      reset,
    ],
  );

  return <ParticipantContext.Provider value={value}>{children}</ParticipantContext.Provider>;
}
