'use client';

/**
 * S1 — the questionnaire.
 *
 * Screens come from the pack in pack order, one page at a time, filtered to the
 * ones the current gate answers make reachable (§4.2.1). Everything about
 * *which* screens exist is derived from the answer map on every render, which
 * is what makes flipping a gate lossless: nothing is cleared, so a section
 * hidden and revealed still holds what the participant put in it (rule 5,
 * AC 7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Screen } from '@/lib/pack/types';
import { reachableScreens } from '@/lib/domain/gates';
import { progressOf } from '@/lib/domain/progress';
import { formatCopy, copyOf } from '@/lib/pack/copy';
import { useParticipant } from '@/lib/client/participant';
import { ScreenView } from './ScreenView';
import styles from './participant.module.css';

export interface QuestionnaireProps {
  /** Called once the last reachable screen is committed (§4.4, step 3.5). */
  onComplete: () => void;
}

/**
 * Where a returning participant lands: the first screen holding an unanswered
 * required field, or the last screen when everything is answered.
 *
 * §5 wants a mid-session refresh to cost nothing. Because advancing commits a
 * screen's defaults for anything untouched, "first unanswered" is exactly the
 * screen they were on.
 */
function resumeScreenId(screens: readonly Screen[], answered: (id: string) => boolean): string {
  const unanswered = screens.find((screen) =>
    screen.fields.some((field) => field.required && !answered(field.id)),
  );
  return unanswered?.id ?? screens[screens.length - 1]?.id ?? '';
}

export function Questionnaire({ onComplete }: QuestionnaireProps) {
  const { index, answers, answer, commitDefaults, record } = useParticipant();
  const pack = index.pack;

  const screens = reachableScreens(index, answers);

  const [screenId, setScreenId] = useState(() =>
    resumeScreenId(screens, (fieldId) => answers[fieldId] !== undefined),
  );

  /*
   * A gate answered on this very screen can remove the screen the participant
   * is standing on from the reachable list — never the gate screen itself,
   * which a gated-out section keeps, but the position still has to be resolved
   * against the current list rather than remembered.
   */
  const position = useMemo(() => {
    const found = screens.findIndex((screen) => screen.id === screenId);
    return found < 0 ? 0 : found;
  }, [screens, screenId]);

  const screen = screens[position];
  const progress = progressOf(index, answers, screen?.id ?? '');

  /*
   * §10's `screen.view`, once per screen the participant lands on — forward,
   * back, or resumed into after a refresh. Keyed on the id rather than on
   * `position`, so a gate answered mid-questionnaire that renumbers the list
   * does not log a view of a screen nobody moved to.
   *
   * The ref is what makes it once per *landing* rather than once per effect
   * run. An effect can run twice for one arrival — a remount, or React's
   * development double-invoke — and two views of a screen at the same
   * millisecond is a log saying something about the participant that is not
   * true. Going A → B → A still logs A twice, because the id changed in
   * between; only an immediate repeat of the same screen is suppressed.
   *
   * The sheet's replay (§8.1) emits none of these. It puts a whole section on
   * one scrolling surface rather than paging through it, so there is no moment
   * at which one screen is the screen being viewed; `sheet.open` is what marks
   * that visit, and the debrief counts those per activity (§10).
   */
  const viewedId = screen?.id;
  const sectionId = screen?.sectionId;
  const lastViewed = useRef<string | null>(null);
  useEffect(() => {
    if (viewedId === undefined || lastViewed.current === viewedId) return;
    lastViewed.current = viewedId;
    record({
      t: Date.now(),
      type: 'screen.view',
      screenId: viewedId,
      activityId: sectionId,
    });
  }, [viewedId, sectionId, record]);

  const advance = useCallback(() => {
    if (screen === undefined) return;
    // Agreeing with what is on screen is an answer (§4.2 `default`), so the
    // pack default is written for anything the participant did not touch.
    commitDefaults(screen.fields);
    const next = screens[position + 1];
    if (next === undefined) onComplete();
    else setScreenId(next.id);
  }, [screen, screens, position, commitDefaults, onComplete]);

  const goBack = useCallback(() => {
    const previous = screens[position - 1];
    if (previous !== undefined) setScreenId(previous.id);
  }, [screens, position]);

  if (screen === undefined) return null;

  return (
    <main className={styles.page}>
      <p className={styles.progress}>
        {formatCopy(pack, 's1.progress', { current: progress.current, total: progress.total })}
      </p>

      <ScreenView pack={pack} screen={screen} answers={answers} onAnswer={answer} />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.secondary}
          onClick={goBack}
          disabled={position === 0}
        >
          {copyOf(pack, 's1.back')}
        </button>
        <button type="button" className={styles.primary} onClick={advance}>
          {copyOf(pack, 's1.next')}
        </button>
      </div>
    </main>
  );
}
