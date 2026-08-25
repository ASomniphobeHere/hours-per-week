import { describe, expect, it } from 'vitest';
import { indexPack } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { setAnswer } from '@/lib/store/answers';
import { progressOf } from './progress';
import type { AnswerMap } from './types';

const index = indexPack(minimalPack());

describe('§4.2.1 progress', () => {
  it('counts every reachable screen when no gate has been answered', () => {
    // An unanswered gate is never skipping (rule 6), so all three are reachable.
    expect(progressOf(index, {}, 'alpha.time')).toEqual({ current: 1, total: 3 });
    expect(progressOf(index, {}, 'beta.gate')).toEqual({ current: 2, total: 3 });
    expect(progressOf(index, {}, 'beta.time')).toEqual({ current: 3, total: 3 });
  });

  it('recomputes over reachable screens when a gate changes (AC 8)', () => {
    const gatedOut: AnswerMap = setAnswer({}, 'beta.any', 'no');
    expect(progressOf(index, gatedOut, 'beta.gate')).toEqual({ current: 2, total: 2 });

    // The drop is the point: §4.2.1 prefers an honest total to a bar that
    // lies to stay monotonic.
    const gatedIn: AnswerMap = setAnswer(gatedOut, 'beta.any', 'yes');
    expect(progressOf(index, gatedIn, 'beta.gate')).toEqual({ current: 2, total: 3 });
  });

  it('keeps the gate screen reachable when its own section is skipped', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    // Otherwise the gate could not be re-answered.
    expect(progressOf(index, answers, 'beta.gate').current).toBe(2);
    expect(progressOf(index, answers, 'beta.time').current).toBe(0);
  });
});
