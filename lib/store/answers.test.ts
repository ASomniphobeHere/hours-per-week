import { describe, expect, it } from 'vitest';
import {
  getAnswer,
  isAnswered,
  isAnswerMap,
  isRevision,
  pruneToFields,
  setAnswer,
} from './answers';

describe('§5 answer map', () => {
  it('stamps the first write at revision 1', () => {
    const answers = setAnswer({}, 'sleep.wake.wd', '07:00', 100);
    expect(answers['sleep.wake.wd']).toEqual({ value: '07:00', at: 100, revision: 1 });
  });

  it('increments the revision on every edit (§10 field.answer vs field.revise)', () => {
    let answers = setAnswer({}, 'work.hours.wd', 8, 100);
    expect(isRevision(answers, 'work.hours.wd')).toBe(true);
    answers = setAnswer(answers, 'work.hours.wd', 9, 200);
    answers = setAnswer(answers, 'work.hours.wd', 10, 300);
    expect(answers['work.hours.wd']).toEqual({ value: 10, at: 300, revision: 3 });
  });

  it('does not mutate the map it was given', () => {
    const before = setAnswer({}, 'a', 1, 1);
    const after = setAnswer(before, 'a', 2, 2);
    expect(before['a']!.value).toBe(1);
    expect(after['a']!.value).toBe(2);
  });

  it('treats an empty value as unanswered so a default can take over', () => {
    expect(isAnswered(setAnswer({}, 'a', '', 1), 'a')).toBe(false);
    expect(isAnswered(setAnswer({}, 'a', null, 1), 'a')).toBe(false);
    expect(isAnswered(setAnswer({}, 'a', 0, 1), 'a')).toBe(true);
    expect(isAnswered({}, 'a')).toBe(false);
  });

  it('reads a value back, or undefined', () => {
    expect(getAnswer(setAnswer({}, 'a', 'x', 1), 'a')).toBe('x');
    expect(getAnswer({}, 'a')).toBeUndefined();
  });
});

describe('pack-version prune (§5)', () => {
  it('keeps answers whose field ids still exist and drops the rest', () => {
    let answers = setAnswer({}, 'kept', 1, 1);
    answers = setAnswer(answers, 'gone', 2, 2);
    const pruned = pruneToFields(answers, ['kept', 'other']);
    expect(Object.keys(pruned)).toEqual(['kept']);
    expect(pruned['kept']!.revision).toBe(1);
  });
});

describe('isAnswerMap — restore from storage', () => {
  it('accepts a well-formed map', () => {
    expect(isAnswerMap({ a: { value: 1, at: 0, revision: 1 } })).toBe(true);
    expect(isAnswerMap({})).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAnswerMap(null)).toBe(false);
    expect(isAnswerMap([])).toBe(false);
    expect(isAnswerMap({ a: 1 })).toBe(false);
    expect(isAnswerMap({ a: { value: 1 } })).toBe(false);
  });
});
