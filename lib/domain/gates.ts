/**
 * §4.2.1 gates — the entire branching surface.
 *
 * A gate is one field on a section's first screen. A skipping answer hides the
 * rest of *that* section and nothing else. Two rules do the load-bearing work
 * here and they pull in opposite directions:
 *
 *   rule 5 — flipping a gate falsy then truthy is lossless, so hidden screens
 *            keep their answers rather than being cleared;
 *   rule 6 — an *unanswered* gate is truthy, so a participant force-advanced
 *            mid-questionnaire (§6.3) reaches the reveal with a full stack.
 *
 * Together they mean "skipping" is a property of a present answer, never of
 * absence.
 */

import type { AnswerMap } from './types';
import { isAnswered } from '@/lib/store/answers';
import type { ActivityDef, ContentPack, Screen } from '@/lib/pack/types';
import type { PackIndex } from '@/lib/pack';

/**
 * True when this activity's section is skipped by its gate answer.
 *
 * `gateSkipValue` names the skipping answer when the pack declares one — a
 * choice gate's answer is an option id and so is never JS-falsy. Absent, the
 * skipping value is JS falsiness, which is what a `count` gate answered 0
 * wants. An unanswered gate is never skipping (rule 6).
 */
export function isGatedOut(activity: ActivityDef, answers: AnswerMap): boolean {
  const gateField = activity.gateField;
  if (gateField === undefined) return false;
  if (!isAnswered(answers, gateField)) return false;

  const value = answers[gateField]?.value;
  if ('gateSkipValue' in activity) return valuesEqual(value, activity.gateSkipValue);
  if (Array.isArray(value)) return value.length === 0;
  return !value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

/** Activity ids whose sections are currently skipped. */
export function gatedOutSections(pack: ContentPack, answers: AnswerMap): Set<string> {
  const out = new Set<string>();
  for (const activity of pack.activities) {
    if (isGatedOut(activity, answers)) out.add(activity.id);
  }
  return out;
}

/**
 * Screens the participant can currently reach, in pack order. A gated-out
 * section keeps its gate screen — that is how the gate is re-answered — and
 * loses the rest.
 *
 * §4.2.1: progress is computed over this list and recomputes when a gate
 * changes. A participant who gates out a section sees the total drop; that is
 * honest and preferable to a bar that lies to stay monotonic.
 */
export function reachableScreens(index: PackIndex, answers: AnswerMap): Screen[] {
  const skipped = gatedOutSections(index.pack, answers);
  if (skipped.size === 0) return index.pack.screens;

  return index.pack.screens.filter((screen) => {
    if (!skipped.has(screen.sectionId)) return true;
    return screen.gate === true;
  });
}

/** First reachable screen with an unanswered required field, or null. */
export function firstUnansweredScreen(index: PackIndex, answers: AnswerMap): Screen | null {
  for (const screen of reachableScreens(index, answers)) {
    const incomplete = screen.fields.some(
      (field) => field.required && !isAnswered(answers, field.id),
    );
    if (incomplete) return screen;
  }
  return null;
}
