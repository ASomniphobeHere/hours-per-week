'use client';

/**
 * One field of §4.2's six types, with its label.
 *
 * The dispatch is on `type` alone and reads nothing else about the field —
 * which is what keeps two day-scoped fields on one screen independent (AC 2).
 * `dayType` never reaches a control: it is part of the field's *identity*, so
 * `sleep.wake.wd` and `sleep.wake.we` are two answers under two keys and share
 * no state to begin with.
 *
 * Each field is a labelled group rather than a bare label beside a control.
 * A stepper is two buttons and a readout with nothing labelable between them,
 * and a choice is a set — neither has a single control for a `<label for>` to
 * point at, and "On a workday" has to name the whole thing or it names nothing.
 */

import { useId } from 'react';
import type { ContentPack, Field } from '@/lib/pack/types';
import { copyOf, unitKey } from '@/lib/pack/copy';
import { ClockField } from './ClockField';
import { ChoiceField } from './ChoiceField';
import { Stepper } from './Stepper';
import styles from '../participant.module.css';

export interface FieldControlProps {
  pack: ContentPack;
  field: Field;
  answer: unknown;
  onChange: (value: unknown) => void;
}

export function FieldControl({ pack, field, answer, onChange }: FieldControlProps) {
  const labelId = useId();
  const unit = unitKey(field.unit);

  return (
    <div
      className={styles.field}
      role="group"
      aria-labelledby={labelId}
      data-field={field.id}
    >
      <span className={styles.label} id={labelId}>
        {copyOf(pack, field.label)}
      </span>
      {field.type === 'clock' ? (
        <ClockField field={field} answer={answer} labelledBy={labelId} onChange={onChange} />
      ) : field.type === 'choice' || field.type === 'multichoice' ? (
        <ChoiceField
          field={field}
          answer={answer}
          labelOf={(option) => copyOf(pack, option.label)}
          onChange={onChange}
        />
      ) : (
        <Stepper
          field={field}
          answer={answer}
          unit={unit === undefined ? undefined : copyOf(pack, unit)}
          decreaseLabel={copyOf(pack, 'a11y.decrease')}
          increaseLabel={copyOf(pack, 'a11y.increase')}
          onChange={onChange}
        />
      )}
    </div>
  );
}
