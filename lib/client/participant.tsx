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

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Activity, AnswerMap } from '@/lib/domain/types';
import { derive, type ScheduleState } from '@/lib/domain/derive';
import { isAnswered, setAnswer } from '@/lib/store/answers';
import { save, type PersistedState, type StorageLike } from '@/lib/store/persist';
import { buildEstimators } from '@/lib/estimators/registry';
import type { Field } from '@/lib/pack/types';
import type { PackIndex } from '@/lib/pack';

/** The fields of the session record a stage is allowed to move. */
export type SessionPatch = Partial<Pick<PersistedState, 'dayType' | 'stage' | 'introSeen'>>;

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
  children: React.ReactNode;
}

export function ParticipantProvider({
  index,
  initial,
  storage,
  reset,
  children,
}: ParticipantProviderProps) {
  const [session, setSession] = useState<PersistedState>(initial);

  const estimators = useMemo(
    () => buildEstimators(index.pack.estimators, index.fieldById),
    [index],
  );

  /**
   * What the participant authored, and nothing else — the `direct` values of
   * §4.3 rule 4, set from the sheet (Stage 5) and the school stepper.
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
  const [authored] = useState<ScheduleState>({});

  const activities = useMemo(
    () => derive({ index, answers: session.answers, estimators, state: authored }).activities,
    [index, session.answers, estimators, authored],
  );

  const answer = useCallback(
    (fieldId: string, value: unknown) => {
      setSession((current) => {
        const next = { ...current, answers: setAnswer(current.answers, fieldId, value) };
        save(storage, next);
        return next;
      });
    },
    [storage],
  );

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

  const value = useMemo<Participant>(
    () => ({
      index,
      session,
      answers: session.answers,
      activities,
      answer,
      commitDefaults,
      patch,
      reset,
    }),
    [index, session, activities, answer, commitDefaults, patch, reset],
  );

  return <ParticipantContext.Provider value={value}>{children}</ParticipantContext.Provider>;
}
