/**
 * Numbers as the participant reads them.
 *
 * The unit suffix comes from the pack (§9), never from a literal here: a
 * duration in minutes and one in hours are the same control with a different
 * word beside it, and that word is content.
 */

import type { Field } from '@/lib/pack/types';

/** `8`, `8.5`, `0.25` — never `8.0`, and never a float artefact like `8.500000001`. */
export function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Holds a value inside the field's `min`/`max`.
 *
 * Deliberately does *not* snap to an absolute `step` grid anchored at `min`.
 * The pack chose the default, and a grid anchored elsewhere would move it —
 * a field with `min: 6`, `step: 5` and `default: 30` would open on 31, a number
 * no one wrote. The step is what a press of the control is worth, so the grid
 * is anchored wherever the participant started, which keeps every value they
 * reach a whole number of presses from the default they were shown.
 */
export function boundToField(field: Field, value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  if (field.min !== undefined && rounded < field.min) return field.min;
  if (field.max !== undefined && rounded > field.max) return field.max;
  return rounded;
}

/** The value a control shows: the answer if there is one, else the pack default. */
export function displayNumber(field: Field, answer: unknown): number {
  const candidate = answer ?? field.default;
  const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
  if (!Number.isFinite(parsed)) return field.min ?? 0;
  return boundToField(field, parsed);
}
