/**
 * §4.2.1 progress — computed over *reachable* screens given the current gate
 * answers, and recomputed when a gate changes.
 *
 * The consequence the spec accepts explicitly: gating a section out drops the
 * total, so the denominator can fall between one screen and the next. That is
 * honest and preferred over a bar that lies to stay monotonic. Nothing here
 * remembers a high-water mark.
 *
 * The intro page (§13's multitasking statement) is deliberately not counted.
 * Progress is over screens, screens come from the pack, and the intro is
 * client chrome — counting it would make `total` disagree with the pack for a
 * page no pack declares.
 */

import type { AnswerMap } from './types';
import type { PackIndex } from '@/lib/pack';
import { reachableScreens } from './gates';

export interface Progress {
  /** 1-based position of the current screen among the reachable ones. */
  current: number;
  total: number;
}

/**
 * A `screenId` that is no longer reachable — the participant gated its section
 * out from the gate screen above it — reports position 0 rather than −1, so a
 * caller rendering `current` never shows a negative.
 */
export function progressOf(index: PackIndex, answers: AnswerMap, screenId: string): Progress {
  const screens = reachableScreens(index, answers);
  const position = screens.findIndex((screen) => screen.id === screenId);
  return { current: position < 0 ? 0 : position + 1, total: screens.length };
}
