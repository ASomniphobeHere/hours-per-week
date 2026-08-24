import { beforeEach, describe, expect, it } from 'vitest';
import { indexPack, type PackIndex } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { setAnswer } from '@/lib/store/answers';
import { firstUnansweredScreen, isGatedOut, reachableScreens } from './gates';

let index: PackIndex;

beforeEach(() => {
  index = indexPack(minimalPack());
});

const beta = () => index.activityById.get('beta')!;

describe('§4.2.1 — what counts as a skipping answer', () => {
  it('skips on the pack’s declared gateSkipValue', () => {
    expect(isGatedOut(beta(), setAnswer({}, 'beta.any', 'no'))).toBe(true);
  });

  it('does not skip on the other option', () => {
    expect(isGatedOut(beta(), setAnswer({}, 'beta.any', 'yes'))).toBe(false);
  });

  /* rule 6 — a force-advanced participant gets a full stack, not a hollow one. */
  it('does not skip when the gate is unanswered', () => {
    expect(isGatedOut(beta(), {})).toBe(false);
  });

  it('falls back to JS falsiness when the pack declares no skip value', () => {
    const pack = minimalPack();
    const activity = pack.activities[1]!;
    delete activity.gateSkipValue;
    expect(isGatedOut(activity, setAnswer({}, 'beta.any', 0))).toBe(true);
    expect(isGatedOut(activity, setAnswer({}, 'beta.any', 2))).toBe(false);
    expect(isGatedOut(activity, setAnswer({}, 'beta.any', []))).toBe(true);
  });

  it('leaves an ungated activity alone', () => {
    expect(isGatedOut(index.activityById.get('alpha')!, {})).toBe(false);
  });
});

describe('reachable screens (§4.2.1, progress)', () => {
  it('renders everything when no gate is closed', () => {
    expect(reachableScreens(index, {}).map((s) => s.id)).toEqual([
      'alpha.time',
      'beta.gate',
      'beta.time',
    ]);
  });

  it('drops the rest of the gated section and keeps the gate itself', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    expect(reachableScreens(index, answers).map((s) => s.id)).toEqual(['alpha.time', 'beta.gate']);
  });

  it('affects that section and no other (rule 2)', () => {
    const answers = setAnswer({}, 'beta.any', 'no');
    const reachable = reachableScreens(index, answers);
    expect(reachable.filter((s) => s.sectionId === 'alpha')).toHaveLength(1);
  });

  /* rule 5 — flipping a gate falsy then truthy is lossless (AC 7). */
  it('round-trips a gate without touching the section’s answers', () => {
    let answers = setAnswer({}, 'beta.minutes.wd', 90);
    answers = setAnswer(answers, 'beta.any', 'no');
    expect(reachableScreens(index, answers)).toHaveLength(2);

    answers = setAnswer(answers, 'beta.any', 'yes');
    expect(reachableScreens(index, answers)).toHaveLength(3);
    expect(answers['beta.minutes.wd']!.value).toBe(90);
  });

  /* AC 8 — progress recomputes over reachable screens when a gate changes. */
  it('shrinks the progress denominator when a section is gated out', () => {
    const open = reachableScreens(index, {}).length;
    const closed = reachableScreens(index, setAnswer({}, 'beta.any', 'no')).length;
    expect(closed).toBeLessThan(open);
  });
});

describe('firstUnansweredScreen — where a pack-version restore resumes (§5)', () => {
  it('is the first screen when nothing is answered', () => {
    expect(firstUnansweredScreen(index, {})?.id).toBe('alpha.time');
  });

  it('skips screens whose required fields are all answered', () => {
    let answers = setAnswer({}, 'alpha.minutes.wd', 60);
    answers = setAnswer(answers, 'alpha.minutes.we', 60);
    expect(firstUnansweredScreen(index, answers)?.id).toBe('beta.gate');
  });

  it('never lands on a screen the gate has hidden', () => {
    let answers = setAnswer({}, 'alpha.minutes.wd', 60);
    answers = setAnswer(answers, 'alpha.minutes.we', 60);
    answers = setAnswer(answers, 'beta.any', 'no');
    expect(firstUnansweredScreen(index, answers)).toBeNull();
  });
});
