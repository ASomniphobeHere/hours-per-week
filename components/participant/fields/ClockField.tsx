'use client';

/**
 * `clock` — a time of day, stored as `"HH:MM"`.
 *
 * The native time input is deliberate: it is the control every phone already
 * knows how to present, and the string it produces is exactly what
 * `asClockMinutes` parses and what the pack's own defaults are written in
 * (`"07:00"`), so nothing converts between the answer store and the estimator.
 */

import type { Field } from '@/lib/pack/types';
import styles from '../participant.module.css';

export interface ClockFieldProps {
  field: Field;
  answer: unknown;
  /** Id of the group label naming this field, e.g. "On a workday". */
  labelledBy: string;
  onChange: (value: string) => void;
}

function displayClock(field: Field, answer: unknown): string {
  const candidate = answer ?? field.default;
  return typeof candidate === 'string' ? candidate : '';
}

export function ClockField({ field, answer, labelledBy, onChange }: ClockFieldProps) {
  return (
    <input
      id={field.id}
      type="time"
      aria-labelledby={labelledBy}
      className={styles.clock}
      value={displayClock(field, answer)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
