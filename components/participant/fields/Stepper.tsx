'use client';

/**
 * `count`, `number` and `duration` — one control, because they differ only in
 * the unit beside the number and in the `step` the pack declares.
 *
 * Both controls are at least `--tap-target-min` (44 px) on every axis. This is
 * the questionnaire, not the editor, so §7.4's overlapping hit areas do not
 * apply — but the floor does, and a stepper a participant has to aim at on a
 * phone is a stepper that produces bad answers.
 */

import type { Field } from '@/lib/pack/types';
import { boundToField, displayNumber, formatAmount } from './format';
import styles from '../participant.module.css';

export interface StepperProps {
  field: Field;
  answer: unknown;
  unit?: string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (value: number) => void;
}

export function Stepper({
  field,
  answer,
  unit,
  decreaseLabel,
  increaseLabel,
  onChange,
}: StepperProps) {
  const value = displayNumber(field, answer);
  const step = field.step ?? 1;
  const atMin = field.min !== undefined && value <= field.min;
  const atMax = field.max !== undefined && value >= field.max;

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.step}
        aria-label={decreaseLabel}
        disabled={atMin}
        onClick={() => onChange(boundToField(field, value - step))}
      >
        −
      </button>
      <output className={styles.value} htmlFor={field.id}>
        {formatAmount(value)}
        {unit === undefined ? null : <span className={styles.unit}>{unit}</span>}
      </output>
      <button
        type="button"
        className={styles.step}
        aria-label={increaseLabel}
        disabled={atMax}
        onClick={() => onChange(boundToField(field, value + step))}
      >
        +
      </button>
    </div>
  );
}
