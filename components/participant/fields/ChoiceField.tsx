'use client';

/**
 * `choice` and `multichoice` — the same list of options, differing only in
 * whether picking one clears the last.
 *
 * Rendered as a radio / checkbox group rather than a row of buttons so that
 * assistive technology gets the grouping and the arrow-key behaviour for free,
 * and so a `choice` field cannot end up with two values selected.
 */

import type { Field, FieldOption } from '@/lib/pack/types';
import styles from '../participant.module.css';

export interface ChoiceFieldProps {
  field: Field;
  answer: unknown;
  /** Option id → resolved copy. */
  labelOf: (option: FieldOption) => string;
  onChange: (value: string | string[]) => void;
}

function selectedIds(field: Field, answer: unknown): string[] {
  const candidate = answer ?? field.default;
  if (Array.isArray(candidate)) return candidate.filter((id): id is string => typeof id === 'string');
  return typeof candidate === 'string' && candidate !== '' ? [candidate] : [];
}

export function ChoiceField({ field, answer, labelOf, onChange }: ChoiceFieldProps) {
  const multiple = field.type === 'multichoice';
  const selected = selectedIds(field, answer);
  const options = field.options ?? [];

  const toggle = (optionId: string): void => {
    if (!multiple) {
      onChange(optionId);
      return;
    }
    onChange(
      selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    );
  };

  return (
    // The field's own wrapper is the labelled group; a second one here would
    // nest two groups around one set of options.
    <div className={styles.options}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <label
            key={option.id}
            className={[styles.option, isSelected ? styles.optionSelected : null]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={field.id}
              value={option.id}
              checked={isSelected}
              onChange={() => toggle(option.id)}
            />
            <span>{labelOf(option)}</span>
          </label>
        );
      })}
    </div>
  );
}
