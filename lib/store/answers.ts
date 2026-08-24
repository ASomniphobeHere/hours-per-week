/**
 * §5 Answer store — flat, keyed by field id.
 *
 * Derived hours are never written here. That is the whole point of §3.2's
 * invariant: an answer is the only thing stored, hours are recomputed on every
 * read, and so editing one answer cannot leave a stale total anywhere.
 */

import type { Answer, AnswerMap } from '@/lib/domain/types';

/** An answer exists but carries no usable value — treated as unanswered. */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function isAnswered(answers: AnswerMap, fieldId: string): boolean {
  const answer = answers[fieldId];
  return answer !== undefined && !isEmpty(answer.value);
}

export function getAnswer(answers: AnswerMap, fieldId: string): unknown {
  return answers[fieldId]?.value;
}

/**
 * Returns a new map with `fieldId` set. `revision` counts writes: 1 on the
 * first, incrementing thereafter, which is what separates `field.answer` from
 * `field.revise` in telemetry (§10).
 */
export function setAnswer(
  answers: AnswerMap,
  fieldId: string,
  value: unknown,
  now: number = Date.now(),
): AnswerMap {
  const previous = answers[fieldId];
  const next: Answer = {
    value,
    at: now,
    revision: (previous?.revision ?? 0) + 1,
  };
  return { ...answers, [fieldId]: next };
}

/** True when this write is a revision rather than a first answer (§10). */
export function isRevision(answers: AnswerMap, fieldId: string): boolean {
  return answers[fieldId] !== undefined;
}

/**
 * §5 pack-version mismatch: keep answers whose field ids still exist, drop the
 * rest. Applied on restore, never on write.
 */
export function pruneToFields(answers: AnswerMap, fieldIds: Iterable<string>): AnswerMap {
  const known = fieldIds instanceof Set ? fieldIds : new Set(fieldIds);
  const kept: AnswerMap = {};
  for (const [fieldId, answer] of Object.entries(answers)) {
    if (known.has(fieldId)) kept[fieldId] = answer;
  }
  return kept;
}

/** Rejects anything that is not a plausible AnswerMap, for restore from storage. */
export function isAnswerMap(value: unknown): value is AnswerMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((answer) => {
    if (typeof answer !== 'object' || answer === null) return false;
    const candidate = answer as Partial<Answer>;
    return typeof candidate.at === 'number' && typeof candidate.revision === 'number';
  });
}
