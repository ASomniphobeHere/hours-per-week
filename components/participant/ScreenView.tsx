'use client';

/**
 * One screen of the questionnaire (§4.2): a prompt, an optional note, up to two
 * images, and one or more fields.
 *
 * Multiple fields per screen is the normal case, not an exception — the pack's
 * first screen is wake time on a workday beside wake time on a weekend day.
 */

import type { ContentPack, Screen } from '@/lib/pack/types';
import type { AnswerMap } from '@/lib/domain/types';
import { copyOf } from '@/lib/pack/copy';
import { getAnswer } from '@/lib/store/answers';
import { FieldControl } from './fields/FieldControl';
import { MediaStrip } from './MediaStrip';
import styles from './participant.module.css';

export interface ScreenViewProps {
  pack: ContentPack;
  screen: Screen;
  answers: AnswerMap;
  onAnswer: (fieldId: string, value: unknown) => void;
}

export function ScreenView({ pack, screen, answers, onAnswer }: ScreenViewProps) {
  return (
    <div className={styles.body}>
      <h1 className={styles.prompt}>{copyOf(pack, screen.prompt)}</h1>
      {screen.note === undefined ? null : (
        <p className={styles.note}>{copyOf(pack, screen.note)}</p>
      )}
      <MediaStrip pack={pack} media={screen.media} />
      <div className={styles.fields}>
        {screen.fields.map((field) => (
          <FieldControl
            key={field.id}
            pack={pack}
            field={field}
            answer={getAnswer(answers, field.id)}
            onChange={(value) => onAnswer(field.id, value)}
          />
        ))}
      </div>
    </div>
  );
}
