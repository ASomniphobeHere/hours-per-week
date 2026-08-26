'use client';

/**
 * §8.1 — the section's screens inside the sheet, stacked vertically.
 *
 * The same `ScreenView` the questionnaire pages through, rendered all at once.
 * Nothing about a field's behaviour differs between S1 and replay, so nothing
 * about it is re-implemented here: an answer written from the sheet takes the
 * identical write-through path (§5), and derivation re-runs off it on the same
 * pass it would have in S1.
 *
 * **Which screens.** `reachableScreens` (§4.2.1), narrowed to this section.
 * A gated-out section therefore shows its gate screen and nothing else, with
 * the gate sitting at the falsy value the participant gave it — which is what
 * §7.7 asks a Not-included row to open. Answering it truthy reveals the rest
 * of the section in the same sheet on the next render, because reachability is
 * recomputed from the answer map rather than remembered. Decided with the
 * user; the alternative — showing every screen regardless — offers fields that
 * still derive to zero while the gate says no.
 */

import type { AnswerMap } from '@/lib/domain/types';
import type { PackIndex } from '@/lib/pack';
import { reachableScreens } from '@/lib/domain/gates';
import { ScreenView } from '@/components/participant/ScreenView';
import styles from './sheet.module.css';

export interface ScreenListProps {
  index: PackIndex;
  activityId: string;
  answers: AnswerMap;
  onAnswer: (fieldId: string, value: unknown) => void;
}

export function ScreenList({ index, activityId, answers, onAnswer }: ScreenListProps) {
  const screens = reachableScreens(index, answers).filter(
    (screen) => screen.sectionId === activityId,
  );

  if (screens.length === 0) return null;

  return (
    <div className={styles.screens} data-testid="sheet-screens">
      {screens.map((screen) => (
        <section key={screen.id} className={styles.screen} data-screen={screen.id}>
          <ScreenView
            pack={index.pack}
            screen={screen}
            answers={answers}
            onAnswer={onAnswer}
          />
        </section>
      ))}
    </div>
  );
}
